import { Container, Network, RegistryImage, Volume } from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface ConcourseInputs {
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
  concourseConfig: {
    postgresPassword: Output<string>;
    concourseAddLocalUser: Output<string>;
    mainTeamLocalUser: Output<string>;
  };
}

export class ConcourseDockerService extends ComponentResource {
  constructor(
    name: string,
    args?: ConcourseInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('docker_service', name, args, opts, remote);
  }

  protected async initialize(args: ConcourseInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const concourseImage = new RegistryImage(
      'concourse',
      {
        name: 'concourse/concourse:7.11.1',
      },
      {
        parent: this,
      },
    );
    const postgresImage = new RegistryImage(
      'concourse-postgres',
      {
        name: 'postgres:15-alpine',
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

    const concourseDataVolume = new Volume(
      'concourse-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'concourse/data'),
        },
      },
      {
        parent: this,
      },
    );
    const concourseKeysVolume = new Volume(
      'concourse-keys',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'concourse/keys'),
        },
      },
      {
        parent: this,
      },
    );

    const internalNetwork = new Network(
      'concourse-internal',
      {},
      { parent: this },
    );

    const concoursePostgresContainer = new Container(
      'concourse-postgres',
      {
        image: postgresImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'concourse-db',
        envs: [
          'POSTGRES_USER=concours_user',
          interpolate`POSTGRES_PASSWORD=${args.concourseConfig.postgresPassword}`,
          'POSTGRES_DB=concourse',
          'PGDATA=/database',
        ],
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [
          {
            volumeName: concourseDataVolume.name,
            containerPath: '/database',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, postgresImage, concourseDataVolume],
      },
    );
    const concourseContainer = new Container(
      'concourse',
      {
        image: concourseImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'concourse',
        command: ['web'],
        envs: [
          'CONCOURSE_SESSION_SIGNING_KEY=/concourse-keys/session_signing_key',
          'CONCOURSE_TSA_AUTHORIZED_KEYS=/concourse-keys/authorized_worker_keys',
          'CONCOURSE_TSA_HOST_KEY=/concourse-keys/tsa_host_key',
          interpolate`CONCOURSE_POSTGRES_HOST=${concoursePostgresContainer.hostname}`,
          'CONCOURSE_POSTGRES_USER=concourse_user',
          interpolate`CONCOURSE_POSTGRES_PASSWORD=${args.concourseConfig.postgresPassword}`,
          'CONCOURSE_POSTGRES_DATABASE=concourse',
          'CONCOURSE_EXTERNAL_URL=https://cicd.planchon.dev',
          interpolate`CONCOURSE_ADD_LOCAL_USER=${args.concourseConfig.concourseAddLocalUser}`,
          interpolate`CONCOURSE_MAIN_TEAM_LOCAL_USER=${args.concourseConfig.mainTeamLocalUser}`,
          'CONCOURSE_CLUSTER_NAME=dev',
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
        volumes: [
          {
            volumeName: concourseKeysVolume.name,
            containerPath: '/concourse-keys',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          internalNetwork,
          concourseImage,
          concourseKeysVolume,
        ],
      },
    );
    const concourseWorkerContainer = new Container(
      'concourse-worker',
      {
        image: concourseImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: 'concourse-worker',
        command: ['worker'],
        privileged: true,
        envs: [
          'CONCOURSE_RUNTIME=containerd',
          'CONCOURSE_TSA_PUBLIC_KEY=/concourse-keys/tsa_host_key.pub',
          'CONCOURSE_TSA_WORKER_PRIVATE_KEY=/concourse-keys/worker_key',
          interpolate`CONCOURSE_TSA_HOST=${concourseContainer.hostname}:2222`,
          'CONCOURSE_BIND_IP=0.0.0.0',
          'CONCOURSE_BAGGAGECLAIM_BIND_IP=0.0.0.0',
          'CONCOURSE_BAGGAGECLAIM_DRIVER=overlay',
          'CONCOURSE_CONTAINERD_DNS_PROXY_ENABLE=true',
        ],
        networksAdvanced: [{ name: internalNetwork.id }],
        volumes: [
          {
            volumeName: concourseKeysVolume.name,
            containerPath: '/concourse-keys',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [internalNetwork, concourseImage, concourseKeysVolume],
      },
    );

    return Promise.resolve({
      concourseContainer,
      concoursePostgresContainer,
      concourseWorkerContainer,
    });
  }
}
