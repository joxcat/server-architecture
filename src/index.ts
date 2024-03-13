import { Config } from '@pulumi/pulumi';
import * as docker from '@pulumi/docker';

import { CaddyDockerService } from './docker-services/caddy/caddy';
import { RssBridgeDockerService } from './docker-services/rss_bridge/rss_bridge';
import { RssForwarderDockerService } from './docker-services/rss_forwarder/rss_forwarder';
import { ShaarliDockerService } from './docker-services/shaarli/shaarli';
import { SeedboxDockerService } from './docker-services/seedbox/seedbox';

const config = new Config();

const dockerProxyNetwork = new docker.Network('proxy');

// SOURCE: https://rclone.org/docker/ for docker_driver_opts

new CaddyDockerService('docker_container', 'caddy', {
  network: dockerProxyNetwork,
  docker_driver_opts: {
    host: config.requireSecret('sftp.host'),
    port: config.requireSecret('sftp.port'),
    user: config.requireSecret('sftp.user'),
    password: config.requireSecret('sftp.password'),
  },
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new RssBridgeDockerService('docker_container', 'rss-bridge', {
  network: dockerProxyNetwork,
  platform: config.require('docker.platform'),
});

new RssForwarderDockerService('docker_container', 'rss-forwarder', {
  network: dockerProxyNetwork,
  docker_driver_opts: {
    host: config.requireSecret('sftp.host'),
    port: config.requireSecret('sftp.port'),
    user: config.requireSecret('sftp.user'),
    password: config.requireSecret('sftp.password'),
  },
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new ShaarliDockerService('docker_container', 'shaarli', {
  network: dockerProxyNetwork,
  docker_driver_opts: {
    host: config.requireSecret('sftp.host'),
    port: config.requireSecret('sftp.port'),
    user: config.requireSecret('sftp.user'),
    password: config.requireSecret('sftp.password'),
  },
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});

new SeedboxDockerService('docker_container', 'seedbox', {
  network: dockerProxyNetwork,
  docker_driver_opts: {
    host: config.requireSecret('sftp.host'),
    port: config.requireSecret('sftp.port'),
    user: config.requireSecret('sftp.user'),
    password: config.requireSecret('sftp.password'),
  },
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});