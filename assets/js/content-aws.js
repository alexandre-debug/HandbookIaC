/* =========================================================
   content-aws.js
   ========================================================= */
(function (IAC) {
  'use strict';
  const code = IAC.code, tip = IAC.tip, warn = IAC.warn, danger = IAC.danger,
    info = IAC.info, table = IAC.table, cs = IAC.consoleSteps;

  IAC.section({
    id: 'aws', label: 'AWS', icon: '🟧', cloud: 'aws',
    pages: [

      {
        id: 'visao', title: 'A arquitetura que você já constrói',
        body: () => `
<span class="eyebrow aws">AWS · 01</span>
<h1>A arquitetura que você já constrói no console</h1>
<p class="lede">Você descreveu o seu fluxo: cria o ECR, cria o secret, cria o target group, cria o auto scaling, vincula ao TG, sobe o load balancer, ajusta a policy. Vamos mapear cada um desses cliques para código — na ordem em que eles realmente acontecem.</p>

<h2>O desenho completo</h2>
${code(`                       Internet
                          │
                    ┌─────▼──────┐
                    │  Route 53  │  registro alias
                    └─────┬──────┘
                          │
                  ┌───────▼────────┐
       ACM  ─────►│      ALB       │◄──── SG do ALB (80/443 do mundo)
    (certificado) │  subnets PÚBL. │
                  └───────┬────────┘
                          │  listener 443 → forward
                  ┌───────▼────────┐
                  │  Target Group  │  health check /health
                  └───────┬────────┘
                          │  target_group_arns   ◄── "vincular ao TG"
                  ┌───────▼────────────────┐
                  │  Auto Scaling Group    │
                  │  subnets PRIVADAS      │◄──── SG da app (só do SG do ALB)
                  └───────┬────────────────┘
                          │ usa
                  ┌───────▼────────┐
                  │ Launch Template│──► IAM instance profile ──► Role
                  └───────┬────────┘                              │
                          │ user_data                    permissões│
              ┌───────────┴────────────┐                          │
              ▼                        ▼                          ▼
        ┌──────────┐            ┌────────────┐          ecr:GetAuthorizationToken
        │   ECR    │            │  Secrets   │          secretsmanager:GetSecretValue
        │ (imagem) │            │  Manager   │
        └──────────┘            └────────────┘

              NAT Gateway ──► saída das subnets privadas
              CloudWatch  ──► logs + alarmes ──► SNS`, { lang: 'text', file: 'o stack clássico' })}

<h2>Console → Terraform: o mapa completo</h2>
${table(['O que você clica', 'Recurso Terraform', 'Capítulo'],
          [['ECR → Create repository', '<code>aws_ecr_repository</code> + <code>aws_ecr_lifecycle_policy</code>', 'ECR e Secrets'],
          ['Secrets Manager → Store a new secret', '<code>aws_secretsmanager_secret</code> (+ <code>_version</code>)', 'ECR e Secrets'],
          ['IAM → Create role → attach policies', '<code>aws_iam_role</code> + <code>aws_iam_policy</code> + <code>_attachment</code>', 'IAM'],
          ['EC2 → Security Groups → Create', '<code>aws_security_group</code>', 'Rede'],
          ['ACM → Request certificate', '<code>aws_acm_certificate</code> + <code>_validation</code>', 'ALB'],
          ['EC2 → Target Groups → Create', '<code>aws_lb_target_group</code>', 'ALB'],
          ['EC2 → Load Balancers → Create', '<code>aws_lb</code>', 'ALB'],
          ['ALB → Listeners → Add listener', '<code>aws_lb_listener</code>', 'ALB'],
          ['EC2 → Launch Templates → Create', '<code>aws_launch_template</code>', 'ASG'],
          ['ASG → Create → <b>Attach to Target Group</b>', '<code>target_group_arns</code> no ASG', 'ASG'],
          ['ASG → Automatic scaling → Create policy', '<code>aws_autoscaling_policy</code>', 'ASG'],
          ['CloudWatch → Alarms → Create', '<code>aws_cloudwatch_metric_alarm</code> + <code>aws_sns_topic</code>', 'Observabilidade'],
          ['Route 53 → Create record → Alias', '<code>aws_route53_record</code>', 'ALB']])}

<h2>A ordem que o Terraform vai escolher (e por quê)</h2>
<p>Você cria na ordem que quiser no console. O Terraform escolhe sozinho a partir das referências. Para este stack, o grafo fica assim:</p>
${code(`nível 0 (paralelo):  aws_vpc · aws_ecr_repository · aws_kms_key · data sources
nível 1:             aws_subnet · aws_internet_gateway · aws_secretsmanager_secret
nível 2:             aws_security_group · aws_route_table · aws_nat_gateway
nível 3:             aws_iam_role (precisa do ARN do secret e do ECR)
nível 4:             aws_launch_template · aws_lb_target_group · aws_lb
nível 5:             aws_lb_listener · aws_autoscaling_group
nível 6:             aws_autoscaling_policy · aws_cloudwatch_metric_alarm · aws_route53_record`, { lang: 'text' })}
${info('Veja acontecendo', 'Abra o <b>Laboratório AWS</b>, adicione esses componentes e vá na aba <b>Diagrama</b>. O grafo é montado lendo as referências do código gerado — exatamente como o Terraform faz.')}

<h2>Quanto isso custa (ordem de grandeza)</h2>
${table(['Item', 'US$/mês aprox.', 'Comentário'],
          [['NAT Gateway', '~32 por AZ', 'o maior custo escondido; + tráfego por GB'],
          ['ALB', '~16 + LCU', 'cobra por hora mesmo parado'],
          ['2× t3.small', '~30', 'escala com o ASG'],
          ['RDS db.t4g.micro', '~13', 'dobra com Multi-AZ'],
          ['ECR', '~0,10/GB', 'sem lifecycle policy, cresce para sempre'],
          ['Secrets Manager', '0,40 por secret', 'barato; o SSM Parameter Store Standard é grátis'],
          ['CloudWatch Logs', '~0,50/GB ingerido', 'sem retenção definida, acumula eternamente']])}
${tip('Economia imediata em dev', 'Sem NAT Gateway (use VPC endpoints ou subnets públicas), sem Multi-AZ, ASG com <code>min_size = 0</code> fora do horário comercial. Um ambiente de dev bem configurado custa menos de US$ 30/mês.')}
`},

      {
        id: 'lab', title: 'Laboratório AWS', tag: 'lab',
        mount: (view) => IAC.lab.mount(view, 'aws')
      },

      {
        id: 'ecr-secrets', title: 'ECR e Secrets Manager',
        body: () => `
<span class="eyebrow aws">AWS · 02</span>
<h1>ECR e Secrets Manager</h1>
<p class="lede">O par que quase todo deploy de contêiner usa: onde mora a imagem e onde moram as credenciais. Também é onde mora o erro mais caro do IaC — segredo comitado.</p>

<h2>ECR</h2>
${cs(['ECR → Repositories → Create repository',
          'Private · nome do repositório',
          'Tag immutability: marcar · Scan on push: marcar',
          'Depois: Lifecycle policy → Create rule → "expire images count more than 10"'])}
${code(`resource "aws_ecr_repository" "api" {
  name                 = "\${var.projeto}/api"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}

# Sem isto o repositório cresce até o fim dos tempos.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Manter as 10 imagens mais recentes"

        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }

        action = { type = "expire" }
      },
    ]
  })
}`, { file: 'ecr.tf' })}

${warn('Tag imutável muda o seu deploy', 'Com <code>IMMUTABLE</code> você não consegue mais fazer <code>docker push :latest</code> por cima. É de propósito: o deploy passa a apontar para uma tag única (o SHA do commit) e você sabe exatamente qual código está rodando. Vale a mudança de hábito.')}

<h3>Compartilhando o repositório com outra conta</h3>
${code(`data "aws_iam_policy_document" "ecr_cross" {
  statement {
    sid    = "PermitirContaDeProducao"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::999988887777:root"]
    }

    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
  }
}

