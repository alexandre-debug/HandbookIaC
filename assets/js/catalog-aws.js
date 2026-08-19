/* =========================================================
   catalog-aws.js — componentes AWS do laboratório
   Cada componente sabe: o que você clica no console, o HCL
   equivalente, as pegadinhas e o custo aproximado.
   ========================================================= */
(function (IAC) {
  'use strict';

  const CATS = [
    { id: 'base', name: 'Fundação', em: '🧱' },
    { id: 'net', name: 'Rede', em: '🌐' },
    { id: 'sec', name: 'Segurança & IAM', em: '🔐' },
    { id: 'reg', name: 'Registry & Segredos', em: '📦' },
    { id: 'lb', name: 'Balanceamento & Entrega', em: '⚖️' },
    { id: 'comp', name: 'Computação', em: '🖥️' },
    { id: 'cont', name: 'Contêineres (ECS)', em: '🐳' },
    { id: 'srv', name: 'Serverless', em: '⚡' },
    { id: 'data', name: 'Dados', em: '🗄️' },
    { id: 'ops', name: 'Observabilidade', em: '📈' }
  ];

  const R = [];
  const C = def => { R.push(def); return def; };

  /* =======================================================
     FUNDAÇÃO
     ======================================================= */
  C({
    id: 'core', cat: 'base', name: 'Fundação: provider + tags', em: '🧱',
    tf: 'terraform · provider · locals', required: true, multi: false, cost: 0,
    desc: 'O cabeçalho de todo projeto sério: versão do Terraform travada, versão do provider travada e tags padrão aplicadas automaticamente em tudo que for criado.',
    console: [
      'Não existe equivalente no console.',
      'É justamente o que o console <em>não</em> te dá: versão travada, padrão de nomes e tags automáticas.'
    ],
    gotchas: [
      'Sem <code>required_version</code>, um colega com Terraform mais novo grava um state que você não consegue mais ler.',
      '<code>default_tags</code> aplica tags em <b>todos</b> os recursos que suportam tag — pare de esquecer a tag de centro de custo.',
      'Trave o provider com <code>~> 5.60</code>: o pessimistic constraint aceita 5.61, mas nunca 6.0 (que quebra tudo).'
    ],
    inputs: [
      { k: 'project', l: 'Projeto', t: 'text', v: 'minha-app' },
      { k: 'region', l: 'Região', t: 'sel', v: 'us-east-1', opts: [['us-east-1', 'us-east-1 · N. Virginia'], ['sa-east-1', 'sa-east-1 · São Paulo'], ['us-west-2', 'us-west-2 · Oregon'], ['eu-west-1', 'eu-west-1 · Irlanda']] },
      { k: 'env', l: 'Ambiente', t: 'sel', v: 'prod', opts: [['dev', 'dev'], ['stg', 'stg'], ['prod', 'prod']] },
      { k: 'owner', l: 'Time dono', t: 'text', v: 'plataforma' }
    ],
    file: 'main.tf',
    hcl: (c) => `terraform {
  required_version = "~> 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region

  # Aplicado automaticamente em todo recurso que suporta tags.
  default_tags {
    tags = local.tags
  }
}

variable "project" {
  type        = string
  description = "Nome do projeto — vira prefixo de tudo"
  default     = "${c.project}"
}

variable "env" {
  type        = string
  description = "Ambiente: dev | stg | prod"
  default     = "${c.env}"

  validation {
    condition     = contains(["dev", "stg", "prod"], var.env)
    error_message = "env precisa ser dev, stg ou prod."
  }
}

variable "region" {
  type        = string
  description = "Região AWS"
  default     = "${c.region}"
}

locals {
  name = "\${var.project}-\${var.env}"

  tags = {
    Project     = var.project
    Environment = var.env
    Owner       = "${c.owner}"
    ManagedBy   = "terraform"
  }
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}`
  });

  C({
    id: 'backend', cat: 'base', name: 'Backend remoto (S3 + DynamoDB)', em: '🗃️',
    tf: 'terraform.backend "s3"', multi: false, cost: 1,
    desc: 'Onde o state mora. Sem isso, o "quem sabe o que existe na conta" é um arquivo no seu notebook — e dois deploys simultâneos corrompem tudo.',
    console: [
      'S3 → Create bucket → habilitar Versioning e Default encryption',
      'DynamoDB → Create table → chave de partição <code>LockID</code> (String)',
      'Esse par você cria <b>uma vez por conta</b>, geralmente com um projeto Terraform separado ("bootstrap") ou na mão mesmo.'
    ],
    gotchas: [
      'Ovo e galinha: o bucket do state não pode estar no state que ele guarda. Crie o bootstrap em um diretório separado.',
      'Versioning no bucket é o seu "ctrl+z" quando alguém corrompe o state.',
      'Desde o AWS provider 5.x você pode usar <code>use_lockfile = true</code> (lock via S3) em vez do DynamoDB. A tabela ainda é o caminho mais compatível.',
      '<b>O state guarda segredos em texto claro.</b> Bloqueie acesso público e criptografe sempre.'
    ],
    inputs: [
      { k: 'bucket', l: 'Bucket do state', t: 'text', v: 'tfstate-minha-empresa' },
      { k: 'table', l: 'Tabela de lock', t: 'text', v: 'terraform-locks' },
      { k: 'key', l: 'Chave (caminho)', t: 'text', v: 'minha-app/prod/terraform.tfstate' }
    ],
    file: 'backend.tf',
    hcl: (c) => `# ---------------------------------------------------------------
# Vai no bloco terraform {} do projeto. Configure com:
#   terraform init -backend-config="bucket=${c.bucket}"
# ---------------------------------------------------------------
terraform {
  backend "s3" {
    bucket         = "${c.bucket}"
    key            = "${c.key}"
    region         = "us-east-1"
    dynamodb_table = "${c.table}"
    encrypt        = true
  }
}`,
    extra: (c) => ({
      file: 'bootstrap/main.tf',
      note: 'Projeto separado — rode uma vez com state local e depois migre.',
      hcl: `# Diretório bootstrap/ — roda UMA vez, com state local.
resource "aws_s3_bucket" "state" {
  bucket = "${c.bucket}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "locks" {
  name         = "${c.table}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}`
    })
  });

  /* =======================================================
     REDE
     ======================================================= */
  C({
    id: 'vpc', cat: 'net', name: 'VPC + Subnets + NAT', em: '🌐',
    tf: 'aws_vpc · aws_subnet · aws_nat_gateway', multi: false, cost: 33,
    desc: 'A planta baixa da rede: subnets públicas (onde mora o Load Balancer) e privadas (onde mora a aplicação e o banco), com saída para a internet via NAT.',
    console: [
      'VPC → Create VPC → "VPC and more" (o wizard já cria subnets, IGW e route tables)',
      'Escolher nº de AZs, nº de subnets públicas/privadas',
      'NAT gateways: none / 1 per AZ / 1 total',
      'Clicar em Create — e depois nunca mais lembrar exatamente o que ele criou'
    ],
    gotchas: [
      'NAT Gateway custa ~US$ 32/mês <b>por AZ</b> + tráfego. Em dev, use <code>none</code> ou um único NAT.',
      'CIDR é praticamente imutável: mudar exige recriar a VPC inteira. Planeje com folga (/16).',
      '<code>map_public_ip_on_launch</code> só na subnet pública.',
      'Reserve espaço: 2 AZs hoje, mas deixe blocos livres para a terceira.'
    ],
    inputs: [
      { k: 'cidr', l: 'CIDR da VPC', t: 'text', v: '10.0.0.0/16' },
      { k: 'azs', l: 'Nº de AZs', t: 'num', v: 2, min: 1, max: 4 },
      { k: 'nat', l: 'NAT Gateway', t: 'sel', v: 'single', opts: [['none', 'nenhum (só subnets públicas)'], ['single', '1 NAT (mais barato)'], ['per-az', '1 por AZ (HA, mais caro)']] }
    ],
    file: 'vpc.tf',
    hcl: (c) => {
      const natCount = c.nat === 'none' ? null : (c.nat === 'per-az' ? 'local.az_count' : '1');
      let s = `locals {
  az_count = ${c.azs}
  azs      = slice(data.aws_availability_zones.available.names, 0, local.az_count)
}

resource "aws_vpc" "main" {
  cidr_block           = "${c.cidr}"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "\${local.name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "\${local.name}-igw"
  }
}

# count cria N subnets a partir de uma única declaração.
# cidrsubnet("10.0.0.0/16", 8, 0) => 10.0.0.0/24
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "\${local.name}-public-\${local.azs[count.index]}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 100)
  availability_zone = local.azs[count.index]

  tags = {
    Name = "\${local.name}-private-\${local.azs[count.index]}"
    Tier = "private"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "\${local.name}-rt-public"
  }
}

resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}`;
      if (natCount) {
        s += `

resource "aws_eip" "nat" {
  count = ${natCount}

  domain = "vpc"

  tags = {
    Name = "\${local.name}-eip-nat-\${count.index}"
  }
}

resource "aws_nat_gateway" "main" {
  count = ${natCount}

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "\${local.name}-nat-\${count.index}"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  count = local.az_count

  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[${c.nat === 'per-az' ? 'count.index' : '0'}].id
  }

  tags = {
    Name = "\${local.name}-rt-private-\${count.index}"
  }
}

resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}`;
      }
      return s;
    },
    outputs: () => `output "vpc_id" {
  description = "ID da VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Subnets privadas (aplicação e banco)"
  value       = aws_subnet.private[*].id
}`
  });

  C({
    id: 'endpoints', cat: 'net', name: 'VPC Endpoints (economia de NAT)', em: '🔌',
    tf: 'aws_vpc_endpoint', multi: false, cost: 15,
    desc: 'Tráfego para S3, ECR e Secrets Manager sai da VPC, passa pelo NAT e volta — pagando por GB. Endpoints mantêm tudo dentro da AWS.',
    console: ['VPC → Endpoints → Create endpoint → escolher o serviço → subnets → security group'],
    gotchas: [
      'O endpoint do S3 é do tipo <b>Gateway</b> (grátis!) e entra na route table. Os demais são <b>Interface</b> (~US$ 7/mês cada + GB).',
      'Para puxar imagem do ECR você precisa de <b>três</b>: <code>ecr.api</code>, <code>ecr.dkr</code> e o gateway de <code>s3</code> (as camadas ficam no S3).',
      'Sem <code>private_dns_enabled = true</code> o endpoint existe mas ninguém usa.'
    ],
    inputs: [{ k: 'svcs', l: 'Serviços', t: 'sel', v: 'ecr', opts: [['ecr', 'ECR + S3 (pull de imagem)'], ['full', 'ECR + S3 + Secrets + Logs + SSM']] }],
    file: 'endpoints.tf',
    hcl: (c) => `resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.\${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = {
    Name = "\${local.name}-vpce-s3"
  }
}

resource "aws_security_group" "vpce" {
  name        = "\${local.name}-vpce"
  description = "Acesso aos VPC endpoints de interface"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS de dentro da VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  tags = {
    Name = "\${local.name}-sg-vpce"
  }
}

locals {
  interface_endpoints = ${c.svcs === 'full'
        ? '["ecr.api", "ecr.dkr", "secretsmanager", "logs", "ssm", "ssmmessages", "ec2messages"]'
        : '["ecr.api", "ecr.dkr"]'}
}

resource "aws_vpc_endpoint" "interface" {
  for_each = toset(local.interface_endpoints)

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.\${var.region}.\${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = {
    Name = "\${local.name}-vpce-\${each.value}"
  }
}`
  });

  /* =======================================================
     SEGURANÇA & IAM
     ======================================================= */
  C({
    id: 'sg', cat: 'sec', name: 'Security Group', em: '🛡️',
    tf: 'aws_security_group', multi: true, cost: 0,
    desc: 'O firewall de cada camada. A regra de ouro: o SG da aplicação libera a porta apenas para o SG do Load Balancer — nunca para um CIDR.',
    console: [
      'EC2 → Security Groups → Create security group',
      'Inbound rules → Add rule → Type / Port / Source',
      'No campo Source, escolher "Custom" e digitar o ID de outro SG'
    ],
    gotchas: [
      'Referenciar <b>SG por SG</b> (não CIDR) é o que faz a rede continuar correta quando os IPs mudam.',
      'Porta 22 aberta para 0.0.0.0/0 é o clássico. Use SSM Session Manager: acesso sem porta aberta e com auditoria.',
      'Blocos <code>ingress</code> inline <b>substituem</b> o conjunto inteiro. Se alguém adicionar regra pelo console, o próximo apply remove.',
      'Para regras gerenciadas separadamente, use <code>aws_vpc_security_group_ingress_rule</code> (1 regra por recurso).'
    ],
    inputs: [
      { k: 'name', l: 'Nome', t: 'text', v: 'alb' },
      { k: 'preset', l: 'Perfil', t: 'sel', v: 'alb', opts: [['alb', 'ALB — 80/443 da internet'], ['app', 'Aplicação — porta X vinda do ALB'], ['db', 'Banco — 5432 vindo da app'], ['bastion', 'Bastion — 22 de um CIDR']] },
      { k: 'port', l: 'Porta da app', t: 'num', v: 8080 },
      { k: 'cidr', l: 'CIDR permitido (bastion)', t: 'text', v: '203.0.113.0/24' }
    ],
    file: c => 'sg-' + (c.name || 'x') + '.tf',
    hcl: (c, ctx) => {
      const n = c._n;
      const vpc = ctx.vpcId();
      const ing = {
        alb: `  ingress {
    description = "HTTP da internet (redireciona para HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS da internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }`,
        app: `  ingress {
    description     = "Trafego vindo apenas do Load Balancer"
    from_port       = ${c.port}
    to_port         = ${c.port}
    protocol        = "tcp"
    security_groups = [${ctx.sgRef('alb')}]
  }`,
        db: `  ingress {
    description     = "PostgreSQL vindo apenas da aplicacao"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [${ctx.sgRef('app')}]
  }`,
        bastion: `  ingress {
    description = "SSH restrito ao escritorio/VPN"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["${c.cidr}"]
  }`
      }[c.preset];
      return `resource "aws_security_group" "${n}" {
  name        = "\${local.name}-${n}"
  description = "SG ${c.preset} de \${local.name}"
  vpc_id      = ${vpc}

${ing}

  egress {
    description = "Saida liberada"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "\${local.name}-sg-${n}"
  }

  # Evita "SG em uso" ao trocar regras: cria o novo antes de apagar o velho.
  lifecycle {
    create_before_destroy = true
  }
}`;
    }
  });

  C({
    id: 'iam_role', cat: 'sec', name: 'IAM Role + Policy da aplicação', em: '🔑',
    tf: 'aws_iam_role · aws_iam_policy', multi: false, cost: 0,
    desc: 'Quem a máquina "é" quando fala com a AWS. Aqui nasce o menor privilégio: ler exatamente aquele secret, puxar exatamente aquele repositório ECR.',
    console: [
      'IAM → Roles → Create role → Trusted entity: AWS service → EC2 (ou ECS Task)',
      'Attach policies → procurar as políticas gerenciadas → Next → Create',
      'Depois voltar em EC2 → Instância → Actions → Security → Modify IAM role'
    ],
    gotchas: [
      'Existem <b>duas</b> políticas em toda role: a de <i>confiança</i> (quem pode assumir) e a de <i>permissão</i> (o que pode fazer).',
      '<code>aws_iam_policy_document</code> é melhor que <code>jsonencode</code>: valida sintaxe no plan e permite herança com <code>source_policy_documents</code>.',
      '<code>ecr:GetAuthorizationToken</code> <b>precisa</b> de <code>Resource = "*"</code> — é uma ação de conta, não de repositório.',
      'Para EC2, a role só chega na instância via <b>instance profile</b>. No ECS/Lambda você aponta a role direto.'
    ],
    inputs: [
      { k: 'name', l: 'Nome', t: 'text', v: 'app' },
      { k: 'svc', l: 'Serviço que assume', t: 'sel', v: 'ec2', opts: [['ec2', 'EC2 (instance profile)'], ['ecs', 'ECS Task'], ['lambda', 'Lambda']] },
      { k: 'ssm', l: 'Permitir SSM Session Manager', t: 'bool', v: true }
    ],
    file: 'iam.tf',
    hcl: (c, ctx) => {
      const svcPrincipal = { ec2: 'ec2.amazonaws.com', ecs: 'ecs-tasks.amazonaws.com', lambda: 'lambda.amazonaws.com' }[c.svc];
      const n = c._n;
      let stmts = '';
      if (ctx.has('secret')) stmts += `
  statement {
    sid    = "LerSecret"
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]

    resources = [aws_secretsmanager_secret.${ctx.nameOf('secret') || 'app'}.arn]
  }
`;
      if (ctx.has('ecr')) stmts += `
  statement {
    sid       = "LoginNoEcr"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # esta acao nao aceita ARN especifico
  }

  statement {
    sid    = "PuxarImagem"
    effect = "Allow"

    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]

    resources = [aws_ecr_repository.${ctx.nameOf('ecr') || 'app'}.arn]
  }
`;
      if (ctx.has('s3')) stmts += `
  statement {
    sid    = "AcessoAoBucket"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
    ]

    resources = ["\${aws_s3_bucket.${ctx.nameOf('s3') || 'app'}.arn}/*"]
  }
`;
      stmts += `
  statement {
    sid    = "EscreverLogs"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["arn:aws:logs:*:*:log-group:/\${var.project}/*"]
  }
`;
      return `# ---- Politica de CONFIANCA: quem pode vestir esta role ----
data "aws_iam_policy_document" "${n}_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["${svcPrincipal}"]
    }
  }
}

resource "aws_iam_role" "${n}" {
  name               = "\${local.name}-${n}"
  description        = "Role da aplicacao \${local.name}"
  assume_role_policy = data.aws_iam_policy_document.${n}_assume.json
}

# ---- Politica de PERMISSAO: o que a role pode fazer ----
data "aws_iam_policy_document" "${n}" {
${stmts}}

resource "aws_iam_policy" "${n}" {
  name        = "\${local.name}-${n}"
  description = "Permissoes minimas de \${local.name}"
  policy      = data.aws_iam_policy_document.${n}.json
}

resource "aws_iam_role_policy_attachment" "${n}" {
  role       = aws_iam_role.${n}.name
  policy_arn = aws_iam_policy.${n}.arn
}
${c.ssm ? `
# Acesso ao shell sem abrir a porta 22 para ninguem.
resource "aws_iam_role_policy_attachment" "${n}_ssm" {
  role       = aws_iam_role.${n}.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
` : ''}${c.svc === 'ec2' ? `
# EC2 so enxerga a role atraves do instance profile.
resource "aws_iam_instance_profile" "${n}" {
  name = "\${local.name}-${n}"
  role = aws_iam_role.${n}.name
}
` : ''}`;
    }
  });

  C({
    id: 'kms', cat: 'sec', name: 'Chave KMS gerenciada', em: '🗝️',
    tf: 'aws_kms_key · aws_kms_alias', multi: false, cost: 1,
    desc: 'Chave própria para criptografar secrets, buckets, volumes e logs. Diferente da chave padrão da AWS, você controla quem usa e mantém rotação automática.',
    console: ['KMS → Customer managed keys → Create key → Symmetric → definir key administrators e key users'],
    gotchas: [
      '<code>deletion_window_in_days</code> mínimo é 7. Chave apagada = dado perdido para sempre.',
      'Sempre crie um <b>alias</b>: ninguém decora UUID de chave.',
      'A policy da chave é uma segunda camada de autorização — permissão IAM sozinha não basta.'
    ],
    inputs: [{ k: 'rotate', l: 'Rotação automática anual', t: 'bool', v: true }],
    file: 'kms.tf',
    hcl: (c) => `resource "aws_kms_key" "main" {
  description             = "Chave de \${local.name}"
  enable_key_rotation     = ${c.rotate}
  deletion_window_in_days = 7

  tags = {
    Name = "\${local.name}-kms"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/\${local.name}"
  target_key_id = aws_kms_key.main.key_id
}`
  });

  IAC.awsCats = CATS;
  IAC.awsRes = R;
  IAC.awsC = C;
})(window.IAC);

/* =========================================================
   catalog-aws (2) — Registry, Segredos e Entrega
   ========================================================= */
(function (IAC) {
  'use strict';
  const C = IAC.awsC;

  C({
    id: 'ecr', cat: 'reg', name: 'ECR — repositório de imagem', em: '📦',
    tf: 'aws_ecr_repository', multi: true, cost: 1,
    desc: 'O registro privado onde suas imagens Docker moram. Com política de ciclo de vida você para de pagar por 400 imagens antigas que ninguém usa.',
    console: [
      'ECR → Repositories → Create repository',
      'Visibility: Private · Nome do repositório',
      'Tag immutability: marcar · Scan on push: marcar',
      'Depois: Lifecycle policy → Create rule → "expire images count more than 10"'
    ],
    gotchas: [
      '<code>force_delete = true</code> permite destruir o repositório com imagens dentro. Em prod, deixe <code>false</code>.',
      'Sem lifecycle policy o repositório cresce para sempre — é o custo silencioso mais comum.',
      '<code>IMMUTABLE</code> impede sobrescrever uma tag. Faça deploy pelo SHA do commit, não por <code>latest</code>.',
      'O <code>repository_url</code> é output do recurso — use-o no CI em vez de montar a URL na mão.'
    ],
    inputs: [
      { k: 'name', l: 'Nome do repositório', t: 'text', v: 'api' },
      { k: 'immutable', l: 'Tags imutáveis', t: 'bool', v: true },
      { k: 'scan', l: 'Scan on push', t: 'bool', v: true },
      { k: 'keep', l: 'Manter N imagens', t: 'num', v: 10, min: 1, max: 100 }
    ],
    file: 'ecr.tf',
    hcl: (c, ctx) => `resource "aws_ecr_repository" "${c._n}" {
  name                 = "\${var.project}/${c.name}"
  image_tag_mutability = "${c.immutable ? 'IMMUTABLE' : 'MUTABLE'}"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = ${c.scan}
  }
${ctx.has('kms') ? `
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
` : ''}
  tags = {
    Name = "\${var.project}-${c.name}"
  }
}

# Sem isto o repositorio cresce ate o fim dos tempos.
resource "aws_ecr_lifecycle_policy" "${c._n}" {
  repository = aws_ecr_repository.${c._n}.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Manter apenas as ${c.keep} imagens mais recentes"

        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = ${c.keep}
        }

        action = {
          type = "expire"
        }
      },
    ]
  })
}`,
    outputs: (c) => `output "ecr_${c._n}_url" {
  description = "URL para docker push/pull"
  value       = aws_ecr_repository.${c._n}.repository_url
}`,
    after: (c) => ({
      title: 'Publicando a primeira imagem',
      lang: 'bash',
      code: `# 1) pegue a URL do repositório direto do Terraform
REPO=$(terraform output -raw ecr_${c._n}_url)

# 2) login no registry (a senha é um token temporário)
aws ecr get-login-password --region us-east-1 \\
  | docker login --username AWS --password-stdin "\${REPO%%/*}"

# 3) build e push usando o SHA do commit como tag (nunca "latest")
TAG=$(git rev-parse --short HEAD)
docker build -t "$REPO:$TAG" .
docker push "$REPO:$TAG"`
    })
  });

  C({
    id: 'secret', cat: 'reg', name: 'Secrets Manager', em: '🔒',
    tf: 'aws_secretsmanager_secret', multi: true, cost: 0.4,
    desc: 'Onde as credenciais moram. O Terraform cria o "cofre" e as permissões; o valor entra por fora, para não vazar no Git nem no state.',
    console: [
      'Secrets Manager → Store a new secret',
      'Other type of secret → key/value',
      'Escolher chave de criptografia → Next → nome <code>prod/minha-app/env</code>',
      'Configurar rotação (ou não) → Store'
    ],
    gotchas: [
      '<b>Tudo que entra no Terraform entra no state em texto claro.</b> Nunca coloque a senha real no .tf.',
      'Padrão: crie o secret com um placeholder + <code>lifecycle { ignore_changes = [secret_string] }</code>, e injete o valor real via CLI/pipeline.',
      '<code>recovery_window_in_days = 0</code> apaga na hora; qualquer outro valor deixa o nome "reservado" e o próximo apply falha com "already scheduled for deletion".',
      'Para <b>ler</b> um secret existente, use <code>data "aws_secretsmanager_secret_version"</code> — mas lembre: também cai no state.'
    ],
    inputs: [
      { k: 'name', l: 'Nome lógico', t: 'text', v: 'app-env' },
      { k: 'path', l: 'Caminho', t: 'text', v: 'prod/minha-app/env' },
      { k: 'rotate', l: 'Rotação automática', t: 'bool', v: false }
    ],
    file: 'secrets.tf',
    hcl: (c, ctx) => `resource "aws_secretsmanager_secret" "${c._n}" {
  name        = "${c.path}"
  description = "Variaveis sensiveis de \${local.name}"
${ctx.has('kms') ? '  kms_key_id  = aws_kms_key.main.arn\n' : ''}
  # 7 dias de "lixeira": da tempo de recuperar um apagao acidental.
  recovery_window_in_days = 7

  tags = {
    Name = "\${local.name}-${c._n}"
  }
}

# ATENCAO: valores de verdade NAO ficam aqui.
# Criamos so o envelope; o conteudo real entra pela pipeline.
resource "aws_secretsmanager_secret_version" "${c._n}" {
  secret_id = aws_secretsmanager_secret.${c._n}.id

  secret_string = jsonencode({
    DB_HOST     = "preencher-fora-do-terraform"
    DB_USER     = "app"
    DB_PASSWORD = "preencher-fora-do-terraform"
  })

  # O Terraform cria a primeira versao e depois nunca mais olha o conteudo.
  lifecycle {
    ignore_changes = [secret_string]
  }
}`,
    after: () => ({
      title: 'Injetando o valor real (fora do Terraform)',
      lang: 'bash',
      code: `aws secretsmanager put-secret-value \\
  --secret-id prod/minha-app/env \\
  --secret-string file://valores.json

# ou, no pipeline, montando a partir dos secrets do CI:
aws secretsmanager put-secret-value \\
  --secret-id prod/minha-app/env \\
  --secret-string "{\\"DB_PASSWORD\\":\\"$DB_PASSWORD\\"}"`
    })
  });

  C({
    id: 'ssm_param', cat: 'reg', name: 'SSM Parameter Store', em: '🏷️',
    tf: 'aws_ssm_parameter', multi: false, cost: 0,
    desc: 'A alternativa barata ao Secrets Manager para configuração não-secreta (e mesmo secreta, com SecureString). Parâmetros Standard são de graça.',
    console: ['Systems Manager → Parameter Store → Create parameter → Tier Standard → Type String/SecureString'],
    gotchas: [
      'Sem rotação automática nem replicação entre regiões (o Secrets Manager tem).',
      'Parâmetro <code>SecureString</code> também cai no state em texto claro.',
      'Use hierarquia <code>/projeto/env/chave</code> — dá para ler tudo de uma vez com <code>get-parameters-by-path</code>.'
    ],
    inputs: [{ k: 'name', l: 'Caminho', t: 'text', v: '/minha-app/prod/LOG_LEVEL' }, { k: 'val', l: 'Valor', t: 'text', v: 'info' }],
    file: 'ssm.tf',
    hcl: (c) => `resource "aws_ssm_parameter" "config" {
  name        = "${c.name}"
  description = "Configuracao nao sensivel de \${local.name}"
  type        = "String"
  value       = "${c.val}"
  tier        = "Standard"

  tags = {
    Name = "\${local.name}-config"
  }
}

# AMI mais recente do Amazon Linux 2023, publicada pela AWS no SSM.
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
}`
  });

  C({
    id: 'acm', cat: 'lb', name: 'Certificado ACM (HTTPS)', em: '📜',
    tf: 'aws_acm_certificate', multi: false, cost: 0,
    desc: 'Certificado TLS gratuito e com renovação automática. Validação por DNS: o Terraform cria o registro de validação sozinho, sem ninguém abrir e-mail.',
    console: [
      'ACM → Request certificate → Public → domínio + <code>*.dominio</code>',
      'Validation method: DNS',
      'Copiar os CNAMEs de validação e colar no Route 53 (ou clicar "Create records in Route 53")',
      'Esperar sair de "Pending validation"'
    ],
    gotchas: [
      'Certificado para <b>CloudFront</b> precisa estar em <code>us-east-1</code>, sempre — use um provider com alias.',
      'Sem <code>aws_acm_certificate_validation</code>, o listener pode ser criado com o certificado ainda pendente e falhar.',
      '<code>create_before_destroy</code> evita downtime quando o domínio muda.',
      'Renovação é automática <b>desde que</b> o registro DNS de validação continue existindo. Não apague.'
    ],
    inputs: [{ k: 'domain', l: 'Domínio', t: 'text', v: 'app.exemplo.com.br' }, { k: 'zone', l: 'Zona Route 53', t: 'text', v: 'exemplo.com.br' }],
    file: 'acm.tf',
    hcl: (c) => `data "aws_route53_zone" "main" {
  name         = "${c.zone}"
  private_zone = false
}

resource "aws_acm_certificate" "main" {
  domain_name               = "${c.domain}"
  subject_alternative_names = ["*.${c.zone}"]
  validation_method         = "DNS"

  tags = {
    Name = "\${local.name}-cert"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# O Terraform cria sozinho os CNAMEs de validacao.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
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

# Este recurso nao cria nada: ele so ESPERA a validacao terminar.
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}`
  });

  C({
    id: 'tg', cat: 'lb', name: 'Target Group', em: '🎯',
    tf: 'aws_lb_target_group', multi: true, cost: 0,
    desc: 'O grupo de destinos e, principalmente, o <b>health check</b>. É o Target Group que decide se sua instância recebe tráfego ou é retirada de rotação.',
    console: [
      'EC2 → Target Groups → Create target group',
      'Target type: Instances (EC2) ou IP addresses (Fargate)',
      'Protocol/Port → escolher a VPC',
      'Health checks → Path <code>/health</code> → Advanced: thresholds, interval, matcher',
      'Create (sem registrar nada ainda — quem registra é o ASG ou o serviço ECS)'
    ],
    gotchas: [
      '<code>target_type</code> é a pegadinha: <b>instance</b> para EC2/ASG, <b>ip</b> para Fargate/awsvpc, <b>lambda</b> para função.',
      'Nome tem limite de 32 caracteres e não aceita ponto. Use <code>name_prefix</code> com <code>create_before_destroy</code>.',
      'Muitos atributos forçam recriação. Sem <code>create_before_destroy</code> você toma "target group is currently in use by a listener".',
      '<code>deregistration_delay</code> alto (padrão 300s) faz cada deploy demorar 5 minutos a mais.',
      'O health check do TG é diferente do health check do ASG — configure o ASG com <code>health_check_type = "ELB"</code> para eles conversarem.'
    ],
    inputs: [
      { k: 'name', l: 'Nome', t: 'text', v: 'app' },
      { k: 'port', l: 'Porta', t: 'num', v: 8080 },
      { k: 'type', l: 'Tipo de destino', t: 'sel', v: 'instance', opts: [['instance', 'instance — EC2 / ASG'], ['ip', 'ip — Fargate / awsvpc'], ['lambda', 'lambda']] },
      { k: 'path', l: 'Health check path', t: 'text', v: '/health' },
      { k: 'dereg', l: 'Deregistration delay (s)', t: 'num', v: 30 }
    ],
    file: 'alb.tf',
    hcl: (c, ctx) => `resource "aws_lb_target_group" "${c._n}" {
  name        = "\${local.name}-${c._n}"
  port        = ${c.port}
  protocol    = "HTTP"
  vpc_id      = ${ctx.vpcId()}
  target_type = "${c.type}"

  # Quanto tempo esperar drenar conexoes antes de tirar a instancia.
  deregistration_delay = ${c.dereg}

  health_check {
    enabled             = true
    path                = "${c.path}"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  stickiness {
    type    = "lb_cookie"
    enabled = false
  }

  tags = {
    Name = "\${local.name}-tg-${c._n}"
  }

  # Sem isto: "target group is currently in use by a listener".
  lifecycle {
    create_before_destroy = true
  }
}`
  });

  C({
    id: 'alb', cat: 'lb', name: 'Application Load Balancer', em: '⚖️',
    tf: 'aws_lb', multi: false, cost: 18,
    desc: 'A porta de entrada. Vive nas subnets públicas, tem seu próprio Security Group e distribui tráfego para os Target Groups.',
    console: [
      'EC2 → Load Balancers → Create → Application Load Balancer',
      'Scheme: internet-facing · IP address type: ipv4',
      'Network mapping: escolher a VPC e <b>pelo menos 2 AZs</b> públicas',
      'Security groups: escolher o SG do ALB',
      'Listeners and routing: HTTP:80 → forward para o TG',
      'Create load balancer'
    ],
    gotchas: [
      'ALB exige <b>no mínimo duas subnets em AZs diferentes</b>. Uma só = erro no apply.',
      'Ele fica em subnet <b>pública</b>; as instâncias, em <b>privada</b>. Esse é o ponto do desenho.',
      '<code>enable_deletion_protection = true</code> em produção — e lembre que aí <code>terraform destroy</code> falha de propósito.',
      'Nome do ALB: máximo 32 caracteres, sem ponto.',
      'Access logs exigem uma <b>bucket policy</b> específica permitindo a conta de log do ELB da região.'
    ],
    inputs: [
      { k: 'name', l: 'Nome', t: 'text', v: 'public' },
      { k: 'internal', l: 'Interno (privado)', t: 'bool', v: false },
      { k: 'prot', l: 'Proteção contra deleção', t: 'bool', v: true },
      { k: 'idle', l: 'Idle timeout (s)', t: 'num', v: 60 }
    ],
    file: 'alb.tf',
    hcl: (c, ctx) => `resource "aws_lb" "${c._n}" {
  name               = "\${local.name}-alb"
  internal           = ${c.internal}
  load_balancer_type = "application"
  security_groups    = [${ctx.sgRef('alb')}]
  subnets            = ${c.internal ? ctx.privSubnets() : ctx.pubSubnets()}

  enable_deletion_protection = ${c.prot}
  idle_timeout               = ${c.idle}
  drop_invalid_header_fields = true
  enable_http2               = true
${ctx.has('s3') ? `
  access_logs {
    bucket  = aws_s3_bucket.${ctx.nameOf('s3')}.id
    prefix  = "alb"
    enabled = true
  }
` : ''}
  tags = {
    Name = "\${local.name}-alb"
  }
}`,
    outputs: (c) => `output "alb_dns_name" {
  description = "DNS publico do Load Balancer"
  value       = aws_lb.${c._n}.dns_name
}`
  });

  C({
    id: 'listener', cat: 'lb', name: 'Listener HTTPS + redirect 80→443', em: '👂',
    tf: 'aws_lb_listener', multi: false, cost: 0,
    desc: 'O listener é quem realmente atende. Sem ele, o ALB existe, cobra e não responde nada. Aqui também mora o redirecionamento de HTTP para HTTPS.',
    console: [
      'No ALB → aba Listeners → Add listener',
      'HTTPS:443 → Default action: Forward to → escolher o TG',
      'Security policy: escolher a política TLS',
      'Default SSL certificate: escolher o certificado do ACM',
      'Adicionar outro listener HTTP:80 → Action: Redirect to URL → HTTPS 443, 301'
    ],
    gotchas: [
      'Sem certificado ACM não há listener HTTPS. É a dependência que mais trava o apply.',
      'Escolha uma <code>ssl_policy</code> moderna: <code>ELBSecurityPolicy-TLS13-1-2-2021-06</code>.',
      'O redirect 80→443 é <b>ação do listener</b>, não configuração do TG.',
      'Para múltiplos certificados no mesmo listener, use <code>aws_lb_listener_certificate</code>.'
    ],
    inputs: [{ k: 'https', l: 'Habilitar HTTPS', t: 'bool', v: true }],
    file: 'alb.tf',
    hcl: (c, ctx) => {
      const alb = ctx.nameOf('alb') || 'public';
      const tg = ctx.nameOf('tg') || 'app';
      if (!c.https) {
        return `resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.${alb}.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.${tg}.arn
  }
}`;
      }
      return `resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.${alb}.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = ${ctx.has('acm') ? 'aws_acm_certificate_validation.main.certificate_arn' : 'var.certificate_arn'}

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.${tg}.arn
  }
}

# Quem chega no 80 e mandado para o 443. Nada trafega em claro.
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.${alb}.arn
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
}`;
    }
  });

  C({
    id: 'listener_rule', cat: 'lb', name: 'Regra de roteamento (path/host)', em: '🧭',
    tf: 'aws_lb_listener_rule', multi: true, cost: 0,
    desc: 'Um único ALB atendendo vários serviços: <code>/api/*</code> vai para um Target Group, <code>/admin/*</code> para outro.',
    console: ['No listener → View/edit rules → + → Insert rule → Add condition (Path) → Add action (Forward) → definir prioridade'],
    gotchas: [
      'Prioridade é obrigatória e única. Deixe espaços (10, 20, 30) para inserir regras no meio depois.',
      'A regra <code>default_action</code> do listener é sempre a última a valer.',
      'Dá para autenticar no próprio ALB com <code>authenticate_oidc</code> / <code>authenticate_cognito</code>.'
    ],
    inputs: [
      { k: 'name', l: 'Nome', t: 'text', v: 'api' },
      { k: 'pattern', l: 'Path pattern', t: 'text', v: '/api/*' },
      { k: 'prio', l: 'Prioridade', t: 'num', v: 10, min: 1, max: 500 }
    ],
    file: 'alb.tf',
    hcl: (c, ctx) => `resource "aws_lb_listener_rule" "${c._n}" {
  listener_arn = aws_lb_listener.https.arn
  priority     = ${c.prio}

  condition {
    path_pattern {
      values = ["${c.pattern}"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.${ctx.nameOf('tg') || 'app'}.arn
  }

  tags = {
    Name = "\${local.name}-rule-${c._n}"
  }
}`
  });

  C({
    id: 'route53', cat: 'lb', name: 'Route 53 — registro alias', em: '🧾',
    tf: 'aws_route53_record', multi: false, cost: 0.5,
    desc: 'Aponta o domínio para o ALB. Registro do tipo <b>alias</b>: não custa consulta, resolve para os IPs do ALB e acompanha mudanças automaticamente.',
    console: ['Route 53 → Hosted zones → escolher a zona → Create record → Alias → Route traffic to → Application Load Balancer → região → o ALB'],
    gotchas: [
      'Alias ≠ CNAME. Alias funciona na raiz do domínio (<code>exemplo.com.br</code>); CNAME não.',
      '<code>evaluate_target_health = true</code> tira o registro de rotação se o ALB estiver ruim.',
      'A <code>zone_id</code> do alias é a do <b>ALB</b> (<code>aws_lb.x.zone_id</code>), não a da sua hosted zone.'
    ],
    inputs: [{ k: 'name', l: 'Nome DNS', t: 'text', v: 'app.exemplo.com.br' }],
    file: 'dns.tf',
    hcl: (c, ctx) => `resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${c.name}"
  type    = "A"

  alias {
    name                   = aws_lb.${ctx.nameOf('alb') || 'public'}.dns_name
    zone_id                = aws_lb.${ctx.nameOf('alb') || 'public'}.zone_id
    evaluate_target_health = true
  }
}`
  });

  C({
    id: 'waf', cat: 'lb', name: 'WAF na frente do ALB', em: '🧱',
    tf: 'aws_wafv2_web_acl', multi: false, cost: 8,
    desc: 'Regras gerenciadas da AWS contra OWASP Top 10, IPs maliciosos e rate limiting — associadas ao ALB com um recurso só.',
    console: ['WAF & Shield → Web ACLs → Create → escolher Regional (ALB) → Add managed rule groups → associar ao ALB'],
    gotchas: [
      'WAF regional (ALB) e WAF global (CloudFront) são <b>escopos diferentes</b>: <code>REGIONAL</code> vs <code>CLOUDFRONT</code> (este exige us-east-1).',
      'Cada regra gerenciada consome WCU; o limite padrão da Web ACL é 1500.',
      'Comece com as regras em <code>count</code> (só observa) antes de <code>block</code>, ou você derruba produção no primeiro dia.'
    ],
    inputs: [{ k: 'rate', l: 'Rate limit (req/5min por IP)', t: 'num', v: 2000 }],
    file: 'waf.tf',
    hcl: (c, ctx) => `resource "aws_wafv2_web_acl" "main" {
  name  = "\${local.name}-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimit"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = ${c.rate}
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "ratelimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "\${local.name}-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "\${local.name}-waf"
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.${ctx.nameOf('alb') || 'public'}.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}`
  });
})(window.IAC);

/* =========================================================
   catalog-aws (3) — Computação, ECS, Serverless, Dados, Ops
   ========================================================= */
(function (IAC) {
  'use strict';
  const C = IAC.awsC;

  C({
    id: 'lt', cat: 'comp', name: 'Launch Template', em: '📋',
    tf: 'aws_launch_template', multi: false, cost: 0,
    desc: 'A receita da instância: AMI, tipo, disco, security group, IAM profile e user_data. O ASG só sabe multiplicar essa receita.',
    console: [
      'EC2 → Launch Templates → Create launch template',
      'AMI, Instance type, Key pair, Network settings (SG), Storage',
      'Advanced details → IAM instance profile → Metadata version: V2 only',
      'Advanced details → User data → colar o script de bootstrap'
    ],
    gotchas: [
      '<b>Sempre</b> <code>http_tokens = "required"</code> (IMDSv2). IMDSv1 permite roubar as credenciais da role via SSRF.',
      'Alterar o launch template <b>não</b> troca as instâncias que já estão rodando — quem faz isso é o <code>instance_refresh</code> do ASG.',
      'Use <code>name_prefix</code> + <code>create_before_destroy</code>: o nome fixo dá conflito na atualização.',
      'AMI fixa no código envelhece. Puxe do SSM Public Parameter e você sempre sobe a mais recente.',
      '<code>user_data</code> precisa de <code>base64encode()</code>; use <code>templatefile()</code> para injetar variáveis.'
    ],
    inputs: [
      { k: 'type', l: 'Tipo de instância', t: 'sel', v: 't3.small', opts: [['t3.micro', 't3.micro · ~US$ 8/mês'], ['t3.small', 't3.small · ~US$ 15/mês'], ['t3.medium', 't3.medium · ~US$ 30/mês'], ['m6i.large', 'm6i.large · ~US$ 70/mês']] },
      { k: 'disk', l: 'Disco (GB)', t: 'num', v: 30, min: 8, max: 500 },
      { k: 'port', l: 'Porta da app', t: 'num', v: 8080 }
    ],
    file: 'compute.tf',
    hcl: (c, ctx) => `data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
}

resource "aws_launch_template" "app" {
  name_prefix   = "\${local.name}-"
  description   = "Receita das instancias de \${local.name}"
  image_id      = data.aws_ssm_parameter.ami.value
  instance_type = "${c.type}"
${ctx.has('iam_role') ? `
  iam_instance_profile {
    arn = aws_iam_instance_profile.${ctx.nameOf('iam_role')}.arn
  }
` : ''}
  vpc_security_group_ids = [${ctx.sgRef('app')}]

  # IMDSv2 obrigatorio: sem isto, um SSRF rouba a credencial da role.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = ${c.disk}
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = true
  }

  user_data = base64encode(templatefile("\${path.module}/user_data.sh.tftpl", {
    region    = var.region
    app_port  = ${c.port}
${ctx.has('ecr') ? `    ecr_url   = aws_ecr_repository.${ctx.nameOf('ecr')}.repository_url\n` : ''}${ctx.has('secret') ? `    secret_id = aws_secretsmanager_secret.${ctx.nameOf('secret')}.name\n` : ''}  }))

  tag_specifications {
    resource_type = "instance"

    tags = merge(local.tags, {
      Name = local.name
    })
  }

  lifecycle {
    create_before_destroy = true
  }
}`,
    after: () => ({
      title: 'user_data.sh.tftpl — o bootstrap da instância',
      lang: 'bash',
      code: `#!/bin/bash
set -euxo pipefail

dnf install -y docker awscli jq
systemctl enable --now docker

# Login no ECR usando a ROLE da instância (nenhuma credencial no disco)
aws ecr get-login-password --region \${region} \\
  | docker login --username AWS --password-stdin "\${ecr_url%%/*}"

# Puxa as variáveis do Secrets Manager e monta o .env
aws secretsmanager get-secret-value \\
  --secret-id \${secret_id} --region \${region} \\
  --query SecretString --output text \\
  | jq -r 'to_entries|.[]|"\\(.key)=\\(.value)"' > /etc/app.env

docker run -d --restart=always \\
  -p \${app_port}:\${app_port} \\
  --env-file /etc/app.env \\
  "\${ecr_url}:latest"`
    })
  });

  C({
    id: 'asg', cat: 'comp', name: 'Auto Scaling Group + vínculo ao TG', em: '📈',
    tf: 'aws_autoscaling_group', multi: false, cost: 30,
    desc: 'O grupo que mantém N instâncias vivas, espalhadas por AZ, registradas no Target Group. O famoso "vincular ao TG" é uma linha aqui.',
    console: [
      'EC2 → Auto Scaling Groups → Create',
      'Escolher o Launch template → Next',
      'Network: VPC + subnets <b>privadas</b>',
      '<b>Load balancing → Attach to an existing load balancer → escolher o Target Group</b>',
      'Health checks: marcar "Turn on Elastic Load Balancing health checks"',
      'Group size: desired / min / max → Create'
    ],
    gotchas: [
      '<b><code>target_group_arns</code> é o "vincular ao TG"</b> do console. Sem isso as instâncias sobem e não recebem tráfego.',
      'Não misture <code>target_group_arns</code> com <code>aws_autoscaling_attachment</code>: os dois brigam e o estado fica oscilando.',
      '<code>health_check_type = "ELB"</code> faz o ASG confiar no health check do TG. Com "EC2", uma app travada nunca é substituída.',
      '<code>instance_refresh</code> é o deploy rolling nativo: mudou o launch template, ele troca as instâncias sozinho.',
      '<code>ignore_changes = [desired_capacity]</code> impede que o apply desfaça um scale-out que já aconteceu.',
      'Tags no ASG usam bloco <code>tag</code> com <code>propagate_at_launch</code> — <code>default_tags</code> não chega nas instâncias.'
    ],
    inputs: [
      { k: 'min', l: 'Mínimo', t: 'num', v: 2, min: 0, max: 20 },
      { k: 'des', l: 'Desejado', t: 'num', v: 2, min: 0, max: 20 },
      { k: 'max', l: 'Máximo', t: 'num', v: 6, min: 1, max: 50 },
      { k: 'hc', l: 'Health check', t: 'sel', v: 'ELB', opts: [['ELB', 'ELB — usa o health check do TG'], ['EC2', 'EC2 — só verifica se a VM está viva']] },
      { k: 'refresh', l: 'Instance refresh (deploy rolling)', t: 'bool', v: true }
    ],
    file: 'compute.tf',
    hcl: (c, ctx) => `resource "aws_autoscaling_group" "app" {
  name                = "\${local.name}-asg"
  vpc_zone_identifier = ${ctx.privSubnets()}

  min_size         = ${c.min}
  max_size         = ${c.max}
  desired_capacity = ${c.des}

  health_check_type         = "${c.hc}"
  health_check_grace_period = 120

  # >>> ESTE E O "VINCULAR AO TARGET GROUP" DO CONSOLE <<<
  target_group_arns = [${ctx.has('tg') ? 'aws_lb_target_group.' + ctx.nameOf('tg') + '.arn' : 'var.target_group_arn'}]

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }
${c.refresh ? `
  # Deploy rolling nativo: mudou o launch template, troca as instancias.
  instance_refresh {
    strategy = "Rolling"

    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 120
    }

    triggers = ["launch_template"]
  }
` : ''}
  # default_tags NAO chega nas instancias do ASG: tem que ser assim.
  dynamic "tag" {
    for_each = local.tags

    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  tag {
    key                 = "Name"
    value               = local.name
    propagate_at_launch = true
  }

  # Nao desfaz um scale-out que ja aconteceu.
  lifecycle {
    ignore_changes = [desired_capacity]
  }
}`
  });

  C({
    id: 'asg_policy', cat: 'comp', name: 'Política de escala automática', em: '🎚️',
    tf: 'aws_autoscaling_policy', multi: false, cost: 0,
    desc: 'Target tracking: você diz "quero CPU média em 60%" e a AWS calcula sozinha quando subir e descer instâncias.',
    console: ['No ASG → Automatic scaling → Create dynamic scaling policy → Target tracking → Metric: Average CPU → Target value: 60'],
    gotchas: [
      'Target tracking cria alarmes do CloudWatch por baixo dos panos — eles aparecem na conta sem você ter criado.',
      'Se a app leva 3 minutos para subir, <code>instance_warmup</code> menor que isso causa escalada em cascata.',
      'Escalar por CPU numa aplicação I/O-bound não funciona. Considere <code>ALBRequestCountPerTarget</code>.',
      '<b>Scale-in</b> é sempre mais lento que scale-out — de propósito, para não derrubar tráfego.'
    ],
    inputs: [
      { k: 'metric', l: 'Métrica', t: 'sel', v: 'cpu', opts: [['cpu', 'CPU média do grupo'], ['req', 'Requisições por target (ALB)']] },
      { k: 'target', l: 'Valor alvo', t: 'num', v: 60, min: 5, max: 5000 }
    ],
    file: 'compute.tf',
    hcl: (c, ctx) => c.metric === 'cpu' ? `resource "aws_autoscaling_policy" "cpu" {
  name                   = "\${local.name}-tt-cpu"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }

    target_value = ${c.target}
  }
}` : `resource "aws_autoscaling_policy" "req" {
  name                   = "\${local.name}-tt-req"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "\${aws_lb.${ctx.nameOf('alb') || 'public'}.arn_suffix}/\${aws_lb_target_group.${ctx.nameOf('tg') || 'app'}.arn_suffix}"
    }

    target_value = ${c.target}
  }
}`
  });

  C({
    id: 'ecs_cluster', cat: 'cont', name: 'Cluster ECS (Fargate)', em: '🐳',
    tf: 'aws_ecs_cluster', multi: false, cost: 0,
    desc: 'O cluster em si é de graça e quase vazio — o que importa são os serviços dentro dele. Com Fargate você não gerencia nenhuma EC2.',
    console: ['ECS → Clusters → Create cluster → Infrastructure: AWS Fargate → Monitoring: Container Insights'],
    gotchas: [
      'Container Insights custa por métrica, mas é a diferença entre debugar e adivinhar.',
      'Cluster ECS com EC2 exige capacity provider e ASG próprio; Fargate elimina isso.'
    ],
    inputs: [{ k: 'insights', l: 'Container Insights', t: 'bool', v: true }],
    file: 'ecs.tf',
    hcl: (c) => `resource "aws_ecs_cluster" "main" {
  name = "\${local.name}"

  setting {
    name  = "containerInsights"
    value = "${c.insights ? 'enabled' : 'disabled'}"
  }

  tags = {
    Name = "\${local.name}-ecs"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}`
  });

  C({
    id: 'ecs_task', cat: 'cont', name: 'Task Definition (imagem + secrets)', em: '📄',
    tf: 'aws_ecs_task_definition', multi: false, cost: 0,
    desc: 'A definição do contêiner: qual imagem do ECR, quanto de CPU/memória, quais variáveis vêm do Secrets Manager e para onde vão os logs.',
    console: [
      'ECS → Task definitions → Create new task definition',
      'Launch type: Fargate · CPU/Memory',
      'Container: nome + Image URI (a URL do ECR + tag)',
      'Environment variables → Add → ValueFrom → colar o ARN do secret',
      'Logging: awslogs → definir o log group'
    ],
    gotchas: [
      '<b>Duas roles diferentes:</b> <code>execution_role</code> (o ECS usa para <i>puxar</i> a imagem e ler o secret) e <code>task_role</code> (o que a sua aplicação pode fazer). Confundir as duas é o erro nº 1.',
      'Em <code>secrets</code>, o <code>valueFrom</code> com sufixo <code>:CHAVE::</code> injeta apenas um campo do JSON — sem isso vem o JSON inteiro.',
      '<code>network_mode = "awsvpc"</code> é obrigatório no Fargate, e o Target Group precisa ser <code>target_type = "ip"</code>.',
      'CPU e memória só aceitam combinações válidas (256/512, 512/1024…).',
      'Cada apply cria uma <b>nova revisão</b>; o serviço precisa apontar para a revisão nova.'
    ],
    inputs: [
      { k: 'cpu', l: 'CPU', t: 'sel', v: '512', opts: [['256', '256 (.25 vCPU)'], ['512', '512 (.5 vCPU)'], ['1024', '1024 (1 vCPU)'], ['2048', '2048 (2 vCPU)']] },
      { k: 'mem', l: 'Memória (MB)', t: 'sel', v: '1024', opts: [['512', '512'], ['1024', '1024'], ['2048', '2048'], ['4096', '4096']] },
      { k: 'port', l: 'Porta do contêiner', t: 'num', v: 8080 }
    ],
    file: 'ecs.tf',
    hcl: (c, ctx) => {
      const ecr = ctx.nameOf('ecr') || 'app';
      const sec = ctx.nameOf('secret');
      return `# Role que o ECS usa para PUXAR a imagem e LER o secret.
data "aws_iam_policy_document" "ecs_exec_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "\${local.name}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_exec_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
${sec ? `
data "aws_iam_policy_document" "ecs_exec_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.${sec}.arn]
  }
}

resource "aws_iam_role_policy" "ecs_exec_secrets" {
  name   = "ler-secrets"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_exec_secrets.json
}
` : ''}
resource "aws_ecs_task_definition" "app" {
  family                   = "\${local.name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "${c.cpu}"
  memory                   = "${c.mem}"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
${ctx.has('iam_role') ? `  task_role_arn            = aws_iam_role.${ctx.nameOf('iam_role')}.arn\n` : ''}
  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "\${aws_ecr_repository.${ecr}.repository_url}:\${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = ${c.port}
          protocol      = "tcp"
        },
      ]
${sec ? `
      # Injeta APENAS o campo DB_PASSWORD do JSON do secret.
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "\${aws_secretsmanager_secret.${sec}.arn}:DB_PASSWORD::"
        },
      ]
` : ''}
      environment = [
        {
          name  = "APP_ENV"
          value = var.env
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"

        options = {
          "awslogs-group"         = ${ctx.has('logs') ? 'aws_cloudwatch_log_group.app.name' : '"/ecs/\\${local.name}"'}
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "app"
        }
      }

      healthCheck = {
        command  = ["CMD-SHELL", "curl -f http://localhost:${c.port}/health || exit 1"]
        interval = 30
        timeout  = 5
        retries  = 3
      }
    },
  ])

  tags = {
    Name = "\${local.name}-task"
  }
}

variable "image_tag" {
  type        = string
  description = "Tag da imagem — passe o SHA do commit pela pipeline"
  default     = "latest"
}`;
    }
  });

  C({
    id: 'ecs_service', cat: 'cont', name: 'ECS Service + autoscaling', em: '🚢',
    tf: 'aws_ecs_service', multi: false, cost: 25,
    desc: 'Mantém N tarefas rodando, registra cada uma no Target Group e faz deploy sem downtime com circuit breaker e rollback automático.',
    console: [
      'No cluster → Services → Create',
      'Task definition (family + revision) · Desired tasks',
      'Networking: subnets privadas + SG da aplicação',
      '<b>Load balancing → Application Load Balancer → escolher o Target Group</b>',
      'Deployment: rolling update, min 100% / max 200%'
    ],
    gotchas: [
      'Fargate exige Target Group com <code>target_type = "ip"</code>. Se estiver "instance", falha.',
      '<code>depends_on</code> no listener: sem o listener existindo, o serviço não consegue registrar no TG.',
      '<code>deployment_circuit_breaker</code> com <code>rollback = true</code> é o que salva o deploy quebrado às 2h da manhã.',
      '<code>ignore_changes = [desired_count]</code> quando o autoscaling gerencia a quantidade.',
      'Autoscaling de ECS não é <code>aws_autoscaling_policy</code>: é <code>aws_appautoscaling_*</code>.'
    ],
    inputs: [
      { k: 'count', l: 'Tarefas desejadas', t: 'num', v: 2, min: 1, max: 20 },
      { k: 'min', l: 'Mín (autoscaling)', t: 'num', v: 2, min: 1, max: 20 },
      { k: 'max', l: 'Máx (autoscaling)', t: 'num', v: 10, min: 1, max: 100 },
      { k: 'port', l: 'Porta do contêiner', t: 'num', v: 8080 }
    ],
    file: 'ecs.tf',
    hcl: (c, ctx) => `resource "aws_ecs_service" "app" {
  name            = "\${local.name}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = ${c.count}
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = ${ctx.privSubnets()}
    security_groups  = [${ctx.sgRef('app')}]
    assign_public_ip = false
  }

  # >>> O "vincular ao Target Group", versao ECS <<<
  load_balancer {
    target_group_arn = aws_lb_target_group.${ctx.nameOf('tg') || 'app'}.arn
    container_name   = "app"
    container_port   = ${c.port}
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  # Deploy quebrado volta sozinho.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Permite "docker exec" via SSM, sem bastion.
  enable_execute_command = true

  depends_on = [aws_lb_listener.https]

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = {
    Name = "\${local.name}-svc"
  }
}

# --- Autoscaling do ECS usa Application Auto Scaling ---
resource "aws_appautoscaling_target" "ecs" {
  service_namespace  = "ecs"
  resource_id        = "service/\${aws_ecs_cluster.main.name}/\${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = ${c.min}
  max_capacity       = ${c.max}
}

resource "aws_appautoscaling_policy" "ecs_cpu" {
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
}`
  });

  C({
    id: 'lambda', cat: 'srv', name: 'Lambda + API Gateway HTTP', em: '⚡',
    tf: 'aws_lambda_function', multi: false, cost: 1,
    desc: 'Para workloads event-driven ou APIs de baixo volume: sem ALB, sem ASG, sem servidor. Você paga por invocação.',
    console: [
      'Lambda → Create function → Author from scratch → runtime → Create',
      'Upload .zip ou apontar imagem do ECR',
      'Configuration → Permissions (a role é criada junto)',
      'API Gateway → Create HTTP API → Integration: Lambda → Route → Deploy'
    ],
    gotchas: [
      '<code>source_code_hash</code> é o que faz o Terraform perceber que o código mudou.',
      'A Lambda em VPC precisa de ENI: cold start maior e você precisa de NAT para ela falar com a internet.',
      'Log group da Lambda é criado <b>pela AWS</b> sem retenção. Crie você mesmo com <code>retention_in_days</code>, ou pague log eterno.',
      '<code>aws_lambda_permission</code> é obrigatório para o API Gateway poder invocar — o erro "internal server error" quase sempre é isso.'
    ],
    inputs: [
      { k: 'runtime', l: 'Runtime', t: 'sel', v: 'python3.12', opts: [['python3.12', 'python3.12'], ['nodejs20.x', 'nodejs20.x'], ['java21', 'java21']] },
      { k: 'mem', l: 'Memória (MB)', t: 'num', v: 512, min: 128, max: 10240 }
    ],
    file: 'lambda.tf',
    hcl: (c, ctx) => `data "archive_file" "fn" {
  type        = "zip"
  source_dir  = "\${path.module}/src"
  output_path = "\${path.module}/build/fn.zip"
}

resource "aws_lambda_function" "api" {
  function_name = "\${local.name}-api"
  role          = aws_iam_role.${ctx.nameOf('iam_role') || 'lambda'}.arn
  handler       = "main.handler"
  runtime       = "${c.runtime}"
  memory_size   = ${c.mem}
  timeout       = 15

  filename         = data.archive_file.fn.output_path
  source_code_hash = data.archive_file.fn.output_base64sha256

  environment {
    variables = {
      APP_ENV = var.env
    }
  }

  tags = {
    Name = "\${local.name}-api"
  }
}

# Se voce nao criar, a AWS cria sem retencao e o log fica eterno.
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/\${aws_lambda_function.api.function_name}"
  retention_in_days = 14
}

resource "aws_apigatewayv2_api" "http" {
  name          = "\${local.name}-http"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "any" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/\${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

# Sem esta permissao o API Gateway responde 500.
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "\${aws_apigatewayv2_api.http.execution_arn}/*/*"
}`
  });

  C({
    id: 'rds', cat: 'data', name: 'RDS PostgreSQL', em: '🗄️',
    tf: 'aws_db_instance', multi: false, cost: 30,
    desc: 'Banco gerenciado em subnet privada, com senha gerada e guardada no Secrets Manager — nunca digitada em lugar nenhum.',
    console: [
      'RDS → Create database → Standard create → PostgreSQL',
      'Templates: Production / Dev · Credentials: "Manage in Secrets Manager"',
      'Connectivity: VPC + subnet group + <b>Public access: No</b> + SG do banco',
      'Additional configuration: initial DB name, backup retention, deletion protection'
    ],
    gotchas: [
      '<code>publicly_accessible = false</code>. Sempre. Não existe exceção boa.',
      '<code>skip_final_snapshot = true</code> em produção é o mesmo que aceitar perder tudo em um destroy.',
      '<code>manage_master_user_password = true</code> deixa a AWS gerar e rotacionar a senha no Secrets Manager — a senha nunca passa pelo state.',
      'Mudar <code>instance_class</code> ou storage causa downtime, a não ser que <code>apply_immediately = false</code> e você espere a janela.',
      '<code>prevent_destroy = true</code> é barato e já salvou muita gente.'
    ],
    inputs: [
      { k: 'class', l: 'Classe', t: 'sel', v: 'db.t4g.micro', opts: [['db.t4g.micro', 'db.t4g.micro · ~US$ 13/mês'], ['db.t4g.small', 'db.t4g.small · ~US$ 26/mês'], ['db.m6g.large', 'db.m6g.large · ~US$ 130/mês']] },
      { k: 'storage', l: 'Storage (GB)', t: 'num', v: 20, min: 20, max: 1000 },
      { k: 'multiaz', l: 'Multi-AZ', t: 'bool', v: false },
      { k: 'backup', l: 'Retenção de backup (dias)', t: 'num', v: 7, min: 0, max: 35 }
    ],
    file: 'rds.tf',
    hcl: (c, ctx) => `resource "aws_db_subnet_group" "main" {
  name       = "\${local.name}"
  subnet_ids = ${ctx.privSubnets()}

  tags = {
    Name = "\${local.name}-subnets"
  }
}

resource "aws_db_parameter_group" "main" {
  name   = "\${local.name}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "\${local.name}"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = "${c.class}"

  allocated_storage     = ${c.storage}
  max_allocated_storage = ${c.storage * 5}
  storage_type          = "gp3"
  storage_encrypted     = true
${ctx.has('kms') ? '  kms_key_id            = aws_kms_key.main.arn\n' : ''}
  db_name  = "app"
  username = "postgres"

  # A AWS gera e rotaciona a senha; ela nunca passa pelo Terraform.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [${ctx.sgRef('db')}]
  publicly_accessible    = false
  multi_az               = ${c.multiaz}

  backup_retention_period = ${c.backup}
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "\${local.name}-final"

  tags = {
    Name = "\${local.name}-db"
  }

  lifecycle {
    prevent_destroy = true
  }
}`
  });

  C({
    id: 's3', cat: 'data', name: 'Bucket S3 seguro', em: '🪣',
    tf: 'aws_s3_bucket', multi: true, cost: 2,
    desc: 'No provider 5.x cada configuração do bucket virou um recurso separado. São 5 blocos para um bucket decente — e cada um deles tem razão de existir.',
    console: ['S3 → Create bucket → Block all public access (marcado) → Versioning: Enable → Default encryption: SSE-KMS'],
    gotchas: [
      'A partir do provider 4.x, <code>versioning</code>, <code>encryption</code>, <code>acl</code> e <code>lifecycle</code> <b>saíram</b> de dentro do <code>aws_s3_bucket</code>.',
      'Nome de bucket é <b>global</b> — se alguém no mundo já usou, o seu apply falha.',
      '<code>force_destroy = true</code> apaga o bucket com objetos dentro. Ótimo em dev, catastrófico em prod.',
      'Sempre <code>aws_s3_bucket_public_access_block</code>. É a defesa contra o vazamento clássico.'
    ],
    inputs: [
      { k: 'name', l: 'Nome lógico', t: 'text', v: 'assets' },
      { k: 'bucket', l: 'Nome do bucket (global)', t: 'text', v: 'minha-app-assets-prod' },
      { k: 'ver', l: 'Versionamento', t: 'bool', v: true }
    ],
    file: 's3.tf',
    hcl: (c, ctx) => `resource "aws_s3_bucket" "${c._n}" {
  bucket = "${c.bucket}"

  tags = {
    Name = "${c.bucket}"
  }
}

resource "aws_s3_bucket_public_access_block" "${c._n}" {
  bucket                  = aws_s3_bucket.${c._n}.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "${c._n}" {
  bucket = aws_s3_bucket.${c._n}.id

  versioning_configuration {
    status = "${c.ver ? 'Enabled' : 'Suspended'}"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "${c._n}" {
  bucket = aws_s3_bucket.${c._n}.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "${ctx.has('kms') ? 'aws:kms' : 'AES256'}"
${ctx.has('kms') ? '      kms_master_key_id = aws_kms_key.main.arn\n' : ''}    }

    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "${c._n}" {
  bucket = aws_s3_bucket.${c._n}.id

  rule {
    id     = "expirar-versoes-antigas"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}`
  });

  C({
    id: 'dynamo', cat: 'data', name: 'DynamoDB', em: '⚡',
    tf: 'aws_dynamodb_table', multi: false, cost: 3,
    desc: 'Tabela NoSQL sob demanda, com point-in-time recovery e TTL — três linhas que a maioria esquece de marcar no console.',
    console: ['DynamoDB → Create table → partition key / sort key → Customize settings → On-demand → Enable PITR'],
    gotchas: [
      'Só declare no <code>attribute</code> os campos que são chave ou índice — não é um schema completo.',
      '<code>PAY_PER_REQUEST</code> evita capacity planning; <code>PROVISIONED</code> é mais barato em carga previsível.',
      'PITR custa pouco e é a diferença entre perder 1 minuto ou 1 dia de dados.'
    ],
    inputs: [{ k: 'name', l: 'Tabela', t: 'text', v: 'sessions' }, { k: 'hash', l: 'Partition key', t: 'text', v: 'pk' }],
    file: 'dynamo.tf',
    hcl: (c) => `resource "aws_dynamodb_table" "main" {
  name         = "\${local.name}-${c.name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "${c.hash}"

  attribute {
    name = "${c.hash}"
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

  tags = {
    Name = "\${local.name}-${c.name}"
  }
}`
  });

  C({
    id: 'logs', cat: 'ops', name: 'CloudWatch Log Group', em: '📜',
    tf: 'aws_cloudwatch_log_group', multi: false, cost: 3,
    desc: 'Log group com retenção definida. Sem retenção, o CloudWatch guarda para sempre e a fatura cresce em silêncio.',
    console: ['CloudWatch → Log groups → Create log group → Retention setting'],
    gotchas: [
      'Retenção padrão é <b>"Never expire"</b>. Esse é o custo escondido nº 1 do CloudWatch.',
      'Se a AWS criar o log group antes de você (ECS/Lambda fazem isso), o apply falha com "already exists" — importe ou apague.'
    ],
    inputs: [{ k: 'ret', l: 'Retenção (dias)', t: 'sel', v: '14', opts: [['7', '7'], ['14', '14'], ['30', '30'], ['90', '90'], ['365', '365']] }],
    file: 'observability.tf',
    hcl: (c, ctx) => `resource "aws_cloudwatch_log_group" "app" {
  name              = "/\${var.project}/\${var.env}/app"
  retention_in_days = ${c.ret}
${ctx.has('kms') ? '  kms_key_id        = aws_kms_key.main.arn\n' : ''}
  tags = {
    Name = "\${local.name}-logs"
  }
}`
  });

  C({
    id: 'alarm', cat: 'ops', name: 'Alarme + SNS', em: '🚨',
    tf: 'aws_cloudwatch_metric_alarm', multi: true, cost: 0.3,
    desc: 'O alarme que grita antes do cliente. Aqui: targets não saudáveis no Target Group e 5xx no ALB.',
    console: ['CloudWatch → Alarms → Create alarm → Select metric → ApplicationELB → definir threshold → SNS topic → Create'],
    gotchas: [
      '<code>treat_missing_data</code> é traiçoeiro: com "missing" um alarme pode nunca disparar porque a métrica sumiu.',
      'A inscrição de e-mail no SNS precisa ser <b>confirmada por clique</b> — o Terraform cria mas fica "pending".',
      'Alarme sem ação é decoração. Sempre aponte para um tópico SNS.'
    ],
    inputs: [
      { k: 'name', l: 'Nome', t: 'text', v: 'health' },
      { k: 'email', l: 'E-mail de alerta', t: 'text', v: 'sre@exemplo.com.br' }
    ],
    file: 'observability.tf',
    hcl: (c, ctx) => `resource "aws_sns_topic" "alerts" {
  name = "\${local.name}-alerts"

  tags = {
    Name = "\${local.name}-alerts"
  }
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "${c.email}"
}

resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "\${local.name}-targets-unhealthy"
  alarm_description   = "Ha targets fora de rotacao no Target Group"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.${ctx.nameOf('tg') || 'app'}.arn_suffix
    LoadBalancer = aws_lb.${ctx.nameOf('alb') || 'public'}.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "http_5xx" {
  alarm_name          = "\${local.name}-5xx"
  alarm_description   = "Aplicacao retornando 5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.${ctx.nameOf('alb') || 'public'}.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}`
  });
})(window.IAC);
