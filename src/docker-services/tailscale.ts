import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';

interface TailscaleInputs {
  network: Network;
  platform: string;
  sftp_base_path: string;
  hostname?: string;
  tailscaleAuthKey: Output<string>;
}

export class TailscaleDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: TailscaleInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: TailscaleInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const tailscaleImage = new RegistryImage(
      'tailscale',
      {
        name: 'ghcr.io/tailscale/tailscale:latest',
      },
      {
        parent: this,
      },
    );

    const tailscaleDataVolume = new Volume(
      'tailscale-data',
      {},
      {
        parent: this,
      },
    );

    const tailscaleContainer = new Container(
      'tailscale',
      {
        image: tailscaleImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'tailscale',
        envs: [
          'TS_EXTRA_ARGS=--advertise-tags=tag:container',
          'TS_STATE_DIR=/var/lib/tailscale',
          interpolate`TS_AUTHKEY=${args.tailscaleAuthKey}`,
        ],
        volumes: [{
          volumeName: tailscaleDataVolume.name,
          containerPath: '/var/lib/tailscale',
        }],
        networksAdvanced: [
          { name: args.network.id },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          tailscaleImage,
          tailscaleDataVolume,
        ],
      },
    );

    return Promise.resolve({
      tailscaleContainer,
    });
  }
}
