/* =========================================================
   hcl.js — mini-parser HCL + grafo + plan/apply + state + lint
   A fonte da verdade é o próprio HCL gerado: dele derivamos
   o grafo de dependências, o plano, o apply e o tfstate.
   ========================================================= */
(function (IAC) {
  'use strict';
  const esc = IAC.esc;

  /* ---------------- parser ---------------- */
  function stripStrings(line) {
    let out = '', inStr = false, i = 0;
    while (i < line.length) {
      const c = line[i];
      if (inStr) {
        if (c === '\\') { out += '  '; i += 2; continue; }
        if (c === '"') { inStr = false; out += '"'; i++; continue; }
        out += ' '; i++; continue;
      }
      if (c === '"') { inStr = true; out += '"'; i++; continue; }
      if (c === '#') break;
      if (c === '/' && line[i + 1] === '/') break;
      out += c; i++;
    }
    return out;
  }
  function delta(line) {
    const s = stripStrings(line); let d = 0;
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '{') d++; else if (c === '}') d--; }
    return d;
  }
  function balanced(str) {
    const s = stripStrings(str); let a = 0, b = 0, c = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') a++; else if (ch === ')') a--;
      else if (ch === '[') b++; else if (ch === ']') b--;
      else if (ch === '{') c++; else if (ch === '}') c--;
    }
    return a <= 0 && b <= 0 && c <= 0;
  }

  function parseBody(lines) {
    const items = []; let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || t[0] === '#' || t.slice(0, 2) === '//') { i++; continue; }
      const bm = t.match(/^([A-Za-z_][\w-]*)((?:\s+"[^"]*")*)\s*\{\s*$/);
      if (bm) {
        let d = 0, j = i, end = -1;
        for (; j < lines.length; j++) { d += delta(lines[j]); if (d <= 0) { end = j; break; } }
        if (end < 0) end = lines.length - 1;
        items.push({
          t: 'block', key: bm[1],
          label: (bm[2].match(/"[^"]*"/) || [''])[0].replace(/"/g, '') || null,
          items: parseBody(lines.slice(i + 1, end))
        });
        i = end + 1; continue;
      }
      const am = t.match(/^([A-Za-z_][\w-]*)\s*=\s*(.*)$/);
      if (am) {
        let val = am[2], j = i;
        while (!balanced(val) && j + 1 < lines.length) { j++; val += '\n' + lines[j].trim(); }
        items.push({ t: 'attr', key: am[1], val: val.trim() });
        i = j + 1; continue;
      }
      i++;
    }
    return items;
  }

  function parse(text) {
    const lines = String(text || '').split('\n');
    const blocks = []; let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^([a-z_]+)((?:\s+"[^"]*")*)\s*\{/);
      if (!m) { i++; continue; }
      const kind = m[1];
      const labels = (m[2].match(/"[^"]*"/g) || []).map(s => s.slice(1, -1));
      let d = 0, j = i, end = -1;
      for (; j < lines.length; j++) { d += delta(lines[j]); if (d <= 0) { end = j; break; } }
      if (end < 0) end = lines.length - 1;
      const bodyLines = lines.slice(i + 1, end);
      blocks.push({
        kind, labels,
        type: kind === 'resource' || kind === 'data' ? labels[0] : null,
        name: kind === 'resource' || kind === 'data' ? labels[1] : labels[0],
        addr: addrOf(kind, labels),
        items: parseBody(bodyLines),
        body: bodyLines.join('\n'),
        raw: lines.slice(i, end + 1).join('\n')
      });
      i = end + 1;
    }
    return blocks;
  }
  function addrOf(kind, labels) {
    if (kind === 'resource') return labels[0] + '.' + labels[1];
    if (kind === 'data') return 'data.' + labels[0] + '.' + labels[1];
    if (kind === 'module') return 'module.' + labels[0];
    if (kind === 'output') return 'output.' + labels[0];
    if (kind === 'variable') return 'var.' + labels[0];
    return kind + (labels.length ? '.' + labels.join('.') : '');
  }

  /* ---------------- referências ---------------- */
  const PROV = '(?:aws|google|google-beta|random|tls|null|archive|local|kubernetes|helm)';
  const DATA_RE = new RegExp('\\bdata\\.(' + PROV + '_[a-z0-9_]+)\\.([A-Za-z_][\\w-]*)', 'g');
  const RES_RE = new RegExp('\\b(' + PROV + '_[a-z0-9_]+)\\.([A-Za-z_][\\w-]*)(?:\\.([A-Za-z_][\\w.\\[\\]*-]*))?', 'g');

  function refsOf(text) {
    const out = [];
    const seen = {};
    let s = String(text == null ? '' : text);
    let m;
    DATA_RE.lastIndex = 0;
    while ((m = DATA_RE.exec(s))) { const a = 'data.' + m[1] + '.' + m[2]; if (!seen[a]) { seen[a] = 1; out.push({ addr: a, attr: null }); } }
    s = s.replace(DATA_RE, x => ' '.repeat(x.length));
    RES_RE.lastIndex = 0;
    while ((m = RES_RE.exec(s))) {
      const a = m[1] + '.' + m[2];
      const k = a + '|' + (m[3] || '');
      if (!seen[k]) { seen[k] = 1; out.push({ addr: a, attr: m[3] || null }); }
    }
    return out;
  }
  function itemsText(items) {
    return items.map(it => it.t === 'attr' ? it.val : itemsText(it.items)).join('\n');
  }

  /* ---------------- grafo ---------------- */
  function graph(blocks) {
    const nodes = blocks.filter(b => b.kind === 'resource' || b.kind === 'data' || b.kind === 'module');
    const byAddr = {}; nodes.forEach(n => byAddr[n.addr] = n);
    const edges = [];
    nodes.forEach(n => {
      const txt = itemsText(n.items);
      const seen = {};
      refsOf(txt).forEach(r => {
        if (r.addr !== n.addr && byAddr[r.addr] && !seen[r.addr]) { seen[r.addr] = 1; edges.push({ from: r.addr, to: n.addr }); }
      });
      // depends_on explícito
      const dep = n.items.filter(i => i.t === 'attr' && i.key === 'depends_on')[0];
      if (dep) refsOf(dep.val).forEach(r => {
        if (byAddr[r.addr] && !seen[r.addr]) { seen[r.addr] = 1; edges.push({ from: r.addr, to: n.addr, explicit: true }); }
      });
    });
    return { nodes, edges, byAddr };
  }

  function topo(g) {
    const indeg = {}, adj = {};
    g.nodes.forEach(n => { indeg[n.addr] = 0; adj[n.addr] = []; });
    g.edges.forEach(e => { if (adj[e.from]) { adj[e.from].push(e.to); indeg[e.to]++; } });
    const q = g.nodes.filter(n => indeg[n.addr] === 0).map(n => n.addr).sort();
    const out = []; const level = {};
    q.forEach(a => level[a] = 0);
    while (q.length) {
      const a = q.shift(); out.push(a);
      (adj[a] || []).forEach(b => {
        level[b] = Math.max(level[b] || 0, (level[a] || 0) + 1);
        if (--indeg[b] === 0) q.push(b);
      });
    }
    g.nodes.forEach(n => { if (out.indexOf(n.addr) < 0) { out.push(n.addr); level[n.addr] = level[n.addr] || 0; } });
    return { order: out, level };
  }

  /* ---------------- valores / computed ---------------- */
  const KNOWN_ATTRS = { name: 1, bucket: 1, family: 1, identifier: 1, port: 1, protocol: 1, repository: 1, key: 1, domain_name: 1, function_name: 1, secret_id: 1 };
  const NO_ARN = /(association|attachment|_rule$|route_table|_route$|_record$|_version$|_policy$|_object$|_membership$|_binding$|_iam_member$|encryption|public_access_block|lifecycle|_group_rule$|_notification$|zone$)/;

  function isComputedValue(val, byAddr) {
    let unknown = false;
    refsOf(val).forEach(r => {
      const t = byAddr[r.addr];
      if (!t) return;
      if (t.kind === 'data') return;                      // data sources são conhecidos no plan
      if (r.attr && KNOWN_ATTRS[r.attr.split('.')[0]]) {
        const lit = literalOf(t, r.attr.split('.')[0]);
        if (lit != null) return;
      }
      unknown = true;
    });
    return unknown;
  }
  function literalOf(block, key) {
    const it = block.items.filter(i => i.t === 'attr' && i.key === key)[0];
    if (!it) return null;
    if (/[a-z_]+\.[a-z_]/.test(it.val)) return null;
    return it.val;
  }

  function planItems(block, byAddr) {
    const out = [];
    block.items.forEach(it => {
      if (it.t === 'attr') {
        if (it.key === 'depends_on' || it.key === 'provider') return;
        const multiline = it.val.indexOf('\n') >= 0;
        let v;
        if (isComputedValue(it.val, byAddr)) v = '(known after apply)';
        else if (multiline) v = it.val.split('\n')[0].trim().replace(/\($/, '(…)') || '(…)';
        else v = it.val;
        out.push({ t: 'attr', key: it.key, val: v });
      } else if (it.t === 'block') {
        if (it.key === 'lifecycle') return;
        out.push({ t: 'block', key: it.key, label: it.label, items: planItems({ items: it.items }, byAddr) });
      }
    });
    // atributos computados sintéticos
    const has = k => out.some(o => o.t === 'attr' && o.key === k);
    const type = block.type || '';
    if (!has('id')) out.unshift({ t: 'attr', key: 'id', val: '(known after apply)' });
    if (type.indexOf('aws_') === 0 && !has('arn') && !NO_ARN.test(type)) out.splice(1, 0, { t: 'attr', key: 'arn', val: '(known after apply)' });
    if (type.indexOf('google_') === 0 && !has('self_link') && !NO_ARN.test(type)) out.splice(1, 0, { t: 'attr', key: 'self_link', val: '(known after apply)' });
    if (has('tags') && !has('tags_all')) out.push({ t: 'attr', key: 'tags_all', val: '(known after apply)' });
    return out;
  }

  function renderPlanItems(items, indent, sym) {
    const pad = ' '.repeat(indent);
    const keys = items.filter(i => i.t === 'attr').map(i => i.key.length);
    const w = keys.length ? Math.max.apply(null, keys) : 0;
    let s = '';
    items.forEach(it => {
      if (it.t === 'attr') {
        const val = it.val === '(known after apply)'
          ? '<span class="o-dim">(known after apply)</span>'
          : '<span class="o-cy">' + esc(it.val) + '</span>';
        s += pad + '<span class="' + sym.cls + '">' + sym.ch + '</span> ' + esc(IAC.pad(it.key, w)) + ' = ' + val + '\n';
      } else {
        s += pad + '<span class="' + sym.cls + '">' + sym.ch + '</span> ' + esc(it.key) + (it.label ? ' "' + esc(it.label) + '"' : '') + ' {\n';
        s += renderPlanItems(it.items, indent + 4, sym);
        s += pad + '  }\n';
      }
    });
    return s;
  }

  /* ---------------- plan ---------------- */
  const SYM = {
    create: { ch: '+', cls: 'o-add', word: 'created' },
    destroy: { ch: '-', cls: 'o-del', word: 'destroyed' },
    update: { ch: '~', cls: 'o-chg', word: 'updated in-place' },
    replace: { ch: '-/+', cls: 'o-del', word: 'replaced' }
  };

  /**
   * plan(blocks, state, drift)
   *  state: { addr: {id, attrs} }  — o que já existe
   *  drift: { addr: {key: newValueVindoDoConsole} }
   */
  function plan(blocks, state, drift) {
    state = state || {}; drift = drift || {};
    const g = graph(blocks);
    const t = topo(g);
    const managed = g.nodes.filter(n => n.kind === 'resource');
    const actions = [];
    managed.forEach(n => {
      if (!state[n.addr]) actions.push({ addr: n.addr, act: 'create', block: n });
      else if (drift[n.addr]) actions.push({ addr: n.addr, act: 'update', block: n, drift: drift[n.addr] });
    });
    Object.keys(state).forEach(a => { if (!g.byAddr[a]) actions.push({ addr: a, act: 'destroy', block: null, prev: state[a] }); });
    actions.sort((a, b) => t.order.indexOf(a.addr) - t.order.indexOf(b.addr));

    let out = '';
    const dataN = g.nodes.filter(n => n.kind === 'data').length;
    if (dataN) {
      g.nodes.filter(n => n.kind === 'data').forEach(n => {
        out += '<span class="o-dim">' + esc(n.addr) + ': Reading...</span>\n';
        out += '<span class="o-dim">' + esc(n.addr) + ': Read complete after 0s</span>\n';
      });
      out += '\n';
    }
    if (!actions.length) {
      out += '<span class="o-b">No changes.</span> Your infrastructure matches the configuration.\n\n';
      out += '<span class="o-dim">Terraform has compared your real infrastructure against your configuration\n';
      out += 'and found no differences, so no changes are needed.</span>\n';
      return { html: out, add: 0, change: 0, destroy: 0, actions: actions, order: t.order, graph: g };
    }
    out += 'Terraform used the selected providers to generate the following execution\nplan. Resource actions are indicated with the following symbols:\n';
    const kinds = {};
    actions.forEach(a => kinds[a.act] = 1);
    if (kinds.create) out += '  <span class="o-add">+</span> create\n';
    if (kinds.update) out += '  <span class="o-chg">~</span> update in-place\n';
    if (kinds.destroy) out += '  <span class="o-del">-</span> destroy\n';
    out += '\nTerraform will perform the following actions:\n\n';

    actions.forEach(a => {
      if (a.act === 'create') {
        out += '  <span class="o-dim"># ' + esc(a.addr) + ' will be created</span>\n';
        out += '  <span class="o-add">+</span> resource "' + esc(a.block.type) + '" "' + esc(a.block.name) + '" {\n';
        out += renderPlanItems(planItems(a.block, g.byAddr), 6, SYM.create);
        out += '    }\n\n';
      } else if (a.act === 'update') {
        out += '  <span class="o-dim"># ' + esc(a.addr) + ' will be updated in-place</span>\n';
        out += '  <span class="o-chg">~</span> resource "' + esc(a.block.type) + '" "' + esc(a.block.name) + '" {\n';
        out += '        id' + ' '.repeat(8) + ' = "' + esc(state[a.addr].id) + '"\n';
        Object.keys(a.drift).forEach(k => {
          const d = a.drift[k];
          out += '      <span class="o-chg">~</span> ' + esc(k) + ' = <span class="o-del">' + esc(d.real) + '</span> <span class="o-dim">-></span> <span class="o-add">' + esc(d.want) + '</span>\n';
        });
        out += '        <span class="o-dim"># (demais atributos sem mudança)</span>\n';
        out += '    }\n\n';
      } else {
        out += '  <span class="o-dim"># ' + esc(a.addr) + ' will be destroyed</span>\n';
        out += '  <span class="o-del">-</span> resource "' + esc(a.addr.split('.')[0]) + '" "' + esc(a.addr.split('.')[1]) + '" {\n';
        out += '      <span class="o-del">-</span> id = "' + esc(a.prev.id) + '" <span class="o-dim">-> null</span>\n';
        out += '    }\n\n';
      }
    });
    const add = actions.filter(a => a.act === 'create').length;
    const ch = actions.filter(a => a.act === 'update').length;
    const de = actions.filter(a => a.act === 'destroy').length;
    out += '<span class="o-b">Plan:</span> <span class="o-add">' + add + ' to add</span>, <span class="o-chg">' + ch + ' to change</span>, <span class="o-del">' + de + ' to destroy</span>.\n';
    return { html: out, add: add, change: ch, destroy: de, actions: actions, order: t.order, graph: g };
  }

  /* ---------------- ids e tempos ---------------- */
  const ID_SHAPES = [
    [/^aws_vpc$/, s => 'vpc-0' + IAC.rnd(s, 16)],
    [/^aws_subnet$/, s => 'subnet-0' + IAC.rnd(s, 16)],
    [/^aws_security_group$/, s => 'sg-0' + IAC.rnd(s, 16)],
    [/^aws_internet_gateway$/, s => 'igw-0' + IAC.rnd(s, 16)],
    [/^aws_nat_gateway$/, s => 'nat-0' + IAC.rnd(s, 16)],
    [/^aws_eip$/, s => 'eipalloc-0' + IAC.rnd(s, 16)],
    [/^aws_route_table/, s => 'rtb-0' + IAC.rnd(s, 16)],
    [/^aws_route$/, s => 'r-rtb-0' + IAC.rnd(s, 10)],
    [/^aws_instance$/, s => 'i-0' + IAC.rnd(s, 16)],
    [/^aws_launch_template$/, s => 'lt-0' + IAC.rnd(s, 16)],
    [/^aws_lb$/, s => 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/' + s + '/' + IAC.rnd(s, 16)],
    [/^aws_lb_target_group$/, s => 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/' + s + '/' + IAC.rnd(s, 16)],
    [/^aws_lb_listener/, s => 'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/' + s + '/' + IAC.rnd(s, 16)],
    [/^aws_iam_role$/, s => s],
    [/^aws_iam_policy$/, s => 'arn:aws:iam::123456789012:policy/' + s],
    [/^aws_secretsmanager_secret$/, s => 'arn:aws:secretsmanager:us-east-1:123456789012:secret:' + s + '-' + IAC.rnd(s, 6, 'abcdefghijklmnopqrstuvwxyz')],
    [/^aws_kms_key$/, s => IAC.rnd(s, 8) + '-' + IAC.rnd(s + 'a', 4) + '-' + IAC.rnd(s + 'b', 4) + '-' + IAC.rnd(s + 'c', 12)],
    [/^aws_db_instance$/, s => s],
    [/^aws_ecs_/, s => 'arn:aws:ecs:us-east-1:123456789012:' + s],
    [/^aws_cloudfront_distribution$/, s => 'E' + IAC.rnd(s, 13, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')],
    [/^google_compute_/, s => 'projects/meu-projeto/global/' + s],
    [/^google_/, s => 'projects/meu-projeto/' + s]
  ];
  function fakeId(block) {
    const nm = literalOf(block, 'name') || literalOf(block, 'bucket') || literalOf(block, 'family') ||
      literalOf(block, 'repository') || literalOf(block, 'identifier') || ('"' + block.name + '"');
    const clean = String(nm).replace(/"/g, '').replace(/\$\{[^}]*\}/g, 'x').slice(0, 40) || block.name;
    for (let i = 0; i < ID_SHAPES.length; i++) if (ID_SHAPES[i][0].test(block.type || '')) return ID_SHAPES[i][1](clean);
    return clean + '-' + IAC.rnd(block.addr, 8);
  }
  const SLOW = [
    [/aws_db_instance|aws_rds_cluster|aws_elasticache/, 320],
    [/aws_cloudfront_distribution/, 240],
    [/aws_eks_cluster|google_container_cluster/, 600],
    [/aws_nat_gateway/, 110],
    [/aws_lb$/, 145],
    [/aws_acm_certificate_validation/, 90],
    [/aws_autoscaling_group|google_compute_instance_group_manager/, 75],
    [/aws_instance|google_compute_instance/, 35],
    [/aws_ecs_service|google_cloud_run/, 45],
    [/aws_lb_target_group|aws_lb_listener/, 6],
    [/aws_s3_bucket$|google_storage_bucket/, 4]
  ];
  function fakeDur(type) {
    for (let i = 0; i < SLOW.length; i++) if (SLOW[i][0].test(type)) return SLOW[i][1];
    return 1 + (type.length % 4);
  }
  function fmtDur(s) {
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), r = s % 60;
    return m + 'm' + (r < 10 ? '0' : '') + r + 's';
  }

  /* ---------------- tfstate ---------------- */
  function tfstate(blocks, state, serial) {
    const g = graph(blocks);
    const res = [];
    Object.keys(state).forEach(addr => {
      const b = g.byAddr[addr];
      const parts = addr.split('.');
      const attrs = { id: state[addr].id };
      if (b) b.items.forEach(it => {
        if (it.t === 'attr' && it.val.indexOf('\n') < 0 && it.key !== 'depends_on') {
          let v = it.val;
          if (/^".*"$/.test(v)) v = v.slice(1, -1);
          else if (/^\d+$/.test(v)) v = parseInt(v, 10);
          else if (v === 'true' || v === 'false') v = (v === 'true');
          else if (/[a-z_]+\.[a-z_]/.test(v)) v = '<' + v + '>';
          attrs[it.key] = v;
        }
      });
      res.push({
        mode: 'managed', type: parts[0], name: parts[1],
        provider: 'provider["registry.terraform.io/hashicorp/' + (parts[0].indexOf('google') === 0 ? 'google' : 'aws') + '"]',
        instances: [{ schema_version: 0, attributes: attrs, sensitive_attributes: [] }]
      });
    });
    return JSON.stringify({
      version: 4,
      terraform_version: '1.9.8',
      serial: serial || 1,
      lineage: IAC.rnd('lineage', 8) + '-' + IAC.rnd('l2', 4) + '-' + IAC.rnd('l3', 4) + '-' + IAC.rnd('l4', 12),
      outputs: {},
      resources: res
    }, null, 2);
  }

  /* ---------------- lint / validação ---------------- */
  const RULES = [
    {
      id: 'no-backend', sev: 'warn',
      msg: 'Nenhum backend remoto configurado — o state vai ficar no seu notebook.',
      fix: 'Adicione o componente "Backend remoto (S3 + DynamoDB)" ou "Backend remoto (GCS)". State local não tem lock nem histórico e some se a máquina morrer.',
      test: (b) => !b.some(x => x.kind === 'terraform' && /backend\s+"/.test(x.raw))
    },
    {
      id: 'no-required-version', sev: 'info',
      msg: 'Sem required_version — versões diferentes de Terraform no time podem corromper o state.',
      fix: 'terraform { required_version = "~> 1.9" }',
      test: (b) => !b.some(x => x.kind === 'terraform' && /required_version/.test(x.raw))
    },
    {
      id: 'sg-open-ssh', sev: 'err',
      msg: 'Security Group liberando SSH/RDP para 0.0.0.0/0.',
      fix: 'Use SSM Session Manager (sem porta 22 aberta) ou restrinja ao CIDR do escritório/VPN.',
      test: (b) => b.some(x => /security_group/.test(x.type || '') &&
        /0\.0\.0\.0\/0/.test(x.raw) && /from_port\s*=\s*(22|3389)/.test(x.raw))
    },
    {
      id: 'asg-no-tg', sev: 'warn',
      msg: 'Auto Scaling Group sem target_group_arns — as instâncias sobem mas não recebem tráfego do Load Balancer.',
      fix: 'É exatamente o "vincular ao Target Group" do console: target_group_arns = [aws_lb_target_group.x.arn].',
      test: (b) => b.some(x => x.type === 'aws_autoscaling_group' && !/target_group_arns/.test(x.raw)) &&
        b.some(x => x.type === 'aws_lb_target_group') &&
        !b.some(x => x.type === 'aws_autoscaling_attachment')
    },
    {
      id: 'asg-health-ec2', sev: 'info',
      msg: 'ASG com health_check_type = "EC2" atrás de um ALB.',
      fix: 'Use "ELB" para que o ASG substitua instâncias que estão up mas com a aplicação quebrada.',
      test: (b) => b.some(x => x.type === 'aws_autoscaling_group' && /health_check_type\s*=\s*"EC2"/.test(x.raw)) &&
        b.some(x => x.type === 'aws_lb')
    },
    {
      id: 'lb-no-listener', sev: 'err',
      msg: 'Load Balancer sem listener — ele existe, custa dinheiro e não atende nada.',
      fix: 'Adicione o componente "Listener HTTPS + redirect 80→443".',
      test: (b) => b.some(x => x.type === 'aws_lb') && !b.some(x => /aws_lb_listener$/.test(x.type || ''))
    },
    {
      id: 'tg-no-target', sev: 'warn',
      msg: 'Target Group sem nada registrado (nem ASG, nem serviço ECS, nem attachment).',
      fix: 'O health check vai ficar eternamente "unused". Vincule um ASG ou um ECS service.',
      test: (b) => b.some(x => x.type === 'aws_lb_target_group') &&
        !/aws_lb_target_group\.[\w-]+\.arn/.test(b.filter(x => /autoscaling_group|ecs_service|lb_target_group_attachment|autoscaling_attachment/.test(x.type || '')).map(x => x.raw).join('\n'))
    },
    {
      id: 'secret-hardcoded', sev: 'err',
      msg: 'Valor de secret escrito direto no .tf — ele vai parar no Git e no state em texto claro.',
      fix: 'Crie só o "envelope" do secret e injete o valor fora do Terraform (console/CLI/pipeline), com lifecycle { ignore_changes = [secret_string] }.',
      test: (b) => b.some(x => x.type === 'aws_secretsmanager_secret_version' &&
        /(senha|password|p@ss|123456|troque-me)/i.test(x.raw) && !/ignore_changes/.test(x.raw))
    },
    {
      id: 'ecr-mutable', sev: 'warn',
      msg: 'ECR com tags mutáveis — "latest" hoje pode não ser "latest" amanhã.',
      fix: 'image_tag_mutability = "IMMUTABLE" e faça deploy por digest ou por tag imutável (o SHA do commit).',
      test: (b) => b.some(x => x.type === 'aws_ecr_repository' && /image_tag_mutability\s*=\s*"MUTABLE"/.test(x.raw))
    },
    {
      id: 's3-public', sev: 'err',
      msg: 'Bucket S3 sem aws_s3_bucket_public_access_block.',
      fix: 'Sempre adicione o bloqueio de acesso público; a exposição de bucket ainda é a causa nº 1 de vazamento em nuvem.',
      test: (b) => b.some(x => x.type === 'aws_s3_bucket') && !b.some(x => x.type === 'aws_s3_bucket_public_access_block')
    },
    {
      id: 'rds-public', sev: 'err',
      msg: 'RDS com publicly_accessible = true.',
      fix: 'Banco fica em subnet privada. Acesso via bastion/SSM ou VPN.',
      test: (b) => b.some(x => /aws_db_instance|aws_rds_cluster/.test(x.type || '') && /publicly_accessible\s*=\s*true/.test(x.raw))
    },
    {
      id: 'iam-star', sev: 'warn',
      msg: 'Política IAM com actions = ["*"] ou resources = ["*"] em ações de escrita.',
      fix: 'Comece pelo mínimo e amplie com base no CloudTrail / IAM Access Analyzer.',
      test: (b) => b.some(x => /iam_policy_document|iam_policy|iam_role_policy/.test(x.type || x.name || '') &&
        /actions\s*=\s*\[\s*"\*"/.test(x.raw))
    },
    {
      id: 'imdsv1', sev: 'warn',
      msg: 'Launch template sem http_tokens = "required" (IMDSv2).',
      fix: 'IMDSv1 permite roubo de credenciais da role via SSRF. Sempre exija IMDSv2.',
      test: (b) => b.some(x => x.type === 'aws_launch_template' && !/http_tokens\s*=\s*"required"/.test(x.raw))
    },
    {
      id: 'no-tags', sev: 'info',
      msg: 'Provider sem default_tags — sem tags padronizadas o FinOps vira arqueologia.',
      fix: 'provider "aws" { default_tags { tags = local.tags } }',
      test: (b) => b.some(x => x.kind === 'provider' && x.labels[0] === 'aws') &&
        !b.some(x => x.kind === 'provider' && /default_tags/.test(x.raw))
    },
    {
      id: 'gcp-fw-open', sev: 'err',
      msg: 'Regra de firewall do GCP com source_ranges 0.0.0.0/0 em porta administrativa.',
      fix: 'Use IAP TCP forwarding (35.235.240.0/20) em vez de expor 22 para a internet.',
      test: (b) => b.some(x => x.type === 'google_compute_firewall' &&
        /0\.0\.0\.0\/0/.test(x.raw) && /"(22|3389)"/.test(x.raw))
    },
    {
      id: 'gcp-sa-owner', sev: 'err',
      msg: 'Service Account com papel roles/owner ou roles/editor.',
      fix: 'Papéis básicos são amplos demais. Use papéis predefinidos específicos (ex.: roles/secretmanager.secretAccessor).',
      test: (b) => b.some(x => /google_project_iam/.test(x.type || '') && /roles\/(owner|editor)/.test(x.raw))
    },
    {
      id: 'no-prevent-destroy', sev: 'info',
      msg: 'Recurso com estado (banco/bucket) sem lifecycle { prevent_destroy = true }.',
      fix: 'Uma linha que já salvou muita gente de um terraform destroy no diretório errado.',
      test: (b) => b.some(x => /aws_db_instance|aws_rds_cluster|google_sql_database_instance/.test(x.type || '') && !/prevent_destroy/.test(x.raw))
    }
  ];
  function lint(blocks) {
    const found = [];
    RULES.forEach(r => { try { if (r.test(blocks)) found.push(r); } catch (e) { } });
    return found;
  }

  IAC.hcl = {
    parse, parseBody, graph, topo, plan, tfstate, lint, refsOf,
    fakeId, fakeDur, fmtDur, literalOf, addrOf, RULES
  };
})(window.IAC);
