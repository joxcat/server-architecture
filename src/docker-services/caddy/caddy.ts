import { Container, Image } from '@pulumi/docker';
import { ComponentResource, Inputs } from '@pulumi/pulumi';

export class CaddyDockerService extends ComponentResource {
  protected initialize(args: Inputs): Promise<any> {
    if (!args.network) throw new Error('args.network must be provided');
    if (!args.storage) throw new Error('args.storage must be provided');

    const caddyImage = new Image('caddy', {
      imageName: 'caddy',
      build: {
        context: '.',
        dockerfile: 'Dockerfile',
      },
      skipPush: true,
    });

    const caddyContainer = new Container('caddy', {
      image: caddyImage.id,
      restart: 'unless-stopped',
      entrypoints: [
        'caddy',
        'run',
        '--config',
        '/etc/caddy/Caddyfile',
        '--adapter',
        'caddyfile',
      ],
    });

    return Promise.resolve({
      caddyImage,
      caddyContainer,
    });
  }
}
