// node tools/build-pages.mjs — статические страницы кейсов, sitemap.xml, robots.txt, llms.txt из cases.js.
// Запускать после любой правки cases.js. 3D-главная ссылается на cases/<id>.html («читать кейс»).
// SITE — адрес боевого домена: пока не выбран, стоит предположение по почте агентства; на черновике всё закрыто noindex.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = process.env.SITE || 'https://oxygen-agency.ru';
const NOINDEX = process.env.INDEX !== '1';   // снять на боевом домене: INDEX=1 node tools/build-pages.mjs
const { CASES } = await import(join(ROOT, 'cases.js'));

// порядок и обложки — как на стенах мегаструктуры (main.js, PJ(...)); ролики — VIDS
const main = readFileSync(join(ROOT, 'main.js'), 'utf8');
const WALL = [...main.matchAll(/PJ\('(\w+)', '([^']+)'/g)].map(m => ({ id: m[1], img: m[2] }));
const VIDS = Object.fromEntries([...main.match(/const VIDS = \{([^}]+)\}/)[1].matchAll(/(\w+): '([^']+)'/g)].map(m => [m[1], m[2]]));
const SKIP = new Set(['ai']);   // сводный «ai-продакшн» из старой версии — заменён отдельными кейсами
const ids = [...WALL.map(w => w.id), ...Object.keys(CASES).filter(id => !WALL.some(w => w.id === id))].filter(id => CASES[id] && !SKIP.has(id));
const cover = id => { const w = WALL.find(w => w.id === id); if (w) return `assets/${w.img}.jpg`; const h = (CASES[id].how || []).find(h => h[0]); return h ? h[0] : null; };
const byDir = d => ids.filter(id => CASES[id].dir === d);

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const real = v => v && v !== '—';
const DIRNAME = { atl: 'ATL и AI', btl: 'BTL' };

const ORG = { '@type': ['Organization', 'ProfessionalService'], '@id': `${SITE}/#org`, name: 'Oxygen', url: `${SITE}/`, logo: `${SITE}/assets/logo.svg`,
  description: 'AI-first рекламное агентство из Петербурга: федеральные кампании, бренд-зоны и ивенты, продакшн полного цикла',
  foundingDate: '2007', email: 'ask@oxygen-agency.ru', telephone: '+7 812 679-05-59',
  address: { '@type': 'PostalAddress', streetAddress: 'набережная Мойки, 37', addressLocality: 'Санкт-Петербург', addressCountry: 'RU' }, areaServed: 'RU' };

const head = ({ title, desc, path, img, ld }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow"><!-- черновик: снять на боевом домене (INDEX=1 node tools/build-pages.mjs) -->\n' : ''}<link rel="canonical" href="${SITE}/${path}">
<meta property="og:type" content="article"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="Oxygen">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}/${path}">
${img ? `<meta property="og:image" content="${SITE}/${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#010101">
<link rel="icon" href="../assets/iskra.svg"><link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
<link rel="stylesheet" href="../assets/page.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>`;

const top = `<a class="skip" href="#main">к содержанию</a>
<header><a href="../" aria-label="Oxygen — на главную"><img src="../assets/logo.svg" alt="Oxygen" width="120" height="22"></a><nav><a class="pill" href="../#cases">кейсы</a><a class="pill" href="../#contact">контакты</a></nav></header>`;
const foot = `<footer><div><b>Горит? Раздуем</b><a href="mailto:ask@oxygen-agency.ru">ask@oxygen-agency.ru</a><a href="tel:+78126790559">+7 (812) 679 05 59</a><a href="https://yandex.ru/maps/?text=%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3%2C%20%D0%BD%D0%B0%D0%B1%D0%B5%D1%80%D0%B5%D0%B6%D0%BD%D0%B0%D1%8F%20%D0%9C%D0%BE%D0%B9%D0%BA%D0%B8%2037" rel="noopener">санкт-петербург, набережная Мойки 37</a></div><p class="t">oxygen · 20_26 · обновлено ${new Date().toISOString().slice(0, 10)}</p></footer>`;

mkdirSync(join(ROOT, 'cases'), { recursive: true });
for (const id of ids) {
  const c = CASES[id], ps = c.pass || {}, list = byDir(c.dir), i = list.indexOf(id), prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
  const client = real(ps.клиент) ? ps.клиент : '', year = real(ps.год) ? ps.год : '';
  const og = existsSync(join(ROOT, `assets/og/${id}.jpg`)) ? `assets/og/${id}.jpg` : null;
  const title = clip(`${c.title}${client ? ` — ${client}` : ''} · кейс Oxygen`, 70);
  const desc = clip([c.task && `задача: ${c.task}`, c.idea && `идея: ${c.idea}`].filter(Boolean).join('. ') || `${c.title} — кейс агентства Oxygen, ${DIRNAME[c.dir]}`, 160);
  const path = `cases/${id}.html`;
  const steps = (c.steps || []).map((st, k) => st.length > 2 ? st : [String(k + 1).padStart(2, '0'), st[0], st[1]]);
  const gal = (c.how || []).filter(h => h[0]);
  const vid = VIDS[id], cov = cover(id);
  const crumbs = [['главная', `${SITE}/`], ['кейсы', `${SITE}/#cases`], [DIRNAME[c.dir], `${SITE}/#cases`], [c.title, `${SITE}/${path}`]];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CreativeWork', name: c.title, url: `${SITE}/${path}`, inLanguage: 'ru', ...(client ? { about: client, sponsor: { '@type': 'Organization', name: client } } : {}),
      ...(/^\d{4}$/.test(year) ? { dateCreated: year } : {}), ...(c.task ? { abstract: `${c.task}. ${c.idea || ''}`.trim() } : {}), ...(cov ? { image: `${SITE}/${cov}` } : {}),
      creator: { '@id': `${SITE}/#org` }, ...((c.awards || []).length ? { award: c.awards } : {}), genre: DIRNAME[c.dir] },
    { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([n, u], k) => ({ '@type': 'ListItem', position: k + 1, name: n, item: u })) }, ORG] };
  const html = `${head({ title, desc, path, img: og, ld })}
<body>
${top}
<main id="main" class="case">
<nav class="crumbs" aria-label="хлебные крошки"><a href="../">главная</a> / <a href="../#cases">кейсы</a> / <a href="../#cases">${DIRNAME[c.dir]}</a> / <span aria-current="page">${esc(c.title)}</span></nav>
<h1>${esc(c.title)}</h1>
<dl class="ps">${Object.entries(ps).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}${(c.awards || []).length ? `<div><dt>награды</dt><dd>${c.awards.map(esc).join('<br>')}</dd></div>` : ''}</dl>
${c.task || c.idea ? `<section class="ti">${c.task ? `<div><h2>задача</h2><p class="big">${esc(c.task)}</p></div>` : ''}${c.idea ? `<div><h2>идея</h2><p class="big">${esc(c.idea)}</p></div>` : ''}</section>` : ''}
${vid ? `<video src="../assets/${vid}.mp4" controls muted playsinline preload="none"${cov ? ` poster="../${cov}"` : ''} aria-label="${esc(c.title)}: ролик"></video>` : ''}
${steps.length ? `<section><h2>как сделали</h2><ol class="steps">${steps.map(([n, a, b]) => `<li><span class="n">${esc(n)}</span><div><b>${esc(a)}</b>${b ? `<p>${esc(b)}</p>` : ''}</div></li>`).join('')}</ol></section>` : ''}
${gal.length ? `<div class="gal${gal.length === 1 ? ' one' : ''}">${gal.map(([src, a, b], k) => `<figure><img src="../${src}" alt="${esc(`${c.title}${client ? ` (${client})` : ''}: ${a || b || `кадр ${k + 1}`}`)}" loading="lazy">${a || b ? `<figcaption><b>${esc(a || '')}</b>${b ? ` — ${esc(b)}` : ''}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
${(c.result || []).length ? `<section><h2>результат</h2><div class="res">${c.result.map(([a, b]) => `<div><b>${esc(a)}</b>${esc(b)}</div>`).join('')}</div></section>` : ''}
${(c.quotes || []).map(([q, who]) => `<blockquote class="q"><p>${esc(q)}</p><cite>${esc(who)}</cite></blockquote>`).join('')}
<div class="cta"><a class="btn" href="../?brief=${id}#contact">хочу так же</a></div>
<nav class="nb" aria-label="соседние кейсы"><a href="${prev}.html">← ${esc(CASES[prev].title)}</a><a href="../#cases">все кейсы</a><a href="${next}.html">${esc(CASES[next].title)} →</a></nav>
</main>
${foot}
</body>
</html>
`;
  writeFileSync(join(ROOT, path), html);
}

// список кейсов ссылками — в смысловой слой главной (index.html, между метками <!-- cases:d --> … <!-- /cases:d -->)
{ const ip = join(ROOT, 'index.html'); let h = readFileSync(ip, 'utf8');
  for (const d of ['atl', 'btl']) {
    const ul = `<!-- cases:${d} --><ul>${byDir(d).map(id => { const ps = CASES[id].pass || {}; return `<li><a href="cases/${id}.html">${esc(CASES[id].title)}</a>${real(ps.клиент) ? ` — ${esc(ps.клиент)}` : ''}${real(ps.год) ? `, ${esc(ps.год)}` : ''}</li>`; }).join('')}</ul><!-- /cases:${d} -->`;
    const a = h.indexOf(`<!-- cases:${d} -->`), e = h.indexOf(`<!-- /cases:${d} -->`);
    h = e > a ? h.slice(0, a) + ul + h.slice(e + `<!-- /cases:${d} -->`.length) : h.replace(`<!-- cases:${d} -->`, ul); }
  writeFileSync(ip, h); }

// sitemap, robots, llms
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>
${ids.map(id => `  <url><loc>${SITE}/cases/${id}.html</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `# поисковики и ИИ-поиск открыты; обучающие боты (GPTBot, ClaudeBot, Google-Extended) — решение руководства, пока не закрыты
# на черновике страницы закрыты meta robots noindex; на боевом домене — пересобрать с INDEX=1
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);
const line = id => { const c = CASES[id], ps = c.pass || {}; return `- [${c.title}](${SITE}/cases/${id}.html): ${[real(ps.клиент) && ps.клиент, real(ps.год) && ps.год].filter(Boolean).join(', ')}${c.task ? `. ${c.task}` : ''}`; };
writeFileSync(join(ROOT, 'llms.txt'), `# Oxygen

> AI-first рекламное агентство из Петербурга: федеральные кампании, бренд-зоны и ивенты, продакшн полного цикла. Здесь идеи разгораются, а не тлеют в рутине.

Агентство маркетинговых коммуникаций полного цикла. Основано в 2007 году, 52 специалиста в штате, проекты по всей России, дом — Петербург.

## Что делаем
- ATL и AI: креатив и федеральные кампании, брендинг, дизайн, продакшн (видео, 3d, cg, анимация, съёмка, ИИ-продакшн, звук), диджитал, it-решения, промо.
- BTL: механики и промо-персонал, event (бренд-зоны, фестивали, корпоративы, презентации), MICE, спорт (гонки, марафоны, клубы), промо, продакшн (застройка, декорации, мерч, печать, свет и звук).

## Контакты
- Почта: ask@oxygen-agency.ru
- Телефон: +7 (812) 679 05 59
- Адрес: Санкт-Петербург, набережная Мойки 37

## Кейсы: ATL и AI
${byDir('atl').map(line).join('\n')}

## Кейсы: BTL
${byDir('btl').map(line).join('\n')}
`);
console.log(`страниц кейсов: ${ids.length} (atl ${byDir('atl').length}, btl ${byDir('btl').length}); SITE ${SITE}; noindex ${NOINDEX}`);
