import { Container, Image, Network, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface RssForwarderInputs {
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

export class RssForwarderDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: RssForwarderInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: RssForwarderInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const rssForwarderImage = new Image(
      'rss-forwarder',
      {
        imageName: 'rss-forwarder',
        build: {
          context: join(__dirname, 'docker'),
          platform: args.platform,
        },
        skipPush: true,
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

    const rssForwarderDataVolume = new Volume(
      'rss-forwarder-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'rss_forwarder/data'),
        },
      },
      {
        parent: this,
      },
    );

    const rssForwarderContainer = new Container(
      'rss-forwarder',
      {
        image: rssForwarderImage.repoDigest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'rss-forwarder',
        networksAdvanced: [{ name: args.network.id }],
        command: ['rss-forwarder', '--debug', '/data/config.toml'],
        volumes: [
          { volumeName: rssForwarderDataVolume.name, containerPath: '/data' },
        ],
      },
      {
        parent: this,
        dependsOn: [args.network, rssForwarderImage, rssForwarderDataVolume],
      },
    );

    return Promise.resolve({
      rssForwarderContainer,
    });
  }
}
