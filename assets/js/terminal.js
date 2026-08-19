/* =========================================================
   terminal.js — CLI Terraform simulado sobre o projeto do lab
   ========================================================= */
(function (IAC) {
  'use strict';
  const $ = IAC.$, esc = IAC.esc, H = IAC.hcl;
  let box = null, out = null, input = null, pending = null;
  const hist = []; let hi = -1;

  const BANNER =
    '<span class="o-hl">Terraform CLI simulado</span> — os comandos operam no projeto que você montou na aba Recursos.\n' +
    '<span class="o-dim">Tente: </span><span class="o-cy">terraform init</span><span class="o-dim">, </span><span class="o-cy">terraform plan</span>' +
    '<span class="o-dim">, </span><span class="o-cy">terraform apply</span><span class="o-dim">, </span><span class="o-cy">terraform state list</span>' +
    '<span class="o-dim">, </span><span class="o-cy">help</span><span class="o-dim">.</span>\n';

  function render(el) {
    el.innerHTML =
      '<div class="term"><div class="term-h">' +
      '<span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>' +
      '<span class="t">~/infra/' + (IAC.lab.S.cloud) + '-prod</span></div>' +
      '<div class="term-scroll" id="termOut"></div>' +
      '<div class="term-in"><span>$</span><input id="termIn" autocomplete="off" spellcheck="false" placeholder="terraform plan"></div></div>';
    box = el; out = $('#termOut'); input = $('#termIn');
    write(BANNER + '\n');
    input.addEventListener('keydown', onKey);
    setTimeout(() => input.focus(), 30);
    el.addEventListener('click', e => { if (!e.target.closest('input')) input.focus(); });
  }

  function write(html) {
    const d = document.createElement('div');
    d.className = 'term-line'; d.innerHTML = html;
    out.appendChild(d); out.scrollTop = out.scrollHeight;
  }
  function echo(cmd) { write('<span class="o-add">$</span> ' + esc(cmd)); }

  function onKey(e) {
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi < hist.length - 1) { hi++; input.value = hist[hist.length - 1 - hi]; } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (hi > 0) { hi--; input.value = hist[hist.length - 1 - hi]; } else { hi = -1; input.value = ''; } return; }
    if (e.key !== 'Enter') return;
    const cmd = input.value.trim();
    input.value = '';
    if (cmd) { hist.push(cmd); hi = -1; }
    echo(cmd);
    if (pending) { const p = pending; pending = null; p(cmd); return; }
    if (!cmd) return;
    try { run(cmd); } catch (err) { write('<span class="o-del">erro interno: ' + esc(err.message) + '</span>'); }
  }

  function A() { return IAC.lab.assemble(); }
  function s() { return IAC.lab.st(); }

  function run(cmd) {
    const parts = cmd.split(/\s+/);
    const c0 = parts[0];
    if (c0 === 'clear' || c0 === 'cls') { out.innerHTML = ''; return; }
    if (c0 === 'help' || c0 === '?') return help();
    if (c0 === 'ls') return write(A().files.map(f => '<span class="o-cy">' + f.name + '</span>').join('   ') + '   .terraform/   ' + (s().initialized ? '.terraform.lock.hcl' : ''));
    if (c0 === 'cat') {
      const f = A().files.filter(x => x.name === parts[1])[0];
      if (!f) return write('<span class="o-del">cat: ' + esc(parts[1] || '') + ': arquivo não existe</span>');
      return write('<span class="o-dim">' + esc(f.text) + '</span>');
    }
    if (c0 === 'aws' || c0 === 'gcloud') return write('<span class="o-dim">Este é um terminal de Terraform. Mas a ideia é boa: quase tudo que você faz no ' + c0 + ' CLI tem equivalente declarativo.</span>');
    if (c0 === 'rm' && /-rf/.test(cmd)) return write('<span class="o-chg">Boa tentativa. Em IaC, apagar arquivo não apaga infraestrutura — quem manda é o state.</span>');
    if (c0 !== 'terraform' && c0 !== 'tf') return write('<span class="o-del">comando não encontrado: ' + esc(c0) + '</span>  <span class="o-dim">(tente "help")</span>');

    const sub = parts[1] || '';
    const args = parts.slice(2);
    switch (sub) {
      case 'version': return write('Terraform v1.9.8\non darwin_arm64\n+ provider registry.terraform.io/hashicorp/' + (IAC.lab.S.cloud === 'aws' ? 'aws v5.68.0' : 'google v6.8.0'));
      case 'init': return tfInit(args);
      case 'fmt': return write(A().files.map(f => f.name).slice(0, 2).join('\n') + '\n<span class="o-dim">(arquivos reformatados — o fmt não muda comportamento, só alinhamento)</span>');
      case 'validate': return tfValidate();
      case 'plan': return tfPlan();
      case 'apply': return tfApply(args);
      case 'destroy': return tfDestroy(args);
      case 'show': return tfShow();
      case 'output': return tfOutput(args);
      case 'state': return tfState(args);
      case 'graph': return tfGraph();
      case 'providers': return write('Providers required by configuration:\n.\n└── provider[registry.terraform.io/hashicorp/' + (IAC.lab.S.cloud === 'aws' ? 'aws] ~> 5.60' : 'google] ~> 6.8'));
      case 'workspace': return tfWorkspace(args);
      case 'import': return tfImport(args);
      case 'taint': return write('<span class="o-chg">Aviso:</span> "terraform taint" está obsoleto desde a 0.15.2.\nUse: <span class="o-cy">terraform apply -replace="' + (args[0] || 'aws_instance.exemplo') + '"</span>');
      case 'refresh': return write('<span class="o-chg">Aviso:</span> "terraform refresh" está obsoleto.\nUse: <span class="o-cy">terraform apply -refresh-only</span> — ele mostra o drift e deixa você decidir.');
      case 'login': return write('<span class="o-dim">Abriria o navegador para autenticar no HCP Terraform.</span>');
      case '': return help();
      default: return write('<span class="o-del">Terraform has no command named "' + esc(sub) + '".</span>');
    }
  }

  function help() {
    write(
      '<span class="o-b">Ciclo de vida</span>\n' +
      '  <span class="o-cy">terraform init</span>       baixa providers e configura o backend\n' +
      '  <span class="o-cy">terraform validate</span>   checa sintaxe e referências (sem falar com a nuvem)\n' +
      '  <span class="o-cy">terraform fmt</span>        formata os arquivos\n' +
      '  <span class="o-cy">terraform plan</span>       mostra o que mudaria — <b>sempre leia antes de aplicar</b>\n' +
      '  <span class="o-cy">terraform apply</span>      aplica (pede confirmação; -auto-approve pula)\n' +
      '  <span class="o-cy">terraform destroy</span>    remove tudo que está no state\n\n' +
      '<span class="o-b">Investigação</span>\n' +
      '  <span class="o-cy">terraform state list</span>          lista o que o Terraform conhece\n' +
      '  <span class="o-cy">terraform state show &lt;addr&gt;</span>   detalha um recurso\n' +
      '  <span class="o-cy">terraform show</span>                despeja o state inteiro\n' +
      '  <span class="o-cy">terraform output</span>              valores exportados\n' +
      '  <span class="o-cy">terraform graph</span>               grafo de dependências\n\n' +
      '<span class="o-b">Manutenção</span>\n' +
      '  <span class="o-cy">terraform import &lt;addr&gt; &lt;id&gt;</span>  adota um recurso criado no console\n' +
      '  <span class="o-cy">terraform apply -replace=&lt;addr&gt;</span> recria um recurso específico\n' +
      '  <span class="o-cy">terraform apply -refresh-only</span>   só reconcilia o state com a realidade\n' +
      '  <span class="o-cy">terraform workspace list|new|select</span>\n\n' +
      '<span class="o-dim">shell: ls · cat &lt;arquivo&gt; · clear</span>');
  }

  function tfInit(args) {
    const st = s();
    write('<span class="o-b">Initializing the backend...</span>');
    const A2 = A();
    const hasBackend = A2.blocks.some(b => b.kind === 'terraform' && /backend\s+"/.test(b.raw));
    if (hasBackend) write('\nSuccessfully configured the backend "' + (IAC.lab.S.cloud === 'aws' ? 's3' : 'gcs') + '"! Terraform will automatically\nuse this backend unless the backend configuration changes.');
    else write('<span class="o-chg">\nAviso: nenhum backend configurado — o state fica em ./terraform.tfstate,\nsem lock e sem histórico. Adicione o componente "Backend remoto".</span>');
    write('\n<span class="o-b">Initializing provider plugins...</span>');
    const pv = IAC.lab.S.cloud === 'aws' ? ['hashicorp/aws', 'v5.68.0', '"~> 5.60"'] : ['hashicorp/google', 'v6.8.0', '"~> 6.8"'];
    write('- Finding ' + pv[0] + ' versions matching ' + pv[2] + '...\n- Installing ' + pv[0] + ' ' + pv[1] + '...\n- Installed ' + pv[0] + ' ' + pv[1] + ' <span class="o-dim">(signed by HashiCorp)</span>');
    write('\nTerraform has created a lock file <span class="o-cy">.terraform.lock.hcl</span>. Faça commit dele:\né o que garante que todo mundo use exatamente a mesma versão do provider.');
    write('\n<span class="o-add">Terraform has been successfully initialized!</span>');
    st.initialized = true; IAC.lab.save();
  }

  function tfValidate() {
    if (!s().initialized) return write('<span class="o-del">╷\n│ Error: Missing required provider\n│ Rode "terraform init" primeiro.\n╵</span>');
    const A2 = A();
    const miss = IAC.lab.missingRefs(A2.blocks);
    if (!miss.length) return write('<span class="o-add">Success!</span> The configuration is valid.');
    miss.forEach(m => {
      write('<span class="o-del">╷\n│ Error: Reference to undeclared resource\n│\n│   A managed resource "' +
        esc(m.split('.')[0]) + '" "' + esc(m.split('.')[1]) + '" has not been declared.\n╵</span>');
    });
  }

  function tfPlan() {
    const st = s();
    if (!st.initialized) return write('<span class="o-del">╷\n│ Error: Backend initialization required\n│ Rode "terraform init" primeiro.\n╵</span>');
    const A2 = A();
    const p = H.plan(A2.blocks, st.applied, st.drift);
    write(p.html);
    if (p.add + p.change + p.destroy > 0) {
      write('<span class="o-dim">\nNote: You didn\'t use the -out option to save this plan, so Terraform can\'t\nguarantee to take exactly these actions if you run "terraform apply" now.</span>');
    }
  }

  function tfApply(args) {
    const st = s();
    if (!st.initialized) return write('<span class="o-del">Error: rode "terraform init" primeiro.</span>');
    if (args.indexOf('-refresh-only') >= 0) {
      if (!Object.keys(st.drift).length) return write('<span class="o-b">No changes.</span> Your infrastructure still matches the configuration.');
      write('<span class="o-chg">Note: Objects have changed outside of Terraform</span>\n\nO refresh-only <b>aceita</b> a realidade e atualiza o state, sem mexer na nuvem.\nUse quando a mudança manual era legítima e você vai trazê-la para o código depois.');
      return;
    }
    const A2 = A();
    const p = H.plan(A2.blocks, st.applied, st.drift);
    if (!p.add && !p.change && !p.destroy) return write('<span class="o-b">No changes.</span> Your infrastructure matches the configuration.\n\n<span class="o-b">Apply complete!</span> Resources: 0 added, 0 changed, 0 destroyed.');
    write(p.html);
    if (args.indexOf('-auto-approve') >= 0) return doApply(p, false);
    write('\n<span class="o-b">Do you want to perform these actions?</span>\n  Terraform will perform the actions described above.\n  Only \'yes\' will be accepted to approve.\n\n  <span class="o-b">Enter a value:</span> <span class="cursor-blink"></span>');
    pending = function (ans) {
      if (ans.trim() !== 'yes') return write('\n<span class="o-chg">Apply cancelled.</span>');
      doApply(p, false);
    };
  }

  function doApply(p, destroy) {
    const st = s();
    write('');
    p.actions.forEach(a => {
      if (a.act === 'create') {
        const b = p.graph.byAddr[a.addr];
        const id = H.fakeId(b), dur = H.fakeDur(b.type || '');
        write('<span class="o-hl">' + esc(a.addr) + '</span>: Creating...');
        if (dur > 30) write('<span class="o-hl">' + esc(a.addr) + '</span>: Still creating... <span class="o-dim">[' + H.fmtDur(Math.round(dur / 2)) + ' elapsed]</span>');
        write('<span class="o-hl">' + esc(a.addr) + '</span>: <span class="o-add">Creation complete after ' + H.fmtDur(dur) + '</span> <span class="o-dim">[id=' + esc(String(id).slice(0, 52)) + ']</span>');
        st.applied[a.addr] = { id: id };
      } else if (a.act === 'update') {
        write('<span class="o-hl">' + esc(a.addr) + '</span>: Modifying... <span class="o-dim">[id=' + esc(st.applied[a.addr].id).slice(0, 40) + ']</span>');
        write('<span class="o-hl">' + esc(a.addr) + '</span>: <span class="o-chg">Modifications complete after 3s</span>');
        delete st.drift[a.addr];
      } else {
        write('<span class="o-hl">' + esc(a.addr) + '</span>: <span class="o-del">Destroying...</span>');
        write('<span class="o-hl">' + esc(a.addr) + '</span>: <span class="o-del">Destruction complete after 2s</span>');
        delete st.applied[a.addr];
      }
    });
    st.serial++;
    IAC.lab.save();
    write('\n<span class="o-b">Apply complete!</span> Resources: <span class="o-add">' + p.add + ' added</span>, <span class="o-chg">' + p.change + ' changed</span>, <span class="o-del">' + p.destroy + ' destroyed</span>.');
  }

  function tfDestroy(args) {
    const st = s();
    const n = Object.keys(st.applied).length;
    if (!n) return write('<span class="o-b">No changes.</span> No objects need to be destroyed.');
    write('<span class="o-b">Plan:</span> 0 to add, 0 to change, <span class="o-del">' + n + ' to destroy</span>.');
    const go = () => {
      const A2 = A();
      const p = H.plan(A2.blocks, st.applied, st.drift);
      const ord = p.order.slice().reverse().filter(a => st.applied[a]);
      Object.keys(st.applied).forEach(a => { if (ord.indexOf(a) < 0) ord.push(a); });
      ord.forEach(a => {
        write('<span class="o-hl">' + esc(a) + '</span>: <span class="o-del">Destroying...</span> <span class="o-dim">[id=' + esc(st.applied[a].id).slice(0, 40) + ']</span>');
        write('<span class="o-hl">' + esc(a) + '</span>: <span class="o-del">Destruction complete after ' + (1 + a.length % 4) + 's</span>');
      });
      st.applied = {}; st.drift = {}; st.serial++; IAC.lab.save();
      write('\n<span class="o-b">Destroy complete!</span> Resources: <span class="o-del">' + ord.length + ' destroyed</span>.');
    };
    if (args.indexOf('-auto-approve') >= 0) return go();
    write('\n<span class="o-del">Do you really want to destroy all resources?</span>\n  Only \'yes\' will be accepted.\n\n  <span class="o-b">Enter a value:</span> <span class="cursor-blink"></span>');
    pending = function (ans) { if (ans.trim() !== 'yes') return write('\n<span class="o-chg">Destroy cancelled.</span>'); go(); };
  }

  function tfState(args) {
    const st = s(), addrs = Object.keys(st.applied).sort();
    if (args[0] === 'list') {
      if (!addrs.length) return write('<span class="o-dim">(state vazio — rode um apply)</span>');
      return write(addrs.map(a => esc(a)).join('\n'));
    }
    if (args[0] === 'show') {
      const a = args[1];
      if (!a || !st.applied[a]) return write('<span class="o-del">No instance found for ' + esc(a || '') + '</span>');
      const A2 = A(), b = H.graph(A2.blocks).byAddr[a];
      let o = '# ' + esc(a) + ':\nresource "' + esc(b.type) + '" "' + esc(b.name) + '" {\n';
      o += '    id = "' + esc(st.applied[a].id) + '"\n';
      b.items.filter(i => i.t === 'attr' && i.val.indexOf('\n') < 0).slice(0, 14).forEach(i => {
        o += '    ' + esc(IAC.pad(i.key, 22)) + ' = ' + esc(i.val) + '\n';
      });
      o += '}';
      return write('<span class="o-dim">' + o + '</span>');
    }
    if (args[0] === 'rm') return write('<span class="o-chg">"state rm" tira o recurso do state SEM apagar na nuvem.</span>\nUse quando quiser "esquecer" um recurso — ele vira órfão e ninguém mais gerencia.');
    if (args[0] === 'mv') return write('<span class="o-chg">"state mv" renomeia sem recriar.</span>\nHoje o jeito recomendado é o bloco <span class="o-cy">moved</span> no código — versionado e revisável no PR.');
    return write('Usage: terraform state &lt;list|show|rm|mv|pull|push&gt;');
  }

  function tfShow() {
    const st = s();
    if (!Object.keys(st.applied).length) return write('<span class="o-dim">The state file is empty. No resources are represented.</span>');
    const A2 = A();
    write('<span class="o-dim">' + esc(H.tfstate(A2.blocks, st.applied, st.serial).slice(0, 2400)) + '\n...</span>');
  }

  function tfOutput(args) {
    const st = s();
    if (!Object.keys(st.applied).length) return write('<span class="o-chg">Warning: No outputs found</span>\nRode um apply primeiro.');
    const A2 = A();
    const f = A2.files.filter(x => x.name === 'outputs.tf')[0];
    if (!f) return write('<span class="o-dim">Nenhum output declarado. Adicione ECR, VPC, ALB ou Cloud Run.</span>');
    const obs = H.parse(f.text).filter(b => b.kind === 'output');
    obs.forEach(o => write('<span class="o-cy">' + esc(o.name) + '</span> = "' + esc(sample(o.name)) + '"'));
  }
  function sample(n) {
    if (/alb|dns/.test(n)) return 'minha-app-prod-alb-1234567890.us-east-1.elb.amazonaws.com';
    if (/ecr/.test(n)) return '123456789012.dkr.ecr.us-east-1.amazonaws.com/minha-app/api';
    if (/lb_ip/.test(n)) return '34.117.42.8';
    if (/run/.test(n)) return 'https://minha-app-prod-abcdefg-rj.a.run.app';
    if (/vpc/.test(n)) return 'vpc-0a1b2c3d4e5f60718';
    return '(valor gerado no apply)';
  }

  function tfGraph() {
    const A2 = A(), g = H.graph(A2.blocks);
    if (!g.nodes.length) return write('<span class="o-dim">digraph { }</span>');
    let o = 'digraph {\n  compound = "true"\n  newrank = "true"\n  subgraph "root" {\n';
    g.edges.slice(0, 24).forEach(e => { o += '    "[root] ' + e.to + '" -> "[root] ' + e.from + '"\n'; });
    if (g.edges.length > 24) o += '    ... (' + (g.edges.length - 24) + ' arestas omitidas)\n';
    o += '  }\n}';
    write('<span class="o-dim">' + esc(o) + '</span>\n<span class="o-dim">Dica: </span><span class="o-cy">terraform graph | dot -Tsvg > grafo.svg</span><span class="o-dim"> — ou use a aba Diagrama aqui do lado.</span>');
  }

  function tfWorkspace(args) {
    const st = s();
    st.ws = st.ws || ['default'];
    st.wsCur = st.wsCur || 'default';
    if (args[0] === 'list' || !args[0]) { IAC.lab.save(); return write(st.ws.map(w => (w === st.wsCur ? '<span class="o-add">* ' + w + '</span>' : '  ' + w)).join('\n')); }
    if (args[0] === 'new') { if (st.ws.indexOf(args[1]) < 0) st.ws.push(args[1]); st.wsCur = args[1]; IAC.lab.save(); return write('<span class="o-add">Created and switched to workspace "' + esc(args[1]) + '"!</span>\n\n<span class="o-dim">Atenção: workspace compartilha o MESMO código. Para ambientes com diferenças reais\n(tamanho de máquina, conta, região), prefira diretórios separados.</span>'); }
    if (args[0] === 'select') { if (st.ws.indexOf(args[1]) < 0) return write('<span class="o-del">Workspace "' + esc(args[1]) + '" doesn\'t exist.</span>'); st.wsCur = args[1]; IAC.lab.save(); return write('Switched to workspace "' + esc(args[1]) + '".'); }
    return write('Usage: terraform workspace &lt;list|new|select|delete&gt;');
  }

  function tfImport(args) {
    const st = s();
    if (args.length < 2) return write('Usage: terraform import &lt;address&gt; &lt;id&gt;\n\n<span class="o-dim">Ex.: terraform import aws_ecr_repository.api minha-app/api</span>');
    const A2 = A(), b = H.graph(A2.blocks).byAddr[args[0]];
    if (!b) return write('<span class="o-del">Error: resource address "' + esc(args[0]) + '" does not exist in the configuration.</span>\n\n<span class="o-dim">O import só funciona se o bloco JÁ existe no código. Escreva o resource vazio primeiro.</span>');
    st.applied[args[0]] = { id: args[1] }; st.serial++; IAC.lab.save();
    write('<span class="o-hl">' + esc(args[0]) + '</span>: Importing from ID "' + esc(args[1]) + '"...');
    write('<span class="o-hl">' + esc(args[0]) + '</span>: Import prepared!\n  Prepared ' + esc(b.type) + ' for import');
    write('<span class="o-add">\nImport successful!</span>\n\nThe resources that were imported are shown above. These resources are now in\nyour Terraform state and will henceforth be managed by Terraform.');
    write('<span class="o-dim">\nAgora rode "terraform plan": tudo que ele quiser mudar é diferença entre o que\nexiste de verdade e o que você escreveu. Ajuste o código até o plan ficar limpo.</span>');
  }

  IAC.term = { render: render, write: write };
})(window.IAC);
