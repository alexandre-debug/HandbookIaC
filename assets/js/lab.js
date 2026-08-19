/* =========================================================
   lab.js — o laboratório: montar, gerar, planejar, aplicar
   ========================================================= */
(function (IAC) {
  'use strict';
  const $ = IAC.$, $$ = IAC.$$, esc = IAC.esc, H = IAC.hcl;

  const S = {
    aws: null, gcp: null, cloud: 'aws'
  };
  function blank(cloud) {
    return { cloud: cloud, items: [], sel: null, tab: 'build', applied: {}, drift: {}, serial: 0, initialized: false, planTxt: '', applyTxt: '' };
  }
  function st() { return S[S.cloud]; }
  function load() {
    ['aws', 'gcp'].forEach(c => {
      const raw = IAC.store.get('lab.' + c, null);
      S[c] = raw && raw.items ? raw : blank(c);
      S[c].cloud = c;
    });
  }
  function save() { IAC.store.set('lab.' + S.cloud, st()); }
  function catalog() { return S.cloud === 'aws' ? IAC.awsRes : IAC.gcpRes; }
  function cats() { return S.cloud === 'aws' ? IAC.awsCats : IAC.gcpCats; }
  function def(cid) { return catalog().filter(d => d.id === cid)[0]; }

  /* ---------------- assembler ---------------- */
  function tfName(s) {
    let n = String(s || 'main').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (!n || /^[0-9]/.test(n)) n = 'r_' + n;
    return n;
  }
  function cfgOf(item) {
    const d = def(item.cid); if (!d) return null;
    const c = {};
    (d.inputs || []).forEach(i => { c[i.k] = (item.cfg && item.cfg[i.k] !== undefined) ? item.cfg[i.k] : i.v; });
    c._n = tfName(c.name !== undefined ? c.name : d.id);
    c._cid = d.id;
    return c;
  }

  function assemble() {
    const s = st();
    const order = catalog().map(d => d.id);
    const items = s.items.slice().sort((a, b) => order.indexOf(a.cid) - order.indexOf(b.cid));
    const prep = items.map(it => ({ it: it, d: def(it.cid), c: cfgOf(it) })).filter(x => x.d && x.c);
    const byCid = {}; prep.forEach(p => { if (!byCid[p.d.id]) byCid[p.d.id] = []; byCid[p.d.id].push(p); });

    const flags = { vpcData: false, missingSG: [] };
    const ctx = {
      cloud: S.cloud,
      has: cid => !!byCid[cid],
      all: cid => byCid[cid] || [],
      nameOf: cid => byCid[cid] ? byCid[cid][0].c._n : null,
      cfg: cid => byCid[cid] ? byCid[cid][0].c : null,
      vpcId: function () {
        if (S.cloud === 'gcp') return 'google_compute_network.main.id';
        if (byCid.vpc) return 'aws_vpc.main.id';
        flags.vpcData = true; return 'data.aws_vpc.default.id';
      },
      pubSubnets: function () {
        if (byCid.vpc) return 'aws_subnet.public[*].id';
        flags.vpcData = true; return 'data.aws_subnets.default.ids';
      },
      privSubnets: function () {
        if (S.cloud === 'gcp') return 'google_compute_subnetwork.main.id';
        if (byCid.vpc) return 'aws_subnet.private[*].id';
        flags.vpcData = true; return 'data.aws_subnets.default.ids';
      },
      sgRef: function (preset) {
        const list = byCid.sg || [];
        const hit = list.filter(p => p.c.preset === preset)[0] || (preset === 'app' ? list.filter(p => p.c.preset !== 'alb')[0] : null);
        if (hit) return 'aws_security_group.' + hit.c._n + '.id';
        flags.missingSG.push(preset);
        return 'aws_security_group.' + preset + '.id';
      }
    };

    const files = {};
    const push = (name, txt) => { if (!txt) return; (files[name] = files[name] || []).push(txt.replace(/\n{3,}/g, '\n\n').trim()); };
    const extras = [];

    prep.forEach(p => {
      const fname = typeof p.d.file === 'function' ? p.d.file(p.c) : (p.d.file || 'main.tf');
      let body = '';
      try { body = p.d.hcl(p.c, ctx); } catch (e) { body = '# erro ao gerar ' + p.d.id + ': ' + e.message; }
      push(fname, body);
      if (p.d.outputs) { try { push('outputs.tf', p.d.outputs(p.c, ctx)); } catch (e) { } }
      if (p.d.extra) { try { extras.push(p.d.extra(p.c, ctx)); } catch (e) { } }
      if (p.d.after) { try { const a = p.d.after(p.c, ctx); if (a) extras.push({ file: a.title, hcl: a.code, lang: a.lang, note: 'passo fora do Terraform' }); } catch (e) { } }
    });

    if (flags.vpcData && S.cloud === 'aws') {
      push('main.tf', `# Nenhuma VPC no projeto: caindo na VPC default da conta.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}`);
    }

    const ORDER = ['main.tf', 'backend.tf', 'vpc.tf', 'endpoints.tf', 'iam.tf', 'kms.tf', 'secrets.tf', 'ssm.tf', 'ecr.tf', 'artifact-registry.tf', 'acm.tf', 'alb.tf', 'lb.tf', 'armor.tf', 'waf.tf', 'compute.tf', 'ecs.tf', 'cloudrun.tf', 'gke.tf', 'lambda.tf', 'rds.tf', 'sql.tf', 's3.tf', 'storage.tf', 'dynamo.tf', 'dns.tf', 'observability.tf', 'monitoring.tf', 'outputs.tf'];
    const names = Object.keys(files).sort((a, b) => {
      const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia < 0 ? 900 : ia) - (ib < 0 ? 900 : ib) || a.localeCompare(b);
    });
    const fileList = names.map(n => ({ name: n, text: files[n].join('\n\n') }));
    const text = fileList.map(f => f.text).join('\n\n');
    return { files: fileList, text: text, ctx: ctx, prep: prep, extras: extras, flags: flags, blocks: H.parse(text) };
  }

  /* ---------------- custo estimado ---------------- */
  const INST_PRICE = { 't3.micro': 8, 't3.small': 15, 't3.medium': 30, 'm6i.large': 70, 'e2-micro': 7, 'e2-small': 14, 'e2-medium': 28, 'n2-standard-2': 70 };
  function estimate(prep) {
    let total = 0; const lines = [];
    const byCid = {}; prep.forEach(p => byCid[p.d.id] = p);
    prep.forEach(p => {
      let v = p.d.cost || 0;
      if (p.d.id === 'asg') {
        const lt = byCid.lt; const price = lt ? (INST_PRICE[lt.c.type] || 15) : 15;
        v = price * (p.c.des || 1);
      }
      if (p.d.id === 'mig') {
        const it = byCid.it; const price = it ? (INST_PRICE[it.c.type] || 14) : 14;
        v = price * (p.c.min || 1);
      }
      if (p.d.id === 'vpc' && p.c.nat === 'none') v = 0;
      if (p.d.id === 'vpc' && p.c.nat === 'per-az') v = 33 * (p.c.azs || 2);
      if (p.d.id === 'rds') { v = ({ 'db.t4g.micro': 13, 'db.t4g.small': 26, 'db.m6g.large': 130 })[p.c.class] || 30; if (p.c.multiaz) v *= 2; }
      if (p.d.id === 'sql') { v = ({ 'db-f1-micro': 9, 'db-custom-1-3840': 50, 'db-custom-2-7680': 100 })[p.c.tier] || 35; if (p.c.ha) v *= 2; }
      if (v > 0) { total += v; lines.push({ n: p.d.name, v: v }); }
    });
    lines.sort((a, b) => b.v - a.v);
    return { total: total, lines: lines };
  }

  /* ---------------- validação extra ---------------- */
  function missingRefs(blocks) {
    const defined = {};
    blocks.forEach(b => { if (b.kind === 'resource' || b.kind === 'data') defined[b.addr] = 1; });
    const miss = {};
    blocks.forEach(b => {
      H.refsOf(b.raw).forEach(r => {
        if (r.addr.indexOf('data.') === 0) return;
        if (!defined[r.addr]) miss[r.addr] = 1;
      });
    });
    return Object.keys(miss);
  }

  /* ---------------- diagrama ---------------- */
  const GROUPS = [
    [/vpc|subnet|route|internet_gateway|nat_gateway|eip|network|firewall|router/, '#58a6ff', 'Rede'],
    [/iam|kms|secret|service_account|ssm_parameter/, '#db61a2', 'Identidade & Segredos'],
    [/security_group/, '#f0883e', 'Firewall'],
    [/ecr|artifact_registry/, '#ff9900', 'Registry'],
    [/lb|target_group|listener|forwarding_rule|url_map|proxy|health_check|backend_service|acm|certificate|waf|security_policy/, '#3fb950', 'Entrega'],
    [/autoscaling|launch_template|instance|group_manager|autoscaler|ecs|run_v2|container_cluster|lambda|apigateway/, '#d29922', 'Computação'],
    [/db_instance|rds|sql|s3_bucket|storage_bucket|dynamodb|elasticache/, '#39c5cf', 'Dados'],
    [/cloudwatch|sns|monitoring|dns|route53/, '#a970e8', 'Observabilidade & DNS']
  ];
  function groupOf(type) {
    for (let i = 0; i < GROUPS.length; i++) if (GROUPS[i][0].test(type)) return GROUPS[i];
    return [null, '#6b7a8d', 'Outros'];
  }
  function diagram(blocks) {
    const g = H.graph(blocks);
    if (!g.nodes.length) return '<div class="empty"><div class="big">🧩</div>Adicione recursos para ver o grafo de dependências.</div>';
    const t = H.topo(g);
    const cols = {};
    g.nodes.forEach(n => { const l = t.level[n.addr] || 0; (cols[l] = cols[l] || []).push(n); });
    const NW = 196, NH = 40, GX = 118, GY = 16;
    const levels = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const pos = {};
    let maxRows = 0;
    levels.forEach((l, ci) => {
      cols[l].sort((a, b) => a.addr.localeCompare(b.addr));
      maxRows = Math.max(maxRows, cols[l].length);
      cols[l].forEach((n, ri) => { pos[n.addr] = { x: 26 + ci * (NW + GX), y: 26 + ri * (NH + GY), n: n }; });
    });
    const W = 52 + levels.length * (NW + GX);
    const Hh = 60 + maxRows * (NH + GY);
    let svg = '<svg width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#6b7a8d"/></marker></defs>';
    g.edges.forEach(e => {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x - 4, y2 = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      svg += '<path d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 +
        '" fill="none" stroke="#6b7a8d" stroke-width="1.3" opacity="' + (e.explicit ? '.9' : '.5') + '"' +
        (e.explicit ? ' stroke-dasharray="4 3"' : '') + ' marker-end="url(#ah)"/>';
    });
    g.nodes.forEach(n => {
      const p = pos[n.addr]; if (!p) return;
      const col = groupOf(n.type || '')[1];
      const short = (n.type || '').replace(/^(aws|google)_/, '');
      const dataMark = n.kind === 'data' ? '<tspan fill="#6b7a8d">data · </tspan>' : '';
      svg += '<g class="node-box" data-addr="' + esc(n.addr) + '">' +
        '<rect x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="7" fill="var(--panel)" stroke="' + col + '" stroke-width="1.3"/>' +
        '<rect x="' + p.x + '" y="' + p.y + '" width="3.5" height="' + NH + '" rx="2" fill="' + col + '"/>' +
        '<text x="' + (p.x + 12) + '" y="' + (p.y + 17) + '" font-size="11" font-family="var(--mono)" fill="var(--tx)">' + dataMark + esc(short.slice(0, 26)) + '</text>' +
        '<text x="' + (p.x + 12) + '" y="' + (p.y + 31) + '" font-size="10" font-family="var(--mono)" fill="var(--tx-3)">' + esc(n.name) + '</text>' +
        '<title>' + esc(n.addr) + '</title></g>';
    });
    svg += '</svg>';
    const seen = {};
    let leg = '<div class="legend">';
    g.nodes.forEach(n => { const gr = groupOf(n.type || ''); if (!seen[gr[2]]) { seen[gr[2]] = 1; leg += '<span><i style="background:' + gr[1] + '"></i>' + gr[2] + '</span>'; } });
    leg += '<span><i style="background:#6b7a8d"></i>seta = dependência (o Terraform cria na ordem das setas)</span></div>';
    return '<div class="diagram-wrap">' + svg + '</div>' + leg;
  }

  IAC.lab = { S: S, st: st, save: save, load: load, blank: blank, assemble: assemble, def: def, catalog: catalog, cats: cats, cfgOf: cfgOf, estimate: estimate, missingRefs: missingRefs, diagram: diagram, tfName: tfName };
})(window.IAC);

