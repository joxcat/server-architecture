import { Network } from '@pulumi/docker';
import * as kube from '@pulumi/kubernetes';
import {
  ComponentResource,
  ResourceError,
  ComponentResourceOptions,
} from '@pulumi/pulumi';

interface RegistryInputs {
  network: Network;
  platform: string;
  hostname?: string;
  provider: kube.Provider;
  domain: string;
}

export class RegistryKubeService extends ComponentResource {
  constructor(
    name: string,
    args?: RegistryInputs,
    opts?: ComponentResourceOptions,
    remote?: boolean,
  ) {
    super('kube_service', name, args, opts, remote);
  }

  protected async initialize(args: RegistryInputs): Promise<any> {
    if (!args.network)
      throw new ResourceError('args.network must be provided', this);
    if (!args.platform)
      throw new ResourceError('args.platform must be provided', this);

    const namespace = new kube.core.v1.Namespace(
      'registry',
      {},
      {
        parent: this,
      },
    );

    const registryDeployment = new kube.apps.v1.Deployment(
      'registry',
      {
        metadata: {
          namespace: namespace.id,
        },
        spec: {
          selector: { matchLabels: { app: 'registry' } },
          replicas: 1,
          template: {
            metadata: { labels: { app: 'registry' } },
            spec: {
              containers: [
                {
                  name: 'registry',
                  image: 'registry:2',
                  env: [
                    {
                      name: 'REGISTRY_HTTP_ADDR',
                      value: '0.0.0.0:5000',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      {
        parent: this,
        provider: args.provider,
      },
    );
    const registryService = new kube.core.v1.Service(
      'registry',
      {
        metadata: {
          namespace: namespace.id,
          labels: registryDeployment.spec.template.metadata.labels,
        },
        spec: {
          type: 'ClusterIP',
          ports: [{ port: 5000, targetPort: 5000, protocol: 'TCP' }],
          selector: { app: 'registry' },
        },
      },
      {
        parent: this,
        provider: args.provider,
      },
    );

    const registryScaledObject = new kube.apiextensions.CustomResource(
      'registry-autoscale',
      {
        kind: 'HTTPScaledObject',
        apiVersion: 'http.keda.sh/v1alpha1',
        metadata: {
          name: 'registry',
          namespace: namespace.id,
        },
        spec: {
          hosts: [args.domain],
          scaleTargetRef: {
            name: registryDeployment.metadata.name,
            kind: 'Deployment',
            service: registryService.metadata.name,
            port: 5000,
          },
          replicas: {
            min: 0,
            max: 2,
          },
        },
      },
      {
        parent: this,
        provider: args.provider,
      },
    );

    const registryTraefik = new kube.apiextensions.CustomResource(
      'registry-proxy',
      {
        kind: 'IngressRoute',
        apiVersion: 'traefik.io/v1alpha1',
        metadata: {
          name: 'registry-proxy',
          namespace: 'keda',
        },
        spec: {
          entryPoints: ['web', 'websecure'],
          routes: [
            {
              match: 'Host(`' + args.domain + '`)',
              kind: 'Rule',
              services: [
                {
                  name: 'keda-add-ons-http-interceptor-proxy',
                  port: 8080,
                },
              ],
            },
          ],
        },
      },
      {
        parent: this,
        provider: args.provider,
      },
    );

    return Promise.resolve({
      registryDeployment,
      registryService,
      registryScaledObject,
      registryTraefik,
    });
  }
}
