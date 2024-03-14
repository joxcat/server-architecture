import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface CoderInputs {
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
  coderConfig: {
    dockerGroupId: Output<string>;
    postgresPassword: Output<string>;
    accessUrl: Output<string>;
    wildcardUrl: Output<string>;
  };
}

export class CoderDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: CoderInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: CoderInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const coderImage = new RegistryImage(
      'coder',
      {
        name: 'ghcr.io/coder/coder:v2.9.0',
      },
      {
        parent: this,
      },
    );
    const postgresImage = new RegistryImage(
      'postgres_14',
      {
        name: 'postgres:14',
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'internal-coder',
      {},
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

    const coderDataVolume = new Volume(
      'coder-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'coder/data'),
        },
      },
      {
        parent: this,
      },
    );

    const coderPostgresContainer = new Container(
      'coder-postgres',
      {
        image: postgresImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'coder-postgres',
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [
          {
            volumeName: coderDataVolume.name,
            containerPath: '/var/lib/postgresql/data',
          },
        ],
        envs: [
          'POSTGRES_USER=coder',
          interpolate`POSTGRES_PASSWORD=${args.coderConfig.postgresPassword}`,
          'POSTGRES_DB=coder',
        ],
        healthcheck: {
          tests: [
            'CMD-SHELL',
            interpolate`pg_isready -U coder -d ${args.coderConfig.postgresPassword}`,
          ],
          interval: '5s',
          timeout: '5s',
          retries: 5,
        },
      },
      {
        parent: this,
        dependsOn: [args.network, postgresImage, coderDataVolume],
      },
    );
    const coderContainer = new Container(
      'coder',
      {
        image: coderImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'coder',
        envs: [
          interpolate`CODER_PG_CONNECTION_URL=postgresql://coder:${args.coderConfig.postgresPassword}@${coderPostgresContainer.hostname}/coder?sslmode=disable`,
          'CODER_HTTP_ADDRESS=0.0.0.0:7080',
          interpolate`CODER_ACCESS_URL=${args.coderConfig.accessUrl}`,
          interpolate`CODER_WILDCARD_ACCESS_URL=${args.coderConfig.wildcardUrl}`,
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
          { name: 'bridge' },
        ],
        volumes: [
          {
            hostPath: '/var/run/docker.sock',
            containerPath: '/var/run/docker.sock',
          },
        ],
        groupAdds: [args.coderConfig.dockerGroupId],
      },
      {
        parent: this,
        dependsOn: [args.network, coderImage, internalNetwork],
      },
    );

    return Promise.resolve({
      coderContainer,
      coderPostgresContainer,
    });
  }
}
