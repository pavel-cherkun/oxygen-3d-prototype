// node tools/build-pages.mjs — собирает из cases.js статические страницы кейсов, sitemap.xml, llms.txt
// и HTML-слой главной (список кейсов, клиенты, награды) между маркерами <!--SEO:start--> и <!--SEO:end--> в index.html.
// Факты берутся только из cases.js и текстов Никиты. Запускать после каждой правки cases.js.
import { CASES, ORDER, slug } from '../cases.js';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = 'https://oxygen-agency.ru';   // боевой домен — уточнить у руководства; пока сайт на черновом адресе, страницы закрыты noindex
const DRAFT = true;                         // снять (false) при публикации на боевом домене
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ORG = { name: 'Oxygen', email: 'ask@oxygen-agency.ru', phone: '+7 (812) 679 05 59', city: 'Санкт-Петербург', street: 'набережная Мойки, 37' };   // из портфолио 20_26
const DIR = { btl: 'BTL', atl: 'ATL' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/[\s,.;:—-]+\S*$/, '') + '…' : s);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ids = [...ORDER.btl, ...ORDER.atl].filter(id => CASES[id]);
const known = v => v && v !== '—';

// обложки для превью ссылок 1200×630 — из первой картинки кейса
mkdirSync(ROOT + 'assets/og', { recursive: true });
function og(id) {
  const out = `assets/og/${slug(id)}.jpg`, src = CASES[id].how?.[0]?.[0];
  if (!existsSync(ROOT + out) && src && existsSync(ROOT + src))
    try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', ROOT + src, '-vf', 'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630', '-q:v', '4', ROOT + out]); } catch {}
  return existsSync(ROOT + out) ? out : 'assets/og/main.jpg';
}

