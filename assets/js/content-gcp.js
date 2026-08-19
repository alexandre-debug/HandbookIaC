/* =========================================================
   content-gcp.js
   ========================================================= */
(function (IAC) {
  'use strict';
  const code = IAC.code, tip = IAC.tip, warn = IAC.warn, danger = IAC.danger,
    info = IAC.info, table = IAC.table, cs = IAC.consoleSteps;

  IAC.section({
    id: 'gcp', label: 'GCP', icon: '🔵', cloud: 'gcp',
    pages: [

      {
        id: 'visao', title: 'GCP para quem vem da AWS',
        body: () => `
<span class="eyebrow gcp">GCP · 01</span>
<h1>GCP para quem já pensa em AWS</h1>
<p class="lede">A linguagem é a mesma, o provider muda. O que realmente muda é o <b>modelo mental</b> — e são umas seis diferenças que explicam quase toda a confusão inicial.</p>

<h2>As seis diferenças que importam</h2>

<h3>1. O projeto é a unidade de isolamento</h3>
<p>Na AWS você separa por <b>conta</b>. No GCP você separa por <b>projeto</b> — e criar projeto é trivial, então o padrão é um projeto por ambiente por sistema. A hierarquia é <code>Organização → Pasta → Projeto → Recurso</code>, e permissões descem por herança.</p>

<h3>2. Você precisa habilitar as APIs</h3>
${code(`resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "run.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}`, { file: 'o passo que não existe na AWS' })}
${danger('O erro nº 1 de quem vem da AWS', '<code>Error 403: Compute Engine API has not been used in project ... before or it is disabled</code>. Não é permissão faltando — é a API do serviço desligada. Habilite antes e use <code>depends_on</code> nos recursos que dependem dela.')}

<h3>3. Não existe Security Group</h3>
<p>O firewall é da <b>VPC</b> e mira em <b>network tags</b> (rótulos na VM) ou em service accounts. Não existe "SG referenciando SG".</p>
${table(['AWS', 'GCP'],
          [['Security group anexado ao recurso', 'Regra de firewall na VPC, com <code>target_tags</code>'],
          ['<code>security_groups = [sg.alb.id]</code>', '<code>source_tags = ["alb"]</code> ou <code>source_service_accounts</code>'],
          ['Regra por recurso', 'Regra por rede, com prioridade'],
          ['Egress liberado por padrão', 'Egress liberado por padrão (allow 65535)']])}

<h3>4. VPC é global, subnet é regional</h3>
${table(['', 'AWS', 'GCP'],
          [['VPC', 'regional', '<b>global</b>'],
          ['Subnet', 'zonal (uma AZ)', '<b>regional</b> (cobre todas as zonas)'],
          ['Consequência', '1 subnet por AZ, com <code>count</code>', '1 subnet por região, sem <code>count</code>'],
          ['NAT', '1 NAT Gateway por AZ (💸)', '1 Cloud NAT por região']])}
<p>Isso simplifica bastante o código de rede: some o <code>count</code> por AZ e o custo de NAT cai.</p>

<h3>5. O Load Balancer não é um recurso — são cinco</h3>
${code(`AWS:  aws_lb  +  aws_lb_listener  +  aws_lb_target_group

GCP:  google_compute_global_forwarding_rule   (o IP + porta)
        └── google_compute_target_https_proxy (termina o TLS)
              └── google_compute_url_map      (roteamento)
                    └── google_compute_backend_service  (o "target group")
                          └── google_compute_health_check
                          └── MIG / NEG (os destinos)`, { lang: 'text' })}
<p>Mais verboso, porém mais componível: o mesmo backend service pode ser usado por vários proxies, e o IP é <b>anycast global</b> — um IP só atende o mundo inteiro, sem Route 53 latency-based.</p>

<h3>6. IAM é sobre membros e papéis, não sobre políticas anexadas</h3>
${table(['AWS', 'GCP'],
          [['Você cria uma <b>policy</b> e anexa a uma role', 'Você concede um <b>role</b> (predefinido) a um <b>member</b>'],
          ['Policy JSON com Action/Resource/Condition', 'Papel = conjunto pronto de permissões'],
          ['Role é assumida (<code>sts:AssumeRole</code>)', 'Service account <b>é</b> uma identidade (um e-mail)'],
          ['Permissão fica na role', 'Permissão fica no <b>recurso</b> ou no projeto']])}
${warn('member vs binding — a pegadinha que derruba acesso', '<code>google_project_iam_member</code> <b>adiciona</b> um membro ao papel. <code>google_project_iam_binding</code> <b>define a lista completa</b> — e remove todo mundo que não estiver nela, inclusive você. Na dúvida, use sempre <code>_member</code>.')}

<h2>O que é melhor no GCP</h2>
<ul>
<li><b>Cloud Run.</b> Contêiner com HTTPS, domínio, escala a zero e certificado, em um recurso. Na AWS isso é ECS + ALB + ACM + Route 53 + autoscaling.</li>
<li><b>Cloud NAT.</b> Um por região, mais barato e mais simples.</li>
<li><b>Backend do state.</b> O GCS faz lock nativo; sem tabela extra.</li>
<li><b>IAM condicional por recurso.</b> Conceder acesso a <i>um</i> secret é natural.</li>
<li><b>Load balancer global.</b> Um IP anycast atende o planeta.</li>
</ul>

<h2>O que é mais fácil na AWS</h2>
<ul>
<li>Load balancer regional simples: 3 recursos contra 5.</li>
<li>Ecossistema de módulos e exemplos muito maior.</li>
<li>Serviços gerenciados com mais opções e maturidade.</li>
<li>Documentação de erro: a mensagem da AWS costuma ser mais direta.</li>
</ul>

${tip('Como praticar', 'Abra o <b>Laboratório GCP</b> e monte o mesmo stack do laboratório AWS. Comparar os dois códigos lado a lado é o jeito mais rápido de internalizar as diferenças.')}
`},

      {
        id: 'lab', title: 'Laboratório GCP', tag: 'lab',
        mount: (view) => IAC.lab.mount(view, 'gcp')
      },

      {
        id: 'equivalencias', title: 'Tabela de equivalências AWS ↔ GCP',
        body: () => `
<span class="eyebrow gcp">GCP · 02</span>
<h1>AWS ↔ GCP, serviço por serviço</h1>
<p class="lede">A tradução direta, com o nome do recurso Terraform dos dois lados. Guarde esta página.</p>

<h2>Computação</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['Máquina virtual', '<code>aws_instance</code>', '<code>google_compute_instance</code>'],
          ['Receita da VM', '<code>aws_launch_template</code>', '<code>google_compute_instance_template</code>'],
          ['Grupo com escala', '<code>aws_autoscaling_group</code>', '<code>google_compute_region_instance_group_manager</code>'],
          ['Política de escala', '<code>aws_autoscaling_policy</code>', '<code>google_compute_region_autoscaler</code>'],
          ['Contêiner gerenciado', '<code>aws_ecs_service</code> (Fargate)', '<code>google_cloud_run_v2_service</code>'],
          ['Kubernetes', '<code>aws_eks_cluster</code>', '<code>google_container_cluster</code>'],
          ['Função', '<code>aws_lambda_function</code>', '<code>google_cloudfunctions2_function</code>'],
          ['Imagem de VM', 'AMI (<code>data.aws_ami</code>)', 'Image (<code>data.google_compute_image</code>)'],
          ['Spot', '<code>mixed_instances_policy</code>', '<code>scheduling { provisioning_model = "SPOT" }</code>']])}

<h2>Rede</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['Rede virtual', '<code>aws_vpc</code> (regional)', '<code>google_compute_network</code> (<b>global</b>)'],
          ['Sub-rede', '<code>aws_subnet</code> (zonal)', '<code>google_compute_subnetwork</code> (<b>regional</b>)'],
          ['Firewall', '<code>aws_security_group</code>', '<code>google_compute_firewall</code> (por tags)'],
          ['NAT', '<code>aws_nat_gateway</code> (por AZ)', '<code>google_compute_router_nat</code> (por região)'],
          ['Gateway de internet', '<code>aws_internet_gateway</code>', 'implícito (rota default)'],
          ['IP estático', '<code>aws_eip</code>', '<code>google_compute_address</code> / <code>_global_address</code>'],
          ['Peering', '<code>aws_vpc_peering_connection</code>', '<code>google_compute_network_peering</code>'],
          ['Endpoint privado', '<code>aws_vpc_endpoint</code>', 'Private Google Access + PSC'],
          ['DNS', '<code>aws_route53_zone</code>', '<code>google_dns_managed_zone</code>']])}