resource "aws_ecr_repository_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy     = data.aws_iam_policy_document.ecr_cross.json
}`, { file: 'cross-account' })}

<h2>Secrets Manager</h2>
${cs(['Secrets Manager → Store a new secret',
          'Other type of secret → key/value',
          'Escolher chave de criptografia → Next',
          'Nome: <code>prod/minha-app/env</code> → configurar rotação → Store'])}

${danger('A regra que não se quebra', '<p>Tudo que passa pelo Terraform fica no <code>terraform.tfstate</code> <b>em texto claro</b>. Se você escrever a senha do banco em um <code>.tf</code>, ela está no state, no bucket, e provavelmente no log do CI.</p><p><b>O padrão correto:</b> o Terraform cria o envelope e as permissões. O valor entra por fora.</p>')}

${code(`resource "aws_secretsmanager_secret" "app" {
  name                    = "prod/\${var.projeto}/env"
  description             = "Variáveis sensíveis da aplicação"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  # Placeholder. O valor real NUNCA vem daqui.
  secret_string = jsonencode({
    DB_HOST     = "preencher-fora-do-terraform"
    DB_PASSWORD = "preencher-fora-do-terraform"
  })

  # O Terraform cria a primeira versão e nunca mais olha o conteúdo.
  lifecycle {
    ignore_changes = [secret_string]
  }
}`, { file: 'secrets.tf' })}
${code(`# Na pipeline ou na mão, uma vez:
aws secretsmanager put-secret-value \\
  --secret-id prod/minha-app/env \\
  --secret-string "{\\"DB_PASSWORD\\":\\"$DB_PASSWORD\\"}"`, { lang: 'bash' })}

${warn('A pegadinha do recovery_window', 'Ao destruir, o secret entra em "scheduled for deletion" e o <b>nome fica reservado</b> por 7 a 30 dias. Recriar com o mesmo nome falha com <code>You can\'t create this secret because a secret with this name is already scheduled for deletion</code>. Em ambientes efêmeros use <code>recovery_window_in_days = 0</code>.')}

<h3>Senha gerada pela própria AWS (o melhor caminho para RDS)</h3>
${code(`resource "aws_db_instance" "main" {
  identifier = "app-prod"
  engine     = "postgres"
  username   = "postgres"

  # A AWS gera, guarda no Secrets Manager e rotaciona sozinha.
  # A senha NUNCA passa pelo Terraform nem pelo state.
  manage_master_user_password = true
}

output "secret_do_banco" {
  value = aws_db_instance.main.master_user_secret[0].secret_arn
}`, { file: 'rds.tf' })}
${tip('Se precisar gerar uma senha no Terraform', 'Existe <code>random_password</code>, mas o valor gerado <b>fica no state</b>. Só use quando o consumidor também é gerenciado pelo Terraform e você aceita esse trade-off. Prefira sempre a rotação gerenciada.')}

<h3>Lendo um secret que já existe</h3>
${code(`data "aws_secretsmanager_secret" "existente" {
  name = "prod/minha-app/env"
}

data "aws_secretsmanager_secret_version" "existente" {
  secret_id = data.aws_secretsmanager_secret.existente.id
}

locals {
  # ATENÇÃO: isto também cai no state em texto claro.
  db_password = jsondecode(data.aws_secretsmanager_secret_version.existente.secret_string)["DB_PASSWORD"]
}`, { file: 'lendo (com cuidado)' })}
${danger('Prefira injetar em runtime', 'A aplicação lendo o secret na hora que sobe (via SDK, via ECS <code>secrets</code>, via user_data) é sempre melhor do que o Terraform lendo e repassando. Cada passagem pelo Terraform é uma cópia a mais em texto claro.')}
`},

      {
        id: 'iam', title: 'IAM: roles, policies e menor privilégio',
        body: () => `
<span class="eyebrow aws">AWS · 03</span>
<h1>IAM</h1>
<p class="lede">A parte que dá mais erro e mais medo. Em Terraform ela fica muito mais clara, porque as duas políticas de toda role — quem pode assumir e o que pode fazer — ficam explícitas e lado a lado.</p>

<h2>As duas políticas de toda role</h2>
${table(['Política', 'Responde', 'No Terraform'],
          [['<b>Trust policy</b><br>(de confiança)', 'Quem pode <i>vestir</i> esta role?', '<code>assume_role_policy</code> no <code>aws_iam_role</code>'],
          ['<b>Permission policy</b><br>(de permissão)', 'O que quem veste esta role pode fazer?', '<code>aws_iam_policy</code> + <code>aws_iam_role_policy_attachment</code>']])}

${code(`# ---- 1. CONFIANÇA: só o serviço EC2 pode assumir ----
data "aws_iam_policy_document" "app_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "\${local.name}-app"
  assume_role_policy = data.aws_iam_policy_document.app_assume.json
}

