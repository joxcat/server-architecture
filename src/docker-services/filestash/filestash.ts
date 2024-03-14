import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface FilestashInputs {
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
  filestashConfigSecret: Output<String>;
}

export class FilestashDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: FilestashInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: FilestashInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const filestashImage = new RegistryImage(
      'filestash',
      {
        name: 'machines/filestash:latest',
      },
      {
        parent: this,
      },
    );
    const onlyofficeImage = new RegistryImage(
      'filestash-onlyoffice',
      {
        name: 'onlyoffice/documentserver:latest',
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

    const filestashConfigVolume = new Volume(
      'filestash-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'filestash/config'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'filestash-internal',
      {},
      { parent: this },
    );

    const filestashOnlyofficeContainer = new Container(
      'filestash-onlyoffice',
      {
        image: onlyofficeImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'onlyoffice',
        networksAdvanced: [{ name: internalNetwork.id }],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, onlyofficeImage],
      },
    );
    const filestashContainer = new Container(
      'filestash',
      {
        image: filestashImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'filestash',
        envs: [
          "APPLICATION_URL=",
          "ONLYOFFICE_URL=http://onlyoffice",
          interpolate`CONFIG_SECRET=${args.filestashConfigSecret}`,
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
        volumes: [
          {
            volumeName: filestashConfigVolume.name,
            containerPath: '/app/data/state',
          },
          {
            hostPath: join(__dirname, 'local_data/data'),
            containerPath: '/app/data/state',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          internalNetwork,
          filestashImage,
          filestashConfigVolume,
        ],
      },
    );

    return Promise.resolve({
      filestashContainer,
      filestashOnlyofficeContainer,
    });
  }
}