<h2>Balanceamento</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['O balanceador', '<code>aws_lb</code>', '<code>google_compute_global_forwarding_rule</code>'],
          ['Terminação TLS', '<code>aws_lb_listener</code> (HTTPS)', '<code>google_compute_target_https_proxy</code>'],
          ['Roteamento por path', '<code>aws_lb_listener_rule</code>', '<code>google_compute_url_map</code>'],
          ['Grupo de destinos', '<code>aws_lb_target_group</code>', '<code>google_compute_backend_service</code>'],
          ['Health check', 'dentro do target group', '<code>google_compute_health_check</code> (separado)'],
          ['Certificado', '<code>aws_acm_certificate</code>', '<code>google_compute_managed_ssl_certificate</code>'],
          ['WAF', '<code>aws_wafv2_web_acl</code>', '<code>google_compute_security_policy</code> (Cloud Armor)'],
          ['CDN', '<code>aws_cloudfront_distribution</code>', '<code>enable_cdn = true</code> no backend service']])}

<h2>Contêineres e artefatos</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['Registro de imagem', '<code>aws_ecr_repository</code>', '<code>google_artifact_registry_repository</code>'],
          ['Limpeza automática', '<code>aws_ecr_lifecycle_policy</code>', '<code>cleanup_policies</code> (dentro do recurso)'],
          ['URL da imagem', '<code>ACCT.dkr.ecr.REG.amazonaws.com/repo</code>', '<code>REG-docker.pkg.dev/PROJ/repo/img</code>'],
          ['Login', '<code>aws ecr get-login-password</code>', '<code>gcloud auth configure-docker</code>']])}

