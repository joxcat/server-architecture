import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface IpfsInputs {
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

export class IpfsDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: IpfsInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: IpfsInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const ipfsImage = new RegistryImage(
      'ipfs',
      {
        name: 'ipfs/kubo:latest',
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

    const ipfsDataVolume = new Volume(
      'ipfs-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'ipfs/data'),
        },
      },
      {
        parent: this,
      },
    );
    
    const ipfsContainer = new Container(
      'ipfs',
      {
        image: ipfsImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'ipfs',
        envs: [
          'IPFS_PROFILE=server',
        ],
        ports: [{
          ip: '0.0.0.0',
          internal: 4001,
          external: 4001,
          protocol: 'tcp',
        }, {
          ip: '0.0.0.0',
          internal: 4001,
          external: 4001,
          protocol: 'udp',
        }],
        networksAdvanced: [
          { name: args.network.id },
        ],
        volumes: [
          {
            volumeName: ipfsDataVolume.name,
            containerPath: '/data/ipfs',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          ipfsImage,
          ipfsDataVolume,
        ],
      },
    );

    return Promise.resolve({
      ipfsContainer,
    });
  }
}
