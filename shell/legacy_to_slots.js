// legacyToSlots(html): reads any email HTML our n8n builders made before 2026-11-11 (delivery, BFY, resolution,
// support notes, sign-in code, assessment) and returns the content as template slots, so Email · Send can put it
// into the one Jupiter shell. Content only: the old header, footer and sign-off are dropped.
function legacyToSlots(html) {
  const src = String(html || '');
  const VOID = { br: 1, img: 1, meta: 1, link: 1, hr: 1, input: 1, col: 1, source: 1 };
  const BLOCK = { p: 1, div: 1, td: 1, th: 1, h1: 1, h2: 1, h3: 1, h4: 1, li: 1, table: 1, tr: 1, tbody: 1, ul: 1, ol: 1, center: 1, blockquote: 1, body: 1 };
  let body = src;
  const bi = body.search(/<body[\s>]/i);
  if (bi >= 0) body = body.slice(body.indexOf('>', bi) + 1);
  body = body.replace(/<\/body>[\s\S]*$/i, '')
    .replace(/<!--\[if (?!!)[^\]]*mso[\s\S]*?<!\[endif\]-->/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '');
  // tokenize to a tree
  const root = { tag: 'root', attrs: '', kids: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.kids.push({ text: m[5] }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    const el = { tag, attrs: m[3] || '', kids: [] };
    top.kids.push(el);
    if (!VOID[tag] && !m[4]) stack.push(el);
  }
  const attr = (el, a) => { const r = new RegExp('\\b' + a + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(el.attrs || ''); return r ? (r[2] !== undefined ? r[2] : r[3]) : ''; };
  const style = (el) => (attr(el, 'style') + ';bgcolor:' + attr(el, 'bgcolor')).toLowerCase();
  const hidden = (el) => /display\s*:\s*none/.test(style(el));
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', rarr: '→', larr: '←', mdash: ', ', ndash: ' to ', hellip: '...', bull: '•', copy: '©', rsquo: "'", lsquo: "'", ldquo: '“', rdquo: '”', times: '×', nbsp: ' ' };
  const decode = (t) => t.replace(/&#8199;|&#847;|&shy;|&zwnj;|\u200c|\u034f|\u2007/g, '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : m);
  const textOf = (el) => el.text !== undefined ? decode(el.text) : (el.tag === 'br' ? '\n' : (hidden(el) ? '' : el.kids.map(textOf).join('')));
  const clean = (t) => t.replace(/\s+/g, ' ').trim();
  const isBlock = (el) => el.tag && BLOCK[el.tag];
  const hasBlockKid = (el) => el.kids && el.kids.some((k) => (k.tag && isBlock(k)) || hasBlockKid(k));
  const LIME = /background(-color)?\s*:\s*#(a4ed07|b8f53a)|bgcolor:#(a4ed07|b8f53a)/;
  const isBtn = (el, parent) => el.tag === 'a' && (LIME.test(style(el)) || (parent && LIME.test(style(parent))));
  const inl = (el) => {
    if (el.text !== undefined) return el.text.replace(/</g, '&lt;');
    if (hidden(el) || el.tag === 'img') return '';
    const inner = el.kids.map(inl).join('');
    if (el.tag === 'br') return '<br>';
    if (el.tag === 'a') return '<a href="' + attr(el, 'href').replace(/"/g, '&quot;') + '">' + inner + '</a>';
    if (el.tag === 'b' || el.tag === 'strong') return '<b>' + inner + '</b>';
    if (el.tag === 'em' || el.tag === 'i') return '<em>' + inner + '</em>';
    if (/font-weight\s*:\s*(5|6|7)00|font-weight\s*:\s*bold/.test(style(el)) && el.tag === 'span') return '<b>' + inner + '</b>';
    return inner;
  };
  const blocks = [];
  const walk = (el, parent) => {
    if (el.text !== undefined || hidden(el)) return;
    if (el.tag === 'img') return;
    if (el.tag === 'a' && isBtn(el, parent)) {
      blocks.push({ type: 'button', href: attr(el, 'href'), label: clean(textOf(el)).replace(/\s*(→|->)\s*$/, '') });
      return;
    }
    if (el.tag === 'tr' && el.kids.filter((k) => k.tag === 'td').length >= 3 && el.kids.some((k) => k.tag === 'td' && k.kids.some((x) => x.tag === 'table'))) {
      const cells = el.kids.filter((k) => k.tag === 'td').map((k) => clean(textOf(k))).filter(Boolean);
      if (cells.length >= 2) { blocks.push({ type: 'p', html: '<b>' + cells[0] + '</b> &middot; ' + cells.slice(1).join(' ') }); return; }
    }
    if (el.tag === 'ul' || el.tag === 'ol') {
      blocks.push({ type: 'list', html: '<' + el.tag + '>' + el.kids.filter((k) => k.tag === 'li').map((li) => '<li>' + li.kids.map(inl).join('').trim() + '</li>').join('') + '</' + el.tag + '>' });
      return;
    }
    const leaf = isBlock(el) && el.tag !== 'root' && !hasBlockKid(el);
    if (leaf || (el.tag === 'a' && false)) {
      // a button nested inside a leaf td
      const btnKid = el.kids.find((k) => isBtn(k, el));
      if (btnKid) { blocks.push({ type: 'button', href: attr(btnKid, 'href'), label: clean(textOf(btnKid)).replace(/\s*(→|->)\s*$/, '') }); return; }
      const t = clean(textOf(el));
      if (!t) return;
      const st = style(el);
      const html = el.kids.map(inl).join('').replace(/^\s+|\s+$/g, '');
      if (el.tag === 'h1' || el.tag === 'h2') {
        const em = el.kids.find((k) => k.tag === 'em');
        blocks.push({ type: 'h1', lead: clean(el.kids.filter((k) => k !== em).map(textOf).join('')), accent: em ? clean(textOf(em)) : '' });
        return;
      }
      if (/dashed/.test(st)) { blocks.push({ type: 'note', text: t }); return; }
      if (/text-transform\s*:\s*uppercase/.test(st) && t.length < 90) { blocks.push({ type: 'label', text: t.replace(/^[●•]\s*/, '') }); return; }
      if (/border-left\s*:\s*3px/.test(st) || (parent && /width\s*:\s*3px/.test(style(parent.kids.find((k) => k.tag === 'td') || {})))) { blocks.push({ type: 'quote', html }); return; }
      if (/letter-spacing\s*:\s*\.32em|font-size\s*:\s*38px/.test(st)) { blocks.push({ type: 'code', text: t }); return; }
      blocks.push({ type: 'p', html, text: t });
      return;
    }
    el.kids.forEach((k) => walk(k, el));
  };
  walk(root, null);
  // the 3px lime bar highlight row: a td with only &nbsp; followed by a text td is caught as p; mark quotes by previous empty bar
  // drop old chrome
  const DROP = [/^Ekai( Stone)?$/i, /^Jupiter Support$/i, /^Happy building\.?\s*(Jupiter Support)?$/i, /^Jupiter Portal$/i, /^EKAI STONE\b/i,
    /^You're getting this because/i, /^Questions about this or any of our other products/i, /^Reply to this email with any question/i,
    /^©|^\(c\)|^&copy;/i, /^Ekai Stone · Jupiter Revenue Systems$/i, /Unsubscribe/i, /^Client portal/i];
  const out = { eyebrow: '', headline: '', headline_accent: '', body_html: '', button_label: '', button_url: '', test_note: '', preheader: '' };
  const kept = [];
  for (const b of blocks) {
    const t = b.text || b.label || (b.html ? clean(b.html.replace(/<[^>]+>/g, '')) : '') || b.lead || '';
    if (b.type !== 'button' && b.type !== 'h1' && DROP.some((r) => r.test(t))) continue;
    kept.push(b);
  }
  // eyebrow = first label before the headline; headline = first h1
  const h1i = kept.findIndex((b) => b.type === 'h1');
  if (h1i >= 0) {
    out.headline = kept[h1i].lead; out.headline_accent = kept[h1i].accent;
    const lab = kept.slice(0, h1i).reverse().find((b) => b.type === 'label');
    if (lab) { out.eyebrow = lab.text; kept.splice(kept.indexOf(lab), 1); }
    kept.splice(kept.findIndex((b) => b.type === 'h1'), 1);
  }
  const ci = kept.findIndex((b) => b.type === 'code');
  if (h1i < 0 && ci > 0 && kept[ci - 1].type === 'p' && (kept[ci - 1].text || '').length < 70) {
    out.eyebrow = 'Your portal'; out.headline = clean(kept[ci - 1].text); kept.splice(ci - 1, 1);
  }
  const note = kept.find((b) => b.type === 'note');
  if (note) { out.test_note = note.text; kept.splice(kept.indexOf(note), 1); }
  // main button = the last button; earlier buttons stay inline
  let lastBtn = -1; kept.forEach((b, i) => { if (b.type === 'button') lastBtn = i; });
  const ex = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = [];
  kept.forEach((b, i) => {
    if (b.type === 'button' && i === lastBtn && kept.slice(i + 1).filter((x) => x.type === 'p' || x.type === 'quote').length <= 3) { out.button_label = b.label; out.button_url = b.href; return; }
    if (b.type === 'button') { parts.push('<p><a href="' + b.href + '"><b>' + b.label + ' &rarr;</b></a></p>'); return; }
    if (b.type === 'label') { parts.push('<h3>' + ex(b.text) + '</h3>'); return; }
    if (b.type === 'quote') { parts.push('<blockquote>' + b.html + '</blockquote>'); return; }
    if (b.type === 'code') { parts.push('<p style="margin:0 0 22px 0;font-family:Menlo,Consolas,monospace;font-size:36px;letter-spacing:.3em;font-weight:600;color:#04070D;background:#E6EFD2;border-radius:12px;padding:16px 0;text-align:center;">' + ex(b.text) + '</p>'); return; }
    if (b.type === 'list') { parts.push(b.html); return; }
    if (b.type === 'p') parts.push('<p>' + b.html.replace(/^Ref (\S+) · ekaistone\.com$/, 'Ref $1') + '</p>');
  });
  // "Sign in with this email..." reads best right under the button: keep it as the last line
  out.body_html = parts.join('\n');
  const ps = kept.filter((b) => b.type === 'p' && (b.text || '').length > 0);
  const firstP = ps.find((b) => !/^(hi|hey|hello)\b[^.!?]{0,30},?$/i.test(b.text || '')) || ps[0];
  const pre = firstP ? clean(firstP.text || '') : '';
  out.preheader = pre.length <= 140 ? pre : pre.slice(0, 140).replace(/\s+\S*$/, '') + '...';
  return out;
}
if (typeof module !== 'undefined') module.exports = { legacyToSlots };
