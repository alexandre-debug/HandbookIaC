# Handbook IaC — Terraform on AWS and GCP

Interactive Infrastructure as Code handbook for Terraform on AWS and GCP. It
includes a simulated lab that mirrors common console work: creating ECR
repositories and secrets, configuring target groups and Auto Scaling, wiring a
load balancer, adjusting policies, and inspecting the equivalent Terraform,
dependency graph, `plan`, `apply`, and console drift.

The application is plain HTML, CSS, and JavaScript. It has no build step,
external dependency, or internet requirement. It opens in **English** by
default; the language selector in the header switches to **Português** and
saves the preference in the browser. The current chapter, reading progress,
and lab projects are preserved when the language changes.

Created by **[Alexandre Cardoso](https://www.linkedin.com/in/alexandre-cardoso-b47353184/)**.

## Opening the application

```bash
open index.html            # macOS
# or serve it over HTTP:
python3 -m http.server 8000 # then open http://localhost:8000
```

The repository also includes a standalone, single-file edition for sharing by
email or Slack:

```bash
node build.js && open dist/handbook.html
```

## What is included

| Section | Contents |
|---|---|
| **Foundations** | 13 chapters covering ClickOps, HCL, lifecycle, state and drift, variables, `count`/`for_each`/`lifecycle`, expressions, modules, environments, import/moved/removed, practices, and CI/CD with OIDC |
| **AWS** | 10 chapters mapping console actions to Terraform: ECR, Secrets Manager, IAM, VPC/SG, ALB+TG+Listener, Launch Template+ASG, ECS Fargate, RDS/S3/DynamoDB, observability, and a complete recipe |
| **GCP** | 5 chapters covering the AWS mental-model mapping, service equivalences, the five-piece load balancer, Cloud Run, and the same stack across both clouds |
| **Labs** | 29 AWS and 18 GCP components. Assemble resources, generate `.tf`, inspect the graph, run simulated `plan`/`apply`/`destroy`, lint the project, estimate cost, and use the Terraform terminal |
| **Guided scenarios** | 5 scenarios with steps that update as the project is assembled |
| **Reference** | Command cheat sheet, common errors and fixes, reusable patterns, and glossary |
| **Quiz** | 15 questions about real-world Terraform pitfalls |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus full-text search |
| `Ctrl/Cmd + K` | Open the quick navigation palette |
| `t` | Toggle light/dark theme |
| `Alt + ← / →` | Previous/next chapter |

## How the lab works

Generated HCL is the source of truth. The code in `assets/js/hcl.js` parses that
HCL, derives dependency edges from resource references, calculates a topological
plan, simulates apply operations with plausible IDs and durations, produces a
Terraform state file, and runs 17 lint rules.

Nothing is hardcoded per component: change an HCL generator and the graph, plan,
state, and checks follow the generated code.

## Repository structure

```text
index.html
build.js                     # creates dist/handbook.html
assets/
  css/styles.css
  js/
    core.js                  # utilities, syntax highlighting, storage
    i18n.js                  # language selection and local rendering
    locales/en.js            # English translations
    hcl.js                   # parser, graph, plan/apply, state, lint
    catalog-aws.js           # AWS catalog
    catalog-gcp.js           # GCP catalog
    content-fundamentos.js   # handbook chapters
    content-aws.js
    content-gcp.js
    content-ref.js
    lab.js                   # lab assembly and simulated apply
    terminal.js              # simulated Terraform CLI
    scenarios.js             # guided scenarios and quiz
    app.js                   # router, navigation, search, theme
```

## Adding a catalog component

Each component is an object. Its only required method is `hcl(cfg, ctx)`, which
returns Terraform text. The graph, plan, state, diagram, and checks are derived
from that output.

```js
C({
  id: 'sqs', cat: 'ops', name: 'SQS queue', em: '📨',
  tf: 'aws_sqs_queue', multi: true, cost: 0.5,
  desc: 'Queue with a dead-letter queue.',
  console: ['SQS → Create queue → Standard → configure DLQ'],
  gotchas: ['Without a DLQ, a poison message can loop forever.'],
  inputs: [
    { k: 'name', l: 'Name', t: 'text', v: 'jobs' },
    { k: 'retention', l: 'Retention (s)', t: 'num', v: 345600 }
  ],
  file: 'sqs.tf',
  hcl: (c, ctx) => `resource "aws_sqs_queue" "${c._n}" {
  name                      = "\${local.name}-${c.name}"
  message_retention_seconds = ${c.retention}
}`
});
```

Available `ctx` helpers include `has(id)`, `nameOf(id)`, `cfg(id)`, `vpcId()`,
`pubSubnets()`, `privSubnets()`, and `sgRef(profile)`. Input types are `text`,
`num`, `bool`, and `sel` (with `opts: [[value, label]]`).

## Notes

- Prices are rough estimates. Use [Infracost](https://www.infracost.io/) for real estimates.
- The lab `plan`/`apply` is simulated: it creates nothing in AWS or GCP and never requests credentials.
- Reading progress, lab projects, theme, and language are stored in browser `localStorage`. The **Reset** button clears them.

---

## Versão em português

# Handbook IaC — Terraform na AWS e no GCP

Handbook interativo de Infraestrutura como Código, em **inglês e português**, com um
**laboratório que simula o que você faz hoje no console**: criar ECR, criar
secret, criar target group, criar auto scaling, vincular ao TG, subir o load
balancer, ajustar as policies — e ver o Terraform equivalente, o grafo de
dependências, o `plan`, o `apply` e até o *drift* de quando alguém mexe no
console depois.

Sem build, sem dependência, sem internet. É HTML + CSS + JavaScript puro.

O site abre em **inglês** na primeira visita. O seletor no header permite
alternar para **Português** e salva a preferência no navegador. A troca mantém
o capítulo aberto, o progresso de leitura e os projetos dos laboratórios.
As traduções também estão incluídas na versão em arquivo único; os exemplos
de código mantêm seus identificadores e comentários originais.

Feito por **[Alexandre Cardoso](https://www.linkedin.com/in/alexandre-cardoso-b47353184/)**.

## Como abrir

```bash
open index.html            # macOS
# ou, se preferir servir por HTTP:
python3 -m http.server 8000   # depois: http://localhost:8000
```

Também existe uma versão em **arquivo único** (boa para mandar por e-mail ou
Slack), gerada por `node build.js`:

```bash
node build.js && open dist/handbook.html
```

## O que tem dentro

| Seção | Conteúdo |
|---|---|
| **Fundamentos** | 13 capítulos: do ClickOps ao código, HCL, ciclo de vida, state e drift, variáveis, `count`/`for_each`/`lifecycle`, expressões, módulos, ambientes, import/moved/removed, boas práticas, CI/CD com OIDC |
| **AWS** | 10 capítulos mapeando console → Terraform: ECR, Secrets Manager, IAM, VPC/SG, ALB+TG+Listener, Launch Template+ASG, ECS Fargate, RDS/S3/DynamoDB, observabilidade, receita completa |
| **GCP** | 5 capítulos: modelo mental para quem vem da AWS, tabela de equivalências serviço a serviço, o LB em 5 peças, Cloud Run, e o mesmo stack lado a lado nas duas nuvens |
| **Laboratórios** | 29 componentes AWS + 18 GCP. Monta, gera `.tf`, desenha o grafo, roda `plan`/`apply`/`destroy`, valida (lint), estima custo e tem terminal Terraform simulado |
| **Roteiros** | 5 cenários guiados com passos que marcam sozinhos conforme você monta |
| **Referência** | Cheat sheet de comandos, erros comuns com solução, padrões prontos, glossário |
| **Quiz** | 15 perguntas sobre as armadilhas que aparecem de verdade |

## Atalhos

| Tecla | Ação |
|---|---|
| `/` | foco na busca (full-text em todo o handbook) |
| `Ctrl/Cmd + K` | paleta de navegação rápida |
| `t` | alternar tema claro/escuro |
| `Alt + ← / →` | capítulo anterior / próximo |

## Como funciona o laboratório

O ponto central é que **o HCL gerado é a fonte da verdade**. A partir do texto
do próprio `.tf`, o `assets/js/hcl.js` faz:

1. **parse** — mini-parser de HCL (blocos, atributos, blocos aninhados);
2. **grafo** — as arestas saem das referências entre recursos (`aws_lb.x.arn`),
   exatamente como o Terraform monta;
3. **plan** — ordem topológica, símbolos `+ ~ -`, `(known after apply)` para
   atributos que dependem de recursos ainda não criados;
4. **apply** — cria na ordem do grafo, com IDs e durações plausíveis por tipo
   de recurso (um RDS demora mais que um target group);
5. **state** — monta um `terraform.tfstate` v4 válido;
6. **lint** — 17 regras (SG aberto, ASG sem target group, bucket sem bloqueio
   público, secret com valor hardcoded, log group sem retenção…).

Nada disso é hardcoded por componente: mude o gerador de HCL e o grafo, o plan
e o state acompanham.

## Estrutura

```
index.html
build.js                     # gera dist/handbook.html (arquivo único)
assets/
  css/styles.css
  js/
    core.js                  # utilidades, realce de sintaxe, storage
    i18n.js                  # idioma, tradução e renderização local
    locales/en.js            # traduções em inglês e mensagens dinâmicas
    hcl.js                   # parser HCL, grafo, plan/apply, tfstate, lint
    catalog-aws.js           # 29 componentes AWS (console, HCL, pegadinhas, custo)
    catalog-gcp.js           # 18 componentes GCP
    content-fundamentos.js   # capítulos
    content-aws.js
    content-gcp.js
    content-ref.js
    lab.js                   # o laboratório (montagem, UI, diagrama, apply)
    terminal.js              # CLI Terraform simulado
    scenarios.js             # roteiros guiados + quiz
    app.js                   # router, navegação, busca, tema
```

## Adicionando um componente ao catálogo

Cada componente é um objeto. O único método obrigatório é `hcl(cfg, ctx)`, que
devolve o Terraform como texto — o resto (grafo, plan, state, diagrama) é
derivado dele automaticamente.

```js
C({
  id: 'sqs', cat: 'ops', name: 'Fila SQS', em: '📨',
  tf: 'aws_sqs_queue', multi: true, cost: 0.5,
  desc: 'Fila com dead-letter queue.',
  console: ['SQS → Create queue → Standard → configurar DLQ'],
  gotchas: ['Sem DLQ, uma mensagem venenosa fica em loop para sempre.'],
  inputs: [
    { k: 'name', l: 'Nome', t: 'text', v: 'jobs' },
    { k: 'retention', l: 'Retenção (s)', t: 'num', v: 345600 }
  ],
  file: 'sqs.tf',
  hcl: (c, ctx) => `resource "aws_sqs_queue" "${c._n}" {
  name                      = "\${local.name}-${c.name}"
  message_retention_seconds = ${c.retention}
}`
});
```

Helpers disponíveis em `ctx`: `has(id)`, `nameOf(id)`, `cfg(id)`, `vpcId()`,
`pubSubnets()`, `privSubnets()`, `sgRef(perfil)`.

Tipos de `inputs`: `text`, `num`, `bool`, `sel` (com `opts: [[valor, rótulo]]`).

## Avisos

- Os custos são **estimativas grosseiras**, só para dar ordem de grandeza. Para
  número real use [infracost](https://www.infracost.io/).
- O `plan`/`apply` do laboratório é **simulado**: nada é criado em nuvem
  nenhuma, e nenhuma credencial é usada ou pedida.
- Todo o progresso (capítulos lidos, projetos montados, tema) fica no
  `localStorage` do navegador. O botão **Reset** na barra lateral limpa tudo.