# ---- 2. PERMISSÃO: exatamente o necessário ----
data "aws_iam_policy_document" "app" {
  statement {
    sid       = "LerOSecretDaApp"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }

  statement {
    sid       = "LoginNoEcr"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # esta ação não aceita ARN específico
  }

  statement {
    sid = "PuxarSomenteEsteRepositorio"

    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]

    resources = [aws_ecr_repository.api.arn]
  }
}

resource "aws_iam_policy" "app" {
  name   = "\${local.name}-app"
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_role_policy_attachment" "app" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app.arn
}

# ---- 3. EC2 só enxerga a role pelo instance profile ----
resource "aws_iam_instance_profile" "app" {
  name = "\${local.name}-app"
  role = aws_iam_role.app.name
}`, { file: 'iam.tf' })}

${info('Por que policy_document e não jsonencode', '<ul><li>Valida a estrutura no <code>plan</code> — erro de digitação aparece antes do apply.</li><li>Compõe documentos com <code>source_policy_documents</code> e <code>override_policy_documents</code>.</li><li>Suporta <code>condition</code> com sintaxe legível.</li><li>Sai formatado e ordenado, então o diff no PR fica limpo.</li></ul>')}

<h2>Menor privilégio na prática</h2>
${table(['Nível', 'Como fica', 'Quando aceitar'],
          [['❌ Terrível', '<code>Action: "*"</code>, <code>Resource: "*"</code>', 'nunca'],
          ['⚠️ Ruim', '<code>Action: "s3:*"</code>, <code>Resource: "*"</code>', 'nunca em produção'],
          ['🙂 Aceitável', '<code>s3:GetObject</code> no ARN do bucket', 'padrão do dia a dia'],
          ['✅ Bom', 'ações mínimas + ARN específico + <code>condition</code>', 'dados sensíveis']])}
${code(`statement {
  actions   = ["s3:GetObject"]
  resources = ["\${aws_s3_bucket.dados.arn}/relatorios/*"]

  condition {
    test     = "StringEquals"
    variable = "s3:ExistingObjectTag/Confidencial"
    values   = ["false"]
  }
}`, { file: 'com condition' })}

${tip('Como descobrir as permissões que faltam', '<ol><li>Comece restritivo e deixe quebrar.</li><li>O erro do CloudTrail diz exatamente qual ação foi negada: <code>User: arn:… is not authorized to perform: ecr:BatchGetImage</code>.</li><li>Adicione só aquela ação.</li><li>Ao final, rode o <b>IAM Access Analyzer</b>: ele gera uma policy baseada no que foi <i>realmente</i> usado nos últimos 90 dias.</li></ol>')}

<h2>Políticas gerenciadas pela AWS: quando usar</h2>
${code(`# Aceitáveis e comuns:
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecs_exec" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}`, { file: 'gerenciadas' })}
${warn('Evite as amplas', 'Políticas como <code>AmazonS3FullAccess</code> ou <code>PowerUserAccess</code> resolvem hoje e viram achado de auditoria amanhã. As <code>service-role/*</code> específicas costumam ser bem calibradas; as <code>*FullAccess</code>, não.')}

<h2>A armadilha do aws_iam_role_policy_attachments_exclusive</h2>
${code(`# aws_iam_role_policy_attachment: ADICIONA uma política (seguro)
# aws_iam_role_policies_exclusive: define a lista EXATA (remove o resto)`, { lang: 'text' })}
<p>O mesmo padrão de "adiciona" versus "substitui a lista inteira" aparece em vários lugares da AWS e do GCP. Na dúvida, prefira sempre o que <b>adiciona</b>.</p>

<h2>Permission boundary: o limite acima do limite</h2>
${code(`resource "aws_iam_role" "dev" {
  name                 = "dev-role"
  assume_role_policy   = data.aws_iam_policy_document.assume.json

  # Mesmo que alguém anexe AdministratorAccess nesta role,
  # ela nunca ultrapassa o que o boundary permite.
  permissions_boundary = aws_iam_policy.boundary.arn
}`, { file: 'boundary' })}
<p>Útil quando você quer delegar criação de roles para times sem abrir a porteira: o boundary define o teto absoluto.</p>
`},

      {
        id: 'rede', title: 'VPC, subnets e Security Groups',
        body: () => `
<span class="eyebrow aws">AWS · 04</span>
<h1>Rede</h1>
<p class="lede">O wizard "VPC and more" do console cria uns 20 recursos em 30 segundos e você nunca vê quais. Aqui estão eles — e por que cada um existe.</p>

<h2>O que o wizard realmente cria</h2>
${table(['Recurso', 'Para quê', 'Quantos'],
          [['<code>aws_vpc</code>', 'o espaço de endereçamento', '1'],
          ['<code>aws_subnet</code> públicas', 'onde vive o ALB e o NAT', '1 por AZ'],
          ['<code>aws_subnet</code> privadas', 'onde vive a aplicação e o banco', '1 por AZ'],
          ['<code>aws_internet_gateway</code>', 'saída/entrada da internet', '1'],
          ['<code>aws_eip</code> + <code>aws_nat_gateway</code>', 'saída da subnet privada', '1 ou 1 por AZ 💸'],
          ['<code>aws_route_table</code> + associações', 'quem vai para onde', '1 pública + 1 por AZ privada']])}

${code(`locals {
  az_count = 2
  azs      = slice(data.aws_availability_zones.available.names, 0, local.az_count)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

# cidrsubnet("10.0.0.0/16", 8, 0) => 10.0.0.0/24
# cidrsubnet("10.0.0.0/16", 8, 1) => 10.0.1.0/24
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Tier = "public" }
}

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 100)
  availability_zone = local.azs[count.index]

  tags = { Tier = "private" }
}`, { file: 'vpc.tf' })}

${danger('CIDR é praticamente imutável', 'Mudar o <code>cidr_block</code> da VPC recria a VPC e <b>tudo dentro dela</b>. Escolha com folga: <code>/16</code> dá 65 mil endereços. E deixe blocos livres — um dia você vai querer a terceira AZ, ou um peering, ou o EKS pedindo range de pods.')}

<h2>O NAT Gateway e a conta no fim do mês</h2>
${table(['Estratégia', 'Custo/mês', 'Quando'],
          [['Nenhum NAT', 'US$ 0', 'dev, ou tudo em subnet pública'],
          ['1 NAT total', '~US$ 32 + tráfego', 'dev/staging; ponto único de falha'],
          ['1 NAT por AZ', '~US$ 32 × AZs', 'produção de verdade'],
          ['NAT + VPC endpoints', '~US$ 32 + 7/endpoint', 'reduz muito o tráfego cobrado']])}
