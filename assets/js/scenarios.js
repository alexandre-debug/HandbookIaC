/* =========================================================
   scenarios.js — roteiros guiados + quiz
   ========================================================= */
(function (IAC) {
  'use strict';
  const $ = IAC.$, esc = IAC.esc, L = IAC.lab;

  /* ---------------- roteiros ---------------- */
  const SC = [
    {
      id: 'aws-web', cloud: 'aws', em: '🌐',
      title: 'App web clássica: ECR → Secret → TG → ASG → ALB',
      lead: 'Exatamente o fluxo que você faz no console hoje, do começo ao fim. Ao final você terá o Terraform completo de uma aplicação em EC2 atrás de um Application Load Balancer, com escala automática.',
      items: [
        ['core', {}], ['backend', {}], ['vpc', { azs: 2, nat: 'single' }],
        ['kms', {}], ['ecr', { name: 'api' }], ['secret', { name: 'app-env' }],
        ['sg', { name: 'alb', preset: 'alb' }], ['sg', { name: 'app', preset: 'app', port: 8080 }],
        ['iam_role', { name: 'app', svc: 'ec2' }],
        ['acm', {}], ['tg', { name: 'api', port: 8080, type: 'instance' }],
        ['alb', { name: 'public' }], ['listener', { https: true }],
        ['lt', { type: 't3.small', port: 8080 }], ['asg', { min: 2, des: 2, max: 10 }],
        ['asg_policy', { metric: 'cpu', target: 60 }],
        ['logs', {}], ['alarm', { name: 'health' }], ['route53', {}]
      ],
      steps: [
        ['Fundação e state remoto', 'Provider com versão travada, tags padrão e o state no S3 com lock. Antes de qualquer recurso.', p => p.has('core') && p.has('backend')],
        ['A rede', 'VPC com subnets públicas (para o ALB) e privadas (para a aplicação), mais o NAT para a saída.', p => p.has('vpc')],
        ['Registry e segredo', 'ECR com política de ciclo de vida e o envelope do secret. O valor real entra por fora.', p => p.has('ecr') && p.has('secret')],
        ['Os security groups', 'Um para o ALB (80/443 do mundo) e um para a aplicação (só a porta 8080, vinda do SG do ALB).', p => p.count('sg') >= 2],
        ['A role da instância', 'Permissão mínima: ler aquele secret e puxar aquele repositório. Mais SSM para acesso sem porta 22.', p => p.has('iam_role')],
        ['Certificado e Target Group', 'ACM validado por DNS e o Target Group com health check em /health.', p => p.has('tg')],
        ['Load Balancer e Listener', 'O ALB nas subnets públicas e o listener 443 encaminhando para o TG, com redirect do 80.', p => p.has('alb') && p.has('listener')],
        ['Launch Template', 'A receita da instância: AMI do SSM, IMDSv2, instance profile e user_data puxando a imagem do ECR.', p => p.has('lt')],
        ['ASG vinculado ao TG', 'O passo principal: <code>target_group_arns</code> ligando o grupo ao Target Group, com health check tipo ELB.', p => p.has('asg')],
        ['Escala e alarmes', 'Target tracking em 60% de CPU, log group com retenção, alarme de targets fora de rotação e SNS.', p => p.has('asg_policy') && p.has('alarm')],
        ['DNS', 'Registro alias apontando o domínio para o ALB — sempre por último.', p => p.has('route53')],
        ['Rode o ciclo', 'Vá em Plan, leia o diff, e depois Apply. Acompanhe a ordem de criação: ela sai do grafo, não do arquivo.', p => p.applied > 0]
      ]
    },
    {
      id: 'aws-ecs', cloud: 'aws', em: '🐳',
      title: 'Contêiner no ECS Fargate',
      lead: 'O mesmo desenho, sem gerenciar nenhuma máquina. Note as duas diferenças críticas: o Target Group vira <code>target_type = "ip"</code> e existem duas roles distintas.',
      items: [
        ['core', {}], ['backend', {}], ['vpc', { azs: 2, nat: 'single' }],
        ['kms', {}], ['ecr', { name: 'api' }], ['secret', { name: 'app-env' }],
        ['sg', { name: 'alb', preset: 'alb' }], ['sg', { name: 'app', preset: 'app', port: 8080 }],
        ['iam_role', { name: 'task', svc: 'ecs' }],
        ['acm', {}], ['tg', { name: 'api', port: 8080, type: 'ip' }],
        ['alb', { name: 'public' }], ['listener', { https: true }],
        ['ecs_cluster', {}], ['ecs_task', {}], ['ecs_service', {}],
        ['logs', {}], ['alarm', { name: 'health' }]
      ],
      steps: [
        ['Base igual à do roteiro anterior', 'Fundação, backend, VPC, ECR e secret não mudam. Contêiner ou VM, a base é a mesma.', p => p.has('core') && p.has('vpc') && p.has('ecr')],
        ['Target Group com target_type = "ip"', 'Esta é a diferença nº 1. Fargate usa network mode <code>awsvpc</code>: os alvos são IPs, não instâncias.', p => { const t = p.cfg('tg'); return !!t && t.type === 'ip'; }],
        ['Cluster ECS', 'O cluster em si é de graça. Container Insights vale o custo.', p => p.has('ecs_cluster')],
        ['Task definition', 'Diferença nº 2: <b>execution role</b> (puxa imagem e lê secret) versus <b>task role</b> (o que sua app faz).', p => p.has('ecs_task')],
        ['Service com load_balancer', 'O bloco <code>load_balancer</code> é o equivalente ao <code>target_group_arns</code> do ASG.', p => p.has('ecs_service')],
        ['Circuit breaker e autoscaling', 'Deploy quebrado volta sozinho; a escala usa <code>aws_appautoscaling_*</code>, não <code>aws_autoscaling_policy</code>.', p => p.has('ecs_service')],
        ['Plan e apply', 'Repare que o serviço depende do listener — o <code>depends_on</code> existe porque o registro no TG exige o listener pronto.', p => p.applied > 0]
      ]
    },
    {
      id: 'aws-serverless', cloud: 'aws', em: '⚡',
      title: 'API serverless: Lambda + API Gateway + DynamoDB',
      lead: 'Sem ALB, sem ASG, sem VPC obrigatória. Para APIs de baixo/médio volume, é o stack mais barato e com menos peças móveis.',
      items: [
        ['core', {}], ['backend', {}], ['iam_role', { name: 'lambda', svc: 'lambda', ssm: false }],
        ['secret', { name: 'app-env' }], ['dynamo', {}], ['lambda', {}], ['s3', { name: 'assets' }]
      ],
      steps: [
        ['Fundação', 'Provider e backend remoto. Sem VPC: a Lambda roda fora dela (mais rápida e mais simples).', p => p.has('core')],
        ['Role da função', 'Principal <code>lambda.amazonaws.com</code>, com permissão de logs e do que a função realmente acessa.', p => p.has('iam_role')],
        ['Tabela DynamoDB', 'On-demand, com TTL e point-in-time recovery.', p => p.has('dynamo')],
        ['Função e API HTTP', 'Repare no <code>aws_lambda_permission</code>: sem ele o API Gateway responde 500.', p => p.has('lambda')],
        ['Log group explícito', 'Se você não criar, a AWS cria sem retenção e o log fica eterno.', p => p.has('lambda')],
        ['Apply', 'Compare o custo estimado com o do roteiro do ALB. É outra ordem de grandeza.', p => p.applied > 0]
      ]
    },
    {
      id: 'gcp-mig', cloud: 'gcp', em: '🔵',
      title: 'GCP: MIG + Load Balancer HTTPS global',
      lead: 'O mesmo desenho da app web clássica, agora no GCP. Preste atenção na cadeia de cinco recursos do balanceador e no named port.',
      items: [
        ['core', {}], ['backend', {}], ['vpc', { nat: true }],
        ['sa', { name: 'app' }], ['secret', {}], ['ar', { name: 'app' }],
        ['hc', { port: 8080 }], ['it', { type: 'e2-small' }], ['mig', { min: 2, max: 6, port: 8080 }],
        ['backend_svc', {}], ['armor', {}], ['lb', {}], ['dns', {}], ['alert', {}]
      ],
      steps: [
        ['Habilitar as APIs', 'O passo que não existe na AWS. Sem ele, tudo falha com 403.', p => p.has('core')],
        ['VPC + firewall + Cloud NAT', 'Sem security group: as regras de firewall miram network tags. Libere os ranges dos health checkers.', p => p.has('vpc')],
        ['Service account + Artifact Registry + Secret', 'Permissão concedida no próprio secret, não no projeto inteiro.', p => p.has('sa') && p.has('ar') && p.has('secret')],
        ['Health check separado', 'No GCP ele é um recurso independente, usado tanto pelo autohealing quanto pelo balanceamento.', p => p.has('hc')],
        ['Instance template + MIG regional', 'O <code>named_port</code> é o que vai permitir o vínculo com o backend service.', p => p.has('it') && p.has('mig')],
        ['Backend service', 'O equivalente ao Target Group. O <code>port_name</code> tem que bater com o <code>named_port</code>.', p => p.has('backend_svc')],
        ['A cadeia do balanceador', 'IP global → forwarding rule → target proxy → url map → backend service. Cinco recursos.', p => p.has('lb')],
        ['DNS e alerta', 'Registro A (não existe alias) e política de alerta no Cloud Monitoring.', p => p.has('dns')],
        ['Apply', 'Compare o diagrama com o do laboratório AWS. Mesma arquitetura, peças diferentes.', p => p.applied > 0]
      ]
    },
    {
      id: 'gcp-run', cloud: 'gcp', em: '🚀',
      title: 'GCP: Cloud Run + Artifact Registry + Secret Manager',
      lead: 'A versão mais enxuta possível de um serviço HTTP em produção: dois recursos substituem ALB, target group, certificado, autoscaling e DNS.',
      items: [
        ['core', {}], ['backend', {}], ['vpc', { nat: true }], ['sa', { name: 'app' }],
        ['ar', { name: 'app' }], ['secret', {}], ['run', { min: 0, max: 10, pub: true }], ['sql', {}]
      ],
      steps: [
        ['Fundação e APIs', 'Habilite <code>run.googleapis.com</code> e <code>artifactregistry.googleapis.com</code>.', p => p.has('core')],
        ['Artifact Registry', 'Com <code>cleanup_policies</code> e <code>immutable_tags</code>.', p => p.has('ar')],
        ['Service account e secret', 'A SA do Cloud Run recebe <code>secretAccessor</code> apenas naquele secret.', p => p.has('sa') && p.has('secret')],
        ['Cloud Run', 'Escala a zero, HTTPS incluso, secret injetado direto — sem execution role separada.', p => p.has('run')],
        ['IAM público', 'Sem o binding <code>allUsers</code> + <code>roles/run.invoker</code>, a URL responde 403.', p => p.has('run')],
        ['Cloud SQL com IP privado', 'Repare no Private Service Access: <code>google_compute_global_address</code> + <code>google_service_networking_connection</code> são pré-requisito do IP privado — e por isso a VPC entra no roteiro.', p => p.has('vpc') && p.has('sql')],
        ['Apply e comparação', 'Conte os recursos e o custo estimado. Compare com o roteiro do MIG.', p => p.applied > 0]
      ]
    }
  ];

  function proj(cloud) {
    L.S.cloud = cloud;
    const s = L.st();
    const cnt = {}; s.items.forEach(i => cnt[i.cid] = (cnt[i.cid] || 0) + 1);
    return {
      has: cid => !!cnt[cid],
      count: cid => cnt[cid] || 0,
      cfg: cid => { const it = s.items.filter(x => x.cid === cid)[0]; return it ? L.cfgOf(it) : null; },
      applied: Object.keys(s.applied).length
    };
  }

  function scenarioPage(sc) {
    return function (view) {
      view.classList.remove('wide');
      render();
      view.addEventListener('click', function (e) {
        const b = e.target.closest('[data-sc]');
        if (!b) return;
        const act = b.getAttribute('data-sc');
        if (act === 'load') {
          L.S.cloud = sc.cloud;
          const s = L.st();
          s.items = sc.items.map(x => ({ uid: 'i' + Math.random().toString(36).slice(2, 8), cid: x[0], cfg: x[1] }));
          s.sel = null; s.tab = 'code'; L.save();
          IAC.toast('Cenário carregado no laboratório ' + sc.cloud.toUpperCase());
          location.hash = '#/' + sc.cloud + '/lab';
        } else if (act === 'lab') {
          L.S.cloud = sc.cloud; L.save();
          location.hash = '#/' + sc.cloud + '/lab';
        } else if (act === 'reset') {
          L.S.cloud = sc.cloud; L.S[sc.cloud] = L.blank(sc.cloud); L.save(); render();
        }
      });

      function render() {
        const p = proj(sc.cloud);
        let done = 0;
        sc.steps.forEach(s => { if (s[2](p)) done++; });
        const pct = Math.round(done / sc.steps.length * 100);
        let html = '<div class="page"><span class="eyebrow ' + sc.cloud + '">Roteiro guiado · ' + sc.cloud.toUpperCase() + '</span>';
        html += '<h1>' + sc.em + ' ' + esc(sc.title) + '</h1>';
        html += '<p class="lede">' + sc.lead + '</p>';
        html += '<div class="toolbar"><button class="btn pri" data-sc="load">⚡ montar tudo de uma vez</button>' +
          '<button class="btn" data-sc="lab">abrir o laboratório</button>' +
          '<button class="btn sm" data-sc="reset">zerar projeto</button>' +
          '<span class="spacer"></span><span class="chip ' + (pct === 100 ? 'ok' : '') + '">' + done + '/' + sc.steps.length + ' passos</span></div>';
        html += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
        let cur = true;
        sc.steps.forEach((s, i) => {
          const ok = s[2](p);
          const isCur = !ok && cur;
          if (!ok) cur = false;
          html += '<div class="step' + (ok ? ' done' : '') + (isCur ? ' cur' : '') + '">' +
            '<div class="n">' + (ok ? '✓' : (i + 1)) + '</div>' +
            '<div><div class="t">' + esc(s[0]) + '</div><div class="d">' + s[1] + '</div></div></div>';
        });
        html += IAC.tip('Como usar este roteiro',
          'Você pode <b>montar tudo de uma vez</b> para ver o resultado final, ou ir ao laboratório e adicionar componente por componente — os passos acima marcam sozinhos conforme você avança. A segunda forma ensina mais.');
        html += '</div>';
        view.innerHTML = IAC.html(html);
      }
    };
  }

  const pages = SC.map(sc => ({ id: sc.id, title: sc.em + ' ' + sc.title, tag: 'lab', mount: scenarioPage(sc) }));

  /* ---------------- quiz ---------------- */
  const Q = [
    ['Você mudou o <code>image_id</code> do launch template e aplicou. O que acontece com as instâncias que já estão rodando?',
      ['São substituídas imediatamente', 'Nada, até o instance_refresh ou uma substituição acontecer', 'O ASG dobra de tamanho', 'O apply falha'], 1,
      'O launch template é só a receita. Instâncias existentes continuam com a versão antiga até serem substituídas — por <code>instance_refresh</code>, por falha de health check, ou na mão.'],
    ['Qual linha é o equivalente ao "Attach to an existing load balancer → Target Group" do console?',
      ['<code>load_balancer_type = "application"</code>', '<code>target_group_arns = [aws_lb_target_group.x.arn]</code>', '<code>health_check_type = "ELB"</code>', '<code>vpc_zone_identifier = [...]</code>'], 1,
      'É o <code>target_group_arns</code> no <code>aws_autoscaling_group</code>. Sem ele, as instâncias sobem saudáveis e não recebem nenhuma requisição.'],
    ['Onde a senha do banco fica em texto claro mesmo com <code>sensitive = true</code>?',
      ['Em lugar nenhum', 'No terraform.tfstate', 'Só no log de debug', 'No .terraform.lock.hcl'], 1,
      '<code>sensitive</code> só esconde do output do terminal. O state guarda tudo em texto claro — por isso o bucket do state é tão crítico quanto a produção.'],
    ['Você tem 3 buckets criados com <code>count</code> e remove o do meio da lista. O que o plan mostra?',
      ['Destroi só o do meio', 'Nada, ele reindexa sozinho', 'Recria o terceiro na posição do segundo e destroi o terceiro', 'Erro de validação'], 2,
      'O <code>count</code> é posicional. Por isso <code>for_each</code> é o padrão para coisas nomeadas: o endereço vira <code>["nome"]</code> e remover um não afeta os outros.'],
    ['Qual a diferença entre <code>execution_role</code> e <code>task_role</code> no ECS?',
      ['Nenhuma, são sinônimos', 'A execution role é do agente ECS (puxar imagem, ler secret); a task role é da sua aplicação', 'A task role é para Fargate e a execution para EC2', 'A execution role só serve para logs'], 1,
      'Confundir as duas é o erro nº 1 no ECS. A permissão de ler o secret vai na <b>execution role</b>, porque o ECS lê o secret antes do contêiner subir.'],
    ['Alguém mudou o desired capacity do ASG pelo console. Você roda <code>terraform plan</code>. O que aparece?',
      ['Nada, o Terraform ignora', 'Um ~ update querendo voltar ao valor do código', 'Um erro de lock', 'Um -/+ replacement'], 1,
      'É o drift. O Terraform quer restaurar o valor declarado. Se aquele campo é gerenciado por fora de propósito, use <code>lifecycle { ignore_changes = [desired_capacity] }</code>.'],
    ['O que <code>terraform state rm aws_instance.velha</code> faz?',
      ['Destrói a instância na AWS', 'Remove do state; a instância continua existindo, órfã', 'Marca para recriação', 'Renomeia o recurso'], 1,
      'Ele faz o Terraform "esquecer" o recurso. A instância continua rodando e cobrando, só que ninguém mais a gerencia. Desde a 1.7, o bloco <code>removed</code> faz isso de forma versionada.'],
    ['Por que o SG da aplicação deve referenciar o SG do ALB em vez de um CIDR?',
      ['É mais rápido', 'Porque IPs mudam e instâncias entram e saem do ASG', 'Porque CIDR não funciona em VPC', 'Por causa do custo'], 1,
      'Referenciando o security group, a regra continua correta mesmo quando as instâncias mudam — inclusive para as que ainda nem existem.'],
    ['No GCP, o que liga o Managed Instance Group ao backend service?',
      ['<code>target_group_arns</code>', 'O <code>named_port</code> do MIG casando com o <code>port_name</code> do backend service', 'Uma regra de firewall', 'O health check'], 1,
      'Na AWS o ASG empurra as instâncias para o Target Group. No GCP o backend service aponta para o instance group e resolve a porta pelo nome. Sentido invertido, resultado igual.'],
    ['Qual é a causa mais provável de "todos os backends UNHEALTHY" em um LB do GCP?',
      ['Certificado inválido', 'Firewall bloqueando os ranges 35.191.0.0/16 e 130.211.0.0/22', 'CPU alta', 'Falta de IP'], 1,
      'Os health checkers do Google vêm desses ranges fixos. Sem regra de firewall liberando, nada nunca fica saudável.'],
    ['O que <code>terraform apply -refresh-only</code> faz?',
      ['Recria todos os recursos', 'Atualiza o state com a realidade, sem alterar a nuvem', 'Baixa providers novos', 'Limpa o cache'], 1,
      'Ele aceita a realidade. Use quando a mudança manual foi legítima — e depois traga a mudança para o código, senão ela some no próximo apply.'],
    ['Por que <code>create_before_destroy</code> em um Target Group?',
      ['Por performance', 'Porque o listener o mantém "em uso" e a destruição falharia', 'Para economizar', 'Para gerar log'], 1,
      'Vários atributos do TG forçam recriação. Com o listener apontando para ele, destruir primeiro dá <code>ResourceInUse</code>.'],
    ['Onde deve ficar o valor real de um secret?',
      ['No .tfvars, que não vai para o Git', 'Fora do Terraform, injetado por CLI ou pipeline', 'Em uma variável de ambiente TF_VAR', 'Criptografado no .tf'], 1,
      'Qualquer caminho que passe pelo Terraform coloca o valor no state em texto claro. O Terraform cria o envelope; o valor entra por fora, com <code>ignore_changes</code> protegendo.'],
    ['Você roda plan e ele quer destruir 40 recursos que você não mexeu. Primeira coisa a fazer?',
      ['Aplicar para ver o que acontece', 'Conferir backend, workspace e credencial', 'Rodar terraform init -upgrade', 'Apagar o state'], 1,
      'Em praticamente 100% dos casos é state/workspace/conta errados. <code>terraform state list</code>, <code>terraform workspace show</code> e <code>aws sts get-caller-identity</code> respondem em 10 segundos.'],
    ['Qual afirmação sobre o <code>.terraform.lock.hcl</code> está correta?',
      ['Não deve ir para o Git', 'Deve ir para o Git: trava a versão exata do provider', 'É gerado no apply', 'Guarda credenciais'], 1,
      'É o package-lock do Terraform. Sem ele comitado, sua máquina e o CI podem usar versões diferentes de provider e produzir planos diferentes.']
  ];

  function quizPage(view) {
    view.classList.remove('wide');
    const answers = {};
    render();
    view.addEventListener('click', function (e) {
      const o = e.target.closest('[data-q]');
      if (o) {
        const qi = +o.getAttribute('data-q'), oi = +o.getAttribute('data-o');
        if (answers[qi] !== undefined) return;
        answers[qi] = oi; render();
        return;
      }
      if (e.target.closest('[data-reset-quiz]')) { for (const k in answers) delete answers[k]; render(); }
    });
    function render() {
      const respondidas = Object.keys(answers).length;
      const certas = Object.keys(answers).filter(k => answers[k] === Q[k][2]).length;
      let html = '<div class="page"><span class="eyebrow">Fixação</span><h1>Quiz</h1>' +
        '<p class="lede">Quinze perguntas sobre as armadilhas que aparecem de verdade. Cada resposta traz a explicação — errar aqui é mais barato que errar em produção.</p>';
      html += '<div class="toolbar"><span class="chip ' + (certas === Q.length ? 'ok' : '') + '">' + certas + ' / ' + Q.length + ' corretas</span>' +
        '<span class="chip">' + respondidas + ' respondidas</span>' +
        '<span class="spacer"></span><button class="btn sm" data-reset-quiz>recomeçar</button></div>';
      html += '<div class="bar"><i style="width:' + Math.round(respondidas / Q.length * 100) + '%"></i></div>';
      Q.forEach((q, qi) => {
        html += '<div class="qz"><div class="qt">' + (qi + 1) + '. ' + IAC.html(q[0]) + '</div>';
        q[1].forEach((opt, oi) => {
          let cls = '';
          if (answers[qi] !== undefined) {
            if (oi === q[2]) cls = ' right';
            else if (answers[qi] === oi) cls = ' wrong';
          }
          html += '<div class="opt' + cls + '" data-q="' + qi + '" data-o="' + oi + '">' +
            '<span class="mk">' + String.fromCharCode(97 + oi) + ')</span><span>' + opt + '</span></div>';
        });
        if (answers[qi] !== undefined) html += '<div class="expl">' + q[3] + '</div>';
        html += '</div>';
      });
      html += '</div>';
      view.innerHTML = IAC.html(html);
    }
  }

  IAC.section({
    id: 'lab', label: 'Roteiros & Quiz', icon: '🧪',
    pages: pages.concat([{ id: 'quiz', title: '❓ Quiz de fixação', tag: 'lab', mount: quizPage }])
  });
})(window.IAC);