<h2>Segredos e identidade</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['Segredos', '<code>aws_secretsmanager_secret</code>', '<code>google_secret_manager_secret</code>'],
          ['Configuração', '<code>aws_ssm_parameter</code>', '<code>google_secret_manager_secret</code> ou Runtime Config'],
          ['Chaves de cripto', '<code>aws_kms_key</code>', '<code>google_kms_crypto_key</code>'],
          ['Identidade de serviço', '<code>aws_iam_role</code> + instance profile', '<code>google_service_account</code>'],
          ['Permissão', '<code>aws_iam_policy</code> + attachment', '<code>google_project_iam_member</code> (papel predefinido)'],
          ['Federação com CI', 'OIDC + <code>assume_role</code>', 'Workload Identity Federation'],
          ['Identidade para pod', 'IRSA (service account + OIDC)', 'Workload Identity']])}

<h2>Dados</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['SQL gerenciado', '<code>aws_db_instance</code>', '<code>google_sql_database_instance</code>'],
          ['SQL serverless', '<code>aws_rds_cluster</code> (Aurora)', '<code>google_alloydb_cluster</code> / Cloud SQL'],
          ['Objeto', '<code>aws_s3_bucket</code>', '<code>google_storage_bucket</code>'],
          ['NoSQL', '<code>aws_dynamodb_table</code>', '<code>google_firestore_database</code> / Bigtable'],
          ['Cache', '<code>aws_elasticache_cluster</code>', '<code>google_redis_instance</code>'],
          ['Data warehouse', 'Redshift', 'BigQuery'],
          ['Fila', '<code>aws_sqs_queue</code>', '<code>google_pubsub_subscription</code>'],
          ['Tópico', '<code>aws_sns_topic</code>', '<code>google_pubsub_topic</code>']])}