${tip('A conta que surpreende', 'O NAT cobra por hora <b>e por GB processado</b>. Uma aplicação puxando imagens grandes do ECR o dia inteiro pode gastar mais em tráfego de NAT do que nas próprias instâncias. Os VPC endpoints de <code>ecr.api</code>, <code>ecr.dkr</code> e o gateway de <code>s3</code> resolvem isso.')}

<h2>Security Groups: a regra de ouro</h2>
${code(`# SG do ALB: aceita o mundo
resource "aws_security_group" "alb" {
  name   = "\${local.name}-alb"
  vpc_id = aws_vpc.main.id

  ingress {
    description = "HTTPS da internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# SG da app: aceita SÓ o SG do ALB — nunca um CIDR
resource "aws_security_group" "app" {
  name   = "\${local.name}-app"
  vpc_id = aws_vpc.main.id

  ingress {
    description     = "Tráfego vindo apenas do Load Balancer"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]   # <<<
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# SG do banco: aceita SÓ o SG da app
resource "aws_security_group" "db" {
  name   = "\${local.name}-db"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}`, { file: 'security-groups.tf' })}

${info('Por que SG referencia SG', 'IPs mudam. Instâncias entram e saem do ASG o tempo todo. Referenciando o <b>security group</b>, a regra continua correta para sempre — inclusive para as instâncias que ainda não existem.')}

${warn('Regras inline substituem tudo', 'Blocos <code>ingress</code> dentro do <code>aws_security_group</code> definem o conjunto <b>completo</b>. Se alguém adicionar uma regra pelo console, o próximo <code>apply</code> remove. Isso é bom (o código manda) mas surpreende. Para regras gerenciadas separadamente use <code>aws_vpc_security_group_ingress_rule</code> — um recurso por regra.')}

${code(`# Uma regra = um recurso. Permite gerenciar regras de fontes diferentes.
resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8080
  to_port                      = 8080
  ip_protocol                  = "tcp"
  description                  = "ALB -> app"
}`, { file: 'regra separada' })}

<h2>Acesso administrativo sem porta 22</h2>
${code(`# Anexe isto na role da instância e pronto:
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}`, { file: 'ssm.tf' })}
${code(`aws ssm start-session --target i-0a1b2c3d4e5f6

# Túnel para o banco, sem bastion e sem VPN
aws ssm start-session --target i-0a1b2c3d \\
  --document-name AWS-StartPortForwardingSessionToRemoteHost \\
  --parameters '{"host":["db.interno"],"portNumber":["5432"],"localPortNumber":["5432"]}'`, { lang: 'bash' })}
${tip('Delete o bastion', 'Session Manager dá shell, port forwarding e log de auditoria de tudo que foi digitado — sem nenhuma porta aberta, sem chave SSH para gerenciar e sem instância de bastion para pagar.')}
`}
    ]
  });
})(window.IAC);

/* ---- AWS (2): ALB, ASG, ECS, dados, observabilidade, receita ---- */
(function (IAC) {
  'use strict';
  const code = IAC.code, tip = IAC.tip, warn = IAC.warn, danger = IAC.danger,
    info = IAC.info, table = IAC.table, cs = IAC.consoleSteps;
  const sec = IAC.sections.filter(s => s.id === 'aws')[0];
  function add(pages) { pages.forEach(p => { p.section = sec; sec.pages.push(p); IAC.pageIndex['aws/' + p.id] = p; }); }

  add([
    {
      id: 'alb', title: 'ALB, Target Group e Listener',
      body: () => `
<span class="eyebrow aws">AWS · 05</span>
<h1>Load Balancer, Target Group e Listener</h1>
<p class="lede">No console isso são três telas separadas que você preenche em ordem. Em Terraform são três recursos ligados por referência — e a ordem passa a ser problema do Terraform, não seu.</p>

<h2>Quem faz o quê</h2>
${table(['Recurso', 'Responsabilidade', 'A pergunta que ele responde'],
        [['<code>aws_lb</code>', 'a caixa, o DNS, as subnets, o SG', '<i>onde</i> o tráfego chega'],
        ['<code>aws_lb_listener</code>', 'porta, protocolo, certificado, ação padrão', '<i>o que fazer</i> com quem chegou'],
        ['<code>aws_lb_target_group</code>', 'destinos e health check', '<i>quem</i> está apto a receber'],
        ['<code>aws_lb_listener_rule</code>', 'roteamento por path/host', '<i>qual</i> target group para cada rota']])}

<h2>1. Target Group — comece por ele</h2>
${cs(['EC2 → Target Groups → Create target group',
        'Target type: <b>Instances</b> (EC2/ASG) ou <b>IP addresses</b> (Fargate)',
        'Protocol/Port + VPC',
        'Health checks → Path <code>/health</code> → Advanced: intervalo, thresholds, matcher',
        'Create — sem registrar nada ainda'])}
${code(`resource "aws_lb_target_group" "api" {
  name        = "\${local.name}-api"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"   # "ip" para Fargate, "lambda" para função

  # Quanto esperar drenando conexões antes de tirar o alvo.
  # O padrão é 300s e faz cada deploy demorar 5 minutos a mais.
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  lifecycle {
    create_before_destroy = true
  }
}`, { file: 'target-group.tf' })}

${danger('target_type é a pegadinha nº 1', '<ul><li><b>instance</b> → registra o ID da EC2. Use com ASG.</li><li><b>ip</b> → registra o IP. <b>Obrigatório</b> com ECS Fargate (network mode <code>awsvpc</code>).</li><li><b>lambda</b> → invoca a função.</li></ul><p>Trocar o tipo <b>força recriação</b> do target group. Com o listener apontando para ele, você toma <code>ResourceInUse</code> — daí o <code>create_before_destroy</code>.</p>')}

<h3>Health check: os números que importam</h3>
${table(['Campo', 'Padrão', 'Sugestão', 'Efeito'],
        [['<code>interval</code>', '30s', '10–15s', 'com que frequência checa'],
        ['<code>timeout</code>', '5s', '5s', 'quanto espera resposta'],
        ['<code>healthy_threshold</code>', '5', '2', 'checks OK para voltar à rotação'],
        ['<code>unhealthy_threshold</code>', '2', '3', 'checks ruins para sair'],
        ['<code>matcher</code>', '200', '200-399', 'quais códigos contam como sucesso']])}
