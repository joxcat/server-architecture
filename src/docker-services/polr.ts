import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface PolrInputs {
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
  polrConfig: {
    mysqlPassword: Output<string>;
    appName: string;
    appAddress: string;
    defaultAdminUsername: Output<string>;
    defaultAdminPassword: Output<string>;
  };
}

export class PolrDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: PolrInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: PolrInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const polrImage = new RegistryImage(
      'polr',
      {
        name: 'ajanvier/polr:latest',
      },
      {
        parent: this,
      },
    );
    const mysqlImage = new RegistryImage(
      'polr-mysql',
      {
        name: 'mysql:8',
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

    const polrDataVolume = new Volume(
      'polr-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'polr/data'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network('polr-internal', {}, { parent: this });

    const polrDatabaseContainer = new Container(
      'polr-database',
      {
        image: mysqlImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'polr-database',
        envs: [
          'MYSQL_DATABASE=polr',
          'MYSQL_USER=polr',
          interpolate`MYSQL_PASSWORD=${args.polrConfig.mysqlPassword}`,
          'MYSQL_RANDOM_ROOT_PASSWORD=yes',
        ],
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [
          {
            volumeName: polrDataVolume.name,
            containerPath: '/var/lib/mysql',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, mysqlImage, polrDataVolume],
      },
    );
    const polrContainer = new Container(
      'polr',
      {
        image: polrImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'polr',
        envs: [
          interpolate`DB_HOST=${polrDatabaseContainer.hostname}`,
          interpolate`DB_PASSWORD=${args.polrConfig.mysqlPassword}`,
          interpolate`APP_NAME=${args.polrConfig.appName}`,
          interpolate`APP_ADDRESS=${args.polrConfig.appAddress}`,
          interpolate`ADMIN_USERNAME=${args.polrConfig.defaultAdminUsername}`,
          interpolate`ADMIN_PASSWORD=${args.polrConfig.defaultAdminPassword}`,
          'SETTING_SHORTEN_PERMISSION=true',
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
      },
      {
        parent: this,
        dependsOn: [args.network, internalNetwork, polrImage],
      },
    );

    return Promise.resolve({
      polrContainer,
      polrDatabaseContainer,
    });
  }
}
