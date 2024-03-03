import { Config } from '@pulumi/pulumi';
import * as docker from '@pulumi/docker';

import { CaddyDockerService } from './docker-services/caddy/caddy';

const config = new Config();

const dockerProxyNetwork = new docker.Network('proxy');

new CaddyDockerService('docker_container', 'caddy', {
  network: dockerProxyNetwork,
  // SOURCE: https://rclone.org/docker/
  docker_driver_opts: {
    host: config.requireSecret('sftp.host'),
    port: config.requireSecret('sftp.port'),
    user: config.requireSecret('sftp.user'),
    password: config.requireSecret('sftp.password'),
  },
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  platform: config.require('docker.platform'),
});
