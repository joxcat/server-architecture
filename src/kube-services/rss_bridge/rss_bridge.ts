import { Container, Image, Network } from '@pulumi/docker';
import * as kube from '@pulumi/kubernetes';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
} from '@pulumi/pulumi';
import { readFileSync } from 'fs';
import { join } from 'path';

interface RssBridgeInputs {
  network: Network;
  platform: string;
  hostname?: string;
  provider: kube.Provider;
  domain: string;
}

export class RssBridgeKubeService extends ComponentResource {
  constructor(
    name: string,
    args?: RssBridgeInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('kube_service', name, args, opts, remote);
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

    const namespace = new kube.core.v1.Namespace('rss-bridge', {}, {
      parent: this,
    });

    const rssBridgeConfigMap = new kube.core.v1.ConfigMap('rss-bridge', {
      metadata: {
        name: 'rss-bridge-config',
        namespace: namespace.id,
      },
      data: {
        'whitelist.txt': readFileSync(join(__dirname, 'whitelist.txt')).toString(),
      },
    }, {
      parent: this,
      provider: args.provider,
    });

    const rssBridgeDeployment = new kube.apps.v1.Deployment('rss-bridge', {
      metadata: {
        namespace: namespace.id,
      },
      spec: {
        selector: { matchLabels: { app: 'rss-bridge' } },
        replicas: 1,
        template: {
          metadata: { labels: { app: 'rss-bridge' } },
          spec: { 
            containers: [{
              name: 'rss-bridge',
              image: rssBridgeImage.imageName,
              imagePullPolicy: 'Never',
              volumeMounts: [{
                name: 'rss-bridge',
                mountPath: '/app/whitelist.txt',
                subPath: 'whitelist.txt',
              }],
            }], 
            volumes: [{
              name: 'rss-bridge',
              configMap: { name: rssBridgeConfigMap.metadata.name },
            }],
          },
        },
      },
    }, {
      parent: this,
      provider: args.provider,
    });
    const rssBridgeService = new kube.core.v1.Service('rss-bridge', {
      metadata: {
        namespace: namespace.id,
        labels: rssBridgeDeployment.spec.template.metadata.labels,
      },
      spec: {
        type: "ClusterIP",
        ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
        selector: { app: 'rss-bridge' },
      },
    }, {
      parent: this,
      provider: args.provider,
    });
    
    const rssBridgeScaledObject = new kube.apiextensions.CustomResource('nginx-autoscale', {
      kind: 'HTTPScaledObject',
      apiVersion: 'http.keda.sh/v1alpha1',
      metadata: {
        name: 'rss-bridge',
        namespace: namespace.id,
      },
      spec: {
        hosts: [args.domain],
        scaleTargetRef: { 
          name: rssBridgeDeployment.metadata.name,
          kind: "Deployment",
          service: rssBridgeService.metadata.name,
          port: 80,
        },
        replicas: {
          min: 0,
          max: 2,
        },
      },
    }, {
      parent: this,
      provider: args.provider,
    });
    
    const rssBridgeTraefik = new kube.apiextensions.CustomResource('nginx-proxy', {
      kind: 'IngressRoute',
      apiVersion: 'traefik.io/v1alpha1',
      metadata: {
        name: 'rss-bridge-proxy',
        namespace: 'keda',
      },
      spec: {
        entryPoints: ['web','websecure'],
        routes: [{
          match: 'Host(`'+ args.domain +'`)',
          kind: 'Rule',
          services: [{
            name: 'keda-add-ons-http-interceptor-proxy',
            port: 8080,
          }],
        }]
      }
    }, {
      parent: this,
      provider: args.provider,
    });

    return Promise.resolve({
      rssBridgeDeployment,
      rssBridgeService,
      rssBridgeScaledObject,
      rssBridgeTraefik,
    });
  }
}
