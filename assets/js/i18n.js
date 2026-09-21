/* Local translations, shared by the regular and standalone editions. */
(function (IAC) {
  'use strict';
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  let language = IAC.store.get('language', 'en') === 'pt-BR' ? 'pt-BR' : 'en';
  let dictionary;

  function translations() {
    if (!dictionary) {
      dictionary = new Map();
      const template = document.createElement('template');
      Object.entries(IAC.english || {}).forEach(([source, target]) => {
        dictionary.set(normalize(source), target);
        // Match the browser's serialization of inline markup and entities.
        template.innerHTML = source.replace(/<\/br>/g, '');
        dictionary.set(normalize(template.innerHTML), target.replace(/<\/br>/g, ''));
      });
    }
    return dictionary;
  }

  function t(value) {
    if (language === 'pt-BR' || typeof value !== 'string') return value;
    const translated = translations().get(normalize(value));
    if (translated !== undefined) {
      return value.match(/^\s*/)[0] + translated + value.match(/\s*$/)[0];
    }
    // Only application-owned messages use these variable patterns.
    for (const [pattern, replacement] of IAC.englishPatterns || []) {
      if (pattern.test(value)) return value.replace(pattern, replacement);
    }
    return value;
  }

  function localize(root) {
    if (language === 'pt-BR') return root;
    function visit(node) {
      if (node.nodeType === 3) { node.nodeValue = t(node.nodeValue); return; }
      if (node.nodeType !== 1 && node.nodeType !== 11) return;
      if (node.nodeType === 1) {
        if (node.matches('pre, code, script, style, svg, textarea, [translate="no"]')) return;
        ['title', 'placeholder', 'aria-label'].forEach(attr => {
          if (node.hasAttribute(attr)) node.setAttribute(attr, t(node.getAttribute(attr)));
        });
        const translated = translations().get(normalize(node.innerHTML));
        if (translated !== undefined) { node.innerHTML = translated; return; }
      }
      Array.from(node.childNodes).forEach(visit);
    }
    visit(root);
    return root;
  }

  function html(value) {
    if (language === 'pt-BR' || !value) return value;
    const template = document.createElement('template');
    template.innerHTML = value;
    localize(template.content);
    return template.innerHTML;
  }

  function setLanguage(value) {
    language = value === 'pt-BR' ? 'pt-BR' : 'en';
    IAC.store.set('language', language);
    document.documentElement.lang = language;
  }

  // Stable IDs keep bookmarks, reading progress and projects shared across languages.
  const register = IAC.section;
  IAC.section = function (section) {
    function label(object, key) {
      const original = object[key];
      Object.defineProperty(object, key, { enumerable: true, get: () => t(original) });
    }
    label(section, 'label');
    section.pages.forEach(page => {
      label(page, 'title');
      if (page.body) {
        const body = page.body;
        page.body = () => html(body());
      }
    });
    return register(section);
  };

  Object.assign(IAC, { t, html, localize, setLanguage, language: () => language });
  document.documentElement.lang = language;
})(window.IAC);