${tip('Tempo até entrar em rotação', 'É <code>interval × healthy_threshold</code>. Com o padrão (30 × 5) uma instância nova leva <b>2min30</b> para receber tráfego. Com 15 × 2, leva 30 segundos. Em um deploy rolling isso é a diferença entre 10 e 2 minutos.')}

<h2>2. O Load Balancer</h2>
${code(`resource "aws_lb" "public" {
  name               = "\${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]

  # Mínimo DUAS subnets em AZs diferentes. Uma só = erro no apply.
  subnets = aws_subnet.public[*].id

  enable_deletion_protection = true
  idle_timeout               = 60
  drop_invalid_header_fields = true
  enable_http2               = true

  access_logs {
    bucket  = aws_s3_bucket.logs.id
    prefix  = "alb"
    enabled = true
  }
}`, { file: 'alb.tf' })}
${warn('deletion_protection e o destroy', 'Com <code>enable_deletion_protection = true</code>, o <code>terraform destroy</code> <b>falha</b> — o que é o objetivo em produção. Em ambientes efêmeros, controle por variável: <code>enable_deletion_protection = var.ambiente == "prod"</code>.')}

<h2>3. O Listener — sem ele o ALB não atende nada</h2>
${code(`resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.public.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# Quem chega no 80 é mandado para o 443. Nada trafega em claro.
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}`, { file: 'listener.tf' })}

<h2>4. Um ALB, vários serviços</h2>
${code(`resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener_rule" "admin" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  condition {
    host_header {
      values = ["admin.exemplo.com.br"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin.arn
  }
}`, { file: 'roteamento.tf' })}
${tip('Numere de 10 em 10', 'Prioridades 10, 20, 30 deixam espaço para inserir uma regra no meio sem renumerar tudo. Prioridade é obrigatória e única por listener.')}

<h3>Bônus: autenticação no próprio ALB</h3>
${code(`action {
  type = "authenticate-oidc"

  authenticate_oidc {
    issuer                 = "https://accounts.google.com"
    authorization_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    token_endpoint         = "https://oauth2.googleapis.com/token"
    user_info_endpoint     = "https://openidconnect.googleapis.com/v1/userinfo"
    client_id              = var.oidc_client_id
    client_secret          = var.oidc_client_secret
  }
}`, { file: 'painel interno' })}

<h2>5. Certificado ACM com validação automática</h2>
${code(`data "aws_route53_zone" "main" {
  name = "exemplo.com.br"
}

resource "aws_acm_certificate" "main" {
  domain_name               = "app.exemplo.com.br"
  subject_alternative_names = ["*.exemplo.com.br"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# O Terraform cria sozinho os CNAMEs de validação
resource "aws_route53_record" "cert" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Este recurso não cria nada: ele ESPERA a validação terminar
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert : r.fqdn]
}`, { file: 'acm.tf' })}
${warn('CloudFront exige us-east-1', 'Certificado usado por CloudFront <b>tem</b> que estar em <code>us-east-1</code>, independentemente de onde o resto mora. Use um provider com alias só para isso.')}
`},

    {
      id: 'asg', title: 'Launch Template, ASG e o vínculo com o TG',
      body: () => `
<span class="eyebrow aws">AWS · 06</span>
<h1>Auto Scaling e o famoso "vincular ao Target Group"</h1>
<p class="lede">Você descreveu: "crio autoscaling, vinculo ao TG". No console é um passo do wizard. Em Terraform é <b>uma linha</b> — e é a linha que mais gente esquece.</p>

<h2>A linha</h2>
${code(`resource "aws_autoscaling_group" "app" {
  # ...

  # >>> ESTE É O "VINCULAR AO TARGET GROUP" DO CONSOLE <<<
  target_group_arns = [aws_lb_target_group.api.arn]
}`, { file: 'o ponto principal' })}
${danger('Sem essa linha', 'As instâncias sobem, ficam saudáveis, aparecem no console, e <b>não recebem nenhuma requisição</b>. O ALB responde 503 e você fica olhando para instâncias verdes sem entender. É o sintoma mais comum de ASG mal configurado.')}

<h2>Launch Template: a receita</h2>
${cs(['EC2 → Launch Templates → Create launch template',
        'AMI, Instance type, Network settings (SG), Storage',
        'Advanced details → IAM instance profile',
        'Advanced details → Metadata version: <b>V2 only</b>',
        'Advanced details → User data'])}
${code(`# AMI sempre atual, sem hardcode de ami-0abc...
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
}

resource "aws_launch_template" "app" {
  name_prefix   = "\${local.name}-"
  image_id      = data.aws_ssm_parameter.al2023.value
  instance_type = "t3.small"

  iam_instance_profile {
    arn = aws_iam_instance_profile.app.arn
  }

  vpc_security_group_ids = [aws_security_group.app.id]

  # IMDSv2 obrigatório. Sem isto, um SSRF na sua app rouba
  # as credenciais da role da instância.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("\${path.module}/user_data.sh.tftpl", {
    region    = var.region
    ecr_url   = aws_ecr_repository.api.repository_url
    secret_id = aws_secretsmanager_secret.app.name
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = merge(local.tags, { Name = local.name })
  }

  lifecycle {
    create_before_destroy = true
  }
}`, { file: 'launch-template.tf' })}

${warn('Mudar o template não troca as instâncias', 'O launch template é só a receita. As instâncias que já estão rodando continuam com a receita antiga até serem substituídas. Quem substitui é o <code>instance_refresh</code> do ASG — ou você, terminando instâncias na mão.')}

<h2>O Auto Scaling Group</h2>
${cs(['EC2 → Auto Scaling Groups → Create',
        'Escolher o Launch template',
        'Network: VPC + subnets <b>privadas</b>',
        '<b>Load balancing → Attach to an existing load balancer → escolher o Target Group</b>',
        'Health checks → marcar "Turn on Elastic Load Balancing health checks"',
        'Group size: desired / min / max'])}
