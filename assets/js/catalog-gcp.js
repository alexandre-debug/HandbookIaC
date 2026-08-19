/* =========================================================
   catalog-gcp.js — componentes GCP do laboratório
   ========================================================= */
(function (IAC) {
  'use strict';

  const CATS = [
    { id: 'base', name: 'Fundação', em: '🧱' },
    { id: 'net', name: 'Rede (VPC)', em: '🌐' },
    { id: 'sec', name: 'IAM & Segredos', em: '🔐' },
    { id: 'reg', name: 'Artifact Registry', em: '📦' },
    { id: 'lb', name: 'Load Balancing', em: '⚖️' },
    { id: 'comp', name: 'Compute Engine', em: '🖥️' },
    { id: 'cont', name: 'Cloud Run & GKE', em: '🐳' },
    { id: 'data', name: 'Dados', em: '🗄️' },
    { id: 'ops', name: 'Observabilidade', em: '📈' }
  ];

  const R = [];
  const C = def => { R.push(def); return def; };

  C({
    id: 'core', cat: 'base', name: 'Fundação: provider + APIs', em: '🧱',
    tf: 'provider google · google_project_service', required: true, multi: false, cost: 0,
    desc: 'No GCP existe um passo que a AWS não tem: <b>habilitar as APIs do projeto</b>. Esquecer isso é o erro nº 1 de quem vem da AWS.',
    console: [
      'Console → APIs & Services → Enable APIs and services',
      'Procurar "Compute Engine API" → Enable (repetir para cada serviço)',
      'IAM → conceder papéis à sua conta'
    ],
    gotchas: [
      'Cada serviço precisa da sua API habilitada. Sem isso: <code>Error 403: ... API has not been used in project ... before or it is disabled</code>.',
      'A ativação leva alguns minutos para propagar — coloque <code>depends_on</code> nos recursos que usam a API.',
      '<code>disable_on_destroy = false</code>: um destroy não deve desligar a API do projeto inteiro.',
      'No GCP o <b>projeto</b> é a unidade de isolamento (equivale mais ou menos à conta AWS). Um projeto por ambiente é o padrão.',
      'Labels do GCP não aceitam maiúscula nem espaço — só minúsculas, números, <code>-</code> e <code>_</code>.'
    ],
    inputs: [
      { k: 'project', l: 'Project ID', t: 'text', v: 'minha-app-prod' },
      { k: 'region', l: 'Região', t: 'sel', v: 'southamerica-east1', opts: [['southamerica-east1', 'southamerica-east1 · São Paulo'], ['us-central1', 'us-central1 · Iowa'], ['europe-west1', 'europe-west1 · Bélgica']] },
      { k: 'env', l: 'Ambiente', t: 'sel', v: 'prod', opts: [['dev', 'dev'], ['stg', 'stg'], ['prod', 'prod']] }
    ],
    file: 'main.tf',
    hcl: (c) => `terraform {
  required_version = "~> 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.8"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Equivalente ao default_tags da AWS (so aceita minusculas).
  default_labels = {
    ambiente   = var.env
    gerenciado = "terraform"
  }
}

variable "project_id" {
  type        = string
  description = "ID do projeto GCP"
  default     = "${c.project}"
}

variable "region" {
  type        = string
  description = "Regiao padrao"
  default     = "${c.region}"
}

variable "env" {
  type        = string
  description = "Ambiente"
  default     = "${c.env}"
}

locals {
  name = "\${replace(var.project_id, "-prod", "")}-\${var.env}"

  labels = {
    ambiente   = var.env
    gerenciado = "terraform"
  }
}

# Sem isto, TUDO falha com "API has not been used in project".
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

data "google_project" "current" {}`
  });

  C({
    id: 'backend', cat: 'base', name: 'Backend remoto (GCS)', em: '🗃️',
    tf: 'terraform.backend "gcs"', multi: false, cost: 0.5,
    desc: 'Mais simples que na AWS: o GCS já faz o lock sozinho. Não existe tabela de lock separada.',
    console: ['Cloud Storage → Create bucket → habilitar Object Versioning'],
    gotchas: [
      '<b>Sem DynamoDB.</b> O bucket GCS faz locking nativo — um problema a menos.',
      '<code>prefix</code> substitui o <code>key</code> da AWS e permite vários states no mesmo bucket.',
      'Ative versionamento de objeto: é o seu rollback de state.'
    ],
    inputs: [{ k: 'bucket', l: 'Bucket', t: 'text', v: 'tfstate-minha-empresa' }, { k: 'prefix', l: 'Prefixo', t: 'text', v: 'minha-app/prod' }],
    file: 'backend.tf',
    hcl: (c) => `terraform {
  backend "gcs" {
    bucket = "${c.bucket}"
    prefix = "${c.prefix}"
  }
}`,
    extra: (c) => ({
      file: 'bootstrap/main.tf',
      note: 'Bootstrap: crie uma vez, com state local.',
      hcl: `resource "google_storage_bucket" "state" {
  name                        = "${c.bucket}"
  location                    = "US"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}`
    })
  });

  C({
    id: 'vpc', cat: 'net', name: 'VPC + Subnet + Cloud NAT', em: '🌐',
    tf: 'google_compute_network', multi: false, cost: 35,
    desc: 'A rede do GCP é <b>global</b> e as subnets são <b>regionais</b> — diferença conceitual grande em relação à AWS, onde a VPC é regional e a subnet é zonal.',
    console: [
      'VPC network → Create VPC network → Subnet creation mode: Custom',
      'Adicionar subnet (região + CIDR) + Private Google Access: On',
      'Firewall rules → Create (o GCP não tem Security Group; são regras com network tags)',
      'Cloud Router → Create → Cloud NAT → Create'
    ],
    gotchas: [
      '<b>Não existe Security Group.</b> O firewall é do nível da VPC e mira em <b>network tags</b> ou service accounts.',
      'Subnet é regional e cobre <b>todas as zonas</b> da região — não existe "subnet por AZ".',
      '<code>auto_create_subnetworks = false</code> sempre. O modo automático cria subnets em todas as regiões do mundo.',
      'Cloud NAT é regional, um só para toda a região — mais simples e barato que o NAT Gateway por AZ.',
      'Ranges secundários (<code>pods</code>, <code>services</code>) são pré-requisito do GKE. Crie desde já.'
    ],
    inputs: [
      { k: 'cidr', l: 'CIDR da subnet', t: 'text', v: '10.10.0.0/20' },
      { k: 'nat', l: 'Cloud NAT', t: 'bool', v: true }
    ],
    file: 'vpc.tf',
    hcl: (c) => `resource "google_compute_network" "main" {
  name                    = "\${local.name}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.apis]
}

resource "google_compute_subnetwork" "main" {
  name          = "\${local.name}-subnet"
  ip_cidr_range = "${c.cidr}"
  region        = var.region
  network       = google_compute_network.main.id

  # Permite alcancar APIs Google sem IP publico.
  private_ip_google_access = true

  # Ranges secundarios para o GKE.
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.20.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.30.0.0/20"
  }

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Firewall mira em NETWORK TAGS, nao em security groups.
resource "google_compute_firewall" "health_checks" {
  name    = "\${local.name}-allow-hc"
  network = google_compute_network.main.name

  # Ranges fixos dos health checkers do Google.
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["app"]

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  name    = "\${local.name}-allow-iap-ssh"
  network = google_compute_network.main.name

  # SSH via IAP: nenhuma porta exposta para a internet.
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["app"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "internal" {
  name          = "\${local.name}-allow-internal"
  network       = google_compute_network.main.name
  source_ranges = ["${c.cidr}"]

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
}${c.nat ? `

resource "google_compute_router" "main" {
  name    = "\${local.name}-router"
  region  = var.region
  network = google_compute_network.main.id
}

# Um Cloud NAT para a regiao inteira (na AWS seria um por AZ).
resource "google_compute_router_nat" "main" {
  name                               = "\${local.name}-nat"
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}` : ''}`
  });

  C({
    id: 'sa', cat: 'sec', name: 'Service Account + papéis', em: '🔑',
    tf: 'google_service_account', multi: false, cost: 0,
    desc: 'O equivalente da IAM Role. Diferença fundamental: no GCP a identidade é um <b>e-mail</b>, e permissões são concedidas em bindings separados.',
    console: ['IAM & Admin → Service Accounts → Create → Grant this service account access to project → escolher papéis'],
    gotchas: [
      '<b>Nunca gere chave JSON.</b> Use Workload Identity (GKE) ou a SA anexada à VM/serviço. Chave em arquivo é credencial eterna vazando por aí.',
      '<code>google_project_iam_member</code> adiciona <b>um</b> membro. <code>google_project_iam_binding</code> <b>substitui a lista inteira</b> — e já derrubou o acesso de gente boa.',
      'Nunca use <code>roles/editor</code> ou <code>roles/owner</code>. Existe papel predefinido específico para quase tudo.',
      'Permissão pode ser dada no recurso (melhor) ou no projeto inteiro (pior).'
    ],
    inputs: [{ k: 'name', l: 'Nome', t: 'text', v: 'app' }],
    file: 'iam.tf',
    hcl: (c, ctx) => `resource "google_service_account" "${c._n}" {
  account_id   = "\${local.name}-${c._n}"
  display_name = "Service account da aplicacao \${local.name}"
}

# _member adiciona; _binding SUBSTITUI a lista inteira. Cuidado.
resource "google_project_iam_member" "logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:\${google_service_account.${c._n}.email}"
}

resource "google_project_iam_member" "metrics" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:\${google_service_account.${c._n}.email}"
}
${ctx.has('ar') ? `
# Permissao no PROPRIO recurso: melhor do que no projeto inteiro.
resource "google_artifact_registry_repository_iam_member" "pull" {
  location   = google_artifact_registry_repository.${ctx.nameOf('ar')}.location
  repository = google_artifact_registry_repository.${ctx.nameOf('ar')}.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:\${google_service_account.${c._n}.email}"
}
` : ''}`
  });

  C({
    id: 'secret', cat: 'sec', name: 'Secret Manager', em: '🔒',
    tf: 'google_secret_manager_secret', multi: false, cost: 0.1,
    desc: 'Mesma ideia da AWS, com um detalhe melhor: a permissão de leitura pode ser dada por <b>secret individual</b>, não pelo projeto inteiro.',
    console: ['Security → Secret Manager → Create secret → nome + valor → Replication: Automatic'],
    gotchas: [
      'O bloco <code>replication { auto {} }</code> é obrigatório — a sintaxe mudou entre versões do provider.',
      'Cada versão é imutável. "Atualizar" significa criar uma versão nova e desabilitar a antiga.',
      '<code>secret_data</code> no .tf entra no state em texto claro. Mesmo padrão da AWS: envelope no Terraform, valor por fora.',
      '<code>roles/secretmanager.secretAccessor</code> no secret específico — nunca no projeto.'
    ],
    inputs: [{ k: 'name', l: 'ID do secret', t: 'text', v: 'app-env' }],
    file: 'secrets.tf',
    hcl: (c, ctx) => `resource "google_secret_manager_secret" "app" {
  secret_id = "${c.name}"

  replication {
    auto {}
  }

  labels     = local.labels
  depends_on = [google_project_service.apis]
}

# Envelope apenas: o valor real entra pela pipeline.
resource "google_secret_manager_secret_version" "app" {
  secret      = google_secret_manager_secret.app.id
  secret_data = "preencher-fora-do-terraform"

  lifecycle {
    ignore_changes = [secret_data]
  }
}
${ctx.has('sa') ? `
resource "google_secret_manager_secret_iam_member" "app" {
  secret_id = google_secret_manager_secret.app.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:\${google_service_account.${ctx.nameOf('sa')}.email}"
}
` : ''}`,
    after: () => ({
      title: 'Injetando o valor real', lang: 'bash',
      code: `echo -n "valor-secreto" | gcloud secrets versions add app-env --data-file=-`
    })
  });

  C({
    id: 'ar', cat: 'reg', name: 'Artifact Registry', em: '📦',
    tf: 'google_artifact_registry_repository', multi: true, cost: 1,
    desc: 'O ECR do GCP. Melhor em um ponto: as políticas de limpeza são declarativas dentro do próprio recurso.',
    console: ['Artifact Registry → Create repository → Format: Docker → região → Cleanup policies'],
    gotchas: [
      'A URL da imagem é <code>REGIAO-docker.pkg.dev/PROJETO/REPO/IMAGEM:TAG</code> — bem diferente do ECR.',
      'O antigo Container Registry (<code>gcr.io</code>) está descontinuado; use Artifact Registry.',
      '<code>cleanup_policy_dry_run = true</code> primeiro: ele mostra o que <i>seria</i> apagado sem apagar.',
      'Repositório é regional. Puxar imagem de outra região custa tráfego entre regiões.'
    ],
    inputs: [
      { k: 'name', l: 'ID do repositório', t: 'text', v: 'app' },
      { k: 'keep', l: 'Manter N versões', t: 'num', v: 10, min: 1, max: 100 }
    ],
    file: 'artifact-registry.tf',
    hcl: (c) => `resource "google_artifact_registry_repository" "${c._n}" {
  location      = var.region
  repository_id = "${c.name}"
  format        = "DOCKER"
  description   = "Imagens de \${local.name}"

  docker_config {
    immutable_tags = true
  }

  cleanup_policies {
    id     = "manter-recentes"
    action = "KEEP"

    most_recent_versions {
      keep_count = ${c.keep}
    }
  }

  cleanup_policies {
    id     = "apagar-antigas"
    action = "DELETE"

    condition {
      older_than = "2592000s"
    }
  }

  labels     = local.labels
  depends_on = [google_project_service.apis]
}`,
    after: (c) => ({
      title: 'Push da imagem', lang: 'bash',
      code: `gcloud auth configure-docker southamerica-east1-docker.pkg.dev

TAG=$(git rev-parse --short HEAD)
IMG="southamerica-east1-docker.pkg.dev/$PROJECT_ID/${c.name}/api:$TAG"

docker build -t "$IMG" .
docker push "$IMG"`
    })
  });

  IAC.gcpCats = CATS;
  IAC.gcpRes = R;
  IAC.gcpC = C;
})(window.IAC);

