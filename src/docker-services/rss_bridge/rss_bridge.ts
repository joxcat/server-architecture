import { Container, Image, Network } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
} from '@pulumi/pulumi';
import { join } from 'path';

interface RssBridgeInputs {
  network: Network;
  platform: string;
  hostname?: string;
}

export class RssBridgeDockerService extends ComponentResource {
  constructor(
    type: string,
    name: string,
    args?: RssBridgeInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super(type, name, args, opts, remote);
  }

  protected async initialize(args: RssBridgeInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.platform)
      throw new ResourceError('args.platform must be provided', this);

    const rssBridgeImage = new Image(
      'rss-bridge',
      {
        imageName: 'rss-bridge',
        build: {
          context: join(__dirname, 'source'),
          platform: args.platform,
        },
        skipPush: true,
      },
      {
        parent: this,
      },
    );

    const rssBridgeContainer = new Container(
      'rss-bridge',
      {
        image: rssBridgeImage.repoDigest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'rss-bridge',
        networksAdvanced: [{ name: args.network.id }],
        volumes: [
          {
            hostPath: join(__dirname, 'whitelist.txt'),
            containerPath: '/app/whitelist.txt',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [args.network, rssBridgeImage],
      },
    );

    return Promise.resolve({
      rssBridgeContainer,
    });
  }
}