${code(`resource "aws_autoscaling_group" "app" {
  name                = "\${local.name}-asg"
  vpc_zone_identifier = aws_subnet.private[*].id

  min_size         = 2
  max_size         = 10
  desired_capacity = 2

  # "ELB" faz o ASG confiar no health check do Target Group.
  # Com "EC2", uma app travada nunca é substituída — a VM está viva.
  health_check_type         = "ELB"
  health_check_grace_period = 120

  target_group_arns = [aws_lb_target_group.api.arn]

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  # Deploy rolling nativo: mudou o template, ele troca as instâncias
  instance_refresh {
    strategy = "Rolling"

    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 120
    }

    triggers = ["launch_template"]
  }

  # default_tags NÃO chega nas instâncias do ASG.
  dynamic "tag" {
    for_each = local.tags

    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  # Não desfaz um scale-out que já aconteceu
  lifecycle {
    ignore_changes = [desired_capacity]
  }
}`, { file: 'asg.tf' })}

${table(['Configuração', 'O que acontece se você errar'],
        [['<code>target_group_arns</code> ausente', 'instâncias sobem e não recebem tráfego (503 no ALB)'],
        ['<code>health_check_type = "EC2"</code>', 'app travada nunca é substituída'],
        ['<code>health_check_grace_period</code> curto', 'ASG mata a instância antes de ela terminar de subir → loop infinito'],
        ['sem <code>instance_refresh</code>', 'mudou o template e nada acontece'],
        ['sem <code>ignore_changes</code> em desired', 'o apply desfaz o scale-out do pico'],
        ['tags sem <code>propagate_at_launch</code>', 'instâncias sem tag; FinOps não consegue atribuir custo']])}

${danger('Não misture as duas formas de vincular', 'Existe também <code>aws_autoscaling_attachment</code>. Usar <b>os dois ao mesmo tempo</b> (o argumento no ASG e o recurso separado) faz cada apply desfazer o outro — o plan nunca fica limpo. Escolha um. O argumento <code>target_group_arns</code> é o mais simples; o recurso separado só quando o TG é gerenciado por outro state.')}

<h2>Escala automática</h2>
${code(`# Target tracking: você diz o alvo, a AWS calcula o resto
resource "aws_autoscaling_policy" "cpu" {
  name                   = "\${local.name}-tt-cpu"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }

    target_value = 60
  }
}

# Melhor para aplicação web: requisições por instância
resource "aws_autoscaling_policy" "req" {
  name                   = "\${local.name}-tt-req"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "\${aws_lb.public.arn_suffix}/\${aws_lb_target_group.api.arn_suffix}"
    }

    target_value = 1000
  }
}`, { file: 'scaling.tf' })}

${tip('Escala agendada para economizar', code(`resource "aws_autoscaling_schedule" "noite" {
  scheduled_action_name  = "desligar-noite"
  autoscaling_group_name = aws_autoscaling_group.app.name
  min_size               = 0
  max_size               = 0
  desired_capacity       = 0
  recurrence             = "0 22 * * MON-FRI"   # UTC
}`) + '<p>Em dev/staging isso corta a conta de EC2 em ~65%.</p>')}

<h2>Spot: metade do preço</h2>
${code(`resource "aws_autoscaling_group" "app" {
  mixed_instances_policy {
    instances_distribution {
      on_demand_base_capacity                  = 1      # 1 sempre garantida
      on_demand_percentage_above_base_capacity = 25     # o resto: 75% spot
      spot_allocation_strategy                 = "price-capacity-optimized"
    }

    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.app.id
      }

      # Quanto mais tipos, menor a chance de interrupção
      override { instance_type = "t3.small" }
      override { instance_type = "t3a.small" }
      override { instance_type = "t2.small" }
    }
  }
}`, { file: 'spot.tf' })}
${warn('Spot exige aplicação preparada', 'A AWS avisa com 2 minutos e retoma a instância. A aplicação precisa ser stateless, drenar conexões e tolerar perder um nó a qualquer momento. Se ela aguenta, é a economia mais fácil da nuvem.')}
`},

    {
      id: 'ecs', title: 'ECS Fargate: a alternativa sem EC2',
      body: () => `
<span class="eyebrow aws">AWS · 07</span>
<h1>ECS Fargate</h1>
<p class="lede">Mesmo desenho de ALB + Target Group, mas sem gerenciar nenhuma máquina. Se sua aplicação já está em contêiner, quase sempre é o caminho mais simples.</p>

<h2>O que muda em relação ao ASG</h2>
${table(['', 'EC2 + ASG', 'ECS Fargate'],
        [['Unidade', 'instância', 'task (contêiner)'],
        ['Target group', '<code>target_type = "instance"</code>', '<code>target_type = "ip"</code>'],
        ['Registro no TG', '<code>target_group_arns</code> no ASG', 'bloco <code>load_balancer</code> no service'],
        ['Autoscaling', '<code>aws_autoscaling_policy</code>', '<code>aws_appautoscaling_*</code>'],
        ['Patch do SO', 'seu', 'da AWS'],
        ['Custo', 'instância ligada 24/7', 'por vCPU/GB da task'],
        ['Deploy', '<code>instance_refresh</code>', 'rolling nativo + circuit breaker']])}

<h2>As duas roles que confundem todo mundo</h2>
${table(['Role', 'Quem usa', 'Para quê'],
        [['<b>execution_role</b>', 'o agente do ECS', 'puxar a imagem do ECR, ler o secret, escrever no log group'],
        ['<b>task_role</b>', 'sua aplicação', 'chamar S3, DynamoDB, SQS… o que o seu código faz']])}
${danger('O erro clássico', 'Colocar a permissão de ler o secret na <b>task_role</b>. O ECS precisa dessa permissão na <b>execution_role</b>, porque é ele quem lê o secret <i>antes</i> do contêiner subir, para injetar como variável de ambiente. O sintoma é a task morrer no start com <code>ResourceInitializationError</code>.')}

${code(`resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.app.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "\${aws_ecr_repository.api.repository_url}:\${var.image_tag}"
      essential = true

      portMappings = [
        { containerPort = 8080, protocol = "tcp" },
      ]

      # Injeta APENAS o campo DB_PASSWORD do JSON do secret.
      # Sem o sufixo :CHAVE:: viria o JSON inteiro.
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "\${aws_secretsmanager_secret.app.arn}:DB_PASSWORD::"
        },
      ]

      environment = [
        { name = "APP_ENV", value = var.ambiente },
      ]

      logConfiguration = {
        logDriver = "awslogs"

        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "app"
        }
      }

      healthCheck = {
        command  = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval = 30
        timeout  = 5
        retries  = 3
      }
    },
  ])
}`, { file: 'task-definition.tf' })}