<h2>Operação</h2>
${table(['Conceito', 'AWS', 'GCP'],
          [['Logs', '<code>aws_cloudwatch_log_group</code>', 'Cloud Logging (automático) + <code>google_logging_metric</code>'],
          ['Alarme', '<code>aws_cloudwatch_metric_alarm</code>', '<code>google_monitoring_alert_policy</code>'],
          ['Canal de notificação', '<code>aws_sns_topic_subscription</code>', '<code>google_monitoring_notification_channel</code>'],
          ['Backend do state', 'S3 + DynamoDB', 'GCS (lock nativo)'],
          ['Tags/labels', '<code>default_tags</code> no provider', '<code>default_labels</code> no provider'],
          ['Shell sem SSH', 'SSM Session Manager', 'IAP TCP forwarding']])}

${warn('Labels do GCP são restritivas', 'Só aceitam <b>minúsculas</b>, números, <code>-</code> e <code>_</code>, máximo 63 caracteres. Uma tag AWS <code>CostCenter = "TI-Infra"</code> vira <code>cost_center = "ti-infra"</code>. Padronize desde o começo se você opera nas duas nuvens.')}
`},

      {
        id: 'lb-gcp', title: 'O Load Balancer do GCP em 5 peças',
        body: () => `
<span class="eyebrow gcp">GCP · 03</span>
<h1>O balanceador em cinco peças</h1>
<p class="lede">Esta é a parte que mais assusta quem vem da AWS. Depois que você entende que cada peça tem uma responsabilidade única, fica lógico.</p>

<h2>A cadeia, de fora para dentro</h2>
${code(`Internet
   │
   ▼
google_compute_global_address          IP anycast global
   │
google_compute_global_forwarding_rule  "escute na porta 443 deste IP"
   │
google_compute_target_https_proxy      termina o TLS
   │   └── google_compute_managed_ssl_certificate
   │
google_compute_url_map                 "/api/* vai para cá, resto para lá"
   │
google_compute_backend_service         o "target group": grupos + política
   │   └── google_compute_health_check
   │   └── google_compute_security_policy (Cloud Armor)
   │
google_compute_region_instance_group_manager   as VMs (via named_port)`, { lang: 'text' })}

<h2>O código completo</h2>
${code(`# 1. IP global — reserve, senão ele muda a cada recriação
resource "google_compute_global_address" "main" {
  name = "\${local.name}-ip"
}

# 2. Certificado gerenciado (grátis, renovação automática)
resource "google_compute_managed_ssl_certificate" "main" {
  name = "\${local.name}-cert"

  managed {
    domains = ["app.exemplo.com.br"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 3. Health check — recurso independente, reaproveitável
resource "google_compute_health_check" "app" {
  name                = "\${local.name}-hc"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 8080
    request_path = "/health"
  }
}

# 4. Backend service — o "target group"
resource "google_compute_backend_service" "app" {
  name                  = "\${local.name}-backend"
  protocol              = "HTTP"
  port_name             = "http"          # bate com o named_port do MIG
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 30

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
}

# 5. URL map — o roteamento
resource "google_compute_url_map" "main" {
  name            = "\${local.name}-urlmap"
  default_service = google_compute_backend_service.app.id
}

# 6. Proxy — termina o TLS
resource "google_compute_target_https_proxy" "main" {
  name             = "\${local.name}-https-proxy"
  url_map          = google_compute_url_map.main.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

# 7. Forwarding rule — o que realmente escuta
resource "google_compute_global_forwarding_rule" "https" {
  name                  = "\${local.name}-https"
  target                = google_compute_target_https_proxy.main.id
  port_range            = "443"
  ip_address            = google_compute_global_address.main.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}`, { file: 'lb.tf' })}

