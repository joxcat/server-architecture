import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface GrafanaInputs {
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
  grafanaPlugins?: string;
}

export class GrafanaDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: GrafanaInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: GrafanaInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const grafanaImage = new RegistryImage(
      'grafana',
      {
        name: 'grafana/grafana-oss:latest',
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

    const grafanaDataVolume = new Volume(
      'grafana-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'grafana/data'),
        },
      },
      {
        parent: this,
      },
    );

    const grafanaContainer = new Container(
      'grafana',
      {
        image: grafanaImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'grafana',
        envs: [interpolate`GF_INSTALL_PLUGINS=${args.grafanaPlugins ?? ''}`],
        networksAdvanced: [{ name: args.network.id }],
        volumes: [
          {
            volumeName: grafanaDataVolume.name,
            containerPath: '/var/lib/grafana',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [args.network, grafanaImage, grafanaDataVolume],
      },
    );

    return Promise.resolve({
      grafanaContainer,
    });
  }
}