<h2>O service — aqui está o "vincular ao TG"</h2>
${code(`resource "aws_ecs_service" "app" {
  name            = local.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  # >>> o "vincular ao Target Group", versão ECS <<<
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "app"
    container_port   = 8080
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  # Deploy quebrado volta sozinho
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # "docker exec" via SSM, sem bastion
  enable_execute_command = true

  # Sem o listener existindo, o service não consegue registrar no TG
  depends_on = [aws_lb_listener.https]

  lifecycle {
    ignore_changes = [desired_count]
  }
}`, { file: 'service.tf' })}

${code(`# Autoscaling do ECS NÃO é aws_autoscaling_policy
resource "aws_appautoscaling_target" "ecs" {
  service_namespace  = "ecs"
  resource_id        = "service/\${aws_ecs_cluster.main.name}/\${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 2
  max_capacity       = 20
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "\${local.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}`, { file: 'autoscaling.tf' })}

${tip('Deploy sem tocar no Terraform', 'A pipeline não precisa rodar <code>terraform apply</code> para trocar a versão da imagem. Ela pode registrar uma nova revisão da task e atualizar o service com o CLI da AWS. O Terraform cuida da <b>forma</b> da infraestrutura; a pipeline cuida da <b>versão</b> da aplicação.' + code('aws ecs update-service --cluster app --service app --force-new-deployment', { lang: 'bash' }))}
`},

    {
      id: 'dados', title: 'RDS, S3 e DynamoDB',
      body: () => `
<span class="eyebrow aws">AWS · 08</span>
<h1>Camada de dados</h1>
<p class="lede">A parte da infraestrutura onde um erro não é reversível. Aqui as travas do <code>lifecycle</code> deixam de ser boa prática e viram obrigação.</p>

<h2>RDS</h2>
${code(`resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = "db.t4g.micro"

  allocated_storage     = 20
  max_allocated_storage = 100      # autoscaling de disco
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.main.arn

  db_name  = "app"
  username = "postgres"

  # A AWS gera, guarda no Secrets Manager e rotaciona.
  # A senha nunca passa pelo Terraform nem pelo state.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = true

  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "\${local.name}-final"

  lifecycle {
    prevent_destroy = true
  }
}`, { file: 'rds.tf' })}

${table(['Campo', 'Por que importa'],
        [['<code>publicly_accessible = false</code>', 'banco na internet é incidente esperando acontecer'],
        ['<code>manage_master_user_password</code>', 'a única forma de a senha nunca tocar o state'],
        ['<code>skip_final_snapshot = false</code>', 'sua última rede de segurança em um destroy'],
        ['<code>prevent_destroy</code>', 'o Terraform se recusa; independe da AWS'],
        ['<code>deletion_protection</code>', 'a AWS se recusa; independe do Terraform'],
        ['<code>max_allocated_storage</code>', 'disco cheio às 3h da manhã deixa de ser problema'],
        ['<code>apply_immediately</code>', '<b>não</b> ligue em prod: aplica na hora, com downtime']])}

${danger('Mudanças que causam downtime', 'Alterar <code>instance_class</code>, <code>engine_version</code> ou <code>allocated_storage</code> reinicia a instância. Com <code>apply_immediately = false</code> (o padrão) isso acontece na janela de manutenção — leia o plan e planeje. Já <code>identifier</code> e <code>db_name</code> <b>forçam recriação</b>: você perde o banco.')}

<h2>S3 no provider 5.x: um recurso virou seis</h2>
${code(`resource "aws_s3_bucket" "assets" {
  bucket = "\${var.projeto}-assets-\${var.ambiente}"
}

# 1. bloqueio de acesso público — sempre
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. versionamento
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 3. criptografia
resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }

    bucket_key_enabled = true   # reduz MUITO o custo de chamadas ao KMS
  }
}

# 4. ciclo de vida
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "limpeza"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}`, { file: 's3.tf' })}
${warn('Migrando de provider 3.x', 'Se o seu código antigo tem <code>versioning {}</code> e <code>server_side_encryption_configuration {}</code> <i>dentro</i> do <code>aws_s3_bucket</code>, ele para de funcionar no provider 4+. A migração exige <code>terraform import</code> de cada sub-recurso. Faça um por vez.')}

<h2>DynamoDB</h2>
${code(`resource "aws_dynamodb_table" "sessoes" {
  name         = "\${local.name}-sessoes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  # Só declare os atributos que são chave ou índice.
  # Não é um schema completo da tabela.
  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}`, { file: 'dynamodb.tf' })}
${tip('PAY_PER_REQUEST como padrão', 'Evita capacity planning e throttling inesperado. Migre para <code>PROVISIONED</code> só quando a carga for previsível <b>e</b> a economia justificar — normalmente acima de alguns milhões de requisições por mês.')}
`},

    {
      id: 'obs', title: 'Observabilidade e alarmes',
      body: () => `
<span class="eyebrow aws">AWS · 09</span>
<h1>Observabilidade</h1>
<p class="lede">A parte que todo mundo deixa para depois e que define se um incidente dura 5 minutos ou 3 horas.</p>

<h2>Log group com retenção (o custo escondido)</h2>
${code(`resource "aws_cloudwatch_log_group" "app" {
  name              = "/\${var.projeto}/\${var.ambiente}/app"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn
}`, { file: 'logs.tf' })}
${danger('O padrão é "Never expire"', 'Todo log group criado sem <code>retention_in_days</code> guarda para sempre e cobra armazenamento para sempre. É o item que mais aparece em auditoria de custo do CloudWatch. Defina retenção em <b>todos</b>.')}
${warn('O conflito de log group', 'ECS e Lambda criam o log group sozinhos se ele não existir — e aí o seu apply falha com <code>ResourceAlreadyExistsException</code>. Crie você primeiro, ou importe o existente.')}

<h2>Alarmes que valem a pena</h2>
${code(`resource "aws_sns_topic" "alerts" {
  name = "\${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "sre@exemplo.com.br"
  # A inscrição fica "pending" até alguém CLICAR no e-mail de confirmação.
}

# 1. Targets fora de rotação — o alarme mais útil de todos
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "\${local.name}-targets-unhealthy"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.api.arn_suffix
    LoadBalancer = aws_lb.public.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# 2. Latência p99
resource "aws_cloudwatch_metric_alarm" "latencia" {
  alarm_name          = "\${local.name}-latencia-p99"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p99"
  period              = 300
  evaluation_periods  = 2
  threshold           = 2
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    LoadBalancer = aws_lb.public.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# 3. Erros 5xx da aplicação
resource "aws_cloudwatch_metric_alarm" "erros" {
  alarm_name          = "\${local.name}-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.public.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}`, { file: 'alarms.tf' })}

