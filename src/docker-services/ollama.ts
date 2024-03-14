import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface OllamaInputs {
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

export class OllamaDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: OllamaInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: OllamaInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const ollamaImage = new RegistryImage(
      'ollama',
      {
        name: 'ghcr.io/ollama-webui/ollama-webui:main',
      },
      {
        parent: this,
      },
    );
    const ollamaRunnerImage = new RegistryImage(
      'ollama-runner',
      {
        name: 'ollama/ollama:latest',
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

    const ollamaDataVolume = new Volume(
      'ollama',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'ollama/data'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'ollama-internal',
      {},
      { parent: this },
    );

    const ollamaRunnerContainer = new Container(
      'ollama-runner',
      {
        image: ollamaRunnerImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'ollama-runner',
        networksAdvanced: [{ name: internalNetwork.id }],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, ollamaRunnerImage],
      },
    );
    const ollamaContainer = new Container(
      'ollama',
      {
        image: ollamaImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'ollama',
        envs: [interpolate`OLLAMA_API_BASE_URL=http://${ollamaRunnerContainer.hostname}:11434/api`],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
        volumes: [
          {
            volumeName: ollamaDataVolume.name,
            containerPath: '/app/backend/data                       ',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          internalNetwork,
          ollamaImage,
          ollamaDataVolume,
        ],
      },
    );

    return Promise.resolve({
      ollamaContainer,
      ollamaRunnerContainer,
    });
  }
}