${danger('load_balancing_scheme precisa combinar', 'O mesmo valor tem que aparecer no <b>backend service</b> e na <b>forwarding rule</b>. Misturar <code>EXTERNAL</code> (clássico) com <code>EXTERNAL_MANAGED</code> (Envoy, o atual) produz erro obscuro do tipo <code>Invalid value for field</code>. Use <code>EXTERNAL_MANAGED</code> em projetos novos.')}

<h2>O redirect 80 → 443 é a cadeia inteira de novo</h2>
${code(`resource "google_compute_url_map" "redirect" {
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
}`, { file: 'redirect.tf' })}
${warn('Na AWS isso é uma flag', 'O <code>default_action { type = "redirect" }</code> do listener resolve em 8 linhas. No GCP são 3 recursos. É o preço da composição.')}

<h2>O vínculo MIG ↔ backend service</h2>
${code(`resource "google_compute_region_instance_group_manager" "app" {
  # ...

  # Dá NOME à porta. O backend service procura por este nome.
  named_port {
    name = "http"
    port = 8080
  }
}

resource "google_compute_backend_service" "app" {
  port_name = "http"   # <<< o vínculo acontece aqui

  backend {
    group = google_compute_region_instance_group_manager.app.instance_group
  }
}`, { file: 'o "vincular ao TG" do GCP' })}
${info('A diferença conceitual', 'Na AWS o ASG <b>empurra</b> as instâncias para o Target Group (<code>target_group_arns</code>). No GCP o backend service <b>aponta</b> para o grupo de instâncias e resolve a porta pelo nome. O resultado é o mesmo; o sentido da referência é invertido.')}

<h2>Três erros que custam uma tarde</h2>
${table(['Sintoma', 'Causa', 'Correção'],
          [['Todos os backends UNHEALTHY', 'firewall bloqueando os health checkers', 'liberar <code>35.191.0.0/16</code> e <code>130.211.0.0/22</code>'],
          ['Certificado eternamente PROVISIONING', 'DNS ainda não aponta para o IP', 'crie o registro A primeiro; espere até 60 min'],
          ['502 no LB, VM saudável', '<code>port_name</code> não bate com o <code>named_port</code>', 'confira os dois nomes']])}
`},

      {
        id: 'run', title: 'Cloud Run e Artifact Registry',
        body: () => `
<span class="eyebrow gcp">GCP · 04</span>
<h1>Cloud Run: onde o GCP ganha</h1>
<p class="lede">Se a sua aplicação está em contêiner e é stateless, este capítulo pode substituir o ALB, o Target Group, o ASG, o certificado e o autoscaling — por um recurso.</p>

<h2>A comparação honesta</h2>
${table(['Necessidade', 'AWS (ECS Fargate + ALB)', 'GCP (Cloud Run)'],
          [['Rodar o contêiner', '<code>aws_ecs_task_definition</code> + <code>aws_ecs_service</code>', '<code>google_cloud_run_v2_service</code>'],
          ['Receber tráfego HTTPS', 'ALB + listener + target group + ACM', 'incluso'],
          ['Domínio', 'Route 53 + alias', 'URL <code>*.run.app</code> incluso'],
          ['Escala', '<code>aws_appautoscaling_*</code>', '<code>scaling { min, max }</code>'],
          ['Escala a zero', 'não (Fargate cobra a task ligada)', '<b>sim</b>, custo zero parado'],
          ['Recursos Terraform', '~10', '<b>2</b>'],
          ['Custo parado', '~US$ 40/mês (ALB + 1 task)', '<b>US$ 0</b>']])}

