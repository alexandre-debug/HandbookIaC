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
