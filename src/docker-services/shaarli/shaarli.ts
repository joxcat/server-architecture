import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { readdirSync } from 'fs';
import { join } from 'path';

interface ShaarliInputs {
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

export class ShaarliDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: ShaarliInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: ShaarliInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const shaarliImage = new RegistryImage(
      'shaarli',
      {
        name: 'ghcr.io/shaarli/shaarli:v0.13.0',
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

    const shaarliDataVolume = new Volume(
      'shaarli-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'shaarli/data'),
        },
      },
      {
        parent: this,
      },
    );

    const hostPluginDirectory = join(__dirname, 'plugins');
    const shaarliContainer = new Container(
      'shaarli',
      {
        image: shaarliImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'shaarli',
        networksAdvanced: [{ name: args.network.id }],
        volumes: [
          {
            volumeName: shaarliDataVolume.name,
            containerPath: '/var/www/shaarli/data',
          },
          {
            hostPath: join(__dirname, 'themes/stack/stack'),
            containerPath: '/var/www/shaarli/tpl/stack',
          },
          ...readdirSync(hostPluginDirectory).map((p) => ({
            hostPath: join(hostPluginDirectory, p),
            containerPath: `/var/www/shaarli/plugins/${p}`,
          })),
        ],
      },
      {
        parent: this,
        dependsOn: [args.network, shaarliImage, shaarliDataVolume],
      },
    );

    return Promise.resolve({
      shaarliImage,
      shaarliContainer,
      shaarliDataVolume,
    });
  }
}