<h2>Artifact Registry + Cloud Run</h2>
${code(`resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "app"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  cleanup_policies {
    id     = "manter-recentes"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }
}

resource "google_cloud_run_v2_service" "app" {
  name     = local.name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app.email

    scaling {
      min_instance_count = 0    # escala a zero
      max_instance_count = 100
    }

    containers {
      image = "\${var.region}-docker.pkg.dev/\${var.project_id}/app/api:\${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 8080
      }

      # Secret direto, sem role de execução separada
      env {
        name = "DB_PASSWORD"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app.secret_id
            version = "latest"
          }
        }
      }

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
}

# Sem isto, a URL responde 403
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}`, { file: 'cloudrun.tf' })}

<h2>Deploy canário sem nenhuma infra extra</h2>
${code(`resource "google_cloud_run_v2_service" "app" {
  # ...

  traffic {
    type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
    revision = "app-v2"
    percent  = 10        # 10% na versão nova
  }

  traffic {
    type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
    revision = "app-v1"
    percent  = 90
  }
}`, { file: 'canário' })}
${tip('Na AWS isso exigiria', 'Dois target groups, uma regra de listener com <code>forward</code> ponderado, e um processo para trocar os pesos. No Cloud Run é uma alteração de percentual.')}

<h2>Quando NÃO usar Cloud Run</h2>
<ul>
<li><b>Processo de longa duração</b> (worker, fila): existe Cloud Run Jobs, mas o modelo de request/response não se aplica.</li>
<li><b>WebSocket de longa duração</b>: suportado, mas com limite de 60 minutos por conexão.</li>
<li><b>Cold start é inaceitável</b>: use <code>min_instance_count = 1</code> e você já perdeu o custo zero.</li>
<li><b>Precisa de disco persistente</b>: não tem (dá para montar GCS via FUSE, com ressalvas).</li>
<li><b>Aplicação stateful</b>: não é o lugar.</li>
</ul>

<h2>Cloud Run atrás do LB global</h2>
${code(`# Para ter domínio próprio, Cloud Armor e CDN na frente:
resource "google_compute_region_network_endpoint_group" "run" {
  name                  = "\${local.name}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }
}

resource "google_compute_backend_service" "run" {
  name                  = "\${local.name}-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.run.id
  }
}`, { file: 'run + lb.tf' })}
${info('Serverless NEG', 'É o adaptador entre o mundo serverless e o balanceador. O mesmo mecanismo serve para Cloud Functions e App Engine.')}
`},

      {
        id: 'migrar', title: 'O mesmo stack, nas duas nuvens',
        body: () => `
<span class="eyebrow gcp">GCP · 05</span>
<h1>O mesmo stack, lado a lado</h1>
<p class="lede">Aquele fluxo do console — registry, secret, target group, autoscaling, load balancer, policy — escrito nas duas nuvens, na mesma ordem.</p>

<h2>1. Registro de imagem</h2>
<div class="split">
${code(`resource "aws_ecr_repository" "api" {
  name                 = "app/api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}`, { file: 'AWS' })}
${code(`resource "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "api"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  cleanup_policies {
    id     = "manter-10"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }
}`, { file: 'GCP' })}
</div>

<h2>2. Segredo</h2>
<div class="split">
${code(`resource "aws_secretsmanager_secret" "app" {
  name = "prod/app/env"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ DB_PASSWORD = "trocar" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}`, { file: 'AWS' })}
${code(`resource "google_secret_manager_secret" "app" {
  secret_id = "app-env"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "app" {
  secret      = google_secret_manager_secret.app.id
  secret_data = "trocar"

  lifecycle {
    ignore_changes = [secret_data]
  }
}`, { file: 'GCP' })}
</div>

