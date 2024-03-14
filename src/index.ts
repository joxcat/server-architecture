import { Config } from '@pulumi/pulumi';
import * as docker from '@pulumi/docker';

import { CaddyDockerService } from './docker-services/caddy/caddy';
import { RssBridgeDockerService } from './docker-services/rss_bridge/rss_bridge';
import { RssForwarderDockerService } from './docker-services/rss_forwarder/rss_forwarder';
import { ShaarliDockerService } from './docker-services/shaarli/shaarli';
import { SeedboxDockerService } from './docker-services/seedbox/seedbox';
import { CoderDockerService } from './docker-services/coder/coder';
import { ConcourseDockerService } from './docker-services/concourse';
import { FilestashDockerService } from './docker-services/filestash/filestash';
import { ForgejoDockerService } from './docker-services/forgejo';
import { IpfsDockerService } from './docker-services/ipfs';
import { KellnrDockerService } from './docker-services/kellner';
import { OllamaDockerService } from './docker-services/ollama';

const config = new Config();

const dockerProxyNetwork = new docker.Network('proxy');

// SOURCE: https://rclone.org/docker/ for docker_driver_opts
const docker_driver_opts = {
  host: config.requireSecret('sftp.host'),
  port: config.requireSecret('sftp.port'),
  user: config.requireSecret('sftp.user'),
  password: config.requireSecret('sftp.password'),
};

new CaddyDockerService('caddy', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new RssBridgeDockerService('rss-bridge', {
  network: dockerProxyNetwork,
  platform: config.require('docker.platform'),
});

new RssForwarderDockerService('rss-forwarder', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new ShaarliDockerService('shaarli', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new SeedboxDockerService('seedbox', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new CoderDockerService('coder', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
  coderConfig: {
    accessUrl: config.requireSecret('coder.access_url'),
    wildcardUrl: config.requireSecret('coder.wildcard_url'),
    dockerGroupId: config.requireSecret('coder.docker_group_id'),
    postgresPassword: config.requireSecret('coder.postgres_password'),
  },
});

new ConcourseDockerService('concourse', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
  concourseConfig: {
    postgresPassword: config.requireSecret('concourse.postgres_password'),
    concourseAddLocalUser: config.requireSecret('concourse.add_local_user'),
    mainTeamLocalUser: config.requireSecret('concourse.main_team_local_user'),
  },
});

new FilestashDockerService('filestash', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
  filestashConfigSecret: config.requireSecret('filestash.config_secret'),
});

new ForgejoDockerService('forgejo', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new IpfsDockerService('ipfs', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new KellnrDockerService('kellnr', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new OllamaDockerService('ollama', {
  network: dockerProxyNetwork,
  docker_driver_opts,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});