${warn('treat_missing_data engana', 'Se a métrica <b>some</b> (porque não há tráfego, ou porque o serviço morreu), o comportamento depende deste campo. <code>"missing"</code> (padrão) deixa o alarme em INSUFFICIENT_DATA e ele nunca dispara. Para métricas de erro use <code>"notBreaching"</code>; para métricas de saúde considere <code>"breaching"</code>.')}

<h2>Alarme de custo — o que ninguém cria e todo mundo devia</h2>
${code(`resource "aws_cloudwatch_metric_alarm" "custo" {
  provider = aws.us_east_1   # a métrica de billing só existe em us-east-1

  alarm_name          = "custo-mensal-acima-do-esperado"
  namespace           = "AWS/Billing"
  metric_name         = "EstimatedCharges"
  statistic           = "Maximum"
  period              = 21600
  evaluation_periods  = 1
  threshold           = 500
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    Currency = "USD"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}`, { file: 'billing.tf' })}

<h2>Log Insights: consultas salvas</h2>
${code(`resource "aws_cloudwatch_query_definition" "erros" {
  name = "\${local.name}/erros-recentes"

  log_group_names = [aws_cloudwatch_log_group.app.name]

  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /ERROR|Exception/
    | sort @timestamp desc
    | limit 100
  EOT
}`, { file: 'insights.tf' })}
${tip('Consulta salva é documentação', 'Guardar as consultas úteis no Terraform significa que, na próxima madrugada, quem estiver de plantão não precisa reinventar a query — ela está lá, no console, pronta.')}
`},

    {
      id: 'receita', title: 'Receita completa: o stack inteiro',
      body: () => `
<span class="eyebrow aws">AWS · 10</span>
<h1>Receita completa</h1>
<p class="lede">Todo o fluxo que você faz no console, em um projeto Terraform coeso. Use como ponto de partida — ou monte o seu no laboratório e exporte.</p>

${IAC.info('Atalho', 'Abra o <b>Laboratório AWS</b>, carregue o cenário <b>"App web clássica"</b> nos Roteiros, e o código sai pronto na aba Código — já com os seus nomes, portas e tamanhos.')}

<h2>Estrutura</h2>
${code(`ambientes/prod/
├── versions.tf     # required_version + required_providers
├── backend.tf      # state no S3 + lock no DynamoDB
├── providers.tf    # provider + default_tags
├── variables.tf
├── locals.tf
├── network.tf      # VPC, subnets, NAT, route tables
├── security.tf     # security groups, KMS
├── iam.tf          # role, policy, instance profile
├── registry.tf     # ECR + lifecycle policy
├── secrets.tf      # Secrets Manager
├── alb.tf          # ACM, ALB, target group, listeners
├── compute.tf      # launch template, ASG, scaling
├── data.tf         # RDS
├── observability.tf# log group, alarmes, SNS
├── dns.tf          # Route 53
├── outputs.tf
└── user_data.sh.tftpl`, { lang: 'text' })}

<h2>O esqueleto, sem os detalhes</h2>
${code(`# ---------- fundação ----------
terraform {
  required_version = "~> 1.9"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }

  backend "s3" {
    bucket         = "tfstate-minha-empresa"
    key            = "minha-app/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}

locals {
  name = "\${var.projeto}-\${var.ambiente}"

  tags = {
    Project     = var.projeto
    Environment = var.ambiente
    ManagedBy   = "terraform"
  }
}

# ---------- a cadeia ----------
# ECR         -> onde mora a imagem
# Secrets     -> onde moram as credenciais
# IAM role    -> permissão de ler os dois acima
# VPC         -> onde tudo vive
# SG do ALB   -> 443 do mundo
# SG da app   -> 8080 vindo do SG do ALB
# ACM         -> certificado validado por DNS
# Target group-> health check /health
# ALB         -> subnets públicas + SG do ALB
# Listener    -> 443 -> forward para o TG; 80 -> redirect
# Launch tpl  -> AMI + instance profile + user_data
# ASG         -> subnets privadas + target_group_arns  <<<
# Policy      -> target tracking em 60% de CPU
# Alarmes     -> unhealthy hosts + 5xx -> SNS
# Route 53    -> alias apontando para o ALB`, { lang: 'text', file: 'a lógica' })}

<h2>A ordem em que você deve escrever (e aplicar)</h2>
<ol>
<li><b>Bootstrap</b> — bucket de state e tabela de lock, uma vez por conta.</li>
<li><b>Fundação</b> — providers, locals, tags. Aplique: cria zero recursos, mas valida credencial.</li>
<li><b>Rede</b> — VPC, subnets, NAT. Aplique e confira no console.</li>
<li><b>Registry e segredos</b> — ECR e Secrets Manager. Suba uma imagem de teste.</li>
<li><b>IAM</b> — role e policy referenciando os ARNs acima.</li>
<li><b>Balanceamento</b> — ACM, target group, ALB, listener. Neste ponto o ALB responde 503: normal, não tem ninguém no TG.</li>
<li><b>Computação</b> — launch template e ASG com <code>target_group_arns</code>. O 503 vira 200.</li>
<li><b>Escala e alarmes</b> — policy de autoscaling, alarmes, SNS.</li>
<li><b>DNS</b> — o alias por último, quando tudo já responde.</li>
</ol>
${IAC.tip('Aplique em fatias', 'Não escreva 800 linhas e dê um <code>apply</code>. Escreva uma camada, aplique, confira, comite. Se algo quebrar, você sabe exatamente o que causou. É a diferença entre 20 minutos e uma tarde inteira.')}

<h2>Checklist antes do primeiro apply em produção</h2>
<ul>
<li><code>aws sts get-caller-identity</code> — é mesmo a conta certa?</li>
<li>Backend remoto configurado e com lock?</li>
<li>Última linha do plan: quantos <code>to destroy</code>?</li>
<li>Algum <code>forces replacement</code> no diff?</li>
<li><code>prevent_destroy</code> nos recursos com dado?</li>
<li>Nenhum segredo em texto claro no código?</li>
<li>Todo bucket com <code>public_access_block</code>?</li>
<li>Todo log group com retenção?</li>
<li>Tags padrão chegando nas instâncias do ASG?</li>
<li>Alarme de <code>UnHealthyHostCount</code> criado?</li>
</ul>
`}
  ]);
})(window.IAC);
