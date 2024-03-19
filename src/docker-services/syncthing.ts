import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface SyncthingInputs {
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
}

export class SyncthingDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: SyncthingInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: SyncthingInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const syncthingImage = new RegistryImage(
      'syncthing',
      {
        name: 'lscr.io/linuxserver/syncthing:1.27.4',
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

    const syncthingConfigVolume = new Volume(
      'syncthing-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'syncthing/config'),
        },
      },
      {
        parent: this,
      },
    );
    const syncthingDataVolume = new Volume(
      'syncthing-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'syncthing/data'),
        },
      },
      {
        parent: this,
      },
    );

    const syncthingContainer = new Container(
      'syncthing',
      {
        image: syncthingImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'syncthing',
        envs: ['PUID=1000', 'PGID=1000', 'TZ=Europe/Paris'],
        ports: [
          {
            internal: 22000,
            external: 22000,
            protocol: 'tcp',
          },
          {
            internal: 22000,
            external: 22000,
            protocol: 'udp',
          },
          {
            internal: 21027,
            external: 21027,
            protocol: 'udp',
          },
        ],
        volumes: [
          {
            volumeName: syncthingConfigVolume.name,
            containerPath: '/config',
          },
          {
            volumeName: syncthingDataVolume.name,
            containerPath: '/data',
          },
        ],
        networksAdvanced: [{ name: args.network.id }],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          syncthingImage,
          syncthingConfigVolume,
          syncthingDataVolume,
        ],
      },
    );

    return Promise.resolve({
      syncthingContainer,
    });
  }
}