<h2>3. Identidade e permissão</h2>
<div class="split">
${code(`data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "app"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "app" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_policy" "app" {
  name   = "app"
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_role_policy_attachment" "app" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app.arn
}`, { file: 'AWS' })}
${code(`resource "google_service_account" "app" {
  account_id   = "app"
  display_name = "App"
}

# Permissão no PRÓPRIO secret, não no projeto inteiro
resource "google_secret_manager_secret_iam_member" "app" {
  secret_id = google_secret_manager_secret.app.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:\${google_service_account.app.email}"
}`, { file: 'GCP' })}
</div>
${info('A diferença de filosofia', 'A AWS descreve permissões com um documento de política que você anexa. O GCP concede um papel pronto a um membro, preferencialmente no próprio recurso. O código GCP fica menor; em compensação você depende dos papéis predefinidos serem granulares o suficiente.')}

<h2>4. Health check + grupo de destinos</h2>
<div class="split">
${code(`resource "aws_lb_target_group" "api" {
  name        = "api"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  lifecycle {
    create_before_destroy = true
  }
}`, { file: 'AWS — health check embutido' })}
${code(`resource "google_compute_health_check" "api" {
  name                = "api-hc"
  check_interval_sec  = 15
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 8080
    request_path = "/health"
  }
}

resource "google_compute_backend_service" "api" {
  name                  = "api"
  port_name             = "http"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  health_checks         = [google_compute_health_check.api.id]

  backend {
    group = google_compute_region_instance_group_manager.app.instance_group
  }
}`, { file: 'GCP — health check separado' })}
</div>

<h2>5. Autoscaling e o vínculo</h2>
<div class="split">
${code(`resource "aws_autoscaling_group" "app" {
  name                = "app"
  vpc_zone_identifier = aws_subnet.private[*].id
  min_size            = 2
  max_size            = 10
  desired_capacity    = 2
  health_check_type   = "ELB"

  # o vínculo, empurrado pelo ASG
  target_group_arns = [aws_lb_target_group.api.arn]

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }
}

resource "aws_autoscaling_policy" "cpu" {
  name                   = "cpu"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }

    target_value = 60
  }
}`, { file: 'AWS' })}
${code(`resource "google_compute_region_instance_group_manager" "app" {
  name               = "app"
  region             = var.region
  base_instance_name = "app"

  version {
    instance_template = google_compute_instance_template.app.id
  }

  # o vínculo, puxado pelo backend service
  named_port {
    name = "http"
    port = 8080
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.api.id
    initial_delay_sec = 120
  }
}

resource "google_compute_region_autoscaler" "app" {
  name   = "app"
  region = var.region
  target = google_compute_region_instance_group_manager.app.id

  autoscaling_policy {
    min_replicas = 2
    max_replicas = 10

    cpu_utilization {
      target = 0.6
    }
  }
}`, { file: 'GCP' })}
</div>

<h2>Resumo da tradução</h2>
${table(['Passo do seu fluxo', 'AWS', 'GCP'],
          [['Crio o ECR', '<code>aws_ecr_repository</code>', '<code>google_artifact_registry_repository</code>'],
          ['Crio o secret', '<code>aws_secretsmanager_secret</code>', '<code>google_secret_manager_secret</code>'],
          ['Crio a policy', '<code>aws_iam_policy</code> + attachment', '<code>google_*_iam_member</code> no recurso'],
          ['Crio o target group', '<code>aws_lb_target_group</code>', '<code>google_compute_backend_service</code> + <code>_health_check</code>'],
          ['Crio o autoscaling', '<code>aws_autoscaling_group</code>', '<code>google_compute_region_instance_group_manager</code>'],
          ['<b>Vinculo ao TG</b>', '<code>target_group_arns = [...]</code>', '<code>named_port</code> + <code>backend { group }</code>'],
          ['Crio o load balancer', '<code>aws_lb</code> + <code>aws_lb_listener</code>', '5 recursos encadeados'],
          ['Aponto o DNS', '<code>aws_route53_record</code> (alias)', '<code>google_dns_record_set</code> (A)']])}
`}
    ]
  });
})(window.IAC);
