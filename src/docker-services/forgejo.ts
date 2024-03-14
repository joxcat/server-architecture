import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface ForgejoInputs {
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

export class ForgejoDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: ForgejoInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: ForgejoInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const forgejoImage = new RegistryImage(
      'forgejo',
      {
        name: 'codeberg.org/forgejo/forgejo:1.21.5-0',
      },
      {
        parent: this,
      },
    );
    const forgejoRunnerImage = new RegistryImage(
      'forgejo-runner',
      {
        name: 'code.forgejo.org/forgejo/runner:3.3.0',
      },
      {
        parent: this,
      },
    );
    const dindImage = new RegistryImage(
      'forgejo-dind',
      {
        name: 'docker:dind',
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

    const forgejoDataVolume = new Volume(
      'forgejo-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'forgejo/data'),
        },
      },
      {
        parent: this,
      },
    );
    const forgejoRunnerVolume = new Volume(
      'forgejo-runner',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'forgejo/runner'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'forgejo-internal',
      {},
      { parent: this },
    );

    const forgejoDindContainer = new Container(
      'forgejo-dind',
      {
        image: dindImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'forgejo-dind',
        command: ['dockerd', '-H', 'tcp://0.0.0.0:2375', '--tls=false'],
        privileged: true,
        networksAdvanced: [{ name: internalNetwork.id }],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, dindImage],
      },
    );
    const forgejoRunnerContainer = new Container(
      'forgejo-runner',
      {
        image: forgejoRunnerImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'forgejo-runner',
        envs: [
          interpolate`DOCKER_HOST=tcp://${forgejoDindContainer.hostname}:2375`,
        ],
        command: ['forgejo-runner', '--config', 'config.yml', 'daemon'],
        // NOTE: To init `forgejo-runner register --no-interactive --token {TOKEN} --name runner --instance http://forgejo:3000`
        // command = [ "tail", "-f", "/dev/null" ]
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [
          {
            volumeName: forgejoRunnerVolume.name,
            containerPath: '/data',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, forgejoRunnerImage],
      },
    );
    const forgejoContainer = new Container(
      'forgejo',
      {
        image: forgejoImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'forgejo',
        envs: ['USER_UID=1000', 'USER_GID=1000'],
        ports: [
          {
            internal: 22,
            external: 22,
          },
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
        volumes: [
          {
            volumeName: forgejoDataVolume.name,
            containerPath: '/data',
          },
          {
            hostPath: '/etc/timezone',
            containerPath: '/etc/timezone',
            readOnly: true,
          },
          {
            hostPath: '/etc/localtime',
            containerPath: '/etc/localtime',
            readOnly: true,
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          internalNetwork,
          forgejoImage,
          forgejoDataVolume,
        ],
      },
    );

    return Promise.resolve({
      forgejoContainer,
      forgejoRunnerContainer,
    });
  }
}
