import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface KellnrInputs {
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

export class KellnrDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: KellnrInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: KellnrInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const kellnrImage = new RegistryImage(
      'kellnr',
      {
        name: 'ghcr.io/kellnr/kellnr:5.1.2',
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

    const kellnrDataVolume = new Volume(
      'kellnr-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'kellnr/data'),
        },
      },
      {
        parent: this,
      },
    );
    
    const kellnrContainer = new Container(
      'kellnr',
      {
        image: kellnrImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'kellnr',
        envs: [
          "KELLNR_ORIGIN__HOSTNAME=registry.tracto.pl",
          "KELLNR_ORIGIN__PORT=443",
          "KELLNR_ORIGIN__PROTOCOL=https",
          "KELLNR_DOCS__ENABLED=true"
        ],
        networksAdvanced: [
          { name: args.network.id },
        ],
        volumes: [
          {
            volumeName: kellnrDataVolume.name,
            containerPath: '/opt/kdata',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          kellnrImage,
          kellnrDataVolume,
        ],
      },
    );

    return Promise.resolve({
      kellnrContainer,
    });
  }
}