const head = ({ title, desc, url, img, type = 'website', ld, rel = '' }) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${DRAFT ? '<meta name="robots" content="noindex, nofollow"><!-- черновой адрес: снять на боевом домене (DRAFT=false в tools/build-pages.mjs) -->\n' : ''}<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="Oxygen">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}/${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${BASE}/${img}">
<meta name="theme-color" content="#111111">
<link rel="icon" href="${rel}assets/iskra.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="${rel}assets/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

const CSS = `@font-face{font-family:"TT";src:url("../assets/fonts/tiktok-sans.woff2") format("woff2");font-weight:300 900;font-display:swap}
@font-face{font-family:"AP";src:url("../assets/fonts/anonymous-pro.woff2") format("woff2");font-display:swap}
:root{--bg:#111111;--cream:#E1D9CF;--red:#F40709;--mute:#8d867e}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--cream);font:400 18px/1.5 "TT",system-ui,sans-serif}
a{color:inherit}
.t{font-family:"AP",monospace;color:var(--red);font-size:13px;letter-spacing:.02em}
header{display:flex;justify-content:space-between;align-items:center;padding:20px 28px;position:sticky;top:0;background:rgba(17,17,17,.9);backdrop-filter:blur(8px);z-index:2}
header img{height:22px;display:block}
.cta{border:1px solid var(--red);padding:8px 16px;border-radius:40px;text-decoration:none}
main{max-width:1180px;margin:0 auto;padding:40px 28px 80px}
nav.crumbs{margin-bottom:28px}nav.crumbs a{text-decoration:none;color:var(--mute)}nav.crumbs a:hover{color:var(--cream)}
h1{font-weight:520;font-size:clamp(44px,8vw,120px);line-height:.92;letter-spacing:-.03em;margin:10px 0 24px}
h2{font-weight:520;font-size:clamp(26px,3vw,40px);line-height:1.05;margin:56px 0 16px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}.tags span{border:1px solid var(--red);border-radius:40px;padding:5px 12px;font-size:14px}
dl.pass{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:18px;border-top:1px solid #2a2a2a;padding-top:20px}
dl.pass dd{margin-top:4px}
.ti{display:grid;grid-template-columns:1fr 1fr;gap:40px}.ti p{font-size:22px;line-height:1.3;margin-top:8px}
ol.steps{list-style:none;display:grid;gap:18px;counter-reset:s}ol.steps li{display:grid;grid-template-columns:70px 1fr;gap:4px 18px;border-top:1px solid #2a2a2a;padding-top:14px}
ol.steps li::before{counter-increment:s;content:counter(s,decimal-leading-zero);color:var(--red);font:520 34px/1 "TT"}ol.steps b{font-weight:520}ol.steps p{grid-column:2;color:#c9c1b7}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}.gal img{width:100%;display:block;border-radius:4px;background:#1a1a1a}.gal figcaption{margin-top:6px;font-size:15px}
.res{display:flex;flex-wrap:wrap;gap:40px}.res b{display:block;color:var(--red);font-weight:520;font-size:clamp(44px,6vw,96px);line-height:.9;letter-spacing:-.03em}.res span{display:block;max-width:24ch;margin-top:8px}
blockquote{border-top:1px solid var(--red);padding-top:24px;margin-top:32px;max-width:900px}blockquote p{font-size:clamp(22px,2.4vw,32px);line-height:1.2}blockquote cite{display:block;margin-top:12px;font-style:normal}
.next{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;margin-top:64px;border-top:1px solid #2a2a2a;padding-top:24px}
.btn{display:inline-block;background:var(--red);color:var(--bg);text-decoration:none;font-weight:520;padding:12px 20px;border-radius:40px;margin-top:20px}
footer{border-top:1px solid #2a2a2a;padding:28px;color:var(--mute);font-size:15px;display:flex;flex-wrap:wrap;gap:8px 28px;justify-content:space-between}
@media(max-width:760px){.ti{grid-template-columns:1fr}main{padding:24px 16px 60px}header{padding:16px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;

const footer = rel => `<footer><span>Oxygen · ai-first рекламное агентство · ${ORG.city}, ${ORG.street}</span><span><a href="mailto:${ORG.email}">${ORG.email}</a> · <a href="tel:+78126790559">${ORG.phone}</a></span><span><a href="${rel}index.html">главная</a> · <a href="${rel}index.html#brief">есть задача</a></span></footer>`;

mkdirSync(ROOT + 'cases', { recursive: true });
for (const id of ids) {
  const c = CASES[id], list = ORDER[c.dir], i = list.indexOf(id), prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
  const url = `${BASE}/cases/${slug(id)}.html`, img = og(id), client = c.pass.клиент;
  const title = cut(`${cap(c.title)} — кейс ${client} · Oxygen`, 70);
  const desc = cut(`${cap(c.idea || c.task)}. ${(c.result || []).filter(r => /\d/.test(r[0])).map(([n, d]) => `${n} ${d}`).join(', ')}${(c.result || []).some(r => /\d/.test(r[0])) ? '.' : ''}`.trim(), 160);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CreativeWork', name: c.title, url, image: `${BASE}/${img}`, about: client, abstract: c.idea, creator: { '@type': 'Organization', '@id': BASE + '/#org', name: 'Oxygen', url: BASE + '/' }, inLanguage: 'ru', genre: DIR[c.dir],
      ...(known(c.pass.год) ? { dateCreated: c.pass.год } : {}), ...(c.awards.length ? { award: c.awards } : {}) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Oxygen', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: DIR[c.dir], item: `${BASE}/#${c.dir}` }, { '@type': 'ListItem', position: 3, name: c.title, item: url }] }] };
  const res = (c.result || []).filter(r => known(r[0]));
  const html = `<!doctype html>
<html lang="ru">
<head>
${head({ title, desc, url, img, type: 'article', ld, rel: '../' })}
<style>${CSS}</style>
</head>
<body>
<header><a href="../index.html"><img src="../assets/logo.svg" alt="Oxygen — на главную"></a><a class="cta" href="../index.html#brief">есть задача</a></header>
<main>
<nav class="crumbs t" aria-label="навигация"><a href="../index.html">oxygen</a> / <a href="../index.html#${c.dir}">${c.dir}</a> / <span>${esc(c.title)}</span></nav>
<article>
<span class="t">кейс · ${c.dir}</span>
<h1>${esc(c.title)}</h1>
${c.awards.length ? `<div class="tags" aria-label="награды">${c.awards.map(a => `<span>${esc(a)}</span>`).join('')}</div>` : ''}
<dl class="pass">${Object.entries(c.pass).filter(([, v]) => known(v)).map(([k, v]) => `<div><dt class="t">${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
${c.task ? `<section class="ti"><div><h2 class="t" style="font-size:13px;margin:40px 0 0">задача</h2><p>${esc(c.task)}</p></div><div><h2 class="t" style="font-size:13px;margin:40px 0 0">идея</h2><p>${esc(c.idea)}</p></div></section>` : ''}
${c.steps ? `<section><h2>как сделали</h2><ol class="steps">${c.steps.map(([h, d]) => `<li><b>${esc(h)}</b><p>${esc(d)}</p></li>`).join('')}</ol></section>` : ''}
${c.formats ? `<section><h2>форматы</h2><ol class="steps">${c.formats.map(([h, d]) => `<li><b>${esc(h)}</b><p>${esc(d)}</p></li>`).join('')}</ol></section>` : ''}
${res.length ? `<section><h2>результат</h2><div class="res">${res.map(([n, d]) => /\d/.test(n) ? `<p><b>${esc(n)}</b><span>${esc(d)}</span></p>` : `<p><span style="font-size:24px">${esc(d)} — ${esc(n)}</span></p>`).join('')}</div></section>` : ''}
${c.how?.length ? `<section><h2>как это выглядело</h2><div class="gal">${c.how.map(([src, h, d]) => `<figure><img src="../${src}" alt="${esc(c.title)}${h && h !== c.title ? ': ' + esc(h) : ''}${d ? ' — ' + esc(d) : ''}" loading="lazy">${h || d ? `<figcaption>${esc(h)}${d ? `<br><span class="t">${esc(d)}</span>` : ''}</figcaption>` : ''}</figure>`).join('')}</div></section>` : ''}
${c.quotes ? c.quotes.map(([q, a]) => `<blockquote><p>«${esc(q.replace(/^«|»$/g, ''))}»</p><cite class="t">— ${esc(a)}</cite></blockquote>`).join('') : ''}
<a class="btn" href="../index.html#brief">хочу так же</a>
</article>
<nav class="next" aria-label="другие кейсы"><a href="${slug(prev)}.html">← ${esc(CASES[prev].title)}</a><a href="../index.html#case-${id}">к кейсу в 3D</a><a href="${slug(next)}.html">${esc(CASES[next].title)} →</a></nav>
</main>
${footer('../')}
</body>
</html>
`;
  writeFileSync(ROOT + `cases/${slug(id)}.html`, html);
}

// HTML-слой главной: то же содержание, что в 3D, — для поисковиков, нейросетей и тех, у кого не запустился WebGL
const li = id => `<li><a href="cases/${slug(id)}.html">${esc(CASES[id].title)}</a> — ${esc(CASES[id].pass.клиент)}${known(CASES[id].pass.год) ? ', ' + CASES[id].pass.год : ''}</li>`;
const norm = n => n.replace(/[«»"]/g, '').replace(/\s*\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();   // ФК «Зенит» и ФК Зенит — один клиент
const clients = [...new Map(ids.map(id => CASES[id].pass.клиент).flatMap(s => s.split(/ · |, /)).filter(known).map(n => [norm(n), n.replace(/\s*\(.*?\)/g, '')])).values()];
const awards = ids.filter(id => CASES[id].awards.length).map(id => `<li>${esc(CASES[id].title)} (${esc(CASES[id].pass.клиент)}): ${CASES[id].awards.map(esc).join('; ')}</li>`);
const layer = `<!--SEO:start-->
<div class="vh" id="seo">
<section id="atl"><h2>Кампании, которые продолжаются без нас</h2><p>Вселенные, бренд-платформы, сезонные рамки и точечные механики. Всё внутри агентства, включая AI-продакшн — режиссуру без площадок, смен и пересъёмок.</p>
<h3>Кейсы ATL и AI</h3><ul>${ORDER.atl.filter(id => CASES[id]).map(li).join('')}</ul></section>
<section id="btl"><h2>Гости приходят зрителями — и становятся участниками</h2><p>Фестивали, гонки, марафоны, промо, выездные программы. Продумываем до последней вывески и строим сами.</p>
<h3>Кейсы BTL</h3><ul>${ORDER.btl.filter(id => CASES[id]).map(li).join('')}</ul></section>
<section id="awards"><h2>Оценили не только клиенты</h2><ul>${awards.join('')}</ul></section>
<section id="clients"><h2>Клиенты</h2><p>${clients.map(esc).join(', ')}</p></section>
<section id="jobs"><h2>Ищем тех, кто превращает чужие искры в пламя</h2><p>Вакансии появятся здесь. Пока — портфолио на <a href="mailto:${ORG.email}">${ORG.email}</a>.</p></section>
<section id="credits"><h2>Сторонние ассеты</h2><p>3D-модели автомобилей: Ford Mustang GT Convertible — adrianaflak09, Chery Tiggo 8 Pro — niev (Sketchfab, CC BY). Скалы — Poly Haven (CC0). three.js — MIT.</p></section>
<section id="contacts"><h2>Горит? Раздуем</h2><address>Oxygen, ${ORG.city}, ${ORG.street}. <a href="mailto:${ORG.email}">${ORG.email}</a>, <a href="tel:+78126790559">${ORG.phone}</a></address></section>
</div>
<!--SEO:end-->`;
let index = readFileSync(ROOT + 'index.html', 'utf8');
index = index.replace(/<!--SEO:start-->[\s\S]*?<!--SEO:end-->/, layer);
// noscript: короткий текст, кейсы ссылками, контакты
const nos = `<!--NOSCRIPT:start--><noscript><div class="nos"><h2>Oxygen — AI-first рекламное агентство из Петербурга</h2><p>Федеральные кампании, бренд-зоны и ивенты, продакшн полного цикла. 3D-версия сайта не запустилась — ниже кейсы и контакты.</p><h3>ATL и AI</h3><ul>${ORDER.atl.filter(id => CASES[id]).map(li).join('')}</ul><h3>BTL</h3><ul>${ORDER.btl.filter(id => CASES[id]).map(li).join('')}</ul><p><a href="mailto:${ORG.email}">${ORG.email}</a> · ${ORG.phone} · ${ORG.city}, ${ORG.street}</p></div></noscript><!--NOSCRIPT:end-->`;
index = index.replace(/<!--NOSCRIPT:start-->[\s\S]*?<!--NOSCRIPT:end-->/, nos);
writeFileSync(ROOT + 'index.html', index);

// sitemap.xml, llms.txt
const today = new Date().toISOString().slice(0, 10);
writeFileSync(ROOT + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/</loc><lastmod>${today}</lastmod></url>
${ids.map(id => `<url><loc>${BASE}/cases/${slug(id)}.html</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(ROOT + 'llms.txt', `# Oxygen

> AI-first рекламное агентство из Петербурга: федеральные кампании, бренд-зоны и ивенты, продакшн полного цикла. Здесь идеи разгораются, а не тлеют в рутине.

Два направления: ATL и AI (кампании, вселенные, бренд-платформы, сезонные рамки, AI-продакшн) и BTL (фестивали, гонки, марафоны, промо, выездные программы, бренд-зоны).

Контакты: ${ORG.email}, ${ORG.phone}, ${ORG.city}, ${ORG.street}.

## Кейсы ATL и AI
${ORDER.atl.filter(id => CASES[id]).map(id => `- [${CASES[id].title}](${BASE}/cases/${slug(id)}.html): ${CASES[id].pass.клиент}. ${CASES[id].idea}`).join('\n')}

## Кейсы BTL
${ORDER.btl.filter(id => CASES[id]).map(id => `- [${CASES[id].title}](${BASE}/cases/${slug(id)}.html): ${CASES[id].pass.клиент}. ${CASES[id].idea}`).join('\n')}
`);
console.log(`страниц кейсов: ${ids.length}; клиентов: ${clients.length}; с наградами: ${awards.length}`);
