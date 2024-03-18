import { Config, Output } from '@pulumi/pulumi';
import * as docker from '@pulumi/docker';
import * as kube from '@pulumi/kubernetes';

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
import { PolrDockerService } from './docker-services/polr';
import { RssMinifluxDockerService } from './docker-services/rss_miniflux';
import { UmamiDockerService } from './docker-services/umami';
import { HomepageDockerService } from './docker-services/homepage';
import { GrafanaDockerService } from './docker-services/grafana';
import { SyncthingDockerService } from './docker-services/syncthing';
import { TailscaleDockerService } from './docker-services/tailscale';
import { readFileSync } from 'fs';

const config = new Config();

const dockerProxyNetwork = new docker.Network('proxy');

const baseParams = {
  network: dockerProxyNetwork,
  platform: config.require('docker.platform'),
};
// SOURCE: https://rclone.org/docker/ for docker_driver_opts
const sftpBaseParams = {
  ...baseParams,
  sftp_base_path: config.get('sftp.base_path') ?? '/',
  docker_driver_opts: {
    host: config.requireSecret('sftp.host'),
    port: config.requireSecret('sftp.port'),
    user: config.requireSecret('sftp.user'),
    password: config.requireSecret('sftp.password'),
  },
};

// new CaddyDockerService('caddy', sftpBaseParams);
// new RssBridgeDockerService('rss-bridge', baseParams);
// new RssForwarderDockerService('rss-forwarder', sftpBaseParams);
// new ShaarliDockerService('shaarli', sftpBaseParams);
// new SeedboxDockerService('seedbox', sftpBaseParams);
// new CoderDockerService('coder', {
//   ...sftpBaseParams,
//   coderConfig: {
//     accessUrl: config.requireSecret('coder.access_url'),
//     wildcardUrl: config.requireSecret('coder.wildcard_url'),
//     dockerGroupId: config.requireSecret('coder.docker_group_id'),
//     postgresPassword: config.requireSecret('coder.postgres_password'),
//   },
// });
// new ConcourseDockerService('concourse', {
//   ...sftpBaseParams,
//   concourseConfig: {
//     postgresPassword: config.requireSecret('concourse.postgres_password'),
//     concourseAddLocalUser: config.requireSecret('concourse.add_local_user'),
//     mainTeamLocalUser: config.requireSecret('concourse.main_team_local_user'),
//   },
// });
// new FilestashDockerService('filestash', {
//   ...sftpBaseParams,
//   filestashConfigSecret: config.requireSecret('filestash.config_secret'),
// });
// new ForgejoDockerService('forgejo', sftpBaseParams);
// new IpfsDockerService('ipfs', sftpBaseParams);
// new KellnrDockerService('kellnr', sftpBaseParams);
// new OllamaDockerService('ollama', sftpBaseParams);
// new PolrDockerService('polr', {
//   ...sftpBaseParams,
//   polrConfig: {
//     mysqlPassword: config.requireSecret('polr.mysql_password'),
//     appName: config.require('polr.app_name'),
//     appAddress: config.require('polr.app_address'),
//     defaultAdminUsername: config.requireSecret('polr.default_admin_username'),
//     defaultAdminPassword: config.requireSecret('polr.default_admin_password'),
//   },
// });
// new RssMinifluxDockerService('miniflux', {
//   ...sftpBaseParams,
//   postgresPassword: config.requireSecret('miniflux.postgres_password'),
// });
// new UmamiDockerService('umami', {
//   ...sftpBaseParams,
//   umamiConfig: {
//     postgresPassword: config.requireSecret('umami.postgres_password'),
//     appSecret: config.requireSecret('umami.app_secret'),
//   },
// });
// new HomepageDockerService('homepage', sftpBaseParams);
// new GrafanaDockerService('grafana', {
//   ...sftpBaseParams,
//   grafanaPlugins: '',
// });
// new SyncthingDockerService('syncthing', sftpBaseParams);
// new TailscaleDockerService('tailscale', {
//   ...sftpBaseParams,
//   tailscaleAuthKey: config.requireSecret('tailscale.auth_key'),
// });

const k3s = new kube.Provider('k3s', {
  kubeconfig: readFileSync(process.env['KUBECONFIG'] ?? '').toString()
});

const image = new docker.RemoteImage('nginx', {
  name: 'nginx:latest',
})
const nginx = new kube.apps.v1.Deployment('nginx', {
  spec: {
    selector: { matchLabels: { app:'nginx' } },
    replicas: 1,
    template: {
      metadata: { labels: { app: 'nginx' } },
      spec: { containers: [{ 
        name: 'nginx', 
        image: image.name,
      }] },
    },
  },
}, {
  provider: k3s,
});
const frontend = new kube.core.v1.Service('nginx', {
  metadata: { labels: nginx.spec.template.metadata.labels },
  spec: {
    type: "ClusterIP",
    ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
    selector: { app: 'nginx' },
  },
}, {
  provider: k3s,
});
export let frontendIp: Output<string>;
frontendIp = frontend.spec.clusterIP;

const keda = new kube.helm.v3.Chart("keda", {
  repo: "kedacore",
  chart: "keda",
  fetchOpts: {
    repo: "https://kedacore.github.io/charts",
  },
}, {
  provider: k3s,
});
const kedaHttp = new kube.helm.v3.Chart("keda-http", {
  repo: "kedacore",
  chart: "keda-add-ons-http",
  fetchOpts: {
    repo: "https://kedacore.github.io/charts",
  },
}, {
  provider: k3s,
});
const httpScaledObject = new kube.apiextensions.CustomResource('scaled-object', {
  kind: 'HTTPScaledObject',
  apiVersion: 'http.keda.sh/v1alpha1',
  metadata: {
    name: 'nginx',
  },
  spec: {
    scaleTargetRef: { 
      name: "nginx",
      kind: "Deployment",
      service: "nginx",
      port: 80,
    },
    replicas: {
      min: 0,
      max: 2,
    },
    scaledownPeriod: 30,
  }
}, {
  provider: k3s,
});