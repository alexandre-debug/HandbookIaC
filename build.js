#!/usr/bin/env node
/**
 * build.js — gera dist/handbook.html: o handbook inteiro em UM arquivo,
 * sem nenhuma dependência externa. Útil para mandar por e-mail/Slack.
 *
 *   node build.js
 */
const fs = require('fs'), path = require('path');
const ROOT = __dirname;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const scripts = (index.match(/<script src="([^"]+)"/g) || []).map(s => s.match(/src="([^"]+)"/)[1]);
const js = scripts.map(s =>
  '/* ===== ' + s + ' ===== */\n' + fs.readFileSync(path.join(ROOT, s), 'utf8')
).join('\n\n').replace(/<\/script>/gi, '<\\/script>');

const body = (index.match(/<body[^>]*>([\s\S]*)<\/body>/) || [, ''])[1]
  .replace(/\s*<script src="[^"]+"><\/script>/g, '');

const head = index.slice(0, index.indexOf('</head>'))
  .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
  .replace(/^[\s\S]*?<head>/, '');

const out = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>${head}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/handbook.html'), out);
console.log('dist/handbook.html  ' + (out.length / 1024).toFixed(0) + ' KB  (' + scripts.length + ' scripts + css embutidos)');
