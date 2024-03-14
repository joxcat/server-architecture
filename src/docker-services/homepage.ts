import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface HomepageInputs {
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

export class HomepageDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: HomepageInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: HomepageInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const homepageImage = new RegistryImage(
      'homepage',
      {
        name: 'ghcr.io/gethomepage/homepage:v0.8.9',
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

    const homepageConfigVolume = new Volume(
      'homepage-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'homepage/config'),
        },
      },
      {
        parent: this,
      },
    );
    
    const homepageContainer = new Container(
      'homepage',
      {
        image: homepageImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'homepage',
        envs: [
          'PUID=1000',
          'PGID=1000',
        ],
        networksAdvanced: [
          { name: args.network.id },
        ],
        volumes: [
          {
            volumeName: homepageConfigVolume.name,
            containerPath: '/app/config',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          homepageImage,
          homepageConfigVolume,
        ],
      },
    );

    return Promise.resolve({
        homepageContainer,
    });
  }
}
