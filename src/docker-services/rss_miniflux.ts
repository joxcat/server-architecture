import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface RssMinifluxInputs {
  network: Network;
  platform: string;
  docker_driver_opts: {
    host: Output<string>;
    port: Output<string>;
    user: Output<string>;
    password: Output<string>;
  };
  sftp_base_path: string;
  hostname?: string;
  postgresPassword: Output<string>;
}

export class RssMinifluxDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: RssMinifluxInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: RssMinifluxInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const minifluxImage = new RegistryImage(
      'miniflux',
      {
        name: 'miniflux/miniflux:2.0.50',
      },
      {
        parent: this,
      },
    );
    const postgresImage = new RegistryImage(
      'miniflux-postgres',
      {
        name: 'postgres:14',
      },
      {
        parent: this,
      },
    );

    const dockerDriverOpts = {
      type: 'sftp',
      'sftp-host': interpolate`${args.docker_driver_opts.host}`,
      'sftp-port': interpolate`${args.docker_driver_opts.port}`,
      'sftp-user': interpolate`${args.docker_driver_opts.user}`,
      'sftp-pass': interpolate`${args.docker_driver_opts.password}`,
      'allow-other': 'true',
    };

    const minifluxDataVolume = new Volume(
      'miniflux-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'rss_miniflux/data'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'miniflux-internal',
      {},
      { parent: this },
    );

    const minifluxDatabaseContainer = new Container(
      'miniflux-database',
      {
        image: postgresImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'miniflux-database',
        envs: [
            'POSTGRES_USER=miniflux',
            interpolate`POSTGRES_PASSWORD=${args.postgresPassword}`,
        ],
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [{
          volumeName: minifluxDataVolume.name,
          containerPath: '/var/lib/postgresql/data',
        }],
        healthcheck: {
            tests: ["CMD", "pg_isready", "-U", "miniflux"],
            interval: "10s",
            startPeriod: "30s",
        },
      },
      {
        parent: this,
        dependsOn: [internalNetwork, postgresImage],
      },
    );
    const minifluxContainer = new Container(
      'miniflux',
      {
        image: minifluxImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'miniflux',
        envs: [
            interpolate`DATABASE_URL=postgres://${minifluxDatabaseContainer.hostname}:${args.postgresPassword}@miniflux_database/miniflux?sslmode=disable`,
            'RUN_MIGRATIONS=1',
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          internalNetwork,
          minifluxImage,
        ],
      },
    );

    return Promise.resolve({
      minifluxContainer,
      minifluxDatabaseContainer,
    });
  }
}
