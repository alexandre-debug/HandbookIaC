/* =========================================================
   content-ref.js — referência, troubleshooting e glossário
   ========================================================= */
(function (IAC) {
  'use strict';
  const code = IAC.code, tip = IAC.tip, warn = IAC.warn, danger = IAC.danger,
    info = IAC.info, table = IAC.table;

  IAC.section({
    id: 'ref', label: 'Referência', icon: '📚',
    pages: [

      {
        id: 'comandos', title: 'Cheat sheet de comandos',
        body: () => `
<span class="eyebrow">Referência</span>
<h1>Comandos</h1>
<p class="lede">Tudo que você vai digitar de verdade, agrupado por situação.</p>

<h2>O dia a dia</h2>
${code(`terraform init                     # baixa providers, configura backend
terraform init -upgrade            # atualiza dentro da restrição de versão
terraform init -reconfigure        # troca de backend
terraform fmt -recursive           # formata tudo
terraform validate                 # sintaxe e referências
terraform plan                     # o diff
terraform plan -out=tfplan         # salva o plano (o jeito certo no CI)
terraform apply tfplan             # aplica EXATAMENTE o plano revisado
terraform apply -auto-approve      # só em CI
terraform destroy`, { lang: 'bash' })}

<h2>Investigando</h2>
${code(`terraform state list                          # tudo que o Terraform conhece
terraform state list | grep aws_lb            # filtrando
terraform state show aws_lb.public            # detalhes de um recurso
terraform show                                # state inteiro, legível
terraform show -json | jq '.values.root_module.resources[].address'
terraform output                              # todos os outputs
terraform output -raw alb_dns_name            # sem aspas, para script
terraform graph | dot -Tsvg > grafo.svg       # o grafo de dependências
terraform providers                           # árvore de providers
terraform version`, { lang: 'bash' })}

<h2>Consertando</h2>
${code(`terraform apply -replace=aws_instance.web    # recria só este recurso
terraform apply -target=module.rede           # aplica só uma parte (emergência)
terraform apply -refresh-only                 # aceita o que mudou por fora
terraform plan -refresh-only                  # detecta drift sem aplicar
terraform force-unlock LOCK_ID                # lock preso (com MUITO cuidado)
terraform state rm aws_instance.antiga        # esquece (não apaga na nuvem)
terraform state mv aws_lb.old aws_lb.new      # renomeia sem recriar
terraform state pull > backup.tfstate         # BACKUP antes de qualquer cirurgia
terraform import aws_ecr_repository.api app/api`, { lang: 'bash' })}

<h2>Depurando</h2>
${code(`TF_LOG=DEBUG terraform plan                    # verboso
TF_LOG=TRACE terraform apply 2> trace.log      # o máximo de detalhe
TF_LOG_PATH=./tf.log TF_LOG=DEBUG terraform plan

terraform console                              # REPL para testar expressões
> cidrsubnet("10.0.0.0/16", 8, 3)
> [for s in var.subnets : s.id]
> jsonencode({a = 1})`, { lang: 'bash' })}

<h2>Variáveis de ambiente úteis</h2>
${table(['Variável', 'Efeito'],
          [['<code>TF_VAR_nome</code>', 'define a variável <code>nome</code>'],
          ['<code>TF_LOG</code>', '<code>TRACE|DEBUG|INFO|WARN|ERROR</code>'],
          ['<code>TF_LOG_PATH</code>', 'grava o log em arquivo'],
          ['<code>TF_INPUT=0</code>', 'nunca pergunta nada (CI)'],
          ['<code>TF_IN_AUTOMATION=1</code>', 'saída mais enxuta, sem dicas de próximos passos'],
          ['<code>TF_CLI_ARGS_plan</code>', 'argumentos padrão para o <code>plan</code>'],
          ['<code>TF_DATA_DIR</code>', 'muda o diretório <code>.terraform</code>'],
          ['<code>AWS_PROFILE</code> / <code>CLOUDSDK_CORE_PROJECT</code>', 'qual conta/projeto']])}

<h2>Workspaces</h2>
${code(`terraform workspace list
terraform workspace new preview-pr-42
terraform workspace select prod
terraform workspace delete preview-pr-42`, { lang: 'bash' })}

<h2>Um Makefile que economiza digitação</h2>
${code(`ENV ?= dev
DIR  = ambientes/$(ENV)

.PHONY: init plan apply destroy
init:
	terraform -chdir=$(DIR) init

plan:
	terraform -chdir=$(DIR) plan -out=tfplan

apply:
	terraform -chdir=$(DIR) apply tfplan

destroy:
	terraform -chdir=$(DIR) destroy

check:
	terraform fmt -check -recursive
	terraform -chdir=$(DIR) validate
	tflint --chdir=$(DIR)
	trivy config $(DIR)`, { lang: 'bash', file: 'Makefile' })}
${tip('-chdir é subestimado', '<code>terraform -chdir=ambientes/prod plan</code> evita ficar entrando e saindo de diretório — e evita o clássico "apliquei no diretório errado".')}
`},

      {
        id: 'erros', title: 'Erros comuns e como sair deles',
        body: () => `
<span class="eyebrow">Referência</span>
<h1>Erros comuns</h1>
<p class="lede">Os erros que todo mundo toma, com a causa real e a saída. Use o buscador (tecla <kbd>/</kbd>) para achar a sua mensagem.</p>

<h2>Error acquiring the state lock</h2>
<p><b>Causa:</b> outro apply está rodando — ou um CI morreu no meio e deixou o lock preso.</p>
${code(`# 1. Confirme que ninguém está aplicando (pergunte no canal do time!)
# 2. Só então:
terraform force-unlock 7e3f1a2b-...`, { lang: 'bash' })}
${danger('force-unlock com apply rodando corrompe o state', 'Se houver mesmo um apply em andamento, você vai acabar com dois processos escrevendo o mesmo arquivo. Confirme antes.')}

<h2>Resource already exists / AlreadyExistsException</h2>
<p><b>Causa:</b> o recurso existe na nuvem mas não está no state. Quase sempre porque alguém criou no console, ou um apply anterior falhou no meio.</p>
${code(`terraform import aws_ecr_repository.api minha-app/api
terraform plan   # ajuste o código até o plan ficar vazio`, { lang: 'bash' })}

<h2>Invalid for_each argument</h2>
<p><b>Mensagem:</b> <i>the "for_each" value depends on resource attributes that cannot be determined until apply</i>.</p>
<p><b>Causa:</b> a chave do <code>for_each</code> depende de algo que só existe depois do apply (um <code>.id</code>, um <code>.arn</code>).</p>
${code(`# ❌ chave desconhecida no plan
resource "aws_route53_record" "r" {
  for_each = { for s in aws_subnet.private : s.id => s }
}

# ✅ chave estática/variável
resource "aws_route53_record" "r" {
  for_each = { for i, az in local.azs : az => i }
}`)}
${tip('Saída de emergência', 'Aplique em duas etapas: <code>terraform apply -target=aws_subnet.private</code> e depois o apply completo. Mas conserte a chave — <code>-target</code> não é solução permanente.')}

<h2>Cycle: a → b → a</h2>
<p><b>Causa:</b> dois recursos se referenciam mutuamente. Muito comum entre security groups.</p>
${code(`# ❌ ciclo: cada SG referencia o outro no bloco inline
resource "aws_security_group" "a" {
  ingress { security_groups = [aws_security_group.b.id] }
}
resource "aws_security_group" "b" {
  ingress { security_groups = [aws_security_group.a.id] }
}

# ✅ crie os SGs vazios e as regras como recursos separados
resource "aws_security_group" "a" { name = "a" }
resource "aws_security_group" "b" { name = "b" }

resource "aws_vpc_security_group_ingress_rule" "a_from_b" {
  security_group_id            = aws_security_group.a.id
  referenced_security_group_id = aws_security_group.b.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}`)}

<h2>target group is currently in use by a listener</h2>
<p><b>Causa:</b> o Terraform tenta destruir o TG antes de criar o novo. Falta <code>create_before_destroy</code>.</p>
${code(`resource "aws_lb_target_group" "api" {
  name_prefix = "api-"   # com create_before_destroy, use prefix

  lifecycle {
    create_before_destroy = true
  }
}`)}

<h2>InvalidParameterException: secret already scheduled for deletion</h2>
<p><b>Causa:</b> o secret foi destruído mas o nome fica reservado pelo <code>recovery_window_in_days</code>.</p>
${code(`# Recuperar
aws secretsmanager restore-secret --secret-id prod/app/env

# Ou, em ambientes efêmeros, evitar o problema:
resource "aws_secretsmanager_secret" "app" {
  recovery_window_in_days = 0   # apaga na hora
}`, { lang: 'bash' })}

<h2>Provider produced inconsistent final plan</h2>
<p><b>Causa:</b> bug do provider, ou um valor que a nuvem normaliza (uma policy JSON reordenada, um ARN em maiúscula).</p>
<ul>
<li>Atualize o provider — normalmente já foi corrigido.</li>
<li>Use <code>jsonencode()</code> em vez de string literal para JSON.</li>
<li>Em último caso, <code>ignore_changes</code> naquele campo.</li>
</ul>

<h2>Error: Unsupported argument</h2>
<p><b>Causa:</b> mudança de versão do provider. Um argumento saiu, virou recurso separado ou mudou de nome.</p>
<p>Exemplo clássico: <code>versioning</code> dentro do <code>aws_s3_bucket</code> virou <code>aws_s3_bucket_versioning</code> no provider 4.x.</p>
${code(`# Veja o que mudou:
# https://registry.terraform.io/providers/hashicorp/aws/latest/docs
# Seção "Upgrade Guides" — sempre leia antes de subir uma major.`, { lang: 'bash' })}

<h2>Plan quer destruir tudo do nada</h2>
${table(['Causa provável', 'Como confirmar'],
          [['Backend errado (state de outro ambiente)', '<code>terraform state list</code> — está vazio ou com coisas erradas?'],
          ['Workspace errado', '<code>terraform workspace show</code>'],
          ['Credencial de outra conta', '<code>aws sts get-caller-identity</code>'],
          ['State perdido/apagado', 'olhe as versões do bucket do state'],
          ['Módulo mudou de versão', '<code>git diff</code> no <code>source</code>/<code>version</code>']])}
${danger('Nunca aplique um plan que destrói tudo "para ver o que acontece"', 'Pare, investigue as cinco causas acima. Em 100% dos casos é uma delas.')}

<h2>Error: Invalid count argument</h2>
<p><b>Causa:</b> o valor do <code>count</code> depende de algo desconhecido no plan. Mesma família do erro de <code>for_each</code>.</p>
${code(`# ❌
count = length(data.aws_instances.web.ids)

# ✅ use um valor conhecido no plan
count = var.instance_count`)}

<h2>GCP: API has not been used in project</h2>
${code(`resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_compute_network" "main" {
  # ...
  depends_on = [google_project_service.compute]
}`)}
<p>Se acabou de habilitar, espere alguns minutos — a propagação não é instantânea.</p>

<h2>GCP: googleapi: Error 409: already exists</h2>
<p>Nomes de recursos GCP frequentemente ficam <b>reservados</b> após a exclusão (Cloud SQL: ~7 dias). Use sufixo com <code>random_id</code> em ambientes efêmeros.</p>
${code(`resource "random_id" "sufixo" {
  byte_length = 4
}

resource "google_sql_database_instance" "main" {
  name = "app-\${random_id.sufixo.hex}"
}`)}

<h2>Timeout esperando o recurso ficar pronto</h2>
${code(`resource "aws_db_instance" "main" {
  timeouts {
    create = "60m"
    update = "80m"
    delete = "60m"
  }
}`)}
<p>RDS, EKS, CloudFront e GKE demoram mesmo. Antes de aumentar o timeout, confira no console se o recurso não está preso em erro.</p>

<h2>Quando nada faz sentido</h2>
${code(`# 1. Confirme quem você é e onde está
aws sts get-caller-identity
terraform workspace show
terraform state list | head

# 2. Backup do state
terraform state pull > backup-$(date +%F-%H%M).tfstate

# 3. Force o refresh e leia
terraform plan -refresh-only

# 4. Log detalhado
TF_LOG=DEBUG terraform plan 2>&1 | tee debug.log

# 5. Limpe o cache local (nunca apaga infra)
rm -rf .terraform .terraform.lock.hcl && terraform init`, { lang: 'bash' })}
`},

      {
        id: 'padroes', title: 'Padrões e receitas prontas',
        body: () => `
<span class="eyebrow">Referência</span>
<h1>Padrões prontos</h1>
<p class="lede">Trechos que resolvem problemas recorrentes. Copie, adapte, siga em frente.</p>

<h2>Tags padronizadas em tudo</h2>
${code(`provider "aws" {
  default_tags {
    tags = local.tags
  }
}

locals {
  tags = {
    Project     = var.projeto
    Environment = var.ambiente
    ManagedBy   = "terraform"
    Repository  = "github.com/org/infra"
    CostCenter  = var.centro_custo
  }
}

# ASG precisa de tratamento especial
resource "aws_autoscaling_group" "app" {
  dynamic "tag" {
    for_each = local.tags

    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}`)}

<h2>Diferenças entre ambientes em um lugar só</h2>
${code(`locals {
  is_prod = var.ambiente == "prod"

  cfg = {
    instance_type = local.is_prod ? "m6i.large" : "t3.micro"
    min_size      = local.is_prod ? 3 : 1
    max_size      = local.is_prod ? 20 : 2
    multi_az      = local.is_prod
    backup_days   = local.is_prod ? 30 : 1
    protecao      = local.is_prod
    nat_por_az    = local.is_prod
  }
}`)}

<h2>Ambiente que se desliga sozinho à noite</h2>
${code(`resource "aws_autoscaling_schedule" "desligar" {
  count = var.ambiente == "prod" ? 0 : 1

  scheduled_action_name  = "desligar"
  autoscaling_group_name = aws_autoscaling_group.app.name
  min_size               = 0
  max_size               = 0
  desired_capacity       = 0
  recurrence             = "0 22 * * MON-FRI"   # 22h UTC
}

resource "aws_autoscaling_schedule" "ligar" {
  count = var.ambiente == "prod" ? 0 : 1

  scheduled_action_name  = "ligar"
  autoscaling_group_name = aws_autoscaling_group.app.name
  min_size               = 1
  max_size               = 2
  desired_capacity       = 1
  recurrence             = "0 11 * * MON-FRI"
}`)}

<h2>Vários serviços atrás do mesmo ALB</h2>
${code(`variable "servicos" {
  type = map(object({
    porta    = number
    path     = string
    health   = string
    prioridade = number
  }))

  default = {
    api   = { porta = 8080, path = "/api/*",   health = "/health",  prioridade = 10 }
    admin = { porta = 9000, path = "/admin/*", health = "/healthz", prioridade = 20 }
  }
}

resource "aws_lb_target_group" "svc" {
  for_each = var.servicos

  name        = "\${local.name}-\${each.key}"
  port        = each.value.porta
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path = each.value.health
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener_rule" "svc" {
  for_each = var.servicos

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.prioridade

  condition {
    path_pattern {
      values = [each.value.path]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.svc[each.key].arn
  }
}`)}

<h2>Multi-região com um provider por região</h2>
${code(`provider "aws" {
  alias  = "primaria"
  region = "us-east-1"
}

provider "aws" {
  alias  = "secundaria"
  region = "sa-east-1"
}

module "app_primaria" {
  source = "./modules/app"

  providers = {
    aws = aws.primaria
  }
}

module "app_secundaria" {
  source = "./modules/app"

  providers = {
    aws = aws.secundaria
  }
}`)}

<h2>Ler saídas de outro state</h2>
${code(`data "terraform_remote_state" "rede" {
  backend = "s3"

  config = {
    bucket = "tfstate-minha-empresa"
    key    = "rede/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_lb" "public" {
  subnets = data.terraform_remote_state.rede.outputs.public_subnet_ids
}`)}
${tip('Alternativa mais desacoplada', 'Procurar por tag evita dar acesso de leitura ao state da outra camada:' + code(`data "aws_subnets" "publicas" {
  filter {
    name   = "tag:Tier"
    values = ["public"]
  }
}`))}

<h2>Bloquear apply fora da janela de manutenção</h2>
${code(`# Terraform 1.5+: check block, validação contínua
check "janela_de_deploy" {
  assert {
    condition     = var.ambiente != "prod" || var.forcar_deploy || formatdate("EEE", timestamp()) != "Fri"
    error_message = "Deploy em produção na sexta-feira exige forcar_deploy = true."
  }
}`)}

<h2>Sufixo aleatório para nomes globais</h2>
${code(`resource "random_id" "sufixo" {
  byte_length = 4

  keepers = {
    projeto = var.projeto
  }
}

resource "aws_s3_bucket" "assets" {
  bucket = "\${var.projeto}-assets-\${random_id.sufixo.hex}"
}`)}

<h2>Precondition e postcondition</h2>
${code(`resource "aws_instance" "app" {
  instance_type = var.instance_type

  lifecycle {
    precondition {
      condition     = data.aws_ami.selecionada.architecture == "x86_64"
      error_message = "A AMI precisa ser x86_64 para este tipo de instância."
    }

    postcondition {
      condition     = self.private_ip != ""
      error_message = "A instância precisa ter IP privado."
    }
  }
}`)}
`},

      {
        id: 'glossario', title: 'Glossário',
        body: () => `
<span class="eyebrow">Referência</span>
<h1>Glossário</h1>
<p class="lede">Os termos que aparecem em toda conversa de IaC.</p>

${table(['Termo', 'O que é'],
          [['<b>Backend</b>', 'Onde o state fica guardado (S3, GCS, HCP Terraform, local).'],
          ['<b>Data source</b>', 'Bloco que <i>lê</i> algo existente. Nunca cria nem altera.'],
          ['<b>Declarativo</b>', 'Você descreve o resultado desejado; a ferramenta decide os passos.'],
          ['<b>Drift</b>', 'Diferença entre o que o código diz e o que existe de verdade na nuvem. Normalmente causado por mudança manual no console.'],
          ['<b>Grafo de dependências</b>', 'A ordem que o Terraform monta a partir das referências entre recursos.'],
          ['<b>HCL</b>', 'HashiCorp Configuration Language, a sintaxe dos arquivos <code>.tf</code>.'],
          ['<b>Idempotência</b>', 'Aplicar duas vezes dá o mesmo resultado que aplicar uma.'],
          ['<b>Import</b>', 'Trazer para o state um recurso que já existe na nuvem.'],
          ['<b>Known after apply</b>', 'Valor que só existe depois de criar o recurso (ARN, ID, DNS).'],
          ['<b>Lock</b>', 'Trava que impede dois <code>apply</code> simultâneos no mesmo state.'],
          ['<b>Meta-argumento</b>', 'Argumento que existe em todo recurso: <code>count</code>, <code>for_each</code>, <code>depends_on</code>, <code>lifecycle</code>, <code>provider</code>.'],
          ['<b>Módulo</b>', 'Um diretório com arquivos <code>.tf</code> que pode ser chamado por outro.'],
          ['<b>Módulo raiz</b>', 'O diretório onde você roda o <code>terraform</code>.'],
          ['<b>OpenTofu</b>', 'Fork open source do Terraform, sob a Linux Foundation. Compatível.'],
          ['<b>Plan</b>', 'O diff entre desejo, state e realidade. Não muda nada.'],
          ['<b>Provider</b>', 'O plugin que traduz HCL em chamadas de API (AWS, Google, Kubernetes…).'],
          ['<b>Provisioner</b>', 'Executa comandos na máquina após criar. <b>Último recurso</b> — quebra a idempotência.'],
          ['<b>Recurso órfão</b>', 'Existe na nuvem, ninguém gerencia. Nasce de <code>state rm</code> ou de criação manual.'],
          ['<b>Replacement</b>', 'Quando alterar um campo exige destruir e recriar (<code>-/+</code> no plan).'],
          ['<b>State</b>', 'O arquivo que mapeia nomes do código para IDs reais na nuvem.'],
          ['<b>Taint</b>', 'Marcar um recurso para recriação. Obsoleto: use <code>-replace</code>.'],
          ['<b>Terragrunt</b>', 'Wrapper que reduz repetição entre ambientes e resolve dependências entre stacks.'],
          ['<b>Workspace</b>', 'States paralelos com o mesmo código. Útil para ambientes efêmeros.'],
          ['<b>ClickOps</b>', 'Criar infraestrutura clicando no console. O ponto de partida de quase todo mundo.'],
          ['<b>Blast radius</b>', 'O tamanho do estrago que uma mudança pode causar. Menor com states separados.'],
          ['<b>Bootstrap</b>', 'O projeto que cria o bucket de state — o ovo antes da galinha.']])}

<h2>Vocabulário AWS que aparece o tempo todo</h2>
${table(['Sigla', 'Significado'],
          [['<b>ALB</b>', 'Application Load Balancer — camada 7 (HTTP).'],
          ['<b>ASG</b>', 'Auto Scaling Group.'],
          ['<b>AZ</b>', 'Availability Zone — datacenter isolado dentro de uma região.'],
          ['<b>ECR</b>', 'Elastic Container Registry.'],
          ['<b>IMDS</b>', 'Instance Metadata Service — de onde a instância pega credencial da role. Use v2.'],
          ['<b>IRSA</b>', 'IAM Roles for Service Accounts (permissão para pod no EKS).'],
          ['<b>LCU</b>', 'Load Balancer Capacity Unit — unidade de cobrança do ALB.'],
          ['<b>NLB</b>', 'Network Load Balancer — camada 4 (TCP/UDP).'],
          ['<b>SSM</b>', 'Systems Manager — Session Manager, Parameter Store, patching.'],
          ['<b>TG</b>', 'Target Group.']])}

<h2>Vocabulário GCP</h2>
${table(['Termo', 'Significado'],
          [['<b>MIG</b>', 'Managed Instance Group — o ASG do GCP.'],
          ['<b>NEG</b>', 'Network Endpoint Group — destinos do balanceador (serverless, contêiner, IP).'],
          ['<b>IAP</b>', 'Identity-Aware Proxy — acesso a VM/app sem VPN nem porta aberta.'],
          ['<b>PSA</b>', 'Private Service Access — o peering que dá IP privado ao Cloud SQL.'],
          ['<b>Autopilot</b>', 'Modo do GKE sem gerenciar nós.'],
          ['<b>Workload Identity</b>', 'Permissão GCP para pod sem chave JSON.'],
          ['<b>Network tag</b>', 'Rótulo na VM usado como alvo pelas regras de firewall.'],
          ['<b>Named port</b>', 'Nome dado a uma porta do MIG; é assim que o backend service a encontra.']])}
`}
    ]
  });
})(window.IAC);
