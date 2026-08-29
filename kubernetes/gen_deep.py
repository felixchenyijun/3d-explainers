#!/usr/bin/env python3
# Assembles deep.html from sections.json (workflow output) + static parts.
# Run: python3 gen_deep.py [sections.json]
import json, re, sys, html, pathlib

ROOT = pathlib.Path(__file__).parent
SRC = sys.argv[1] if len(sys.argv) > 1 else 'sections.json'

ORDER = ['shape','etcd','apiserver','concurrency','watch','reconcile',
         'controllers','scheduler','kubelet','leader','network','storage',
         'operators','lessons']

CAPTIONS = {
 'shape': 'Every component is a client of the API server. Watch the traffic, the forbidden shortcut, and what happens when one loop dies.',
 'etcd': 'A write becomes true when a majority of etcd members have it in their log. Then the leader dies, and it barely matters.',
 'apiserver': 'Three requests walk the write path: one clean, one stopped by RBAC, one stopped by schema validation.',
 'concurrency': 'Two controllers race on one object. The loser gets a 409, re-reads, and both intents survive.',
 'watch': 'LIST builds the local replica, WATCH keeps it current, a dropped stream resumes by version, and resync re-verifies everything.',
 'reconcile': 'Three events collapse to one key; the key rides the loop; a failed act is requeued with backoff and retried from zero.',
 'controllers': 'A rollout as it actually is — two ReplicaSets and arithmetic — then a cascading delete walked by the garbage collector.',
 'scheduler': 'Filter removes the impossible nodes, score ranks the survivors, and binding turns out to be one write.',
 'kubelet': 'The same loop at the edge: a bound pod arrives, containerd does the work, probes feed status, a crash is reconciled away.',
 'leader': 'Leader election with no election service: a lease renewed by CAS, drained by a crash, won by exactly one standby.',
 'lessons': 'Nine patterns worth stealing, in one place.',
 'network': 'A packet chases a virtual IP that no process listens on — rewritten by kernel rules, straight to a pod, and rerouted when a backend dies.',
 'storage': 'A claim becomes a disk: the provisioner reconciles intent into hardware, the disk follows the pod to its node, and outlives it.',
 'operators': 'A CRD teaches the API server a new noun; your controller gives it a janitor — and a 3am failover becomes a reconcile.',
}

# ── in-practice config blocks (hand-authored, verified separately) ──────
def yamlize(txt):
    """comments → .c, keys → .k, ⟦..⟧ → .hi spans"""
    out = []
    for line in txt.strip('\n').split('\n'):
        line = html.escape(line, quote=False)
        line = re.sub(r'(#.*)$', r'<span class="c">\1</span>', line)
        line = re.sub(r'^(\s*(?:-\s+)?)([\w./-]+)(:)', r'\1<span class="k">\2</span>\3', line)
        line = line.replace('&#x27E6;', '<span class="hi">').replace('&#x27E7;', '</span>')
        line = line.replace('⟦', '<span class="hi">').replace('⟧', '</span>')
        out.append(line)
    return '\n'.join(out)

