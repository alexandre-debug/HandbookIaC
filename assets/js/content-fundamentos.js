/* =========================================================
   content-fundamentos.js
   ========================================================= */
(function (IAC) {
  'use strict';
  const code = IAC.code, tip = IAC.tip, warn = IAC.warn, danger = IAC.danger,
    info = IAC.info, table = IAC.table, cs = IAC.consoleSteps;

  IAC.section({
    id: 'fund', label: 'Fundamentos', icon: '📘',
    pages: [

      {
        id: 'por-que', title: 'Do ClickOps ao código',
        body: () => `
<span class="eyebrow">Fundamentos · 01</span>
<h1>Do ClickOps ao código</h1>
${IAC.byline('autor deste handbook · conecte-se no LinkedIn')}
<p class="lede">Você abre o console, cria o ECR, cria o secret, cria o target group, o auto scaling, vincula ao TG, sobe o load balancer, ajusta a policy. Funciona. O problema não é criar — é <b>recriar</b>, <b>revisar</b> e <b>lembrar</b>.</p>

<h2>As quatro perguntas que o console não responde</h2>
${table(['Pergunta', 'Com console', 'Com Terraform'],
          [['O que exatamente existe em produção?', 'Abrir 12 telas e conferir na mão', '<code>terraform state list</code> ou ler o repositório'],
          ['Por que este security group foi aberto?', 'Ninguém sabe', '<code>git log -p</code> mostra quem, quando e o PR'],
          ['Consigo recriar isso idêntico em staging?', 'Repetindo os cliques e torcendo', '<code>terraform apply</code> com outro tfvars'],
          ['O que essa mudança vai quebrar?', 'Descobre depois', '<code>terraform plan</code> mostra antes']])}

<h2>O ganho real não é velocidade</h2>
<p>Criar um ALB no console leva 3 minutos. Escrever o mesmo ALB em Terraform leva 15. <b>A primeira vez é mais lenta.</b> O ganho aparece na segunda, na décima, e principalmente no dia em que:</p>
<ul>
<li>você precisa subir o mesmo ambiente em outra região porque o cliente exigiu;</li>
<li>alguém pergunta "quem abriu a porta 22 pro mundo?" e a resposta é um <code>git blame</code>;</li>
<li>o ambiente de staging divergiu de produção e ninguém sabe em quê;</li>
<li>a pessoa que montou tudo saiu da empresa.</li>
</ul>

${info('Uma verdade desconfortável', '<p>IaC não impede erro. Impede <b>erro sem rastro</b>. Você ainda pode destruir a produção — mas vai ser em um commit, revisado, com um plano que avisou <code>1 to destroy</code> antes.</p>')}

<h2>Os três estados de qualquer recurso</h2>
<p>Terraform vive comparando três coisas. Entender isso resolve 80% da confusão:</p>
${table(['Onde', 'O que é', 'Como se chama'],
          [['<b>Código</b> (.tf)', 'O que você <i>quer</i> que exista', 'configuração / desejo'],
          ['<b>State</b> (.tfstate)', 'O que o Terraform <i>acha</i> que existe', 'estado conhecido'],
          ['<b>Nuvem</b> (AWS/GCP)', 'O que <i>realmente</i> existe', 'realidade']])}
<p>O <code>plan</code> é literalmente a diferença entre esses três. Quando alguém mexe no console, a nuvem muda mas o código não — e isso é o que chamamos de <b>drift</b>. O laboratório deste handbook simula exatamente isso.</p>

<h2>O que NÃO colocar em Terraform</h2>
<ul>
<li><b>Dados dentro dos recursos.</b> O bucket sim, os arquivos dentro dele não. A tabela sim, as linhas não.</li>
<li><b>Valores de segredo.</b> Crie o "envelope" do secret; o valor entra por fora (você vai ver isso repetido várias vezes aqui — é o erro mais caro).</li>
<li><b>Coisas que mudam a cada minuto.</b> Escala automática, por exemplo, é gerenciada pela nuvem — o Terraform define os limites, não o número atual.</li>
<li><b>Configuração de dentro da máquina.</b> Isso é Ansible/cloud-init/imagem. Terraform provisiona a máquina, não o que roda dentro.</li>
</ul>

<h2>Terraform, OpenTofu e os outros</h2>
<p>Em agosto de 2023 a HashiCorp trocou a licença do Terraform de MPL para BUSL. A comunidade respondeu com o <b>OpenTofu</b>, um fork sob a Linux Foundation. Na prática, hoje:</p>
<ul>
<li>A linguagem é a mesma. <code>tofu plan</code> e <code>terraform plan</code> fazem a mesma coisa.</li>
<li>Tudo que você aprender aqui vale para os dois.</li>
<li>Para uso interno da empresa, a BUSL não te afeta. Ela restringe quem quer <i>vender um produto concorrente</i>.</li>
<li>Alternativas com linguagem de programação de verdade: <b>Pulumi</b> (TypeScript/Python/Go) e <b>CDK for Terraform</b>. Ótimos quando você precisa de lógica complexa; mais um passo de abstração para depurar quando quebra.</li>
</ul>

${tip('Como usar este handbook', '<p>Leia os fundamentos na ordem, mas vá para o <b>Laboratório AWS</b> assim que a mão coçar. Ele monta exatamente o fluxo que você já faz no console — ECR, secret, target group, auto scaling, load balancer, policies — e mostra o código, o grafo, o plan e o apply. Depois volte para os capítulos que ficaram nebulosos.</p>')}
`},

      {
        id: 'instalar', title: 'Instalação e primeiro projeto',
        body: () => `
<span class="eyebrow">Fundamentos · 02</span>
<h1>Instalação e o primeiro projeto</h1>
<p class="lede">Cinco minutos até o primeiro <code>apply</code>. Depois a gente entende o que aconteceu.</p>

<h2>Instalando</h2>
${code(`# macOS
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# Linux (Debian/Ubuntu)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \\
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# Recomendado: tfenv, para alternar versões por projeto
brew install tfenv && tfenv install 1.9.8 && tfenv use 1.9.8

terraform version`, { lang: 'bash', file: 'instalação' })}

<h2>Credenciais</h2>
${code(`# AWS — nunca coloque chave no .tf
aws configure sso            # o jeito recomendado hoje
export AWS_PROFILE=meu-perfil
aws sts get-caller-identity  # confirme QUEM você é antes de aplicar

# GCP
gcloud auth application-default login
gcloud config set project meu-projeto-prod`, { lang: 'bash', file: 'credenciais' })}

${danger('O hábito que evita o desastre', 'Antes de qualquer <code>apply</code>, rode <code>aws sts get-caller-identity</code>. Aplicar na conta errada é o acidente mais comum e mais caro de IaC. Coloque a conta/projeto no seu prompt do shell.')}

<h2>O menor projeto que faz sentido</h2>
${code(`terraform/
├── main.tf         # os recursos
├── variables.tf    # entradas
├── outputs.tf      # saídas
├── providers.tf    # provider + versões
├── terraform.tfvars # valores (NÃO comite se tiver algo sensível)
└── .gitignore`, { lang: 'text', file: 'estrutura' })}

${code(`terraform {
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

  default_tags {
    tags = {
      Project   = "handbook"
      ManagedBy = "terraform"
    }
  }
}`, { file: 'providers.tf' })}

${code(`resource "aws_ecr_repository" "primeiro" {
  name                 = "handbook/minha-app"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}`, { file: 'main.tf' })}

${code(`terraform init      # baixa o provider, cria .terraform/
terraform fmt       # alinha o código
terraform validate  # checa sintaxe e referências
terraform plan      # o que vai acontecer?
terraform apply     # faz acontecer (digite "yes")
terraform destroy   # desfaz`, { lang: 'bash', file: 'o ciclo' })}

<h2>O .gitignore obrigatório</h2>
${code(`# Estes NUNCA vão para o Git
*.tfstate
*.tfstate.*
.terraform/
*.tfvars          # se contiver valores sensíveis
crash.log
override.tf

# Estes VÃO para o Git (importante!)
# .terraform.lock.hcl   -> trava a versão exata do provider
# *.tf
# terraform.tfvars.example`, { lang: 'bash', file: '.gitignore' })}

${warn('O erro clássico do dia 1', 'Comitar o <code>terraform.tfstate</code>. Ele contém senhas de banco, chaves e tokens <b>em texto claro</b>. Se já aconteceu, considere as credenciais vazadas e rotacione tudo — apagar o commit não basta.')}
`},

      {
        id: 'linguagem', title: 'A linguagem: HCL em 10 minutos',
        body: () => `
<span class="eyebrow">Fundamentos · 03</span>
<h1>HCL em 10 minutos</h1>
<p class="lede">HCL tem sete tipos de bloco. Sabendo os sete, você lê qualquer código Terraform do mundo.</p>

<h2>Os sete blocos</h2>
${code(`# 1. terraform — configura o próprio Terraform
terraform {
  required_version = "~> 1.9"
}

# 2. provider — configura um provedor de nuvem
provider "aws" {
  region = "us-east-1"
}

# 3. resource — CRIA algo. É o único que muda o mundo.
resource "aws_ecr_repository" "api" {
  name = "minha-api"
}

# 4. data — LÊ algo que já existe. Nunca cria.
data "aws_vpc" "default" {
  default = true
}

# 5. variable — entrada
variable "ambiente" {
  type    = string
  default = "prod"
}

# 6. output — saída
output "url" {
  value = aws_ecr_repository.api.repository_url
}

# 7. locals — valores calculados, internos ao módulo
locals {
  nome = "app-\${var.ambiente}"
}

# (bônus) module — chama outro conjunto de arquivos .tf
module "rede" {
  source = "./modules/vpc"
  cidr   = "10.0.0.0/16"
}`, { file: 'os sete blocos' })}

<h2>Como se referencia cada coisa</h2>
${table(['Bloco', 'Referência', 'Exemplo'],
          [['resource', '<code>TIPO.NOME.ATRIBUTO</code>', '<code>aws_ecr_repository.api.arn</code>'],
          ['data', '<code>data.TIPO.NOME.ATRIBUTO</code>', '<code>data.aws_vpc.default.id</code>'],
          ['variable', '<code>var.NOME</code>', '<code>var.ambiente</code>'],
          ['local', '<code>local.NOME</code>', '<code>local.nome</code>'],
          ['module', '<code>module.NOME.OUTPUT</code>', '<code>module.rede.vpc_id</code>'],
          ['each (for_each)', '<code>each.key</code> / <code>each.value</code>', '<code>each.value.port</code>'],
          ['count', '<code>count.index</code>', '<code>subnets[count.index]</code>']])}

${tip('A regra de ouro do IaC', 'Se você escreveu um ID (<code>vpc-0a1b2c3d</code>, <code>arn:aws:...</code>) na mão dentro de um <code>.tf</code>, quase sempre existe uma referência ou um <code>data source</code> melhor. IDs colados quebram quando o ambiente muda.')}

<h2>Tipos e estruturas</h2>
${code(`variable "porta"     { type = number }
variable "ativo"     { type = bool }
variable "nome"      { type = string }
variable "zonas"     { type = list(string) }
variable "tags"      { type = map(string) }
variable "portas"    { type = set(number) }

# Objeto: o tipo que deixa a interface do módulo explícita
variable "banco" {
  type = object({
    engine   = string
    tamanho  = number
    multi_az = optional(bool, false)   # optional() com default
  })
}

# Tupla: posições com tipos diferentes
variable "misto" {
  type = tuple([string, number, bool])
}`, { file: 'tipos' })}

<h2>Interpolação e heredoc</h2>
${code(`locals {
  # interpolação
  nome = "\${var.projeto}-\${var.ambiente}"

  # condicional (não existe if/else, existe ternário)
  tamanho = var.ambiente == "prod" ? "m6i.large" : "t3.micro"

  # texto multilinha; o traço em <<- remove a indentação
  script = <<-EOT
    #!/bin/bash
    echo "ambiente: \${var.ambiente}"
  EOT
}`, { file: 'expressões' })}

${warn('Interpolação desnecessária', 'Não escreva <code>name = "\${var.nome}"</code>. Escreva <code>name = var.nome</code>. O <code>terraform fmt</code> não corrige isso, mas o <code>tflint</code> reclama — e com razão.')}

<h2>Comentários que valem o commit</h2>
${code(`# Comentário de linha (o estilo preferido)
// Também funciona, mas ninguém usa
/* bloco */

resource "aws_lb_target_group" "app" {
  # Sem create_before_destroy o apply falha com
  # "target group is currently in use by a listener".
  lifecycle {
    create_before_destroy = true
  }
}`, { file: 'comentários' })}
<p>Comentário bom em IaC não explica <i>o que</i> o código faz — o código já diz. Explica <b>por que aquilo está ali</b>, normalmente uma pegadinha que custou uma tarde.</p>
`},

      {
        id: 'ciclo', title: 'init, plan, apply, destroy',
        body: () => `
<span class="eyebrow">Fundamentos · 04</span>
<h1>O ciclo de vida</h1>
<p class="lede">Quatro comandos. O terceiro muda o mundo; o segundo é o que evita que ele mude errado.</p>

<h2>terraform init</h2>
<p>Baixa os providers, configura o backend e cria o arquivo de lock. Roda de novo sempre que você mudar provider, backend ou módulo.</p>
${code(`terraform init
terraform init -upgrade                    # atualiza dentro da restrição de versão
terraform init -reconfigure                # troca de backend, ignorando o anterior
terraform init -backend-config=prod.hcl    # backend parametrizado por ambiente`, { lang: 'bash' })}

${info('.terraform.lock.hcl', '<p>É o <code>package-lock.json</code> do Terraform: trava o <b>hash exato</b> de cada provider. <b>Comite ele.</b> Sem isso, sua máquina usa o provider 5.68 e o CI usa o 5.72, e o plan sai diferente. Para adicionar outras plataformas (Linux no CI, Mac na sua máquina):</p>' + code('terraform providers lock \\\n  -platform=darwin_arm64 \\\n  -platform=linux_amd64', { lang: 'bash' }))}

<h2>terraform plan</h2>
<p>Compara código × state × realidade e imprime o diff. <b>Não muda nada.</b></p>
${code(`terraform plan
terraform plan -out=tfplan          # salva o plano — o jeito certo no CI
terraform plan -target=aws_lb.main  # só um recurso (emergência, não hábito)
terraform plan -var-file=prod.tfvars
terraform plan -refresh-only        # "o que mudou fora do Terraform?"`, { lang: 'bash' })}

<h3>Lendo os símbolos</h3>
${table(['Símbolo', 'Significado', 'Nível de atenção'],
          [['<code class="o-add">+</code>', 'criar', 'normal'],
          ['<code class="o-chg">~</code>', 'alterar no lugar, sem downtime', 'leia o campo alterado'],
          ['<code class="o-del">-</code>', 'destruir', '🚨 confira o que é'],
          ['<code>-/+</code>', '<b>destruir e recriar</b>', '🚨🚨 downtime; leia o motivo'],
          ['<code>+/-</code>', 'criar novo e depois destruir o velho', 'é o <code>create_before_destroy</code>'],
          ['<code>&lt;=</code>', 'ler um data source', 'inofensivo']])}

${danger('O que ler primeiro no plan', 'Vá direto para a <b>última linha</b>: <code>Plan: X to add, Y to change, Z to destroy</code>. Se <code>Z &gt; 0</code> e você não esperava destruir nada, <b>pare</b>. Depois procure por <code>forces replacement</code> — é ali que mora o downtime não planejado.')}

<h2>terraform apply</h2>
${code(`terraform apply                       # mostra o plan e pergunta "yes"
terraform apply tfplan                # aplica um plano salvo (não pergunta)
terraform apply -auto-approve         # sem perguntar — só em CI, nunca na sua mão
terraform apply -replace=aws_instance.web  # força recriar um recurso
terraform apply -refresh-only         # só reconcilia o state com a realidade`, { lang: 'bash' })}

${tip('O padrão de CI que funciona', 'No PR: <code>terraform plan -out=tfplan</code> e o resultado vira comentário no pull request. No merge: <code>terraform apply tfplan</code> — aplicando <b>exatamente</b> o plano que foi revisado. Sem isso, você aprova um plano e aplica outro.')}

<h2>terraform destroy</h2>
${code(`terraform destroy
terraform destroy -target=aws_instance.temp   # só uma coisa
terraform plan -destroy                        # veja antes de fazer`, { lang: 'bash' })}

${danger('Proteções que você deve ligar hoje', code(`resource "aws_db_instance" "main" {
  # 1. o Terraform se recusa a destruir
  lifecycle {
    prevent_destroy = true
  }

  # 2. a AWS se recusa a destruir
  deletion_protection = true

  # 3. se destruir mesmo assim, sobra um snapshot
  skip_final_snapshot       = false
  final_snapshot_identifier = "app-final"
}`))}

<h2>Ordem de execução: quem manda é o grafo</h2>
<p>O Terraform <b>ignora</b> a ordem dos arquivos e das linhas. Ele monta um grafo a partir das referências entre recursos e executa em paralelo tudo que não depende de nada (10 operações simultâneas por padrão).</p>
${code(`# Isto cria o VPC ANTES da subnet, mesmo que a subnet
# esteja escrita primeiro no arquivo — porque ela referencia o VPC.
resource "aws_subnet" "a" {
  vpc_id = aws_vpc.main.id   # <- a dependência nasce daqui
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

# Quando NÃO existe referência mas a ordem importa:
resource "aws_nat_gateway" "main" {
  # ...
  depends_on = [aws_internet_gateway.main]
}`, { file: 'dependências' })}
${info('Veja o grafo de verdade', 'Na aba <b>Diagrama</b> do laboratório, o grafo é montado exatamente assim: lendo as referências do código que você gerou. É a mesma coisa que <code>terraform graph | dot -Tsvg</code> faz.')}
`},

      {
        id: 'state', title: 'O state: o coração de tudo',
        body: () => `
<span class="eyebrow">Fundamentos · 05</span>
<h1>O state</h1>
<p class="lede">Todo problema difícil de Terraform é, no fundo, um problema de state. Vale a pena entender bem uma vez.</p>

<h2>Por que ele existe</h2>
<p>O Terraform precisa saber que o <code>aws_lb.public</code> do seu código <b>é</b> aquele ARN específico na AWS. Esse mapeamento nome-do-código → ID-real é o state. Sem ele, o Terraform não teria como saber se deve criar um recurso novo ou atualizar um existente.</p>
${code(`{
  "version": 4,
  "terraform_version": "1.9.8",
  "serial": 42,
  "lineage": "8f2a...",
  "resources": [
    {
      "mode": "managed",
      "type": "aws_ecr_repository",
      "name": "api",
      "instances": [
        {
          "attributes": {
            "id": "minha-app/api",
            "arn": "arn:aws:ecr:us-east-1:123456789012:repository/minha-app/api",
            "repository_url": "123456789012.dkr.ecr.us-east-1.amazonaws.com/minha-app/api"
          }
        }
      ]
    }
  ]
}`, { lang: 'json', file: 'terraform.tfstate (recortado)' })}

${danger('O state é um arquivo de segredos', '<p>Senha de RDS, valor de secret, chave privada de TLS — <b>tudo em texto claro</b>, mesmo que você tenha marcado <code>sensitive = true</code> (isso só esconde do output no terminal). Portanto:</p><ul><li>nunca no Git;</li><li>bucket com criptografia e acesso público bloqueado;</li><li>acesso ao bucket = acesso a produção. Trate como tal.</li></ul>')}

<h2>Backend remoto: o primeiro passo de qualquer time</h2>
${code(`terraform {
  backend "s3" {
    bucket         = "tfstate-minha-empresa"
    key            = "minha-app/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"   # o lock
    encrypt        = true
  }
}`, { file: 'AWS' })}
${code(`terraform {
  backend "gcs" {
    bucket = "tfstate-minha-empresa"
    prefix = "minha-app/prod"
    # sem tabela de lock: o GCS faz locking nativo
  }
}`, { file: 'GCP' })}

${warn('O ovo e a galinha', 'O bucket que guarda o state não pode ser gerenciado pelo state que ele guarda. Crie um projeto <code>bootstrap/</code> separado, rode uma vez com state local e comite o resultado. É a única vez que se aceita clicar no console — e mesmo assim dá para escrever em Terraform.')}

<h2>O lock, e por que ele importa</h2>
<p>Dois <code>apply</code> simultâneos no mesmo state = state corrompido, recursos duplicados, recursos órfãos. O lock evita isso.</p>
${code(`$ terraform apply
Error: Error acquiring the state lock

Lock Info:
  ID:        7e3f...
  Operation: OperationTypeApply
  Who:       maria@notebook
  Created:   2026-08-19 14:02:11`, { lang: 'text', file: 'quando dá certo' })}
${code(`# Só se você tem CERTEZA de que ninguém está aplicando
# (ex.: o CI morreu no meio e deixou o lock preso)
terraform force-unlock 7e3f...`, { lang: 'bash' })}

<h2>Comandos de state que você vai precisar</h2>
${code(`terraform state list                       # o que o Terraform conhece
terraform state show aws_lb.public         # detalhes de um recurso
terraform state pull > backup.tfstate      # BACKUP antes de qualquer cirurgia
terraform state rm aws_instance.antiga     # esquece o recurso (NÃO apaga na nuvem)
terraform state mv aws_lb.old aws_lb.new   # renomeia sem recriar
terraform state replace-provider ...       # troca de provider`, { lang: 'bash' })}

${tip('Antes de mexer no state', 'Sempre <code>terraform state pull > backup-$(date +%F).tfstate</code>. Cirurgia de state dá errado; backup é a diferença entre 5 minutos e uma madrugada.')}

<h2>Drift: quando alguém mexe no console</h2>
<p>É o caso mais comum de quem está migrando do ClickOps. Alguém entra no console durante um incidente e muda algo. Agora a nuvem discorda do código.</p>
${code(`# 1. Descubra o que mudou, sem aplicar nada
terraform plan -refresh-only

# 2a. Se a mudança manual foi ERRADA: deixe o código vencer
terraform apply

# 2b. Se a mudança manual foi CERTA: aceite no state
terraform apply -refresh-only
#     ...e depois traga a mudança para o código, senão ela volta a sumir

# 2c. Se aquele campo é gerenciado por fora DE PROPÓSITO:
#     lifecycle { ignore_changes = [desired_capacity] }`, { lang: 'bash' })}

${info('Experimente', 'No laboratório, clique em <b>🕵️ simular ClickOps</b> depois de um apply. Ele muda um atributo "pelo console" e o <code>plan</code> passa a mostrar o Terraform querendo desfazer. É o momento exato em que os dois mundos se encontram.')}

<h2>Um state ou vários?</h2>
${table(['Estratégia', 'Quando usar', 'Risco'],
          [['State único gigante', 'Nunca, depois de ~100 recursos', 'plan de 5 minutos; um erro afeta tudo'],
          ['Um state por ambiente', 'Sempre. Mínimo obrigatório.', 'nenhum'],
          ['Um state por camada<br>(rede / dados / app)', 'Times médios e grandes', 'precisa de <code>data</code> ou <code>remote_state</code> entre eles'],
          ['Um state por serviço', 'Times independentes', 'muita repetição de código base']])}
${code(`# Camada de aplicação lendo a saída da camada de rede
data "terraform_remote_state" "rede" {
  backend = "s3"

  config = {
    bucket = "tfstate-minha-empresa"
    key    = "rede/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_lb" "public" {
  subnets = data.terraform_remote_state.rede.outputs.public_subnet_ids
}`, { file: 'ligando camadas' })}
${warn('Alternativa mais desacoplada', 'Em vez de ler o state da outra camada (que exige acesso de leitura àquele state), procure o recurso por <b>tag</b> com um <code>data source</code>. Menos acoplamento, mais resiliente a refatoração.')}
`},

      {
        id: 'variaveis', title: 'Variáveis, locals, outputs e data',
        body: () => `
<span class="eyebrow">Fundamentos · 06</span>
<h1>Variáveis, locals, outputs e data sources</h1>
<p class="lede">Quatro peças que separam "um script que funciona" de "um módulo reutilizável".</p>

<h2>variable — a entrada</h2>
${code(`variable "instance_type" {
  type        = string
  description = "Tipo da instância EC2. Em prod, use ao menos m6i.large."
  default     = "t3.micro"

  validation {
    condition     = can(regex("^(t3|m6i)\\\\.", var.instance_type))
    error_message = "Só aceitamos famílias t3 e m6i por política de custo."
  }
}

variable "db_password" {
  type      = string
  sensitive = true   # some do output do plan (mas NÃO do state)
  nullable  = false
}

variable "config" {
  type = object({
    porta   = number
    replicas = optional(number, 2)
  })
}`, { file: 'variables.tf' })}

<h3>Precedência (quem ganha de quem)</h3>
${table(['Ordem', 'Origem', 'Observação'],
          [['1 (menor)', '<code>default</code> no bloco', 'o fallback'],
          ['2', 'variáveis de ambiente <code>TF_VAR_nome</code>', 'útil no CI'],
          ['3', '<code>terraform.tfvars</code>', 'carregado automaticamente'],
          ['4', '<code>*.auto.tfvars</code> (ordem alfabética)', 'carregado automaticamente'],
          ['5 (maior)', '<code>-var</code> e <code>-var-file</code> na linha de comando', 'ganha de todos']])}

${warn('sensitive não é criptografia', '<code>sensitive = true</code> só troca o valor por <code>(sensitive value)</code> na saída do terminal. No <code>terraform.tfstate</code> continua em texto puro. Segredo de verdade: Secrets Manager / Secret Manager, injetado em runtime.')}

<h2>locals — o cálculo interno</h2>
${code(`locals {
  name = "\${var.projeto}-\${var.ambiente}"

  tags = {
    Project     = var.projeto
    Environment = var.ambiente
    ManagedBy   = "terraform"
  }

  # decisões por ambiente ficam em UM lugar só
  is_prod  = var.ambiente == "prod"
  min_size = local.is_prod ? 3 : 1
  multi_az = local.is_prod

  # transformação de dados
  subnet_ids = [for s in aws_subnet.private : s.id]
}`, { file: 'locals.tf' })}
${info('variable × local', '<b>variable</b> é o que quem usa o módulo pode mudar. <b>local</b> é o que você calcula internamente e ninguém de fora precisa saber. Se está com dúvida: comece como local; promova a variable quando alguém precisar mudar.')}

<h2>output — a saída</h2>
${code(`output "alb_dns_name" {
  description = "DNS do load balancer — aponte seu CNAME para cá"
  value       = aws_lb.public.dns_name
}

output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

# Output com dependência explícita: só fica pronto depois do listener
output "url" {
  value      = "https://\${aws_lb.public.dns_name}"
  depends_on = [aws_lb_listener.https]
}`, { file: 'outputs.tf' })}
${code(`terraform output                      # todos
terraform output alb_dns_name         # um
terraform output -raw alb_dns_name    # sem aspas — para usar em script
terraform output -json | jq .`, { lang: 'bash' })}

<h2>data — lendo o que já existe</h2>
<p>Data source <b>nunca cria nada</b>. Ele consulta. É a ponte entre o que o Terraform gerencia e o que já estava lá.</p>
${code(`# Quem sou eu? (conta, região)
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# AMI mais recente do Amazon Linux, mantida pela AWS
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
}

# Achar recursos por TAG — melhor que colar ID
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["prod-vpc"]
  }
}

# Política IAM: valida no plan, diferente de jsonencode
data "aws_iam_policy_document" "app" {
  statement {
    sid       = "LerSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

# Zonas disponíveis de verdade nesta conta/região
data "aws_availability_zones" "available" {
  state = "available"
}`, { file: 'data sources úteis' })}

${tip('O data source que mais rende', '<code>aws_iam_policy_document</code>. Ele valida a estrutura da policy durante o <code>plan</code>, permite compor documentos (<code>source_policy_documents</code>) e evita o inferno de escapar JSON dentro de HCL.')}
`},

      {
        id: 'meta', title: 'count, for_each, dynamic e lifecycle',
        body: () => `
<span class="eyebrow">Fundamentos · 07</span>
<h1>Meta-argumentos</h1>
<p class="lede">Os argumentos que existem em <b>todo</b> recurso e mudam como ele é criado. Aqui mora a diferença entre código que escala e código que dá dor de cabeça.</p>

<h2>count — repetir por número</h2>
${code(`resource "aws_subnet" "private" {
  count = 3

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = local.azs[count.index]
}

# Referenciando
aws_subnet.private[0].id       # uma
aws_subnet.private[*].id       # todas (splat)

# count como "if": 0 ou 1 recurso
resource "aws_nat_gateway" "main" {
  count = var.criar_nat ? 1 : 0
}`, { file: 'count' })}

${danger('A armadilha do count', '<p>O índice é <b>posicional</b>. Se você tem 3 buckets e remove o do meio, o Terraform não remove o do meio — ele <b>renomeia o terceiro para a posição 2 e destrói o terceiro</b>:</p>' + code(`# antes: ["a", "b", "c"]  ->  depois: ["a", "c"]
# aws_s3_bucket.x[1]  "b" -> "c"   ~ altera (na verdade recria!)
# aws_s3_bucket.x[2]  "c" -> null  - destrói`, { lang: 'text' }) + '<p>Para listas que mudam, use <b>for_each</b>.</p>')}

<h2>for_each — repetir por chave</h2>
${code(`resource "aws_ecr_repository" "repos" {
  for_each = toset(["api", "worker", "cron"])

  name = "\${var.projeto}/\${each.value}"
}
# Endereço estável: aws_ecr_repository.repos["api"]
# Remover "worker" NÃO mexe em "api" nem em "cron".

# Com mapa: chave + configuração
resource "aws_lb_target_group" "tgs" {
  for_each = {
    api    = { port = 8080, path = "/health" }
    admin  = { port = 9000, path = "/healthz" }
  }

  name     = "tg-\${each.key}"
  port     = each.value.port
  vpc_id   = aws_vpc.main.id

  health_check {
    path = each.value.path
  }
}`, { file: 'for_each' })}

${table(['', 'count', 'for_each'],
          [['Endereço', '<code>[0]</code>, <code>[1]</code> — posicional', '<code>["api"]</code> — nominal'],
          ['Remover do meio', '🚨 recria os seguintes', '✅ não afeta os outros'],
          ['Aceita', 'número', '<code>set</code> ou <code>map</code>'],
          ['Bom para', 'N cópias idênticas (subnets por AZ)', 'coisas nomeadas (repos, buckets, TGs)'],
          ['Regra prática', 'só quando é realmente "N vezes o mesmo"', '<b>o padrão</b>']])}

${warn('O erro do for_each', '<code>Invalid for_each argument: the given "for_each" argument value is unsuitable</code> significa que a chave depende de algo que só existe depois do apply. Chave de <code>for_each</code> precisa ser conhecida no <b>plan</b>. Solução: use valores estáticos/variáveis como chave, nunca <code>.id</code> ou <code>.arn</code> de outro recurso.')}

<h2>dynamic — blocos repetidos</h2>
${code(`variable "regras" {
  type = list(object({
    porta  = number
    origem = string
  }))
  default = [
    { porta = 80,  origem = "0.0.0.0/0" },
    { porta = 443, origem = "0.0.0.0/0" },
  ]
}

resource "aws_security_group" "web" {
  name   = "web"
  vpc_id = aws_vpc.main.id

  dynamic "ingress" {
    for_each = var.regras

    content {
      from_port   = ingress.value.porta
      to_port     = ingress.value.porta
      protocol    = "tcp"
      cidr_blocks = [ingress.value.origem]
    }
  }
}`, { file: 'dynamic' })}
${tip('Use com moderação', '<code>dynamic</code> deixa o código bem mais difícil de ler. Se são 2 ou 3 blocos fixos, escreva os 3. Use <code>dynamic</code> quando a quantidade realmente vem de fora.')}

<h2>lifecycle — as quatro travas</h2>
${code(`resource "aws_lb_target_group" "app" {
  lifecycle {
    # 1. cria o novo ANTES de destruir o velho (evita "in use")
    create_before_destroy = true

    # 2. o Terraform se recusa a destruir este recurso
    prevent_destroy = true

    # 3. ignora mudanças nestes campos (gerenciados por fora)
    ignore_changes = [
      desired_capacity,
      tags["LastDeploy"],
    ]

    # 4. força recriação quando OUTRA coisa muda
    replace_triggered_by = [aws_launch_template.app.id]
  }
}`, { file: 'lifecycle' })}

${table(['Trava', 'Use quando', 'Exemplo típico'],
          [['<code>create_before_destroy</code>', 'o recurso está "em uso" por outro', 'target group, launch template, SG'],
          ['<code>prevent_destroy</code>', 'perder aquilo é irreversível', 'RDS, bucket de state, bucket de dados'],
          ['<code>ignore_changes</code>', 'algo legítimo muda por fora', '<code>desired_capacity</code>, valor de secret, tag de deploy'],
          ['<code>replace_triggered_by</code>', 'dependência que não é referência direta', 'recriar instância quando o template muda']])}

${danger('prevent_destroy tem um efeito colateral', 'Com ele ligado, <code>terraform destroy</code> do stack inteiro <b>falha</b>. Isso é o objetivo — mas em ambientes efêmeros (dev, preview) deixe desligado por variável, senão a limpeza automática nunca funciona.')}

<h2>provider alias — múltiplas regiões/contas</h2>
${code(`provider "aws" {
  region = "us-east-1"
}

provider "aws" {
  alias  = "sp"
  region = "sa-east-1"
}

provider "aws" {
  alias  = "prod"
  region = "us-east-1"

  assume_role {
    role_arn = "arn:aws:iam::999988887777:role/TerraformAdmin"
  }
}

# Certificado do CloudFront TEM que estar em us-east-1
resource "aws_acm_certificate" "cdn" {
  provider    = aws.us_east_1
  domain_name = "app.exemplo.com.br"
}

# Módulo recebendo providers explicitamente
module "replica" {
  source = "./modules/app"

  providers = {
    aws = aws.sp
  }
}`, { file: 'provider alias' })}
`}

    ]
  });
})(window.IAC);

/* ---- fundamentos (2): expressões, módulos, ambientes, import, CI/CD ---- */
(function (IAC) {
  'use strict';
  const code = IAC.code, tip = IAC.tip, warn = IAC.warn, danger = IAC.danger,
    info = IAC.info, table = IAC.table;
  const sec = IAC.sections.filter(s => s.id === 'fund')[0];
  function add(pages) {
    pages.forEach(p => { p.section = sec; sec.pages.push(p); IAC.pageIndex['fund/' + p.id] = p; });
  }

  add([
    {
      id: 'expressoes', title: 'Expressões e funções',
      body: () => `
<span class="eyebrow">Fundamentos · 08</span>
<h1>Expressões e funções</h1>
<p class="lede">HCL não é uma linguagem de programação, mas tem o suficiente para você não repetir código. Estas são as construções que aparecem em 95% dos projetos reais.</p>

<h2>for — transformar coleções</h2>
${code(`locals {
  # lista -> lista
  nomes_maiusculos = [for n in var.nomes : upper(n)]

  # lista -> mapa
  por_nome = { for s in aws_subnet.private : s.availability_zone => s.id }

  # com filtro
  publicas = [for s in var.subnets : s.id if s.publica]

  # mapa -> mapa (transformando valor)
  tags_prefixadas = { for k, v in var.tags : "app:\${k}" => v }

  # achatando
  todas_portas = flatten([for svc in var.servicos : svc.portas])
}`, { file: 'for' })}

<h2>As funções que você realmente vai usar</h2>
${table(['Função', 'Para quê', 'Exemplo'],
        [['<code>merge()</code>', 'juntar mapas (tags!)', '<code>merge(local.tags, { Name = "app" })</code>'],
        ['<code>lookup()</code>', 'valor com fallback', '<code>lookup(var.mapa, "chave", "padrao")</code>'],
        ['<code>try()</code>', 'tenta em ordem, ignora erro', '<code>try(var.x.y, "padrao")</code>'],
        ['<code>coalesce()</code>', 'primeiro não-nulo', '<code>coalesce(var.nome, local.nome)</code>'],
        ['<code>cidrsubnet()</code>', 'fatiar CIDR', '<code>cidrsubnet("10.0.0.0/16", 8, 1)</code> → <code>10.0.1.0/24</code>'],
        ['<code>jsonencode()</code>', 'HCL → JSON', 'policies, container definitions'],
        ['<code>templatefile()</code>', 'arquivo com variáveis', 'user_data, cloud-init'],
        ['<code>base64encode()</code>', 'user_data exige', '<code>base64encode(local.script)</code>'],
        ['<code>toset()</code>', 'lista → conjunto', 'obrigatório em <code>for_each</code> com lista'],
        ['<code>slice()</code>', 'recortar lista', '<code>slice(data.aws_availability_zones.available.names, 0, 2)</code>'],
        ['<code>can()</code>', 'testa sem quebrar', 'usado em <code>validation</code>'],
        ['<code>file()</code>', 'ler arquivo', '<code>file("\${path.module}/script.sh")</code>'],
        ['<code>regex()</code> / <code>replace()</code>', 'texto', 'normalizar nomes'],
        ['<code>one()</code>', 'lista de 0/1 → valor', 'com <code>count</code> condicional']])}

<h2>templatefile — o jeito certo de gerar scripts</h2>
${code(`resource "aws_launch_template" "app" {
  user_data = base64encode(templatefile("\${path.module}/user_data.sh.tftpl", {
    ecr_url   = aws_ecr_repository.api.repository_url
    secret_id = aws_secretsmanager_secret.app.name
    region    = var.region
  }))
}`, { file: 'main.tf' })}
${code(`#!/bin/bash
set -euxo pipefail

REGION="\${region}"
aws ecr get-login-password --region "$REGION" \\
  | docker login --username AWS --password-stdin "\${ecr_url%%/*}"

docker run -d --restart=always "\${ecr_url}:latest"

# Dentro do template, %{ if } e %{ for } também funcionam:
%{ if enable_debug ~}
export LOG_LEVEL=debug
%{ endif ~}`, { lang: 'bash', file: 'user_data.sh.tftpl' })}
${warn('Cuidado com o cifrão', 'Dentro de um <code>.tftpl</code>, <code>\${...}</code> é do Terraform e <code>$${...}</code> escapa para virar um <code>\${...}</code> literal do shell. Misturar os dois sem perceber é fonte constante de "por que meu script não funciona na instância".')}

<h2>Referências especiais</h2>
${code(`path.module      # diretório deste módulo
path.root        # diretório raiz da execução
path.cwd         # diretório atual
terraform.workspace  # nome do workspace atual

# Padrão comum
locals {
  ambiente = terraform.workspace == "default" ? "dev" : terraform.workspace
}`, { file: 'referências' })}

<h2>Condicionais na prática</h2>
${code(`locals {
  is_prod = var.ambiente == "prod"
}

resource "aws_db_instance" "main" {
  instance_class          = local.is_prod ? "db.m6g.large" : "db.t4g.micro"
  multi_az                = local.is_prod
  backup_retention_period = local.is_prod ? 30 : 1
  deletion_protection     = local.is_prod
  skip_final_snapshot     = !local.is_prod
}

# Recurso condicional
resource "aws_cloudfront_distribution" "cdn" {
  count = local.is_prod ? 1 : 0
}

# Referenciando um recurso condicional com segurança
output "cdn_domain" {
  value = try(aws_cloudfront_distribution.cdn[0].domain_name, null)
}`, { file: 'condicionais' })}
${tip('Concentre as decisões', 'Todos os <code>is_prod ? x : y</code> em <code>locals</code>, nunca espalhados pelos recursos. Quando alguém perguntar "o que muda entre dev e prod?", a resposta é um bloco de 10 linhas.')}
`},

    {
      id: 'modulos', title: 'Módulos',
      body: () => `
<span class="eyebrow">Fundamentos · 09</span>
<h1>Módulos</h1>
<p class="lede">Módulo é uma pasta com arquivos <code>.tf</code>. Só isso. A dificuldade não é criar — é decidir <b>quando</b> criar.</p>

<h2>Anatomia</h2>
${code(`modules/servico-web/
├── main.tf        # os recursos
├── variables.tf   # a interface de entrada
├── outputs.tf     # a interface de saída
├── versions.tf    # required_providers
└── README.md      # como usar (gere com terraform-docs)`, { lang: 'text' })}

${code(`module "api" {
  source = "./modules/servico-web"

  nome           = "api"
  vpc_id         = aws_vpc.main.id
  subnet_ids     = aws_subnet.private[*].id
  container_port = 8080
  min_size       = 2
  max_size       = 10

  tags = local.tags
}

# Usando as saídas
output "api_url" {
  value = module.api.url
}`, { file: 'uso' })}

<h2>Origens (source)</h2>
${code(`# Local — o mais comum e o mais fácil de depurar
source = "./modules/vpc"

# Registry público (sempre trave a versão!)
source  = "terraform-aws-modules/vpc/aws"
version = "~> 5.13"

# Git com tag — o padrão para módulos internos da empresa
source = "git::ssh://git@github.com/minha-empresa/tf-modules.git//vpc?ref=v1.4.2"

# Subdiretório de um repositório
source = "github.com/org/repo//modules/vpc?ref=v2.0.0"`, { lang: 'text', file: 'source' })}

${danger('Sempre trave a versão', 'Sem <code>version</code> (ou <code>?ref=</code>), o <code>terraform init -upgrade</code> pode puxar uma versão nova do módulo e o próximo plan querer destruir metade da sua infra. Módulo sem versão travada é bomba-relógio.')}

<h2>Quando criar um módulo — e quando não criar</h2>
${table(['Situação', 'Veredito'],
        [['Você vai usar isso em 3+ lugares', '✅ crie o módulo'],
        ['Você quer padronizar (todo ALB da empresa igual)', '✅ crie o módulo'],
        ['É a segunda vez que você copia e cola', '🤔 espere a terceira'],
        ['Só para "organizar" arquivos', '❌ use vários <code>.tf</code> na mesma pasta'],
        ['Módulo que só envelopa 1 recurso', '❌ abstração sem ganho — chamada de "wrapper module"'],
        ['Módulo com 40 variáveis', '❌ virou configuração; quebre em módulos menores']])}

${info('A regra prática', 'Um módulo deve ser <b>uma decisão de arquitetura</b>, não um agrupamento de recursos. "Serviço web com ALB, ASG e autoscaling" é um módulo. "Um security group" não é.')}

<h2>Módulos públicos: usar ou não?</h2>
<p>O <code>terraform-aws-modules/vpc/aws</code> tem mais de 3 mil linhas e cobre casos que você nunca vai usar. Vantagens e custos:</p>
${table(['A favor', 'Contra'],
        [['Cobre casos de borda que você não pensou', 'Você não entende o que ele cria'],
        ['Mantido e testado pela comunidade', 'Atualizações podem forçar recriação'],
        ['Economiza semanas em VPC/EKS', 'Debugar erro dentro do módulo é doloroso'],
        ['Boas práticas embutidas', 'Dependência de terceiro no seu caminho crítico']])}
${tip('Meio-termo pragmático', 'Use módulos públicos para coisas <b>complexas e padronizadas</b> (VPC, EKS). Escreva os seus para coisas <b>específicas do seu negócio</b> (o "serviço web padrão da empresa"). E leia o código do módulo público antes — é o mínimo de diligência.')}

<h2>Interface bem desenhada</h2>
${code(`# ❌ Ruim: variável frouxa, sem descrição, sem tipo
variable "config" {}

# ✅ Bom: tipo explícito, descrição útil, default sensato
variable "escala" {
  description = "Limites de escala do serviço. min nunca deve ser 1 em produção."

  type = object({
    min      = number
    max      = number
    cpu_alvo = optional(number, 60)
  })

  default = {
    min = 2
    max = 6
  }

  validation {
    condition     = var.escala.min <= var.escala.max
    error_message = "min precisa ser menor ou igual a max."
  }
}`, { file: 'interface' })}

<h2>Documentação automática</h2>
${code(`# gera a tabela de inputs/outputs direto no README.md
terraform-docs markdown table --output-file README.md .

# no pre-commit, para nunca ficar desatualizado
- repo: https://github.com/antonbabenko/pre-commit-terraform
  hooks:
    - id: terraform_docs`, { lang: 'bash' })}
`},

    {
      id: 'ambientes', title: 'Ambientes: dev, staging, prod',
      body: () => `
<span class="eyebrow">Fundamentos · 10</span>
<h1>Ambientes</h1>
<p class="lede">A pergunta que todo time faz na segunda semana: como ter dev, staging e produção sem duplicar tudo — e sem aplicar em prod achando que era dev?</p>

<h2>Opção 1 — Diretórios por ambiente (recomendado)</h2>
${code(`infra/
├── modules/
│   ├── rede/
│   └── servico-web/
└── ambientes/
    ├── dev/
    │   ├── main.tf          # chama os módulos
    │   ├── terraform.tfvars # valores do dev
    │   └── backend.tf       # state do dev
    ├── stg/
    └── prod/`, { lang: 'text' })}
${code(`# ambientes/prod/main.tf
module "rede" {
  source = "../../modules/rede"

  cidr = "10.0.0.0/16"
  azs  = 3
  nat  = "per-az"
}

module "api" {
  source = "../../modules/servico-web"

  nome     = "api"
  vpc_id   = module.rede.vpc_id
  min_size = 3
  max_size = 20
  classe   = "m6i.large"
}`, { file: 'prod/main.tf' })}
${table(['A favor', 'Contra'],
        [['Cada ambiente tem state e backend próprios', 'Alguma duplicação de código de chamada'],
        ['Diferenças reais ficam <b>explícitas</b>', ''],
        ['Impossível aplicar em prod por engano no dev', ''],
        ['Permissões diferentes por diretório no CI', '']])}

<h2>Opção 2 — Workspaces</h2>
${code(`terraform workspace new dev
terraform workspace new prod
terraform workspace select prod
terraform workspace list`, { lang: 'bash' })}
${code(`locals {
  config = {
    dev  = { min = 1, max = 2,  classe = "t3.micro" }
    prod = { min = 3, max = 20, classe = "m6i.large" }
  }

  atual = local.config[terraform.workspace]
}

resource "aws_autoscaling_group" "app" {
  min_size = local.atual.min
  max_size = local.atual.max
}`, { file: 'workspace' })}
${danger('Por que a maioria dos times abandona workspaces', '<ul><li>Mesmo código para todos os ambientes — quando prod precisa de algo que dev não tem, vira uma floresta de <code>count = terraform.workspace == "prod" ? 1 : 0</code>.</li><li><code>terraform workspace select</code> errado + <code>apply</code> = incidente. Não existe barreira.</li><li>Todos os states no mesmo bucket/prefixo: quem pode aplicar em dev normalmente pode ler o state de prod.</li></ul><p>Workspaces são ótimos para <b>ambientes efêmeros e idênticos</b> (um por pull request, por exemplo). Para dev/stg/prod, use diretórios.</p>')}

<h2>Opção 3 — Terragrunt</h2>
${code(`# ambientes/prod/api/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "git::git@github.com:org/modules.git//servico-web?ref=v1.4.0"
}

inputs = {
  nome     = "api"
  min_size = 3
}`, { file: 'terragrunt.hcl' })}
<p>Terragrunt gera o backend automaticamente por diretório, resolve dependências entre stacks e aplica vários módulos em ordem. Vale a partir de ~10 stacks; abaixo disso é uma ferramenta a mais para o time aprender.</p>

<h2>Independente da opção: separe as contas</h2>
${info('Isolamento de verdade', '<p>Ambiente separado por <b>tag</b> na mesma conta não é isolamento. Um erro de IAM em dev alcança prod. O padrão maduro:</p><ul><li><b>AWS:</b> uma conta por ambiente, sob AWS Organizations, com o Terraform assumindo role via <code>assume_role</code>.</li><li><b>GCP:</b> um projeto por ambiente, dentro de uma pasta por sistema.</li></ul><p>O custo disso é quase zero e o ganho é enorme — inclusive para descobrir quanto cada ambiente custa.</p>')}
`},

    {
      id: 'import', title: 'Adotando o que já existe',
      body: () => `
<span class="eyebrow">Fundamentos · 11</span>
<h1>Adotando infraestrutura que já existe</h1>
<p class="lede">Este é o capítulo mais importante para quem tem tudo criado no console. Você <b>não</b> precisa apagar nada para começar a usar Terraform.</p>

<h2>A estratégia: adote por camadas, não tudo de uma vez</h2>
<ol>
<li><b>Comece pelo novo.</b> A próxima coisa que você for criar, crie em Terraform. Zero risco.</li>
<li><b>Depois o periférico.</b> ECR, buckets, log groups, secrets — coisas cuja recriação não derruba nada.</li>
<li><b>Depois o estável.</b> VPC, security groups, IAM.</li>
<li><b>Por último o crítico.</b> Banco, load balancer. Só quando você já confia no processo.</li>
</ol>
${warn('Nunca faça', 'Escrever o Terraform do zero e dar <code>apply</code> em cima de infra existente sem importar. Você vai criar recursos duplicados — ou pior, o Terraform vai tentar criar algo com nome já usado, falhar no meio e deixar o ambiente inconsistente.')}

<h2>Jeito moderno: bloco import (Terraform 1.5+)</h2>
${code(`# 1. Declare a intenção de importar
import {
  to = aws_ecr_repository.api
  id = "minha-app/api"
}

# 2. Peça para o Terraform GERAR o código para você
#    terraform plan -generate-config-out=gerado.tf

# 3. Revise o gerado.tf, limpe o que for computado, mova para o lugar certo
# 4. terraform apply  -> importa de verdade
# 5. Apague o bloco import (ele já cumpriu o papel)`, { file: 'import.tf' })}
${code(`terraform plan -generate-config-out=gerado.tf
terraform apply`, { lang: 'bash' })}
${tip('Por que o bloco é melhor que o comando', 'Ele é <b>declarativo e versionado</b>: entra no pull request, é revisado e roda no CI igual a qualquer outra mudança. O comando <code>terraform import</code> é imperativo e some do histórico.')}

<h2>Jeito clássico: comando import</h2>
${code(`# 1. Escreva o bloco (pode ser mínimo)
# resource "aws_ecr_repository" "api" {
#   name = "minha-app/api"
# }

terraform import aws_ecr_repository.api minha-app/api
terraform plan   # ajuste o código até o plan ficar VAZIO`, { lang: 'bash' })}

<h3>IDs de import mais usados</h3>
${table(['Recurso', 'ID do import'],
        [['<code>aws_ecr_repository</code>', 'nome do repositório'],
        ['<code>aws_s3_bucket</code>', 'nome do bucket'],
        ['<code>aws_vpc</code> / <code>aws_subnet</code>', '<code>vpc-0a1b…</code> / <code>subnet-0a1b…</code>'],
        ['<code>aws_security_group</code>', '<code>sg-0a1b…</code>'],
        ['<code>aws_lb</code> / <code>aws_lb_target_group</code>', 'o ARN completo'],
        ['<code>aws_iam_role</code>', 'nome da role'],
        ['<code>aws_secretsmanager_secret</code>', 'o ARN'],
        ['<code>aws_autoscaling_group</code>', 'nome do ASG'],
        ['<code>google_compute_network</code>', '<code>projeto/nome</code>'],
        ['<code>google_cloud_run_v2_service</code>', '<code>projeto/regiao/nome</code>']])}

${info('Ferramenta que acelera muito', '<b>Terraformer</b> (Google) e <b>former2</b> geram código + state a partir de uma conta existente. O código sai feio e precisa de faxina, mas para adotar 200 recursos é a diferença entre uma semana e uma tarde.')}

<h2>moved — renomear sem recriar</h2>
${code(`# Você quer renomear aws_instance.web para aws_instance.api.
# Sem isso, o Terraform DESTRÓI a web e CRIA a api.

moved {
  from = aws_instance.web
  to   = aws_instance.api
}

# Também funciona ao extrair recursos para um módulo:
moved {
  from = aws_lb.public
  to   = module.rede.aws_lb.public
}

# E ao migrar de count para for_each:
moved {
  from = aws_subnet.private[0]
  to   = aws_subnet.private["us-east-1a"]
}`, { file: 'moved.tf' })}
${tip('Deixe o bloco moved por um ciclo', 'Depois que todos os ambientes aplicaram, você pode remover. Se apagar cedo demais, quem ainda não aplicou vai ver um destroy/create.')}

<h2>removed — parar de gerenciar sem destruir</h2>
${code(`# Terraform 1.7+: tira do state e NÃO destrói na nuvem.
removed {
  from = aws_instance.legado

  lifecycle {
    destroy = false
  }
}`, { file: 'removed.tf' })}
<p>Antes da 1.7 isso era <code>terraform state rm</code> — imperativo e sem rastro no PR.</p>

<h2>Como saber se deu certo</h2>
${code(`terraform plan
# O objetivo é este:
# No changes. Your infrastructure matches the configuration.`, { lang: 'bash' })}
${danger('Plan limpo é o único critério', 'Enquanto o plan quiser mudar algo depois de um import, ou o seu código está diferente da realidade, ou você importou o recurso errado. Não aplique "para ver o que acontece" — leia o diff e ajuste o código.')}
`},

    {
      id: 'boas-praticas', title: 'Boas práticas e estrutura de repositório',
      body: () => `
<span class="eyebrow">Fundamentos · 12</span>
<h1>Boas práticas</h1>
<p class="lede">O que separa um repositório que o time inteiro usa de um que só uma pessoa entende.</p>

<h2>Estrutura de repositório</h2>
${code(`infra/
├── .github/workflows/terraform.yml
├── .pre-commit-config.yaml
├── .tflint.hcl
├── modules/
│   ├── rede/
│   ├── servico-web/
│   └── observabilidade/
├── ambientes/
│   ├── dev/
│   ├── stg/
│   └── prod/
└── bootstrap/          # bucket de state + tabela de lock
    └── main.tf`, { lang: 'text' })}

<h2>Dentro de cada diretório</h2>
${table(['Arquivo', 'Conteúdo'],
        [['<code>versions.tf</code>', '<code>required_version</code> + <code>required_providers</code>'],
        ['<code>providers.tf</code>', 'blocos <code>provider</code> e aliases'],
        ['<code>backend.tf</code>', 'configuração do state'],
        ['<code>variables.tf</code>', 'todas as <code>variable</code>'],
        ['<code>locals.tf</code>', 'cálculos e decisões por ambiente'],
        ['<code>main.tf</code>', 'os recursos (ou quebre por domínio: <code>rede.tf</code>, <code>alb.tf</code>…)'],
        ['<code>outputs.tf</code>', 'todas as <code>output</code>'],
        ['<code>terraform.tfvars</code>', 'valores daquele ambiente']])}

<h2>Nomes</h2>
${code(`# ✅ snake_case, substantivo, sem repetir o tipo
resource "aws_lb_target_group" "api" {}
resource "aws_security_group" "alb" {}

# ❌ redundante e inconsistente
resource "aws_lb_target_group" "apiTargetGroup" {}
resource "aws_security_group" "sg-alb-prod-1" {}

# Quando só existe um do tipo, "main" ou "this" é convenção aceita
resource "aws_vpc" "main" {}`, { file: 'nomenclatura' })}
${tip('Nome de recurso vs nome na nuvem', 'O rótulo do bloco (<code>"api"</code>) é interno ao Terraform e serve para <b>referenciar</b>. O <code>name</code> dentro do bloco é o que aparece na nuvem — e nele você inclui projeto e ambiente: <code>name = "\${local.name}-api"</code>.')}

<h2>Tags: a decisão que o financeiro agradece</h2>
${code(`provider "aws" {
  default_tags {
    tags = {
      Project     = var.projeto
      Environment = var.ambiente
      ManagedBy   = "terraform"
      Repository  = "github.com/org/infra"
      CostCenter  = var.centro_custo
    }
  }
}`, { file: 'default_tags' })}
${warn('Onde default_tags NÃO chega', 'Instâncias criadas por Auto Scaling Group (precisa do bloco <code>tag</code> com <code>propagate_at_launch</code>) e alguns recursos que simplesmente não aceitam tag. No GCP, o equivalente é <code>default_labels</code> — e labels só aceitam minúsculas.')}

<h2>Ferramentas que valem o setup</h2>
${table(['Ferramenta', 'O que faz', 'Vale a pena?'],
        [['<code>terraform fmt</code>', 'formata', '✅ obrigatório, é nativo'],
        ['<code>terraform validate</code>', 'sintaxe e referências', '✅ obrigatório'],
        ['<b>tflint</b>', 'lint com regras de provider (tipo de instância inválido, etc.)', '✅ pega erro antes do apply'],
        ['<b>trivy</b> / <b>tfsec</b>', 'segurança (SG aberto, bucket público…)', '✅ no CI'],
        ['<b>checkov</b>', 'compliance com políticas', '✅ se você tem requisito regulatório'],
        ['<b>terraform-docs</b>', 'README automático dos módulos', '✅ barato'],
        ['<b>infracost</b>', 'custo estimado no PR', '✅ muda conversa com o financeiro'],
        ['<b>pre-commit</b>', 'roda tudo isso antes do commit', '✅ economiza rodada de CI'],
        ['<b>OPA / Sentinel</b>', 'políticas como código', '🤔 empresas grandes']])}

${code(`repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.96.1
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
      - id: terraform_tflint
      - id: terraform_trivy
      - id: terraform_docs`, { lang: 'yaml', file: '.pre-commit-config.yaml' })}

<h2>Regras que evitam 90% dos incidentes</h2>
<ul>
<li><b>Nunca</b> <code>apply</code> direto na sua máquina em produção. Produção se muda por merge.</li>
<li><b>Sempre</b> leia a última linha do plan antes do yes.</li>
<li><b>Sempre</b> <code>prevent_destroy</code> em banco e bucket de dados.</li>
<li><b>Nunca</b> segredo em <code>.tf</code> ou <code>.tfvars</code> comitado.</li>
<li><b>Sempre</b> versão travada de provider e de módulo.</li>
<li><b>Nunca</b> <code>-target</code> como hábito — ele mascara problemas de dependência.</li>
<li><b>Sempre</b> um state por ambiente, no mínimo.</li>
<li>Se o plan tem 200 mudanças e você só esperava 2: <b>pare e investigue</b>.</li>
</ul>
`},

    {
      id: 'cicd', title: 'CI/CD: plan no PR, apply no merge',
      body: () => `
<span class="eyebrow">Fundamentos · 13</span>
<h1>CI/CD</h1>
<p class="lede">O objetivo: ninguém tem credencial de produção na máquina. A infraestrutura muda por pull request revisado, como código de aplicação.</p>

<h2>O fluxo</h2>
${code(`Pull Request aberto
   └─> terraform fmt -check
   └─> terraform init
   └─> terraform validate
   └─> tflint + trivy
   └─> terraform plan -out=tfplan
   └─> comenta o plan no PR
   └─> infracost comenta o custo

Review humano  ->  Merge

Merge na main
   └─> terraform apply tfplan   (exatamente o plano revisado)`, { lang: 'text' })}

<h2>GitHub Actions com OIDC (sem chave de acesso)</h2>
${code(`name: terraform

on:
  pull_request:
  push:
    branches: [main]

permissions:
  id-token: write      # necessário para OIDC
  contents: read
  pull-requests: write

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ambientes/prod

    steps:
      - uses: actions/checkout@v4

      # Sem chave: o GitHub troca um token OIDC por credencial temporária
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsTerraform
          aws-region: us-east-1

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.9.8

      - run: terraform fmt -check -recursive
      - run: terraform init
      - run: terraform validate

      - name: Plan
        id: plan
        run: terraform plan -out=tfplan -no-color
        continue-on-error: true

      - name: Comentar plano no PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const out = \\\`\\\`\\\`\\\`terraform\\n\\\${{ steps.plan.outputs.stdout }}\\n\\\`\\\`\\\`\\\`
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: out
            })

      - name: Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -auto-approve tfplan`, { lang: 'yaml', file: '.github/workflows/terraform.yml' })}

<h2>A role que confia no GitHub (isto é Terraform também)</h2>
${code(`resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # CRÍTICO: restrinja ao SEU repositório e branch.
    # Sem isto, qualquer repositório do GitHub pode assumir esta role.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:minha-org/infra:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "GitHubActionsTerraform"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}`, { file: 'oidc.tf' })}

${danger('A condição sub é obrigatória', 'Sem a condição <code>token.actions.githubusercontent.com:sub</code> restringindo ao seu repositório, <b>qualquer repositório público do GitHub</b> pode assumir a sua role. Já aconteceu com empresas grandes.')}

<h2>GCP: Workload Identity Federation</h2>
${code(`- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: projects/123/locations/global/workloadIdentityPools/github/providers/gh
    service_account: terraform@meu-projeto.iam.gserviceaccount.com`, { lang: 'yaml' })}
${tip('A mesma ideia', 'Tanto na AWS quanto no GCP, o objetivo é o mesmo: <b>nenhuma chave de longa duração em lugar nenhum</b>. O CI prova quem é por OIDC e recebe credencial temporária.')}

<h2>Detalhes que economizam sofrimento</h2>
<ul>
<li><b>Concurrency group</b> no workflow: impede dois applies simultâneos brigando pelo lock.</li>
<li><b>Environment protection rule</b> do GitHub para produção: exige aprovação manual antes do apply.</li>
<li><b>Aplique o plano salvo</b> (<code>tfplan</code>), não um plan novo. Senão você aprova um diff e aplica outro.</li>
<li><b>Cache do <code>.terraform</code></b> economiza minutos por execução.</li>
<li><b>Não</b> mande o output do plan para logs públicos: ele pode conter valores sensíveis.</li>
</ul>
${code(`concurrency:
  group: terraform-\${{ github.ref }}
  cancel-in-progress: false`, { lang: 'yaml' })}
`}
  ]);
})(window.IAC);
