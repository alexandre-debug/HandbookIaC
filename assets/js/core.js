/* =========================================================
   core.js — utilidades, highlighter, storage, registry
   ========================================================= */
window.IAC = window.IAC || {};
(function (IAC) {
  'use strict';

  /* ---------- DOM ---------- */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  function h(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------- storage (tolerante a file:// e Safari) ---------- */
  const mem = {};
  const store = {
    get(k, def) {
      try { const v = localStorage.getItem('iac.' + k); return v == null ? def : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : def; }
    },
    set(k, v) {
      try { localStorage.setItem('iac.' + k, JSON.stringify(v)); } catch (e) { mem[k] = v; }
      return v;
    },
    del(k) { try { localStorage.removeItem('iac.' + k); } catch (e) { delete mem[k]; } }
  };

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2100);
  }
  function copy(text, label) {
    const done = () => toast((label || 'Copiado') + ' ✓');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = h('textarea'); ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Não consegui copiar'); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- syntax highlight ---------- */
  const HCL_BLOCK = /^(resource|data|module|variable|output|locals|provider|terraform|backend|required_providers|check|import|moved|removed|run|dynamic|lifecycle|connection|provisioner)$/;
  const HCL_KW = /^(for|in|if|else|endif|endfor|null|true|false|depends_on|count|for_each|source|version|providers|sensitive|type|default|description|validation|precondition|postcondition)$/;

  function hl(code, lang) {
    lang = lang || 'hcl';
    if (lang === 'bash' || lang === 'sh') return hlBash(code);
    if (lang === 'json') return hlJson(code);
    if (lang === 'yaml' || lang === 'yml') return hlYaml(code);
    if (lang === 'text' || lang === 'plain') return esc(code);
    return hlHcl(code);
  }

  function hlHcl(code) {
    const RE = new RegExp([
      '(#[^\\n]*|//[^\\n]*)',                                  // 1 comment
      '("(?:[^"\\\\\\n]|\\\\.)*")',                            // 2 string
      '\\b([a-z_][a-z0-9_]*)\\s*(?=\\()',                      // 3 function
      '\\b(true|false|null)\\b',                               // 4 bool
      '\\b(\\d+(?:\\.\\d+)?)\\b',                              // 5 number
      '^\\s*([a-z_][a-z0-9_]*)(?=\\s+"|\\s*\\{)',              // 6 block head
      '\\b((?:aws|google|azurerm|random|tls|null|local|archive|kubernetes|helm)_[a-z0-9_]+)\\.([A-Za-z_][\\w-]*)', // 7,8 ref
      '\\b(var|local|module|data|each|count|path|terraform|self)\\.([A-Za-z_][\\w-]*)', // 9,10 ref2
      '^\\s*([A-Za-z_][\\w-]*)(?=\\s*=[^=])'                   // 11 attribute
    ].join('|'), 'gm');
    return esc(code).replace(RE, function (m, com, str, fn, bool, num, blk, r1, r2, v1, v2, attr) {
      if (com) return '<span class="t-com">' + m + '</span>';
      if (str) {
        const inner = str.replace(/\$\{[^}]*\}/g, x => '<span class="t-intp">' + x + '</span>');
        return '<span class="t-str">' + inner + '</span>';
      }
      if (fn) return '<span class="t-fn">' + m + '</span>';
      if (bool) return '<span class="t-bool">' + m + '</span>';
      if (num) return '<span class="t-num">' + m + '</span>';
      if (blk) return m.replace(blk, (HCL_BLOCK.test(blk) ? '<span class="t-kw">' : '<span class="t-blk">') + blk + '</span>');
      if (r1) return '<span class="t-ref">' + m + '</span>';
      if (v1) return '<span class="t-ref">' + m + '</span>';
      if (attr) return m.replace(attr, '<span class="t-attr">' + attr + '</span>');
      return m;
    });
  }
  function hlBash(code) {
    return esc(code)
      .replace(/^(\s*)(#[^\n]*)$/gm, '$1<span class="t-com">$2</span>')
      .replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;|'[^']*')/g, '<span class="t-str">$1</span>')
      .replace(/^(\s*)\$ /gm, '$1<span class="t-com">$ </span>')
      .replace(/\b(terraform|tflint|tfsec|checkov|terragrunt|aws|gcloud|docker|git|export|cd|make|curl|jq|infracost|atmos|kubectl)\b/g, '<span class="t-kw">$1</span>')
      .replace(/(\s)(-{1,2}[a-zA-Z][\w-]*)/g, '$1<span class="t-num">$2</span>');
  }
  function hlJson(code) {
    return esc(code)
      .replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;)(\s*:)/g, '<span class="t-attr">$1</span>$2')
      .replace(/:\s*(&quot;(?:[^&]|&(?!quot;))*&quot;)/g, ': <span class="t-str">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="t-bool">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="t-num">$1</span>');
  }
  function hlYaml(code) {
    return esc(code)
      .replace(/^(\s*)(#[^\n]*)$/gm, '$1<span class="t-com">$2</span>')
      .replace(/^(\s*-?\s*)([\w.\/-]+)(:)/gm, '$1<span class="t-attr">$2</span>$3')
      .replace(/\$\{\{[^}]*\}\}/g, m => '<span class="t-intp">' + m + '</span>');
  }

  let cbId = 0;
  const CODE_CACHE = {};
  /** Bloco de código com header + botão copiar. */
  function code(src, opts) {
    opts = opts || {};
    const lang = opts.lang || 'hcl';
    const id = 'cb' + (++cbId);
    CODE_CACHE[id] = src;
    const file = opts.file ? '<span class="fn">' + esc(opts.file) + '</span>' : '';
    return '<div class="code"><div class="code-h">' + file +
      '<span class="lang">' + esc(lang) + '</span>' +
      '<button class="cbtn" data-copy="' + id + '">' +
      '<svg viewBox="0 0 24 24" class="ico" style="width:13px;height:13px"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>copiar</button>' +
      '</div><pre><code>' + hl(src, lang) + '</code></pre></div>';
  }
  function getCode(id) { return CODE_CACHE[id]; }

  /* ---------- helpers de conteúdo ---------- */
  function box(kind, title, html) {
    const ics = {
      tip: 'M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z',
      warn: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z',
      danger: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z',
      info: 'M12 16v-4M12 8h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
      console: 'M4 17l6-5-6-5M12 19h8'
    };
    return '<div class="box ' + kind + '"><div class="bt">' +
      '<svg viewBox="0 0 24 24" class="ico" style="width:15px;height:15px"><path d="' + (ics[kind] || ics.info) + '"/></svg>' +
      esc(title) + '</div>' + html + '</div>';
  }
  const tip = (t, h) => box('tip', t || 'Boa prática', h);
  const warn = (t, h) => box('warn', t || 'Atenção', h);
  const danger = (t, h) => box('danger', t || 'Cuidado', h);
  const info = (t, h) => box('info', t || 'Nota', h);
  function consoleSteps(list) {
    return box('console', 'No console (o que você faz hoje)',
      '<ol>' + list.map(x => '<li>' + x + '</li>').join('') + '</ol>');
  }
  function table(head, rows) {
    return '<table><thead><tr>' + head.map(x => '<th>' + x + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';
  }

  /* ---------- registry de seções/páginas ---------- */
  const sections = [];
  const pageIndex = {};   // path -> page
  function section(def) { sections.push(def); def.pages.forEach(p => { p.section = def; pageIndex[def.id + '/' + p.id] = p; }); return def; }
  function flat() { const out = []; sections.forEach(s => s.pages.forEach(p => out.push(p))); return out; }

  /* ---------- progresso ---------- */
  function doneSet() { return store.get('done', {}); }
  function isDone(path) { return !!doneSet()[path]; }
  function toggleDone(path) { const d = doneSet(); if (d[path]) delete d[path]; else d[path] = 1; store.set('done', d); return !!d[path]; }

  /* ---------- util diversos ---------- */
  function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; }
  function stripTags(s) { return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function download(name, content, mime) {
    try {
      const b = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const u = URL.createObjectURL(b);
      const a = h('a', { href: u, download: name });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(u), 1500);
      toast('Baixado: ' + name);
    } catch (e) { copy(content, 'Download indisponível — conteúdo copiado'); }
  }
  const canDownload = () => true;
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function rnd(seedStr, len, alphabet) {
    // determinístico: mesmo nome -> mesmo "id" (evita ruído entre renders)
    alphabet = alphabet || '0123456789abcdef';
    let hsh = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { hsh ^= seedStr.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
    let out = '';
    for (let i = 0; i < len; i++) { hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177); out += alphabet[Math.abs(hsh) % alphabet.length]; }
    return out;
  }

  Object.assign(IAC, {
    $, $$, h, esc, slug, store, toast, copy, hl, code, getCode,
    box, tip, warn, danger, info, consoleSteps, table,
    section, sections, pageIndex, flat, isDone, toggleDone, doneSet,
    debounce, stripTags, download, canDownload, pad, rnd
  });
})(window.IAC);