PRACTICE = {
'apiserver': dict(title='in practice', file='rbac.yaml', note=
 'A request from <code>ci-bot</code> outside these verbs and resources dies at the RBAC gate with <code>403</code> — before admission, before validation, before anything.',
 code='''
# Who may do what — enforced at the one door, identically for every client.
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: shop
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "update", "patch"]   # no delete, no create
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-deploys
  namespace: shop
subjects:
- kind: ServiceAccount
  name: ci-bot
  namespace: shop
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io'''),

'concurrency': dict(title='in practice', file='three answers to the same race', note=
 'Controllers hit that 409 constantly and wrap writes in a re-GET-and-retry loop. <code>kubectl apply</code> avoids the race by patching instead; server-side apply turns it into an explicit field-ownership conflict. Same race, three answers.',
 code='''
# A write that carries a resourceVersion meets the check head-on.
# Replace from a stale copy and the API answers:
kubectl replace -f web.yaml
#   Error from server (Conflict): Operation cannot be fulfilled on
#   deployments.apps "web": the object has been modified; please
#   apply your changes to the latest version and try again   # HTTP 409

# The declarative path sidesteps it: apply computes a three-way merge
# (your file, the live object, the last-applied record) and sends a
# PATCH with no resourceVersion — no version check to trip:
kubectl apply -f web.yaml

# Server-side apply: field-level ownership. Two managers writing the
# same field get an explicit conflict instead of a silent clobber:
kubectl apply --server-side --field-manager=ci -f web.yaml
#   error: Apply failed with 1 conflict: conflict with
#   "kubectl-client-side-apply" using apps/v1: .spec.replicas
#   (yield the field, or take it with --force-conflicts)'''),

'controllers': dict(title='in practice', file='deployment.yaml', note=
 'Change <code>image</code> and the Deployment controller cuts a new ReplicaSet; <code>kubectl rollout undo</code> points back at the old one, which was kept for exactly this.',
 code='''
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
spec:
  replicas: ⟦3⟧                     # desired state — remove once an HPA owns scaling (last section)
  revisionHistoryLimit: 5          # old ReplicaSets kept around for rollback
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: ⟦1⟧                 # one extra pod may exist mid-rollout
      maxUnavailable: ⟦0⟧           # never dip below 3 — real only once a readinessProbe gates "ready"
  selector:
    matchLabels: { app: web }      # which pods this deployment owns
  template:
    metadata:
      labels: { app: web }         # must match the selector above
    spec:
      containers:
      - name: web
        image: ⟦ghcr.io/acme/web:1.7.2⟧   # pin versions — :latest defeats rollback
        ports:
        - containerPort: 8080'''),

'scheduler': dict(title='in practice', file='pod spec — placement inputs', note=
 '<code>requests</code> are a promise the scheduler plans around; <code>limits</code> are a fence the kubelet enforces. Omit both and the scheduler places your pod blind — omit only requests and they quietly default to the limits.',
 code='''
    spec:
      containers:
      - name: web
        image: ghcr.io/acme/web:1.7.2
        resources:
          requests:                # what the SCHEDULER uses to place the pod
            cpu: ⟦250m⟧
            memory: ⟦256Mi⟧
          limits:                  # what the KUBELET enforces at runtime
            memory: 512Mi          # over this → OOMKilled. a cpu limit (unset here) throttles instead
      tolerations:                 # permission to land on the node pool reserved for web
      - key: dedicated
        operator: Equal
        value: web
        effect: NoSchedule
      topologySpreadConstraints:   # spread replicas across failure domains
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels: { app: web }'''),

'kubelet': dict(title='in practice', file='probes — feeding the actual state', note=
 'Readiness gates traffic; liveness restarts. Point liveness at deadlock detection only — never at a dependency, or a flaky database restart-storms your whole fleet.',
 code='''
      containers:
      - name: web
        image: ghcr.io/acme/web:1.7.2
        startupProbe:              # gates the other probes until boot completes
          httpGet: { path: /healthz, port: 8080 }
          failureThreshold: 30     # 30 × 2s — up to a minute of grace at boot
          periodSeconds: 2
        readinessProbe:            # fail → removed from Service endpoints
          httpGet: { path: ⟦/ready⟧, port: 8080 }
          periodSeconds: 5
          timeoutSeconds: 3        # the 1s default times out on any GC pause
        livenessProbe:             # fail → container restarted, with backoff
          httpGet: { path: ⟦/healthz⟧, port: 8080 }
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3      # three misses before the kubelet restarts it'''),

'lessons': dict(title='in practice', file='the rest of a production stack', note=
 'The HPA is one more controller editing your desired state — so delete <code>replicas:</code> from the Deployment manifest once it owns scaling, or every re-apply stomps the autoscaler. The PDB is a constraint other controllers must respect while they work. Every piece is the same machinery.',
 code='''
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  selector: { app: web }           # membership by label — pods come and go
  ports:
  - port: 80
    targetPort: 8080
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
  namespace: shop
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 3
  maxReplicas: 12
  metrics:
  - type: Resource
    resource:
      name: cpu                    # utilization = usage ÷ request, so cpu
      target:                      # requests must be set on the pods
        type: Utilization
        averageUtilization: ⟦70⟧    # a controller now edits replicas for you
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
  namespace: shop
spec:
  maxUnavailable: ⟦1⟧               # tracks the autoscaled count; a fixed
  selector:                        # minAvailable goes stale as HPA scales
    matchLabels: { app: web }'''),
}

