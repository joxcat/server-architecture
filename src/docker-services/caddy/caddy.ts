import { Container, Image, Network, Volume } from '@pulumi/docker';
import { interpolate, ComponentResource, Output, ResourceError } from '@pulumi/pulumi';
import { join } from 'path';

interface CaddyInputs {
  network: Network;
  docker_driver_opts: {
    host: Output<string>;
    port: Output<string>;
    user: Output<string>;
    password: Output<string>;
  };
  sftp_base_path: string;
  platform: string;
}

export class CaddyDockerService extends ComponentResource {
  protected async initialize(args: CaddyInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      throw new ResourceError('args.platform must be provided', this);

    const caddyImage = new Image('caddy', {
      imageName: 'caddy',
      build: {
        context: join(__dirname, 'docker'),
        platform: args.platform,
      },
      skipPush: true,
    }, {
      parent: this,
    });

    const dockerDriverOpts = {
      type: 'sftp',
      'sftp-host': interpolate`${args.docker_driver_opts.host}`,
      'sftp-port': interpolate`${args.docker_driver_opts.port}`,
      'sftp-user': interpolate`${args.docker_driver_opts.user}`,
      'sftp-pass': interpolate`${args.docker_driver_opts.password}`,
      'allow-other': 'true',
    };

    const caddyDataVolume = new Volume('caddy-data', {
      driver: 'rclone:latest',
      driverOpts: {
        ...dockerDriverOpts,
        path: join(args.sftp_base_path, 'caddy/data'),
      },
    }, {
      parent: this,
    });
    const caddyStateVolume = new Volume('caddy-state', {
      driver: 'rclone:latest',
      driverOpts: {
        ...dockerDriverOpts,
        path: join(args.sftp_base_path, 'caddy/state'),
      },
    }, {
      parent: this,
    });
    const caddyConfigVolume = new Volume('caddy-config', {
      driver: 'rclone:latest',
      driverOpts: {
        ...dockerDriverOpts,
        path: join(args.sftp_base_path, 'caddy/config'),
      },
    }, {
      parent: this,
    });

    const caddyContainer = new Container('caddy', {
      image: caddyImage.repoDigest,
      restart: 'unless-stopped',
      entrypoints: [
        'caddy',
        'run',
        '--config',
        '/etc/caddy/Caddyfile',
        '--adapter',
        'caddyfile',
      ],
      hosts: [
        {
          host: 'host.docker.internal',
          ip: 'host-gateway',
        },
      ],
      networksAdvanced: [{ name: args.network.id }],
      ports: [
        { internal: 80, external: 80 },
        { internal: 443, external: 443 },
      ],
      volumes: [
        { volumeName: caddyDataVolume.name, containerPath: '/data' },
        { volumeName: caddyStateVolume.name, containerPath: '/config' },
        { volumeName: caddyConfigVolume.name, containerPath: '/etc/caddy' },
      ]
    }, {
      parent: this,
      dependsOn: [
        caddyImage,
        args.network,
      ],
    });

    return Promise.resolve({
      caddyImage,
      caddyContainer,
      caddyDataVolume,
      caddyStateVolume,
      caddyConfigVolume,
    });
  }
}
