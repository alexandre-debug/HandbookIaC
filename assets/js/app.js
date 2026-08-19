/* =========================================================
   app.js — router, navegação, busca, tema
   ========================================================= */
(function (IAC) {
  'use strict';
  const $ = IAC.$, $$ = IAC.$$, esc = IAC.esc;
  let flat = [], searchIndex = null, current = null;

  /* ---------------- boot ---------------- */
  function boot() {
    IAC.lab.load();
    flat = IAC.flat();
    applyTheme(IAC.store.get('theme', 'dark'));
    buildNav();
    window.addEventListener('hashchange', route);
    bindGlobal();
    route();
  }

  /* ---------------- navegação ---------------- */
  function buildNav() {
    const nav = $('#nav');
    const collapsed = IAC.store.get('navCollapsed', {});
    let html = '';
    IAC.sections.forEach(sec => {
      const isC = !!collapsed[sec.id];
      html += '<div class="nav-sec' + (isC ? ' collapsed' : '') + '" data-sec="' + sec.id + '"' +
        (sec.cloud ? ' data-cloud="' + sec.cloud + '"' : '') + '>' +
        '<button class="nav-sec-h"><span class="dot"></span>' + esc(sec.label) +
        '<svg viewBox="0 0 24 24" class="ico chev"><path d="M6 9l6 6 6-6"/></svg></button><div class="nav-items">';
      sec.pages.forEach(p => {
        const path = sec.id + '/' + p.id;
        html += '<a class="nav-item" href="#/' + path + '" data-path="' + path + '">' +
          '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.title) + '</span>' +
          (p.tag ? '<span class="tag lab">' + esc(p.tag) + '</span>' :
            '<svg viewBox="0 0 24 24" class="ico tick"><path d="M20 6L9 17l-5-5"/></svg>') +
          '</a>';
      });
      html += '</div></div>';
    });
    nav.innerHTML = html;
    refreshNavState();
  }

  function refreshNavState() {
    const done = IAC.doneSet();
    $$('#nav .nav-item').forEach(a => {
      const p = a.getAttribute('data-path');
      a.classList.toggle('done', !!done[p]);
      a.classList.toggle('active', p === current);
    });
    const total = flat.filter(p => !p.mount).length;
    const d = Object.keys(done).length;
    $('#progressPill').textContent = d + '/' + total + ' lidos';
  }

  /* ---------------- router ---------------- */
  /** Substitui #view por um clone vazio: descarta todos os listeners que
   *  páginas interativas (lab, roteiros, quiz) tenham registrado nele. */
  function freshView() {
    const old = $('#view');
    const nu = old.cloneNode(false);
    nu.className = 'view';
    old.parentNode.replaceChild(nu, old);
    return nu;
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const path = h || 'fund/por-que';
    const page = IAC.pageIndex[path];
    const view = freshView();
    $('#q').value = '';
    if (!page) { location.hash = '#/fund/por-que'; return; }
    current = path;
    view.classList.remove('wide');
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    $('#crumb').innerHTML = '<b>' + esc(page.section.label) + '</b><span class="sep">›</span>' + esc(page.title);
    document.title = page.title + ' · Handbook IaC';
    if (page.mount) { view.innerHTML = ''; page.mount(view); }
    else {
      let html = '<div class="page">' + page.body() + markDone(path) + pager(path) + '</div>';
      view.innerHTML = html;
      buildToc();
    }
    refreshNavState();
    closeSidebar();
  }

  function markDone(path) {
    const d = IAC.isDone(path);
    return '<div class="mark-done' + (d ? ' done' : '') + '" data-done="' + path + '">' +
      '<svg viewBox="0 0 24 24" class="ico" style="color:' + (d ? 'var(--ok)' : 'var(--tx-3)') + '">' +
      (d ? '<path d="M22 11.1V12a10 10 0 11-5.9-9.1"/><path d="M22 4L12 14.1l-3-3"/>' : '<circle cx="12" cy="12" r="9"/>') +
      '</svg><span>' + (d ? 'Capítulo concluído' : 'Marcar capítulo como lido') + '</span></div>';
  }

  function pager(path) {
    const list = flat.map(p => p.section.id + '/' + p.id);
    const i = list.indexOf(path);
    const prev = i > 0 ? IAC.pageIndex[list[i - 1]] : null;
    const next = i < list.length - 1 ? IAC.pageIndex[list[i + 1]] : null;
    let h = '<div class="pager">';
    h += prev ? '<a href="#/' + list[i - 1] + '"><div class="k">← anterior</div><div class="n">' + esc(prev.title) + '</div></a>' : '<span style="flex:1"></span>';
    h += next ? '<a class="r" href="#/' + list[i + 1] + '"><div class="k">próximo →</div><div class="n">' + esc(next.title) + '</div></a>' : '<span style="flex:1"></span>';
    return h + '</div>';
  }

  function buildToc() {
    const hs = $$('#view h2');
    if (hs.length < 3) return;
    let h = '<div class="tocx">';
    hs.forEach((el, i) => {
      const id = 'h' + i + '-' + IAC.slug(el.textContent).slice(0, 30);
      el.id = id;
      h += '<a href="#' + id + '" data-anchor="' + id + '">' + esc(el.textContent) + '</a>';
    });
    h += '</div>';
    const lede = $('#view .lede') || $('#view h1');
    if (lede) lede.insertAdjacentHTML('afterend', h);
  }

  /* ---------------- busca ---------------- */
  function buildIndex() {
    if (searchIndex) return searchIndex;
    searchIndex = [];
    flat.forEach(p => {
      let txt = p.title;
      if (p.body) { try { txt += ' ' + IAC.stripTags(p.body()); } catch (e) { } }
      searchIndex.push({ p: p, path: p.section.id + '/' + p.id, txt: txt, low: txt.toLowerCase() });
    });
    // recursos dos catálogos entram na busca também
    [['aws', IAC.awsRes], ['gcp', IAC.gcpRes]].forEach(pair => {
      pair[1].forEach(d => {
        searchIndex.push({
          res: d, cloud: pair[0], path: pair[0] + '/lab',
          txt: d.name + ' ' + d.tf + ' ' + IAC.stripTags(d.desc),
          low: (d.name + ' ' + d.tf + ' ' + IAC.stripTags(d.desc)).toLowerCase()
        });
      });
    });
    return searchIndex;
  }

  function doSearch(q) {
    if (!q || q.length < 2) { route(); return; }
    const view = freshView();
    const idx = buildIndex();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = [];
    idx.forEach(it => {
      let score = 0, all = true;
      terms.forEach(t => {
        const i = it.low.indexOf(t);
        if (i < 0) { all = false; return; }
        score += 1;
        if ((it.res ? it.res.name : it.p.title).toLowerCase().indexOf(t) >= 0) score += 6;
      });
      if (all) hits.push({ it: it, score: score, pos: it.low.indexOf(terms[0]) });
    });
    hits.sort((a, b) => b.score - a.score);
    view.classList.remove('wide');
    let html = '<div class="page"><span class="eyebrow">Busca</span><h1>' + hits.length + ' resultado' + (hits.length === 1 ? '' : 's') + ' para "' + esc(q) + '"</h1>';
    if (!hits.length) html += '<div class="empty"><div class="big">🔍</div>Nada encontrado. Tente <code>target group</code>, <code>drift</code>, <code>for_each</code>, <code>state</code>…</div>';
    hits.slice(0, 40).forEach(hh => {
      const it = hh.it;
      const snip = snippet(it.txt, terms[0]);
      if (it.res) {
        html += '<a class="card link" style="display:block;margin-bottom:9px" href="#/' + it.path + '">' +
          '<div class="k">' + it.cloud.toUpperCase() + ' · componente do laboratório</div>' +
          '<div style="font-weight:650;margin:2px 0">' + it.res.em + ' ' + esc(it.res.name) + ' <code>' + esc(it.res.tf) + '</code></div>' +
          '<div style="font-size:12.5px;color:var(--tx-3)">' + snip + '</div></a>';
      } else {
        html += '<a class="card link" style="display:block;margin-bottom:9px" href="#/' + it.path + '">' +
          '<div class="k">' + esc(it.p.section.label) + '</div>' +
          '<div style="font-weight:650;margin:2px 0">' + esc(it.p.title) + '</div>' +
          '<div style="font-size:12.5px;color:var(--tx-3)">' + snip + '</div></a>';
      }
    });
    html += '</div>';
    view.innerHTML = html;
    $('#crumb').innerHTML = '<b>Busca</b><span class="sep">›</span>' + esc(q);
  }
  function snippet(txt, term) {
    const i = txt.toLowerCase().indexOf(term);
    if (i < 0) return esc(txt.slice(0, 150)) + '…';
    const s = Math.max(0, i - 60);
    const part = txt.slice(s, s + 190);
    return (s > 0 ? '…' : '') + esc(part).replace(new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'),
      '<mark style="background:rgba(123,66,188,.35);color:inherit;border-radius:3px">$1</mark>') + '…';
  }

  /* ---------------- paleta (Ctrl+K) ---------------- */
  function openPalette() {
    const pal = $('#palette'); pal.classList.remove('hidden');
    const inp = $('#paletteInput'); inp.value = ''; inp.focus();
    renderPalette('');
  }
  function closePalette() { $('#palette').classList.add('hidden'); }
  function renderPalette(q) {
    const list = $('#paletteList');
    const ql = q.toLowerCase();
    const items = flat.filter(p => !ql || (p.title + ' ' + p.section.label).toLowerCase().indexOf(ql) >= 0).slice(0, 12);
    list.innerHTML = items.map((p, i) =>
      '<div class="presult' + (i === 0 ? ' sel' : '') + '" data-go="' + p.section.id + '/' + p.id + '">' +
      '<span>' + esc(p.title) + '</span><span class="sec">' + esc(p.section.label) + '</span></div>').join('') ||
      '<div class="presult"><span style="color:var(--tx-3)">nada encontrado</span></div>';
  }

  /* ---------------- tema ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    IAC.store.set('theme', t);
  }

  function closeSidebar() { $('#sidebar').classList.remove('open'); }

  /* ---------------- eventos globais ---------------- */
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      const cp = e.target.closest('[data-copy]');
      if (cp) { IAC.copy(IAC.getCode(cp.getAttribute('data-copy')), 'Código copiado'); return; }

      const secH = e.target.closest('.nav-sec-h');
      if (secH) {
        const sec = secH.parentNode; sec.classList.toggle('collapsed');
        const c = IAC.store.get('navCollapsed', {});
        c[sec.getAttribute('data-sec')] = sec.classList.contains('collapsed');
        IAC.store.set('navCollapsed', c); return;
      }

      const md = e.target.closest('[data-done]');
      if (md) {
        const on = IAC.toggleDone(md.getAttribute('data-done'));
        md.classList.toggle('done', on);
        md.querySelector('span').textContent = on ? 'Capítulo concluído' : 'Marcar capítulo como lido';
        md.querySelector('svg').style.color = on ? 'var(--ok)' : 'var(--tx-3)';
        md.querySelector('svg').innerHTML = on
          ? '<path d="M22 11.1V12a10 10 0 11-5.9-9.1"/><path d="M22 4L12 14.1l-3-3"/>'
          : '<circle cx="12" cy="12" r="9"/>';
        refreshNavState(); return;
      }

      const anchor = e.target.closest('[data-anchor]');
      if (anchor) {
        e.preventDefault();
        const el = document.getElementById(anchor.getAttribute('data-anchor'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const go = e.target.closest('[data-go]');
      if (go) { location.hash = '#/' + go.getAttribute('data-go'); closePalette(); return; }

      if (e.target.closest('#themeBtn')) {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
        return;
      }
      if (e.target.closest('#resetBtn')) {
        if (!confirm('Apagar progresso de leitura, projetos do laboratório e preferências?')) return;
        ['done', 'lab.aws', 'lab.gcp', 'navCollapsed'].forEach(k => IAC.store.del(k));
        IAC.lab.load(); location.reload(); return;
      }
      if (e.target.closest('#menuBtn')) { $('#sidebar').classList.toggle('open'); return; }
      if (e.target === $('#palette')) { closePalette(); return; }
      if (e.target.closest('.sidebar') === null && $('#sidebar').classList.contains('open') && !e.target.closest('#menuBtn')) closeSidebar();
    });

    $('#prevBtn').addEventListener('click', () => step(-1));
    $('#nextBtn').addEventListener('click', () => step(1));

    $('#q').addEventListener('input', IAC.debounce(function () { doSearch($('#q').value.trim()); }, 220));
    $('#q').addEventListener('keydown', function (e) { if (e.key === 'Escape') { this.value = ''; route(); this.blur(); } });

    $('#paletteInput').addEventListener('input', function () { renderPalette(this.value); });
    $('#paletteInput').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') return closePalette();
      const items = $$('#paletteList .presult');
      let i = items.findIndex(x => x.classList.contains('sel'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (i >= 0) items[i].classList.remove('sel');
        i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[i].classList.add('sel'); items[i].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        const sel = items[Math.max(0, i)];
        if (sel && sel.getAttribute('data-go')) { location.hash = '#/' + sel.getAttribute('data-go'); closePalette(); }
      }
    });

    document.addEventListener('keydown', function (e) {
      const inField = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (inField) return;
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
      if (e.key === 'ArrowLeft' && e.altKey) step(-1);
      if (e.key === 'ArrowRight' && e.altKey) step(1);
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  function step(d) {
    const list = flat.map(p => p.section.id + '/' + p.id);
    const i = list.indexOf(current);
    const n = i + d;
    if (n >= 0 && n < list.length) location.hash = '#/' + list[n];
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.IAC);
