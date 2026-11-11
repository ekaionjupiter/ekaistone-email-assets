// Jupiter email renderer (v1.1 locked 2026-11-11). ONE renderer for every ekaistone.com client email.
// Pure function: renderJupiterEmail(slots, parts, links). Used by n8n "Email · Send" (copied into its Code node)
// and by the GHL template sync (same code). parts = the email_shell rows (see shell_parts.json).
// slots: { subject, preheader, eyebrow, headline, headline_accent, body_html | paragraphs[], button_label, button_url,
//          kind: 'client' | 'support', test_note, ps_html }
// links: { prefs_url, unsub_url }
function renderJupiterEmail(slots, parts, links) {
  const S = slots || {};
  const P = parts;
  const L = links || {};
  const DASH = /[‒–—―]/g;
  const tidy = (t) => String(t == null ? '' : t).replace(/(\d)\s*[‒–—]\s*(\d)/g, '$1 to $2').replace(DASH, ', ');
  const esc = (t) => tidy(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONT = "font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";
  const PSTY = 'margin:0 0 18px 0;' + FONT + 'font-size:17px;line-height:27px;color:#0B0F17;';
  // Body: plain <p>/<ul>/<li>/<a>/<b>/<h3>/<div class="note"> in, styled email markup out.
  function styleBody(html) {
    let h = tidy(html);
    h = h.replace(/<p(\s[^>]*)?>/gi, (m, a) => (a && /style=/.test(a)) ? m : '<p class="sans body ink" style="' + PSTY + '">');
    h = h.replace(/<ul(\s[^>]*)?>/gi, '<ul style="margin:0 0 18px 0;padding:0 0 0 22px;' + FONT + 'font-size:17px;line-height:27px;color:#0B0F17;">');
    h = h.replace(/<ol(\s[^>]*)?>/gi, '<ol style="margin:0 0 18px 0;padding:0 0 0 22px;' + FONT + 'font-size:17px;line-height:27px;color:#0B0F17;">');
    h = h.replace(/<li(\s[^>]*)?>/gi, '<li class="ink" style="margin:0 0 8px 0;color:#0B0F17;">');
    h = h.replace(/<h3(\s[^>]*)?>/gi, '<h3 class="mono" style="margin:6px 0 10px 0;font-family:\'Geist Mono\',ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#4C7A00;font-weight:500;">');
    h = h.replace(/<div class="note">/gi, '<div class="mono" style="margin:0 0 18px 0;padding:10px 14px;border:1px dashed #E2732E;border-radius:10px;font-family:\'Geist Mono\',ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:18px;color:#B4521A;">');
    h = h.replace(/<blockquote(\s[^>]*)?>/gi, '<blockquote style="margin:0 0 18px 0;padding:2px 0 2px 14px;border-left:3px solid #A4ED07;' + FONT + 'font-size:16px;line-height:25px;color:#0B0F17;">');
    h = h.replace(/<a\s(?![^>]*style=)/gi, '<a style="color:#4C7A00;text-decoration:underline;" ');
    h = h.replace(/<(b|strong)>/gi, '<$1 style="font-weight:600;color:#0B0F17;">');
    return h;
  }
  let body = S.body_html != null && S.body_html !== '' ? String(S.body_html)
    : (Array.isArray(S.paragraphs) ? S.paragraphs.map((x) => '<p>' + esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('\n') : '');
  if (S.test_note) body = '<div class="note">' + esc(S.test_note) + '</div>\n' + body;
  if (S.ps_html) body += '\n<p><i>P.S.</i> ' + S.ps_html + '</p>';
  const fill = (s, m) => Object.keys(m).reduce((a, k) => a.split('%%' + k + '%%').join(m[k]), s);
  const kind = S.kind === 'support' ? 'support' : 'client';
  const hasHero = !!(S.headline && String(S.headline).trim());
  const hasBtn = !!(S.button_label && S.button_url);
  const url = String(S.button_url || '').replace(/&(?!amp;)/g, '&amp;');
  let html = fill(P.head, { SUBJECT: esc(S.subject), PREHEADER: esc(S.preheader || '') });
  html += P.header;
  html += hasHero ? fill(P.hero, {
    EYEBROW_HTML: S.eyebrow ? fill(P.eyebrow, { EYEBROW: esc(S.eyebrow) }) : '',
    HEADLINE: esc(S.headline),
    ACCENT_HTML: S.headline_accent ? fill(P.accent, { ACCENT: esc(S.headline_accent) }) : ''
  }) : P.no_hero_gap;
  html += P.card_open + styleBody(body) + '\n' + P.body_close;
  if (hasBtn) html += fill(P.button, { BUTTON_URL: url, BUTTON_LABEL: esc(S.button_label) });
  html += kind === 'support' ? P.sig_support : P.sig_client;
  html += P.card_close;
  html += fill(P.footer, { PREFS_URL: L.prefs_url || 'https://ekaistone.com/contact', UNSUB_URL: L.unsub_url || L.prefs_url || 'https://ekaistone.com/contact' });
  html += P.close;
  // Plain-text twin
  const strip = (h) => tidy(h).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h3|div|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '->').replace(/&middot;/g, '·').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  const sig = kind === 'support' ? 'Jupiter Support\nJupiter Revenue Systems\nNeed anything else? Just reply.' : 'Ekai\nFounder, Jupiter Revenue Systems\nQuestions about this or anything else we offer? Just reply. It comes straight to me.';
  const text = [hasHero ? tidy(S.headline) + (S.headline_accent ? ' ' + tidy(S.headline_accent) : '') : '', strip(body),
    hasBtn ? tidy(S.button_label) + ': ' + String(S.button_url || '') : '', sig,
    '--\nJupiter Revenue Systems · Los Angeles, CA • Mexico City\nekaistone.com · Unsubscribe: ' + (L.unsub_url || 'https://ekaistone.com/contact')
  ].filter(Boolean).join('\n\n');
  return { html, text, kind, kb: Math.round(html.length / 1024) };
}
if (typeof module !== 'undefined') module.exports = { renderJupiterEmail };
