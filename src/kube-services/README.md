# Deploy nginx demo using KEDA
```ts
const namespace = new kube.core.v1.Namespace('nginx');
const kubeconfig = readFileSync(process.env['KUBECONFIG'] ?? '').toString()
const k3s = new kube.Provider('k3s', {
  kubeconfig,
  namespace: namespace.id,
});

const image = new docker.RemoteImage('nginx', {
  name: 'nginx:latest',
})
const nginxDeployment = new kube.apps.v1.Deployment('nginx', {
  spec: {
    selector: { matchLabels: { app: 'nginx' } },
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
const nginxService = new kube.core.v1.Service('nginx', {
  metadata: {
    labels: nginxDeployment.spec.template.metadata.labels,
  },
  spec: {
    type: "ClusterIP",
    ports: [{ port: 8080, targetPort: 80, protocol: "TCP" }],
    selector: { app: 'nginx' },
  },
}, {
  provider: k3s,
});

const nginxScaledObject = new kube.apiextensions.CustomResource('nginx-autoscale', {
  kind: 'HTTPScaledObject',
  apiVersion: 'http.keda.sh/v1alpha1',
  metadata: {
    name: 'nginx',
  },
  spec: {
    hosts: ["example.org"],
    scaleTargetRef: { 
      name: nginxDeployment.metadata.name,
      kind: "Deployment",
      service: nginxService.metadata.name,
      port: 8080,
    },
    replicas: {
      min: 0,
      max: 2,
    },
  },
}, {
  provider: k3s,
});

const nginxTraefik = new kube.apiextensions.CustomResource('nginx-proxy', {
  kind: 'IngressRoute',
  apiVersion: 'traefik.io/v1alpha1',
  metadata: {
    name: 'nginx-proxy',
    namespace: 'keda',
  },
  spec: {
    entryPoints: ['web'],
    routes: [{
      match: 'Host(`example.org`)',
      kind: 'Rule',
      services: [{
        name: 'keda-add-ons-http-interceptor-proxy',
        port: 8080,
      }],
    }]
  }
}, {
  provider: k3s,
});
```