/* =========================================================
   lab.js (2) — interface do laboratório
   ========================================================= */
(function (IAC) {
  'use strict';
  const $ = IAC.$, $$ = IAC.$$, esc = IAC.esc, H = IAC.hcl, L = IAC.lab;
  let root = null, timer = null;

  const TABS = [
    ['build', 'Recursos', '🧩'],
    ['code', 'Código .tf', '📄'],
    ['graph', 'Diagrama', '🕸️'],
    ['plan', 'Plan', '🔍'],
    ['apply', 'Apply', '🚀'],
    ['checks', 'Checks & Custo', '✅'],
    ['term', 'Terminal', '⌨️']
  ];

  function mount(view, cloud) {
    if (timer) { clearInterval(timer); timer = null; }
    L.S.cloud = cloud;
    if (!L.S[cloud]) L.load();
    const s = L.st();
    if (!s.items.length) {
      const req = L.catalog().filter(d => d.required);
      req.forEach(d => s.items.push({ uid: uid(), cid: d.id, cfg: {} }));
      L.save();
    }
    view.classList.add('wide');
    view.innerHTML =
      '<div class="page full">' +
      '<span class="eyebrow ' + cloud + '">Laboratório</span>' +
      '<h1>' + (cloud === 'aws' ? 'Monte sua infraestrutura AWS' : 'Monte sua infraestrutura GCP') + '</h1>' +
      '<p class="lede">Clique nos componentes à esquerda como você clicaria no console. O Terraform correspondente, o grafo de dependências, o <code>plan</code> e o <code>apply</code> aparecem do lado direito — inclusive o drift de quando alguém mexe no console depois.</p>' +
      '<div id="labTop"></div>' +
      '<div class="lab">' +
      '<aside class="lab-side"><div class="lab-side-h">Catálogo ' + cloud.toUpperCase() +
      '<span class="spacer"></span><span id="cntSel" class="chip"></span></div>' +
      '<div class="lab-side-body" id="labSide"></div></aside>' +
      '<div class="lab-main"><div class="lab-tabs" id="labTabs"></div><div class="lab-body" id="labBody"></div></div>' +
      '</div></div>';
    root = view;
    bind();
    renderAll();
  }
  function uid() { return 'i' + Math.abs(Date.now() % 100000) + Math.floor(Math.random() * 999); }

  function renderAll() { renderTop(); renderSide(); renderTabs(); renderBody(); }

  /* ---------- barra superior ---------- */
  function renderTop() {
    const s = L.st(), A = L.assemble();
    const cost = L.estimate(A.prep);
    const n = A.blocks.filter(b => b.kind === 'resource').length;
    const applied = Object.keys(s.applied).length;
    const drifted = Object.keys(s.drift).length;
    $('#labTop').innerHTML =
      '<div class="toolbar">' +
      '<button class="btn pri" data-act="plan">▶ terraform plan</button>' +
      '<button class="btn ok" data-act="apply">🚀 terraform apply</button>' +
      '<button class="btn dgr" data-act="destroy"' + (applied ? '' : ' disabled') + '>💥 destroy</button>' +
      '<button class="btn" data-act="drift"' + (applied ? '' : ' disabled') + ' title="Alguém mexeu no console...">🕵️ simular ClickOps</button>' +
      '<span class="spacer"></span>' +
      '<span class="chip">' + n + ' recursos</span>' +
      (applied ? '<span class="chip ok">' + applied + ' no state</span>' : '<span class="chip">state vazio</span>') +
      (drifted ? '<span class="chip warn">' + drifted + ' com drift</span>' : '') +
      '<span class="chip info" title="Estimativa grosseira, só para dar noção de ordem de grandeza">≈ US$ ' + cost.total.toFixed(0) + '/mês</span>' +
      '<button class="btn sm" data-act="clear">limpar projeto</button>' +
      '</div>';
  }

  /* ---------- catálogo ---------- */
  function renderSide() {
    const s = L.st();
    const inProj = {}; s.items.forEach(i => inProj[i.cid] = (inProj[i.cid] || 0) + 1);
    let html = '';
    L.cats().forEach(cat => {
      const list = L.catalog().filter(d => d.cat === cat.id);
      if (!list.length) return;
      html += '<div class="cat" data-cat="' + cat.id + '"><button class="cat-h">' + cat.em + ' ' + esc(cat.name) +
        '<svg viewBox="0 0 24 24" class="ico chev"><path d="M6 9l6 6 6-6"/></svg></button><div class="cat-items">';
      list.forEach(d => {
        const c = inProj[d.id] || 0;
        html += '<button class="res' + (c ? ' in' : '') + '" data-add="' + d.id + '">' +
          '<span class="em">' + d.em + '</span><span style="min-width:0"><span class="rn">' + esc(d.name) + '</span>' +
          '<span class="rt">' + esc(d.tf) + '</span></span>' +
          '<span class="plus">' + (c ? (d.multi ? '＋' : '✓') : '＋') + '</span></button>';
      });
      html += '</div></div>';
    });
    $('#labSide').innerHTML = html;
    $('#cntSel').textContent = s.items.length + ' no projeto';
  }

  /* ---------- abas ---------- */
  function renderTabs() {
    const s = L.st();
    $('#labTabs').innerHTML = TABS.map(t =>
      '<button class="tab' + (s.tab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[2] + ' ' + t[1] + '</button>'
    ).join('');
  }

  function renderBody() {
    const s = L.st(), body = $('#labBody');
    body.className = 'lab-body' + (s.tab === 'term' ? ' pad0' : '');
    if (s.tab === 'build') body.innerHTML = viewBuild();
    else if (s.tab === 'code') body.innerHTML = viewCode();
    else if (s.tab === 'graph') body.innerHTML = L.diagram(L.assemble().blocks);
    else if (s.tab === 'plan') body.innerHTML = viewPlan();
    else if (s.tab === 'apply') body.innerHTML = viewApply();
    else if (s.tab === 'checks') body.innerHTML = viewChecks();
    else if (s.tab === 'term') { body.innerHTML = ''; IAC.term.render(body); }
  }

  /* ---------- aba Recursos ---------- */
  function viewBuild() {
    const s = L.st();
    if (!s.items.length) return '<div class="empty"><div class="big">🧩</div>Projeto vazio. Clique em um componente do catálogo.</div>';
    const order = L.catalog().map(d => d.id);
    const items = s.items.slice().sort((a, b) => order.indexOf(a.cid) - order.indexOf(b.cid));
    let html = '<div class="split"><div>';
    html += '<h4 style="margin-top:0">No seu projeto</h4>';
    items.forEach(it => {
      const d = L.def(it.cid); if (!d) return;
      const c = L.cfgOf(it);
      html += '<div class="pitem' + (s.sel === it.uid ? ' sel' : '') + '" data-sel="' + it.uid + '">' +
        '<span class="em">' + d.em + '</span><span style="min-width:0">' +
        '<span class="nm">' + esc(d.name) + '</span><span class="sub">' + esc(d.tf.split(' · ')[0]) + (c.name ? '.' + esc(c._n) : '') + '</span></span>' +
        (d.required ? '<span class="cnt">fixo</span>' : '<button class="del" data-del="' + it.uid + '" title="Remover">×</button>') +
        '</div>';
    });
    html += '</div><div>';
    const sel = items.filter(i => i.uid === s.sel)[0] || items[items.length - 1];
    if (sel) html += inspector(sel);
    html += '</div></div>';
    return html;
  }

  function inspector(item) {
    const d = L.def(item.cid), c = L.cfgOf(item);
    let html = '<h4 style="margin-top:0">' + d.em + ' ' + esc(d.name) + '</h4>';
    html += '<p style="margin-top:0;font-size:13px;color:var(--tx-2)">' + d.desc + '</p>';
    html += '<div style="margin:14px 0">';
    (d.inputs || []).forEach(i => {
      const v = c[i.k];
      let ctl;
      if (i.t === 'bool') ctl = '<input type="checkbox" data-in="' + i.k + '" data-uid="' + item.uid + '"' + (v ? ' checked' : '') + '>';
      else if (i.t === 'sel') ctl = '<select data-in="' + i.k + '" data-uid="' + item.uid + '">' +
        i.opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
      else if (i.t === 'num') ctl = '<input type="number" data-in="' + i.k + '" data-uid="' + item.uid + '" value="' + esc(v) + '"' + (i.min != null ? ' min="' + i.min + '"' : '') + (i.max != null ? ' max="' + i.max + '"' : '') + '>';
      else ctl = '<input type="text" data-in="' + i.k + '" data-uid="' + item.uid + '" value="' + esc(v) + '">';
      html += '<div class="form-row"><label>' + esc(i.l) + '</label>' + ctl + '</div>';
    });
    html += '</div>';
    if (d.console) html += IAC.consoleSteps(d.console);
    if (d.gotchas) html += IAC.warn('Pegadinhas deste recurso', '<ul>' + d.gotchas.map(g => '<li>' + g + '</li>').join('') + '</ul>');
    return html;
  }

  /* ---------- aba Código ---------- */
  function viewCode() {
    const A = L.assemble();
    if (!A.files.length) return '<div class="empty"><div class="big">📄</div>Nada para gerar ainda.</div>';
    let html = '<div class="toolbar"><button class="btn" data-act="copyall">📋 copiar tudo</button>' +
      '<button class="btn" data-act="dlall">⬇ baixar arquivos</button>' +
      '<span class="chip">' + A.files.length + ' arquivos · ' + A.text.split('\n').length + ' linhas</span></div>';
    if (A.flags.missingSG.length) {
      html += IAC.warn('Referência pendente', 'O código aponta para um Security Group que não existe no projeto (<code>' +
        A.flags.missingSG.map(esc).join('</code>, <code>') + '</code>). Adicione o Security Group com esse perfil — é exatamente o erro que o <code>terraform validate</code> daria.');
    }
    A.files.forEach(f => { html += IAC.code(f.text, { lang: 'hcl', file: f.name }); });
    if (A.extras.length) {
      html += '<h3>Fora do Terraform</h3><p style="color:var(--tx-2);font-size:13.5px">Nem tudo é código de infra. Estes são os passos que continuam sendo seus:</p>';
      A.extras.forEach(x => { html += IAC.code(x.hcl, { lang: x.lang || 'hcl', file: x.file }); });
    }
    return html;
  }

  /* ---------- aba Plan ---------- */
  function viewPlan() {
    const s = L.st(), A = L.assemble();
    if (!s.initialized) {
      return '<div class="empty"><div class="big">⚙️</div><p>Rode <code>terraform init</code> antes.</p>' +
        '<button class="btn pri" data-act="init">terraform init</button></div>';
    }
    const p = H.plan(A.blocks, s.applied, s.drift);
    s.planTxt = p.html;
    let head = '<div class="toolbar"><button class="btn pri" data-act="apply">aplicar este plano</button>' +
      '<span class="chip ok">+' + p.add + '</span><span class="chip warn">~' + p.change + '</span><span class="chip err">-' + p.destroy + '</span>' +
      '<span class="spacer"></span><span class="chip">ordem definida pelo grafo, não pelo arquivo</span></div>';
    if (Object.keys(s.drift).length) {
      head += IAC.danger('Drift detectado', 'Alguém mexeu no console depois do último apply. O <code>plan</code> abaixo mostra o Terraform querendo <b>desfazer</b> a mudança manual — este é o momento em que o ClickOps e o IaC se encontram. Ou você aplica e perde a mudança manual, ou traz a mudança para o código.');
    }
    return head + '<div class="term-out">' + p.html + '</div>';
  }

  /* ---------- aba Apply ---------- */
  function viewApply() {
    const s = L.st();
    return '<div class="toolbar"><button class="btn ok" data-act="apply">🚀 apply</button>' +
      '<button class="btn dgr" data-act="destroy"' + (Object.keys(s.applied).length ? '' : ' disabled') + '>💥 destroy</button>' +
      '<button class="btn" data-act="showstate"' + (Object.keys(s.applied).length ? '' : ' disabled') + '>📄 ver terraform.tfstate</button>' +
      '<span class="spacer"></span><span class="chip">serial ' + s.serial + '</span></div>' +
      '<div class="term-out" id="applyOut">' + (s.applyTxt || '<span class="o-dim">Nada aplicado ainda. Clique em apply.</span>') + '</div>';
  }

  /* ---------- aba Checks ---------- */
  function viewChecks() {
    const A = L.assemble(), s = L.st();
    const found = H.lint(A.blocks);
    const miss = L.missingRefs(A.blocks);
    const cost = L.estimate(A.prep);
    let html = '<h4 style="margin-top:0">Validação</h4>';
    if (!found.length && !miss.length) {
      html += '<div class="lint ok"><span class="sev">ok</span><div><div class="msg">Nenhum problema encontrado. Esse projeto passaria em uma revisão de PR.</div></div></div>';
    }
    miss.forEach(m => {
      html += '<div class="lint err"><span class="sev">erro</span><div><div class="msg">Referência a <code>' + esc(m) + '</code>, que não existe no projeto.</div>' +
        '<div class="fix">O <code>terraform validate</code> falharia aqui. Adicione o componente que cria esse recurso.</div></div></div>';
    });
    found.forEach(r => {
      html += '<div class="lint ' + r.sev + '"><span class="sev">' + (r.sev === 'err' ? 'erro' : r.sev === 'warn' ? 'aviso' : 'dica') + '</span>' +
        '<div><div class="msg">' + r.msg + '</div><div class="fix">' + r.fix + '</div></div></div>';
    });
    html += '<h4>Custo estimado</h4>';
    html += '<p style="font-size:13px;color:var(--tx-3);margin-top:0">Estimativa grosseira, sem tráfego nem armazenamento, só para dar noção de ordem de grandeza. Para valor real use <code>infracost</code>.</p>';
    if (cost.lines.length) {
      html += IAC.table(['Componente', 'US$/mês aprox.'], cost.lines.map(l => [esc(l.n), '<b>' + l.v.toFixed(0) + '</b>']).concat([['<b>Total</b>', '<b>' + cost.total.toFixed(0) + '</b>']]));
    } else html += '<p style="color:var(--tx-3)">Nada com custo relevante ainda.</p>';

    const g = H.graph(A.blocks);
    html += '<h4>Resumo</h4>';
    html += '<div class="kv"><b>Recursos gerenciados</b><span>' + g.nodes.filter(n => n.kind === 'resource').length + '</span></div>';
    html += '<div class="kv"><b>Data sources</b><span>' + g.nodes.filter(n => n.kind === 'data').length + '</span></div>';
    html += '<div class="kv"><b>Arestas de dependência</b><span>' + g.edges.length + '</span></div>';
    html += '<div class="kv"><b>Arquivos gerados</b><span>' + A.files.map(f => f.name).join(', ') + '</span></div>';
    html += '<div class="kv"><b>Recursos no state</b><span>' + Object.keys(s.applied).length + '</span></div>';
    return html;
  }

  /* ---------- motor de apply ---------- */
  function runApply(destroy) {
    const s = L.st(), A = L.assemble();
    if (!s.initialized) { IAC.toast('Rode terraform init antes'); s.tab = 'plan'; L.save(); renderAll(); return; }
    const p = H.plan(A.blocks, s.applied, s.drift);
    const evs = [];
    let out = '';
    if (destroy) {
      const addrs = Object.keys(s.applied);
      if (!addrs.length) return;
      const ord = p.order.slice().reverse().filter(a => s.applied[a]);
      Object.keys(s.applied).forEach(a => { if (ord.indexOf(a) < 0) ord.push(a); });
      evs.push({ t: '<span class="o-b">Terraform will perform the following actions:</span>\n' });
      ord.forEach(a => {
        evs.push({ t: '<span class="o-del">' + esc(a) + ': Destroying...</span> <span class="o-dim">[id=' + esc(s.applied[a].id).slice(0, 40) + ']</span>\n' });
        evs.push({ t: '<span class="o-del">' + esc(a) + ': Destruction complete after ' + (1 + a.length % 5) + 's</span>\n' });
      });
      evs.push({ t: '\n<span class="o-b">Destroy complete!</span> Resources: <span class="o-del">' + ord.length + ' destroyed</span>.\n' });
      evs.push({ done: () => { s.applied = {}; s.drift = {}; s.serial++; L.save(); renderTop(); } });
    } else {
      if (!p.add && !p.change && !p.destroy) {
        s.applyTxt = '<span class="o-b">No changes.</span> Your infrastructure matches the configuration.\n\n<span class="o-dim">Apply complete! Resources: 0 added, 0 changed, 0 destroyed.</span>';
        s.tab = 'apply'; L.save(); renderAll(); return;
      }
      const creates = p.actions.filter(a => a.act === 'create').map(a => a.addr);
      const updates = p.actions.filter(a => a.act === 'update');
      p.graph.nodes.filter(n => n.kind === 'data').forEach(n => {
        evs.push({ t: '<span class="o-dim">' + esc(n.addr) + ': Reading...</span>\n' });
        evs.push({ t: '<span class="o-dim">' + esc(n.addr) + ': Read complete after 0s</span>\n' });
      });
      creates.forEach(addr => {
        const b = p.graph.byAddr[addr];
        const dur = H.fakeDur(b.type || '');
        const id = H.fakeId(b);
        evs.push({ t: '<span class="o-hl">' + esc(addr) + '</span>: Creating...\n' });
        if (dur > 30) evs.push({ t: '<span class="o-hl">' + esc(addr) + '</span>: Still creating... <span class="o-dim">[' + H.fmtDur(Math.round(dur / 2)) + ' elapsed]</span>\n' });
        evs.push({
          t: '<span class="o-hl">' + esc(addr) + '</span>: <span class="o-add">Creation complete after ' + H.fmtDur(dur) + '</span> <span class="o-dim">[id=' + esc(String(id).slice(0, 52)) + ']</span>\n',
          done: () => { s.applied[addr] = { id: id }; }
        });
      });
      updates.forEach(a => {
        evs.push({ t: '<span class="o-hl">' + esc(a.addr) + '</span>: Modifying... <span class="o-dim">[id=' + esc(s.applied[a.addr].id).slice(0, 40) + ']</span>\n' });
        evs.push({
          t: '<span class="o-hl">' + esc(a.addr) + '</span>: <span class="o-chg">Modifications complete after 3s</span>\n',
          done: () => { delete s.drift[a.addr]; }
        });
      });
      evs.push({
        t: '\n<span class="o-b">Apply complete!</span> Resources: <span class="o-add">' + p.add + ' added</span>, <span class="o-chg">' + p.change + ' changed</span>, <span class="o-del">' + p.destroy + ' destroyed</span>.\n',
        done: () => { s.serial++; L.save(); renderTop(); }
      });
      const outs = A.files.filter(f => f.name === 'outputs.tf')[0];
      if (outs) {
        const ob = H.parse(outs.text).filter(b => b.kind === 'output');
        if (ob.length) {
          evs.push({ t: '\n<span class="o-b">Outputs:</span>\n' });
          ob.forEach(o => evs.push({ t: esc(o.name) + ' = <span class="o-cy">"' + esc(sampleOutput(o, p)) + '"</span>\n' }));
        }
      }
    }
    s.tab = 'apply'; L.save(); renderAll();
    const el = $('#applyOut'); if (!el) return;
    el.innerHTML = '';
    let i = 0;
    // projetos grandes rodam mais rápido para o apply não virar tédio
    const speed = evs.length > 40 ? 45 : 90;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!el.isConnected) { clearInterval(timer); timer = null; return; }
      if (i >= evs.length) { clearInterval(timer); timer = null; s.applyTxt = el.innerHTML; L.save(); renderTop(); renderTabs(); return; }
      const e = evs[i++];
      if (e.t) { out += e.t; el.innerHTML = out; el.scrollTop = el.scrollHeight; }
      if (e.done) e.done();
    }, speed);
  }
  function sampleOutput(o, p) {
    const v = (o.items.filter(i => i.t === 'attr' && i.key === 'value')[0] || {}).val || '';
    if (/dns_name/.test(v)) return 'minha-app-prod-alb-1234567890.us-east-1.elb.amazonaws.com';
    if (/repository_url/.test(v)) return '123456789012.dkr.ecr.us-east-1.amazonaws.com/minha-app/api';
    if (/global_address/.test(v)) return '34.117.42.8';
    if (/cloud_run/.test(v) || /\.uri/.test(v)) return 'https://minha-app-prod-abcdefg-rj.a.run.app';
    if (/vpc/.test(v)) return 'vpc-0a1b2c3d4e5f60718';
    if (/subnet/.test(v)) return '["subnet-0aa11", "subnet-0bb22"]';
    return '(valor gerado no apply)';
  }

  /* ---------- drift (ClickOps) ---------- */
  const DRIFTS = [
    { type: 'aws_autoscaling_group', key: 'desired_capacity', to: '5', story: 'Deu pico na Black Friday, alguém entrou no console e subiu o desired capacity na mão.' },
    { type: 'aws_lb', key: 'idle_timeout', to: '300', story: 'Upload grande estourava timeout; alguém aumentou o idle timeout pelo console e não avisou ninguém.' },
    { type: 'aws_ecr_repository', key: 'image_tag_mutability', to: '"MUTABLE"', story: 'Precisaram sobrescrever a tag latest às pressas e destravaram a imutabilidade no console.' },
    { type: 'aws_db_instance', key: 'backup_retention_period', to: '0', story: 'Alguém desligou o backup "só durante a migração" — e esqueceu de religar.' },
    { type: 'aws_launch_template', key: 'instance_type', to: '"t3.large"', story: 'A app estava lenta; alguém trocou o tipo de instância direto no console.' },
    { type: 'aws_cloudwatch_log_group', key: 'retention_in_days', to: '0', story: 'Alguém mudou a retenção para "Never expire" investigando um incidente.' },
    { type: 'google_compute_backend_service', key: 'timeout_sec', to: '120', story: 'Requisição longa dava 502; alguém subiu o timeout no console.' },
    { type: 'google_compute_health_check', key: 'timeout_sec', to: '20', story: 'O health check ficava flapando e alguém afrouxou o timeout na interface.' },
    { type: 'google_sql_database_instance', key: 'deletion_protection', to: 'false', story: 'Precisaram recriar o banco em staging e desligaram a proteção — no projeto errado.' },
    { type: 'google_cloud_run_v2_service', key: 'ingress', to: '"INGRESS_TRAFFIC_INTERNAL_ONLY"', story: 'Alguém restringiu o ingress do Cloud Run durante um teste de segurança.' }
  ];
  function makeDrift() {
    const s = L.st(), A = L.assemble();
    const g = H.graph(A.blocks);
    const cands = [];
    Object.keys(s.applied).forEach(addr => {
      const b = g.byAddr[addr]; if (!b) return;
      DRIFTS.forEach(d => {
        if (b.type === d.type && !s.drift[addr]) {
          const want = H.literalOf(b, d.key);
          if (want != null && want !== d.to) cands.push({ addr: addr, key: d.key, real: d.to, want: want, story: d.story });
        }
      });
    });
    if (!cands.length) { IAC.toast('Nada para "estragar" — adicione ASG, ALB, ECR ou banco e aplique.'); return; }
    const pick = cands[Math.floor(Math.random() * cands.length)];
    s.drift[pick.addr] = {};
    s.drift[pick.addr][pick.key] = { real: pick.real, want: pick.want };
    s.tab = 'plan'; L.save(); renderAll();
    const top = $('#labTop');
    top.insertAdjacentHTML('afterend', IAC.danger('O que aconteceu no console',
      '<p>' + pick.story + '</p><p>Agora <code>' + esc(pick.addr) + '.' + esc(pick.key) + '</code> está <code>' + esc(pick.real) +
      '</code> na AWS/GCP, mas o código diz <code>' + esc(pick.want) + '</code>. Veja o <code>plan</code> abaixo: o Terraform quer <b>desfazer</b> a mudança manual.</p>' +
      '<p><b>Suas opções:</b> (1) <code>apply</code> e o código vence; (2) trazer a mudança para o código; (3) <code>lifecycle { ignore_changes = [' +
      esc(pick.key) + '] }</code> se aquele campo é gerenciado por fora de propósito.</p>'));
  }

  /* ---------- eventos ---------- */
  function bind() {
    root.addEventListener('click', function (e) {
      const s = L.st();
      const cat = e.target.closest('.cat-h');
      if (cat) { cat.parentNode.classList.toggle('collapsed'); return; }
      const add = e.target.closest('[data-add]');
      if (add) {
        const cid = add.getAttribute('data-add'), d = L.def(cid);
        const already = s.items.filter(i => i.cid === cid);
        if (already.length && !d.multi) { s.sel = already[0].uid; s.tab = 'build'; L.save(); renderAll(); IAC.toast('Já está no projeto — selecionado para edição'); return; }
        const it = { uid: uid(), cid: cid, cfg: {} };
        if (d.multi && already.length && d.inputs && d.inputs.filter(x => x.k === 'name')[0]) {
          it.cfg.name = (d.inputs.filter(x => x.k === 'name')[0].v) + '_' + (already.length + 1);
        }
        s.items.push(it); s.sel = it.uid; s.tab = 'build'; L.save(); renderAll();
        IAC.toast(d.name + ' adicionado');
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const u = del.getAttribute('data-del');
        s.items = s.items.filter(i => i.uid !== u);
        L.save(); renderAll(); return;
      }
      const sel = e.target.closest('[data-sel]');
      if (sel) { s.sel = sel.getAttribute('data-sel'); L.save(); renderBody(); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { s.tab = tab.getAttribute('data-tab'); L.save(); renderTabs(); renderBody(); return; }
      const node = e.target.closest('.node-box');
      if (node) { IAC.copy(node.getAttribute('data-addr'), 'Endereço copiado'); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.getAttribute('data-act');
      if (a === 'plan') { if (!s.initialized) { doInit(); return; } s.tab = 'plan'; L.save(); renderAll(); }
      else if (a === 'init') doInit();
      else if (a === 'apply') runApply(false);
      else if (a === 'destroy') { if (confirm('terraform destroy — apagar tudo do state simulado?')) runApply(true); }
      else if (a === 'drift') makeDrift();
      else if (a === 'clear') {
        if (!confirm('Limpar o projeto inteiro?')) return;
        L.S[L.S.cloud] = L.blank(L.S.cloud); L.save(); mount(root, L.S.cloud);
      }
      else if (a === 'copyall') { IAC.copy(L.assemble().files.map(f => '# ===== ' + f.name + ' =====\n' + f.text).join('\n\n'), 'Projeto copiado'); }
      else if (a === 'dlall') {
        const fs = L.assemble().files;
        fs.forEach((f, i) => setTimeout(() => IAC.download(f.name, f.text), i * 320));
      }
      else if (a === 'showstate') {
        const A = L.assemble();
        $('#labBody').innerHTML = '<div class="toolbar"><button class="btn" data-tab="apply">← voltar</button>' +
          '<span class="chip warn">o state guarda valores sensíveis em texto claro</span></div>' +
          IAC.code(H.tfstate(A.blocks, s.applied, s.serial), { lang: 'json', file: 'terraform.tfstate' });
      }
    });
    root.addEventListener('change', onInput);
    root.addEventListener('input', IAC.debounce(onInput, 420));
  }
  function onInput(e) {
    const t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute('data-in')) return;
    const s = L.st(), u = t.getAttribute('data-uid'), k = t.getAttribute('data-in');
    const it = s.items.filter(i => i.uid === u)[0]; if (!it) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number') v = parseInt(v, 10) || 0;
    it.cfg[k] = v; L.save(); renderTop(); renderSide();
    if (s.tab !== 'build') renderBody();
  }
  function doInit() {
    const s = L.st();
    s.initialized = true; L.save();
    s.tab = 'plan'; renderAll();
    const el = $('#labBody');
    el.innerHTML = '<div class="term-out" id="initOut"></div>';
    const lines = [
      '<span class="o-b">Initializing the backend...</span>\n',
      '<span class="o-b">Initializing provider plugins...</span>\n',
      '- Finding hashicorp/' + (L.S.cloud === 'aws' ? 'aws versions matching "~> 5.60"' : 'google versions matching "~> 6.8"') + '...\n',
      '- Installing hashicorp/' + (L.S.cloud === 'aws' ? 'aws v5.68.0' : 'google v6.8.0') + '...\n',
      '- Installed hashicorp/' + (L.S.cloud === 'aws' ? 'aws v5.68.0' : 'google v6.8.0') + ' <span class="o-dim">(signed by HashiCorp)</span>\n',
      '\nTerraform has created a lock file <span class="o-cy">.terraform.lock.hcl</span> to record the provider\nselections it made above. Include this file in your version control repository\nso that Terraform can guarantee to make the same selections by default when\nyou run "terraform init" in the future.\n',
      '\n<span class="o-add">Terraform has been successfully initialized!</span>\n'
    ];
    let i = 0, buf = '';
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const out = $('#initOut');
      if (!out) { clearInterval(timer); timer = null; return; }
      if (i >= lines.length) {
        clearInterval(timer); timer = null;
        setTimeout(() => { if ($('#labBody')) renderBody(); }, 700);
        return;
      }
      buf += lines[i++]; out.innerHTML = buf;
    }, 260);
  }

  L.mount = mount;
  L.renderAll = renderAll;
  L.runApply = runApply;
  L.doInit = doInit;
})(window.IAC);