PRACTICE['network'] = dict(title='in practice', file='ingress.yaml — L7, same pattern', note=
 'An Ingress does nothing by itself — it is a row in the ledger. The ingress controller watches it and reprograms itself. cert-manager spots the <code>cluster-issuer</code> annotation, creates a <code>Certificate</code> object from the <code>tls:</code> block, runs the ACME flow, and lands the key pair in <code>shop-tls</code> — controllers all the way down. One caveat: the Ingress API is feature-frozen and <code>ingress-nginx</code> was retired in early 2026 — on new clusters reach for the <b>Gateway API</b> (Gateway + HTTPRoute) or a maintained class (Cilium, Traefik, cloud-managed); the pattern is identical.',
 code='''
# Inside the cluster, DNS + the VIP already work with zero config:
#   web.shop.svc.cluster.local → 10.96.0.12
#   (a virtual IP: no pod answers for it — every node's kernel rewrites it)

# For traffic from OUTSIDE, describe the route — as data:
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: shop
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt   # TLS via yet another controller
spec:
  ingressClassName: ⟦nginx⟧          # which watching controller acts on this
  rules:
  - host: shop.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web              # → the Service → the EndpointSlice → pods
            port:
              number: 80
  tls:
  - hosts: [shop.example.com]
    secretName: shop-tls           # cert-manager's ACME flow fills this Secret''')

PRACTICE['storage'] = dict(title='in practice', file='statefulset storage — each replica its own claim', note=
 '<code>volumeClaimTemplates</code> mint one claim per replica (<code>data-pg-0</code>, <code>data-pg-1</code>) so identity survives rescheduling — a single shared RWO claim would deadlock the second replica. <code>WaitForFirstConsumer</code> lets the scheduler pick the node first so the disk is born in the right zone. And <code>Retain</code> means deleting the claim — or the whole namespace — leaves the disk recoverable instead of gone.',
 code='''
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast
provisioner: ebs.csi.aws.com       # a CSI driver — storage's CRI
parameters:
  type: gp3
volumeBindingMode: ⟦WaitForFirstConsumer⟧   # provision where the pod lands
allowVolumeExpansion: true         # else the 10Gi is forever
reclaimPolicy: ⟦Retain⟧             # database class: deletion keeps the disk
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: pg
  namespace: shop
spec:
  serviceName: pg                  # headless Service providing pg-0.pg, pg-1.pg
  replicas: 2
  selector:
    matchLabels: { app: pg }
  template:
    metadata:
      labels: { app: pg }
    spec:
      containers:
      - name: postgres
        image: postgres:16
        env:
        - name: PGDATA             # one level below the mount — a fresh ext4
          value: ⟦/var/lib/postgresql/data/pgdata⟧   # volume has lost+found at its root
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:            # one claim PER REPLICA: data-pg-0, data-pg-1
  - metadata:
      name: data
    spec:
      accessModes: [ReadWriteOnce] # one node at a time (ReadWriteOncePod: one pod)
      storageClassName: fast
      resources:
        requests:
          storage: ⟦10Gi⟧''')

PRACTICE['operators'] = dict(title='in practice', file='crd.yaml — a new noun', note=
 'Apply the CRD, wait for it to report <code>Established</code> (a second or two — applying CRD and instance in one shot is a classic race), and <code>kubectl get pg</code>, RBAC and watch streams all work. Because the status subresource is on, your controller\'s Role needs both <code>postgresclusters</code> and <code>postgresclusters/status</code>. The only code you write is the controller.',
 code='''
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: postgresclusters.db.acme.io
spec:
  group: db.acme.io
  scope: Namespaced
  names:
    kind: PostgresCluster
    plural: postgresclusters
    shortNames: [pg]               # kubectl get pg
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:             # validation at the door, like any built-in
        type: object
        properties:
          spec:
            type: object
            properties:
              replicas: { type: integer, minimum: 1 }
              version:  { type: string }
          status:
            type: object
            properties:
              phase: { type: string }
    subresources:
      status: {}                   # the spec/status split — for YOUR type, free
---
# apply the CRD first, then:
#   kubectl wait --for=condition=Established crd/postgresclusters.db.acme.io
apiVersion: db.acme.io/v1
kind: PostgresCluster
metadata:
  name: pg-main
  namespace: shop
spec:
  replicas: ⟦2⟧
  version: "16"''')

# ── load sections ───────────────────────────────────────────────────────
try:
    data = json.loads(pathlib.Path(SRC).read_text())
    sections = {s['id']: s for s in data['sections']}
except Exception as e:
    print(f'!! no usable {SRC} ({e}) — using placeholders', file=sys.stderr)
    sections = {i: dict(id=i, kicker='placeholder', title=f'[{i}]',
                paras=['<b>Placeholder</b> prose pending workflow output.'] * 3,
                pattern='Placeholder pattern.',
                misconception=dict(wrong='Placeholder.', right='Placeholder.'),
                beats=[]) for i in ORDER}

