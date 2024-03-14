import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface UmamiInputs {
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
  umamiConfig: {  
    postgresPassword: Output<string>;
    appSecret: Output<string>;
  }
}

export class UmamiDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: UmamiInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: UmamiInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const umamiImage = new RegistryImage(
      'umami',
      {
        name: 'miniflux/miniflux:2.0.50',
      },
      {
        parent: this,
      },
    );
    const postgresImage = new RegistryImage(
      'umami-postgres',
      {
        name: 'postgres:15-alpine',
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
      'umami-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'umami/data'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'umami-internal',
      {},
      { parent: this },
    );

    const umamiDatabaseContainer = new Container(
      'umami-database',
      {
        image: postgresImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'umami-database',
        envs: [
            'POSTGRES_DN=umami',
            'POSTGRES_USER=umami',
            interpolate`POSTGRES_PASSWORD=${args.umamiConfig.postgresPassword}`,
        ],
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [{
          volumeName: minifluxDataVolume.name,
          containerPath: '/var/lib/postgresql/data',
        }],
        healthcheck: {
            tests: ["CMD", "pg_isready", "-U", "umami"],
            interval: "10s",
            startPeriod: "30s",
        },
      },
      {
        parent: this,
        dependsOn: [internalNetwork, postgresImage],
      },
    );
    const umamiContainer = new Container(
      'umami',
      {
        image: umamiImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'umami',
        envs: [
            interpolate`DATABASE_URL=postgres://${umamiDatabaseContainer.hostname}:${args.umamiConfig.postgresPassword}@umami_database:5432/umami`,
            'DATABASE_TYPE=postgresql',
            interpolate`APP_SECRET=${args.umamiConfig.appSecret}`,
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
          umamiImage,
        ],
      },
    );

    return Promise.resolve({
      umamiContainer,
      umamiDatabaseContainer,
    });
  }
}
