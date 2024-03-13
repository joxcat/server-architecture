import {
  Container,
  Image,
  Network,
  RegistryImage,
  Volume,
} from '@pulumi/docker';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
  Output,
  interpolate,
} from '@pulumi/pulumi';
import { join } from 'path';

interface SeedboxInputs {
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

export class SeedboxDockerService extends ComponentResource {
  constructor(
    type: string,
    name: string,
    args?: SeedboxInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super(type, name, args, opts, remote);
  }

  protected async initialize(args: SeedboxInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.docker_driver_opts)
      throw new ResourceError('args.docker_driver_opts must be provided', this);
    if (!args.sftp_base_path)
      throw new ResourceError('args.sftp_base_path must be provided', this);
    if (!args.platform)
      if (!args.platform)
        throw new ResourceError('args.platform must be provided', this);

    const internalNetwork = new Network('internal-seedbox');

    const jellyfinImage = new RegistryImage(
      'jellyfin',
      {
        name: 'lscr.io/linuxserver/jellyfin:latest',
      },
      {
        parent: this,
      },
    );
    const floodImage = new RegistryImage(
      'flood',
      {
        name: 'jesec/flood:master',
      },
      {
        parent: this,
      },
    );
    // HACK: // Because of https://github.com/jesec/rtorrent/issues/53
    const rtorrentImage = new Image(
      'rtorrent',
      {
        imageName: 'rtorrent:alpine',
        build: {
          context: join(__dirname, 'rtorrent-docker'),
          platform: args.platform,
        },
        skipPush: true,
      },
      {
        parent: this,
      },
    );
    const jfaGoImage = new RegistryImage(
      'jfa-go',
      {
        name: 'hrfee/jfa-go:latest',
      },
      {
        parent: this,
      },
    );
    const radarrImage = new RegistryImage(
      'radarr',
      {
        name: 'lscr.io/linuxserver/radarr:latest',
      },
      {
        parent: this,
      },
    );
    const sonarrImage = new RegistryImage(
      'sonarr',
      {
        name: 'lscr.io/linuxserver/sonarr:latest',
      },
      {
        parent: this,
      },
    );
    const prowlarrImage = new RegistryImage(
      'prowlarr',
      {
        name: 'lscr.io/linuxserver/prowlarr:latest',
      },
      {
        parent: this,
      },
    );
    const flaresolverrImage = new RegistryImage(
      'flaresolverr',
      {
        name: 'ghcr.io/flaresolverr/flaresolverr:latest',
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

    const seedboxDataVolume = new Volume(
      'seedbox-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/data'),
        },
      },
      {
        parent: this,
      },
    );
    const seedboxConfigVolume = new Volume(
      'seedbox-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/config'),
        },
      },
      {
        parent: this,
      },
    );
    const radarrConfigVolume = new Volume(
      'seedbox-radarr-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/radarr_config'),
        },
      },
      {
        parent: this,
      },
    );
    const sonarrConfigVolume = new Volume(
      'seedbox-sonarr-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/sonarr_config'),
        },
      },
      {
        parent: this,
      },
    );
    const prowlarrConfigVolume = new Volume(
      'seedbox-prowlarr-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/prowlarr_config'),
        },
      },
      {
        parent: this,
      },
    );
    const jellyfinConfigVolume = new Volume(
      'seedbox-jellyfin-config',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/jellyfin_config'),
        },
      },
      {
        parent: this,
      },
    );
    const jfaGoDataVolume = new Volume(
      'seedbox-jfa-go-data',
      {
        driver: 'rclone:latest',
        driverOpts: {
          ...dockerDriverOpts,
          path: join(args.sftp_base_path, 'seedbox/jfa_go_data'),
        },
      },
      {
        parent: this,
      },
    );

    const floodContainer = new Container(
      'flood',
      {
        image: floodImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-flood',
        user: '1000:1001',
        envs: ['HOME=/config'],
        networksAdvanced: [{ name: args.network.id }],
        volumes: [
          { volumeName: seedboxDataVolume.name, containerPath: '/data' },
          { volumeName: seedboxConfigVolume.name, containerPath: '/config' },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          floodImage,
          seedboxDataVolume,
          seedboxConfigVolume,
        ],
      },
    );
    const radarrContainer = new Container(
      'radarr',
      {
        image: radarrImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-radarr',
        envs: ['PUID=1000', 'PGID=1001', 'TZ=Europe/Paris'],
        networksAdvanced: [{ name: args.network.id }],
        volumes: [
          { volumeName: seedboxDataVolume.name, containerPath: '/data' },
          {
            hostPath: seedboxConfigVolume.mountpoint.apply(
              (m) => `${m}/.local/share/rtorrent`,
            ),
            containerPath: '/config/.local/share/rtorrent',
          },
          { volumeName: radarrConfigVolume.name, containerPath: '/config' },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          radarrImage,
          seedboxDataVolume,
          seedboxConfigVolume,
          radarrConfigVolume,
        ],
      },
    );
    const sonarrContainer = new Container(
      'sonarr',
      {
        image: sonarrImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-sonarr',
        envs: ['PUID=1000', 'PGID=1001', 'TZ=Europe/Paris'],
        networksAdvanced: [{ name: args.network.id }],
        volumes: [
          { volumeName: seedboxDataVolume.name, containerPath: '/data' },
          {
            hostPath: seedboxConfigVolume.mountpoint.apply(
              (m) => `${m}/.local/share/rtorrent`,
            ),
            containerPath: '/config/.local/share/rtorrent',
          },
          { volumeName: sonarrConfigVolume.name, containerPath: '/config' },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          sonarrImage,
          seedboxDataVolume,
          seedboxConfigVolume,
          sonarrConfigVolume,
        ],
      },
    );
    const prowlarrContainer = new Container(
      'prowlarr',
      {
        image: prowlarrImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-prowlarr',
        envs: ['PUID=1000', 'PGID=1001', 'TZ=Europe/Paris'],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
        volumes: [
          { volumeName: prowlarrConfigVolume.name, containerPath: '/config' },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          internalNetwork,
          prowlarrImage,
          prowlarrConfigVolume,
        ],
      },
    );
    const flaresolverrContainer = new Container(
      'flaresolverr',
      {
        image: flaresolverrImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-flaresolverr',
        envs: [
          'LOG_LEVEL=info',
          'LOG_HTML=false',
          'CAPTCHA_SOLVER=none',
          'TZ=Europe/Paris',
        ],
        networksAdvanced: [
          { name: args.network.id },
          { name: internalNetwork.id },
        ],
      },
      {
        parent: this,
        dependsOn: [args.network, internalNetwork, flaresolverrImage],
      },
    );
    const rtorrentContainer = new Container(
      'rtorrent',
      {
        image: rtorrentImage.repoDigest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-rtorrent',
        user: '1000:1001',
        envs: ['HOME=/config'],
        command: ['-o', 'system.daemon.set=true'],
        memory: 2048,
        memorySwap: 2048,
        ports: [
          {
            external: 6881,
            internal: 6881,
            protocol: 'tcp',
          },
          {
            external: 6881,
            internal: 6881,
            protocol: 'udp',
          },
        ],
        volumes: [
          {
            volumeName: seedboxConfigVolume.name,
            containerPath: '/config',
          },
          {
            volumeName: seedboxDataVolume.name,
            containerPath: '/data',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [rtorrentImage, seedboxDataVolume, seedboxConfigVolume],
      },
    );
    const jellyfinContainer = new Container(
      'jellyfin',
      {
        image: jellyfinImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-jellyfin',
        envs: ['PUID=1000', 'PGID=1001', 'TZ=Europe/Paris'],
        networksAdvanced: [
          {
            name: args.network.id,
          },
        ],
        volumes: [
          {
            volumeName: jellyfinConfigVolume.name,
            containerPath: '/config',
          },
          {
            volumeName: seedboxDataVolume.name,
            containerPath: '/home',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          jellyfinImage,
          jellyfinConfigVolume,
          seedboxDataVolume,
        ],
      },
    );
    const jfaGoContainer = new Container(
      'jfa-go',
      {
        image: jfaGoImage.sha256Digest,
        restart: 'unless-stopped',
        hostname: args.hostname ?? 'seedbox-jfa-go',
        networksAdvanced: [
          {
            name: args.network.id,
          },
        ],
        volumes: [
          {
            volumeName: jellyfinConfigVolume.name,
            containerPath: '/jf',
          },
          {
            hostPath: '/etc/localtime',
            containerPath: '/etc/localtime',
          },
          {
            volumeName: jfaGoDataVolume.name,
            containerPath: '/data',
          },
        ],
      },
      {
        parent: this,
        dependsOn: [
          args.network,
          jfaGoImage,
          jfaGoDataVolume,
          jellyfinConfigVolume,
        ],
      },
    );

    return Promise.resolve({
      floodContainer,
      radarrContainer,
      sonarrContainer,
      prowlarrContainer,
      flaresolverrContainer,
      rtorrentContainer,
      jellyfinContainer,
      jfaGoContainer,
    });
  }
}