def sec_html(sid, n):
    s = sections[sid]
    num = f'{n:02d}'
    before = s.get('before') or s['paras'][:2]
    after = s.get('after') or s['paras'][2:]
    p_before = '\n'.join(f'      <p>{p}</p>' for p in before)
    p_after = '\n'.join(f'      <p>{p}</p>' for p in after)
    practice = ''
    if sid in PRACTICE:
        p = PRACTICE[sid]
        practice = f'''
    <div class="practice">
      <div class="ph"><span class="t">{p['title']}</span><span class="f">{p['file']}</span></div>
      <pre>{yamlize(p['code'])}</pre>
      <p class="pnote">{p['note']}</p>
    </div>'''
    return f'''
  <section class="sec" id="s-{sid}">
    <p class="kicker"><span class="n">{num}</span> <span>{s['kicker']}</span></p>
    <h2>{s['title']}</h2>
    <div class="prose">
{p_before}
    </div>
    <figure class="fig" data-fig="{sid}">
      <figcaption><b>fig {num}</b> — {CAPTIONS[sid]}</figcaption>
    </figure>
    <div class="prose">
{p_after}
    </div>
    <aside class="wrong">
      <div><span class="tag">the usual wrong model</span><p>{s['misconception']['wrong']}</p></div>
      <div><span class="tag">what actually happens</span><p>{s['misconception']['right']}</p></div>
    </aside>{practice}
    <div class="pattern">
      <div class="tag">the pattern to steal</div>
      <p>{s['pattern']}</p>
    </div>
  </section>'''

toc = '\n'.join(
    f'      <a href="#s-{sid}"><span class="n">{i+1:02d}</span><span>{sections[sid]["title"]}</span></a>'
    for i, sid in enumerate(ORDER))

body_secs = '\n'.join(sec_html(sid, i + 1) for i, sid in enumerate(ORDER))

page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Control Plane, Deeply — how Kubernetes actually works</title>
<meta name="description" content="A written deep dive into Kubernetes control-plane internals — etcd and Raft, the API server pipeline, optimistic concurrency, informers, reconcile loops, the scheduler, the kubelet, leader election — with an animated figure for every section.">
<link rel="stylesheet" href="vendor/fonts/fonts.css">
<link rel="stylesheet" href="deep.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>☸</text></svg>">
</head>
<body>

<div id="readbar"></div>

<header id="topbar">
  <div class="mark">☸</div>
  <span class="t">Kubernetes</span>
  <span class="sep">/</span>
  <span class="t" style="color:var(--dim)">the control plane, deeply</span>
  <nav><a href="index.html">3D walkthrough →</a></nav>
</header>

<section id="hero">
  <p class="eyebrow">kubernetes · part two · the internals</p>
  <h1>The Control Plane, Deeply</h1>
  <div class="lede">
    <p>You have seen the loop close the gap — desired on one side, actual on the other, a controller squeezing the difference to zero. This is the same machine, opened up: how the ledger agrees with itself, how writes race without locks, how one watch stream replaces a million polls, and why a component you <code>kill&nbsp;-9</code> at 3am owes nobody an apology.</p>
    <p>Each section opens with a few lines of setup, then an animated figure does the real teaching — watch it, replay it, then read the short mechanics underneath to lock in the names and numbers. The <i>in&nbsp;practice</i> blocks show the real YAML where these ideas surface, and every section ends with the pattern worth stealing for systems that have nothing to do with containers.</p>
  </div>
  <div class="meta">
    <span>14 sections</span><span>~20 min · figures do the teaching</span><span>every figure replayable</span><span><a href="index.html">start with the 3D walkthrough ↩</a></span>
  </div>
</section>

<div id="frame">
  <nav id="toc" aria-label="Sections">
    <div class="toc-head">sections</div>
{toc}
  </nav>

  <main>
{body_secs}
  </main>
</div>

<footer id="foot">
  <a href="index.html">↩ Back to the 3D walkthrough</a>
  <div class="sub">watch the loop close the gap again — it will read differently now</div>
</footer>

<script type="module" src="src/deep/main.js"></script>
</body>
</html>
'''

pathlib.Path(ROOT / 'deep.html').write_text(page)
print(f'deep.html written · {len(page)} bytes · sections: {len(sections)}')