/* =========================================================
   catalog-gcp (2) — Compute, LB, Cloud Run, dados e ops
   ========================================================= */
(function (IAC) {
  'use strict';
  const C = IAC.gcpC;

  C({
    id: 'hc', cat: 'lb', name: 'Health Check', em: '🩺',
    tf: 'google_compute_health_check', multi: false, cost: 0,
    desc: 'No GCP o health check é um recurso <b>independente</b>, reaproveitado pelo autohealing do MIG e pelo backend service. Na AWS ele vive dentro do Target Group.',
    console: ['Compute Engine → Health checks → Create a health check → protocolo, porta, path, thresholds'],
    gotchas: [
      'O mesmo health check serve para dois papéis: <b>autohealing</b> (recriar a VM) e <b>balanceamento</b> (tirar de rotação). Muita gente cria dois separados de propósito, com thresholds diferentes.',
      'Não esqueça a regra de firewall liberando <code>35.191.0.0/16</code> e <code>130.211.0.0/22</code> — sem ela tudo fica UNHEALTHY e você perde a tarde.',
      '<code>log_config { enable = true }</code> mostra <i>por que</i> o check falhou.'
    ],
    inputs: [{ k: 'port', l: 'Porta', t: 'num', v: 8080 }, { k: 'path', l: 'Path', t: 'text', v: '/health' }],
    file: 'lb.tf',
    hcl: (c) => `resource "google_compute_health_check" "app" {
  name                = "\${local.name}-hc"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = ${c.port}
    request_path = "${c.path}"
  }

  log_config {
    enable = true
  }
}`
  });

  C({
    id: 'it', cat: 'comp', name: 'Instance Template', em: '📋',
    tf: 'google_compute_instance_template', multi: false, cost: 0,
    desc: 'A receita da VM. Equivale ao Launch Template da AWS, com uma diferença: no GCP o template é <b>imutável</b> — qualquer mudança cria um novo.',
    console: ['Compute Engine → Instance templates → Create → machine type, boot disk, service account, network tags, startup script'],
    gotchas: [
      '<b>Template é imutável.</b> Use <code>name_prefix</code> + <code>create_before_destroy</code>, sempre.',
      'Sem bloco <code>access_config</code> = sem IP público (o correto). A saída acontece pelo Cloud NAT.',
      '<code>tags</code> aqui são <b>network tags</b> (alvo do firewall), não labels de billing. Duas coisas diferentes com nomes parecidos.',
      '<code>enable-oslogin = "TRUE"</code> troca o gerenciamento de chaves SSH pelo IAM.',
      'Escopo <code>cloud-platform</code> + papéis IAM finos é o padrão atual (escopos legados são confusos).'
    ],
    inputs: [
      { k: 'type', l: 'Machine type', t: 'sel', v: 'e2-small', opts: [['e2-micro', 'e2-micro · ~US$ 7/mês'], ['e2-small', 'e2-small · ~US$ 14/mês'], ['e2-medium', 'e2-medium · ~US$ 28/mês'], ['n2-standard-2', 'n2-standard-2 · ~US$ 70/mês']] },
      { k: 'disk', l: 'Disco (GB)', t: 'num', v: 30, min: 10, max: 500 }
    ],
    file: 'compute.tf',
    hcl: (c, ctx) => `data "google_compute_image" "base" {
  family  = "debian-12"
  project = "debian-cloud"
}

resource "google_compute_instance_template" "app" {
  name_prefix  = "\${local.name}-"
  machine_type = "${c.type}"

  disk {
    source_image = data.google_compute_image.base.self_link
    auto_delete  = true
    boot         = true
    disk_size_gb = ${c.disk}
    disk_type    = "pd-balanced"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.main.id
    # Sem access_config = sem IP publico. Saida via Cloud NAT.
  }
${ctx.has('sa') ? `
  service_account {
    email  = google_service_account.${ctx.nameOf('sa')}.email
    scopes = ["cloud-platform"]
  }
` : ''}
  # NETWORK TAGS: e por aqui que o firewall encontra estas VMs.
  tags = ["app"]

  metadata = {
    enable-oslogin = "TRUE"
    startup-script = file("\${path.module}/startup.sh")
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  labels = local.labels

  # Template e IMUTAVEL: sem isto, nenhuma alteracao aplica.
  lifecycle {
    create_before_destroy = true
  }
}`
  });

  C({
    id: 'mig', cat: 'comp', name: 'MIG regional + Autoscaler', em: '📈',
    tf: 'google_compute_region_instance_group_manager', multi: false, cost: 30,
    desc: 'O Auto Scaling Group do GCP. Já nasce multi-zona quando é regional, e o "vincular ao balanceador" acontece pelo <b>named port</b> + backend service.',
    console: [
      'Compute Engine → Instance groups → Create instance group → Managed, Multiple zones',
      'Escolher o instance template · Autoscaling: on · min/max · CPU target',
      'Autohealing: escolher o health check',
      'Port name mapping: <code>http → 8080</code>'
    ],
    gotchas: [
      '<b>O vínculo com o balanceador é indireto:</b> o MIG expõe um <code>named_port</code> e o backend service aponta para <code>instance_group</code>. Não existe "target_group_arns".',
      'MIG regional distribui pelas 3 zonas automaticamente — HA de graça, sem <code>count</code> por AZ.',
      '<code>update_policy</code> com <code>type = "PROACTIVE"</code> é o rolling update; sem isso, mudar o template não troca nada.',
      '<code>max_surge_fixed</code> precisa ser múltiplo do número de zonas em MIG regional.',
      'Autoscaler é um recurso <b>separado</b> que aponta para o MIG.'
    ],
    inputs: [
      { k: 'min', l: 'Mínimo', t: 'num', v: 2, min: 0, max: 20 },
      { k: 'max', l: 'Máximo', t: 'num', v: 6, min: 1, max: 50 },
      { k: 'cpu', l: 'CPU alvo (0-1)', t: 'text', v: '0.6' },
      { k: 'port', l: 'Porta da app', t: 'num', v: 8080 }
    ],
    file: 'compute.tf',
    hcl: (c) => `resource "google_compute_region_instance_group_manager" "app" {
  name               = "\${local.name}-mig"
  region             = var.region
  base_instance_name = local.name

  version {
    instance_template = google_compute_instance_template.app.id
  }

  # >>> O "named port" e o que liga o MIG ao backend service <<<
  named_port {
    name = "http"
    port = ${c.port}
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.app.id
    initial_delay_sec = 120
  }

  # Rolling update nativo (equivale ao instance_refresh do ASG).
  update_policy {
    type                         = "PROACTIVE"
    minimal_action               = "REPLACE"
    instance_redistribution_type = "PROACTIVE"
    max_surge_fixed              = 3
    max_unavailable_fixed        = 0
  }
}

resource "google_compute_region_autoscaler" "app" {
  name   = "\${local.name}-autoscaler"
  region = var.region
  target = google_compute_region_instance_group_manager.app.id

  autoscaling_policy {
    min_replicas    = ${c.min}
    max_replicas    = ${c.max}
    cooldown_period = 120

    cpu_utilization {
      target = ${c.cpu}
    }
  }
}`
  });

  C({
    id: 'backend_svc', cat: 'lb', name: 'Backend Service', em: '🎯',
    tf: 'google_compute_backend_service', multi: false, cost: 0,
    desc: 'O parente mais próximo do Target Group da AWS — mas ele também carrega CDN, política de segurança e afinidade de sessão.',
    console: ['Network services → Load balancing → Create → Backend configuration → Create backend service → escolher o instance group + health check'],
    gotchas: [
      '<code>load_balancing_scheme</code> precisa combinar em <b>todos</b> os recursos da cadeia. Misturar <code>EXTERNAL</code> com <code>EXTERNAL_MANAGED</code> dá erro obscuro.',
      '<code>port_name</code> precisa bater exatamente com o <code>named_port</code> do MIG.',
      'Habilitar <code>enable_cdn</code> é uma linha — o Cloud CDN vem embutido, sem CloudFront separado.',
      '<code>timeout_sec</code> padrão é 30s: streaming e uploads longos quebram sem ajuste.'
    ],
    inputs: [{ k: 'cdn', l: 'Habilitar Cloud CDN', t: 'bool', v: false }, { k: 'timeout', l: 'Timeout (s)', t: 'num', v: 30 }],
    file: 'lb.tf',
    hcl: (c, ctx) => `resource "google_compute_backend_service" "app" {
  name                  = "\${local.name}-backend"
  protocol              = "HTTP"
  port_name             = "http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = ${c.timeout}
  enable_cdn            = ${c.cdn}

  health_checks = [google_compute_health_check.app.id]

  backend {
    group           = google_compute_region_instance_group_manager.app.instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
${ctx.has('armor') ? '\n  security_policy = google_compute_security_policy.main.id\n' : ''}}`
  });

  C({
    id: 'lb', cat: 'lb', name: 'HTTPS LB global (proxy + IP + cert)', em: '⚖️',
    tf: 'google_compute_global_forwarding_rule', multi: false, cost: 20,
    desc: 'Aqui a diferença para a AWS é grande: o "load balancer" do GCP não é <i>um</i> recurso, são <b>cinco</b> encadeados. Em compensação, o IP é anycast global.',
    console: [
      'Network services → Load balancing → Create load balancer → Application Load Balancer (HTTP/S) → Global',
      'Frontend: reservar IP estático + certificado gerenciado + porta 443',
      'Routing rules: URL map apontando para o backend service',
      'Criar um segundo frontend na porta 80 só para redirecionar'
    ],
    gotchas: [
      'A cadeia é: <b>forwarding rule → target proxy → url map → backend service → MIG</b>. Cada elo é um recurso.',
      'Certificado gerenciado só valida depois que o DNS já aponta para o IP — <b>e pode levar até 60 minutos</b>. Não é bug.',
      'O IP global precisa ser <code>google_compute_global_address</code> (não o regional).',
      'O redirect 80→443 exige um <b>segundo</b> url map + proxy + forwarding rule. Não é uma flag como na AWS.'
    ],
    inputs: [{ k: 'domain', l: 'Domínio', t: 'text', v: 'app.exemplo.com.br' }],
    file: 'lb.tf',
    hcl: (c) => `resource "google_compute_global_address" "main" {
  name = "\${local.name}-ip"
}

resource "google_compute_managed_ssl_certificate" "main" {
  name = "\${local.name}-cert"

  managed {
    domains = ["${c.domain}"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 1) URL map: qual caminho vai para qual backend
resource "google_compute_url_map" "main" {
  name            = "\${local.name}-urlmap"
  default_service = google_compute_backend_service.app.id

  host_rule {
    hosts        = ["${c.domain}"]
    path_matcher = "principal"
  }

  path_matcher {
    name            = "principal"
    default_service = google_compute_backend_service.app.id

    path_rule {
      paths   = ["/api/*"]
      service = google_compute_backend_service.app.id
    }
  }
}

# 2) Target proxy: termina o TLS
resource "google_compute_target_https_proxy" "main" {
  name             = "\${local.name}-https-proxy"
  url_map          = google_compute_url_map.main.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

# 3) Forwarding rule: o IP + porta de verdade
resource "google_compute_global_forwarding_rule" "https" {
  name                  = "\${local.name}-https"
  target                = google_compute_target_https_proxy.main.id
  port_range            = "443"
  ip_address            = google_compute_global_address.main.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# --- Redirect 80 -> 443 precisa da cadeia inteira de novo ---
resource "google_compute_url_map" "redirect" {
  name = "\${local.name}-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "\${local.name}-http-proxy"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "\${local.name}-http"
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  ip_address            = google_compute_global_address.main.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}`,
    outputs: () => `output "lb_ip" {
  description = "Aponte seu DNS para este IP"
  value       = google_compute_global_address.main.address
}`
  });

  C({
    id: 'armor', cat: 'lb', name: 'Cloud Armor (WAF)', em: '🧱',
    tf: 'google_compute_security_policy', multi: false, cost: 6,
    desc: 'O WAF do GCP. Regras pré-configuradas contra OWASP e rate limiting por IP, anexadas ao backend service.',
    console: ['Network Security → Cloud Armor policies → Create policy → Add rule → Target: backend service'],
    gotchas: [
      'A regra de prioridade <code>2147483647</code> é a default e <b>tem que existir</b>.',
      'Prioridade menor = avaliada primeiro.',
      'Use <code>preview = true</code> antes de bloquear de verdade.'
    ],
    inputs: [{ k: 'rate', l: 'Limite (req/min por IP)', t: 'num', v: 600 }],
    file: 'armor.tf',
    hcl: (c) => `resource "google_compute_security_policy" "main" {
  name = "\${local.name}-armor"

  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Regra padrao obrigatoria"

    match {
      versioned_expr = "SRC_IPS_V1"

      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  rule {
    action      = "throttle"
    priority    = 1000
    description = "Rate limiting por IP"

    match {
      versioned_expr = "SRC_IPS_V1"

      config {
        src_ip_ranges = ["*"]
      }
    }

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"

      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = ${c.rate}
        interval_sec = 60
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 900
    description = "Protecao contra SQL injection (preview primeiro!)"
    preview     = true

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }
  }
}`
  });

  C({
    id: 'run', cat: 'cont', name: 'Cloud Run', em: '🚀',
    tf: 'google_cloud_run_v2_service', multi: false, cost: 5,
    desc: 'Onde o GCP realmente brilha: contêiner rodando com escala a zero, HTTPS e domínio inclusos. É o ECS Fargate + ALB + ACM em um recurso só.',
    console: ['Cloud Run → Create service → escolher imagem do Artifact Registry → Autoscaling min/max → Variables & Secrets → Deploy'],
    gotchas: [
      '<code>min_instance_count = 0</code> = escala a zero e você paga zero, mas paga cold start.',
      'Secrets entram como <code>value_source.secret_key_ref</code>, sem nenhuma role de execução extra.',
      '<code>ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"</code> se você quiser Cloud Run atrás do LB global.',
      'Sem <code>google_cloud_run_v2_service_iam_member</code> com <code>allUsers</code>, a URL responde 403.',
      'A imagem precisa escutar na porta da variável <code>PORT</code>.'
    ],
    inputs: [
      { k: 'min', l: 'Instâncias mínimas', t: 'num', v: 0, min: 0, max: 10 },
      { k: 'max', l: 'Instâncias máximas', t: 'num', v: 10, min: 1, max: 100 },
      { k: 'pub', l: 'Público (allUsers)', t: 'bool', v: true }
    ],
    file: 'cloudrun.tf',
    hcl: (c, ctx) => `resource "google_cloud_run_v2_service" "app" {
  name     = "\${local.name}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
${ctx.has('sa') ? `    service_account = google_service_account.${ctx.nameOf('sa')}.email\n` : ''}
    scaling {
      min_instance_count = ${c.min}
      max_instance_count = ${c.max}
    }

    containers {
      image = "\${var.region}-docker.pkg.dev/\${var.project_id}/${ctx.has('ar') ? '\\${google_artifact_registry_repository.' + ctx.nameOf('ar') + '.repository_id}' : 'app'}/api:\${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 8080
      }
${ctx.has('secret') ? `
      env {
        name = "DB_PASSWORD"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app.secret_id
            version = "latest"
          }
        }
      }
` : ''}
      startup_probe {
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3

        http_get {
          path = "/health"
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = local.labels
}

variable "image_tag" {
  type        = string
  description = "Tag da imagem — passe o SHA do commit"
  default     = "latest"
}
${c.pub ? `
# Sem isto a URL responde 403.
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
` : ''}`,
    outputs: () => `output "cloud_run_url" {
  description = "URL publica ja com HTTPS"
  value       = google_cloud_run_v2_service.app.uri
}`
  });

  C({
    id: 'gke', cat: 'cont', name: 'GKE Autopilot', em: '☸️',
    tf: 'google_container_cluster', multi: false, cost: 75,
    desc: 'Kubernetes gerenciado de verdade: no modo Autopilot você não cria node pool, não escolhe máquina e paga por pod.',
    console: ['Kubernetes Engine → Create cluster → Autopilot → região → rede/subnet → ranges secundários → Create'],
    gotchas: [
      'Autopilot exige os <b>ranges secundários</b> da subnet (pods e services). Crie a VPC pensando nisso.',
      '<code>deletion_protection = true</code> é o padrão no provider 6.x — <code>terraform destroy</code> falha até você desligar.',
      'Workload Identity é o jeito certo de dar permissão GCP a um pod. Chave JSON de service account em Secret do K8s, nunca.',
      'Criar um cluster leva de 5 a 10 minutos. É normal o apply parecer travado.'
    ],
    inputs: [{ k: 'priv', l: 'Nodes privados', t: 'bool', v: true }],
    file: 'gke.tf',
    hcl: (c) => `resource "google_container_cluster" "main" {
  name     = "\${local.name}-gke"
  location = var.region

  # Autopilot: sem node pool, sem escolher maquina, paga por pod.
  enable_autopilot = true

  network    = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.main.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
${c.priv ? `
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }
` : ''}
  release_channel {
    channel = "REGULAR"
  }

  # Padrao no provider 6.x — destroy falha ate voce desligar.
  deletion_protection = true

  depends_on = [google_project_service.apis]
}`
  });

  C({
    id: 'sql', cat: 'data', name: 'Cloud SQL (PostgreSQL)', em: '🗄️',
    tf: 'google_sql_database_instance', multi: false, cost: 35,
    desc: 'O RDS do GCP. A grande diferença: conectar em IP privado exige um <b>peering de rede</b> (Private Service Access) que você precisa criar antes.',
    console: [
      'SQL → Create instance → PostgreSQL → escolher tier',
      'Connections → Private IP → escolher a VPC → "Set up connection" (o console cria o peering por você)',
      'Backups → Automate + Point-in-time recovery'
    ],
    gotchas: [
      '<b>O peering é o pulo do gato:</b> <code>google_compute_global_address</code> (VPC_PEERING) + <code>google_service_networking_connection</code>. Sem eles, IP privado não funciona.',
      'Um <code>depends_on</code> na conexão de service networking evita o erro de corrida no primeiro apply.',
      '<code>ipv4_enabled = false</code> tira o IP público do banco.',
      'Nome de instância apagada fica <b>reservado por ~7 dias</b>: recriar com o mesmo nome falha.',
      'Cloud SQL Auth Proxy é a forma recomendada de conectar de fora sem abrir IP.'
    ],
    inputs: [
      { k: 'tier', l: 'Tier', t: 'sel', v: 'db-custom-1-3840', opts: [['db-f1-micro', 'db-f1-micro · ~US$ 9/mês'], ['db-custom-1-3840', 'db-custom-1-3840 · ~US$ 50/mês'], ['db-custom-2-7680', 'db-custom-2-7680 · ~US$ 100/mês']] },
      { k: 'ha', l: 'Alta disponibilidade', t: 'bool', v: false }
    ],
    file: 'sql.tf',
    hcl: (c) => `# --- Private Service Access: o "pulo do gato" do Cloud SQL privado ---
resource "google_compute_global_address" "psa" {
  name          = "\${local.name}-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa.name]
}

resource "google_sql_database_instance" "main" {
  name             = "\${local.name}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [google_service_networking_connection.psa]

  settings {
    tier              = "${c.tier}"
    availability_type = "${c.ha ? 'REGIONAL' : 'ZONAL'}"
    disk_size         = 20
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    insights_config {
      query_insights_enabled = true
    }
  }

  deletion_protection = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_database" "app" {
  name     = "app"
  instance = google_sql_database_instance.main.name
}`
  });

  C({
    id: 'gcs', cat: 'data', name: 'Bucket GCS', em: '🪣',
    tf: 'google_storage_bucket', multi: true, cost: 2,
    desc: 'Mais simples que o S3: versionamento, criptografia e ciclo de vida ficam <b>dentro</b> do mesmo recurso.',
    console: ['Cloud Storage → Create bucket → Access control: Uniform → Protection: prevenção de acesso público'],
    gotchas: [
      '<code>uniform_bucket_level_access = true</code> desliga ACLs por objeto. É o padrão moderno.',
      '<code>public_access_prevention = "enforced"</code> é o "Block all public access" da AWS.',
      'Nome também é global, como no S3.',
      'Escolha bem a <code>location</code>: <code>US</code> (multi-região) custa mais que <code>southamerica-east1</code> e muda a latência.'
    ],
    inputs: [{ k: 'name', l: 'Nome lógico', t: 'text', v: 'assets' }, { k: 'bucket', l: 'Nome do bucket', t: 'text', v: 'minha-app-assets-prod' }],
    file: 'storage.tf',
    hcl: (c) => `resource "google_storage_bucket" "${c._n}" {
  name                        = "${c.bucket}"
  location                    = "SOUTHAMERICA-EAST1"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }

    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 30
    }

    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  labels = local.labels
}`
  });

  C({
    id: 'dns', cat: 'ops', name: 'Cloud DNS', em: '🧾',
    tf: 'google_dns_record_set', multi: false, cost: 0.4,
    desc: 'Aponta o domínio para o IP global do balanceador. Sem "alias": o IP é estático e anycast, então um registro A simples resolve.',
    console: ['Network services → Cloud DNS → Create zone → Add record set → tipo A → IPv4 do LB'],
    gotchas: [
      'O nome do registro precisa terminar com <b>ponto</b>: <code>app.exemplo.com.br.</code>',
      'O certificado gerenciado só valida <b>depois</b> que este registro existe e propaga.',
      'Não existe alias — mas como o IP global é fixo, um A record basta.'
    ],
    inputs: [{ k: 'zone', l: 'Domínio da zona', t: 'text', v: 'exemplo.com.br' }, { k: 'name', l: 'Registro', t: 'text', v: 'app.exemplo.com.br' }],
    file: 'dns.tf',
    hcl: (c) => `resource "google_dns_managed_zone" "main" {
  name     = "\${local.name}-zone"
  dns_name = "${c.zone}."

  dnssec_config {
    state = "on"
  }
}

resource "google_dns_record_set" "app" {
  name         = "${c.name}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.main.name
  rrdatas      = [google_compute_global_address.main.address]
}`
  });

  C({
    id: 'alert', cat: 'ops', name: 'Alerta + canal de notificação', em: '🚨',
    tf: 'google_monitoring_alert_policy', multi: false, cost: 0,
    desc: 'Alerta do Cloud Monitoring com filtro MQL/PromQL. Mais verboso que o CloudWatch, porém mais expressivo.',
    console: ['Monitoring → Alerting → Create policy → Select a metric → Configure trigger → Notification channels'],
    gotchas: [
      'O <code>filter</code> é a parte difícil: <code>metric.type</code> + <code>resource.type</code> precisam existir de verdade.',
      'Canal de e-mail não exige confirmação (diferente do SNS da AWS).',
      '<code>alignment_period</code> menor que 60s costuma não ser suportado.'
    ],
    inputs: [{ k: 'email', l: 'E-mail', t: 'text', v: 'sre@exemplo.com.br' }],
    file: 'monitoring.tf',
    hcl: (c) => `resource "google_monitoring_notification_channel" "email" {
  display_name = "SRE \${local.name}"
  type         = "email"

  labels = {
    email_address = "${c.email}"
  }
}

resource "google_monitoring_alert_policy" "backend_5xx" {
  display_name = "\${local.name} — taxa de 5xx alta"
  combiner     = "OR"

  conditions {
    display_name = "5xx no balanceador"

    condition_threshold {
      filter          = "metric.type=\\"loadbalancing.googleapis.com/https/request_count\\" AND resource.type=\\"https_lb_rule\\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}`
  });
})(window.IAC);
