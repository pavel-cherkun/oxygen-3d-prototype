// Сборка HTML-слоя для поисковиков и ИИ-ассистентов из cases.js — один источник для 3D и для текста.
//   node tools/build-pages.mjs
// Делает: cases/<id>.html (страница кейса), cases/index.html (все кейсы), sitemap.xml, llms.txt,
// и вставляет смысловой текст главной между <!--SEO:start--> и <!--SEO:end--> в index.html.
// BASE — адрес боевого домена. ⚠ домен не выбран: стоит домен почты агентства, заменить при публикации.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CASES, ORDER } from '../cases.js';

const BASE = 'https://oxygen-agency.ru';
const DRAFT = true;   // черновик: noindex на всех страницах. снять на боевом домене
const UPDATED = '2026-11-17';
const ORG = { name: 'Oxygen', email: 'ask@oxygen-agency.ru', phone: '+7 (812) 679 05 59', tel: '+78126790559', city: 'Санкт-Петербург', street: 'набережная Мойки, 37' };   // из портфолио 20_26 (материалы/)
const T = {   // тексты Никиты Лопатина, «Копирайт для сайта», 17.11 — дословно
  h1: 'Топливо ваших идей',
  h2: 'AI-first рекламное агентство из Петербурга: федеральные кампании, бренд-зоны и ивенты, продакшн полного цикла. Здесь идеи разгораются, а не тлеют в рутине',
  atl: ['Кампании, которые продолжаются без нас', 'Вселенные, бренд-платформы, сезонные рамки и точечные механики. Всё внутри агентства, включая AI-продакшн — режиссуру без площадок, смен и пересъёмок.'],
  btl: ['Гости приходят зрителями — и становятся участниками', 'Фестивали, гонки, марафоны, промо, выездные программы. Продумываем до последней вывески и строим сами.'],
  about: [
    ['Берём на себя скучное и возвращаем интересное', 'Провести вашу концепцию через сорок носителей, три подрядчика и два круга правок, не растеряв драйв по дороге, — в этой работе мы так же устойчивы, как в креативе.'],
    ['Раскручиваем то, что в брифе только намечалось', 'Ищем точку, где вашу идею можно усилить, и доводим её до системы: стратегия или креативная рамка, брендбук или дизайн-система, которые держат консистентность. Чем больше у кампании точек входа, тем дольше она живёт.'],
    ['Вам есть что показать — мы делаем так, чтобы это заметили', 'У любого бренда есть то, чем он отличается: продукт, история, люди, привычки его покупателей. Чаще всего преимущество тонет в общем шуме. Мы ищем форму, в которой отличие становится видно, — собственных героев, спецпроект, место, где бренд не ждали. После этого рекламу перестают терпеть и начинают пересматривать.'],
  ],
  come: ['Нужна кампания к запуску', 'Скоро тендер', 'Нужно мероприятие или промо', 'Хотим выйти на новую аудиторию', 'Нужен спецпроект'],
  contacts: 'Горит? Раздуем', jobs: 'Ищем тех, кто превращает чужие искры в пламя', awards: 'Оценили не только клиенты',
};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const has = v => v && v !== '—';
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const dirOf = (id, c) => id.startsWith('ai') ? 'ai' : c.dir;
const DIRN = { btl: 'BTL', atl: 'ATL', ai: 'AI-продакшн' };
const LIST = [...ORDER.btl, ...ORDER.atl].filter((id, i, a) => CASES[id] && a.indexOf(id) === i);
const clip = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)) + '…';
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const orgLD = { '@type': ['Organization', 'ProfessionalService'], '@id': BASE + '/#org', name: ORG.name, url: BASE + '/', logo: BASE + '/assets/logo.svg', email: ORG.email, telephone: ORG.phone,
  description: T.h2, address: { '@type': 'PostalAddress', addressLocality: ORG.city, streetAddress: ORG.street, addressCountry: 'RU' },
  contactPoint: { '@type': 'ContactPoint', contactType: 'new business', email: ORG.email, telephone: ORG.phone, areaServed: 'RU', availableLanguage: 'ru' } };

// ---------- страница кейса ----------
function casePage(id, i) {
  const c = CASES[id], d = dirOf(id, c), sib = LIST.filter(k => dirOf(k, CASES[k]) === d), j = sib.indexOf(id);
  const prev = sib[(j - 1 + sib.length) % sib.length], next = sib[(j + 1) % sib.length];
  const client = c.pass.клиент, year = has(c.pass.год) ? c.pass.год : '', url = `${BASE}/cases/${id}.html`;
  const title = `${cap(c.title)} — ${client}${year ? ', ' + year : ''} · кейс Oxygen`;
  const desc = clip(`${cap(c.task)}. Идея: ${c.idea}.`, 158);
  const img = c.how[0]?.[0], res = (c.result || []).filter(([n]) => has(n));
  const crumbs = [['Главная', '../index.html', BASE + '/'], ['Кейсы', 'index.html', BASE + '/cases/'], [DIRN[d], `index.html#${d}`, `${BASE}/cases/#${d}`], [c.title, `${id}.html`, url]];
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${DRAFT ? '<meta name="robots" content="noindex"><!-- черновик: снять на боевом домене -->\n' : ''}<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="Oxygen">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
${img ? `<meta property="og:image" content="${BASE}/${img}"><meta name="twitter:card" content="summary_large_image">` : `<meta property="og:image" content="${BASE}/assets/og.jpg"><meta name="twitter:card" content="summary_large_image">`}
<meta name="theme-color" content="#111111">
<link rel="icon" href="../assets/iskra.svg"><link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
<link rel="stylesheet" href="case.css">
${ld({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'CreativeWork', '@id': url + '#work', name: c.title, headline: c.title, url, description: desc, inLanguage: 'ru',
    about: { '@type': 'Organization', name: client }, ...(year ? { dateCreated: year } : {}), ...(img ? { image: `${BASE}/${img}` } : {}),
    creator: { '@id': BASE + '/#org' }, ...(c.awards.length ? { award: c.awards } : {}), genre: c.pass.направления || c.pass.формат || DIRN[d] },
  { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([n, , u], k) => ({ '@type': 'ListItem', position: k + 1, name: n, item: u })) },
  orgLD ] })}
</head>
<body>
<header class="top"><a href="../index.html" class="logo"><img src="../assets/logo.svg" alt="Oxygen — на главную" width="118" height="28"></a>
<nav aria-label="разделы"><a href="index.html#btl">btl</a><a href="index.html#atl">atl</a><a href="index.html#ai">ai</a><a class="go" href="#contact">есть задача</a></nav></header>
<main>
<nav class="crumbs t" aria-label="хлебные крошки"><ol>${crumbs.map(([n, h], k) => k < crumbs.length - 1 ? `<li><a href="${h}">${esc(n.toLowerCase())}</a></li>` : `<li aria-current="page">${esc(n)}</li>`).join('')}</ol></nav>
<article>
<header class="ch"><span class="t">{кейс · ${esc(DIRN[d].toLowerCase())}} · ${esc(client)}${year ? ' · ' + esc(year) : ''}</span>
<h1>${esc(c.title)}</h1>
${c.awards.length ? `<ul class="tags" aria-label="награды">${c.awards.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</header>
<dl class="pass">${Object.entries(c.pass).filter(([, v]) => has(v)).map(([k, v]) => `<div><dt class="t">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
<div class="ti"><section><h2 class="t">задача</h2><p>${esc(c.task)}</p></section><section><h2 class="t">идея</h2><p>${esc(c.idea)}</p></section></div>
${c.how.length ? `<div class="gal">${c.how.map(([src, h, dd], k) => `<figure><img src="../${src}" alt="${esc(`${c.title}, ${client}: ${h || 'кадр ' + (k + 1)}${dd ? ' — ' + dd : ''}`)}" loading="${k ? 'lazy' : 'eager'}">${h ? `<figcaption><span class="t">{${String(k + 1).padStart(2, '0')}}</span> <b>${esc(h)}</b>${dd ? ` · <span>${esc(dd)}</span>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
${(c.steps || []).length ? `<section><h2 class="t">как сделали</h2><ol class="steps">${c.steps.map(([h, dd], k) => `<li><span class="n t">${String(k + 1).padStart(2, '0')}</span><b>${esc(h)}</b><p>${esc(dd)}</p></li>`).join('')}</ol></section>` : ''}
${res.length ? `<section><h2 class="t">результат</h2><ul class="res">${res.map(([n, dd]) => `<li><b>${esc(n)}</b> <span>${esc(dd)}</span></li>`).join('')}</ul></section>` : ''}
${(c.quotes || []).map(([q, a]) => `<blockquote class="q"><p>«${esc(q)}»</p><cite class="t">— ${esc(a)}</cite></blockquote>`).join('')}
${c.note ? `<p class="note t">${esc(c.note)}</p>` : ''}
</article>
<section class="cta" id="contact"><h2>${esc(T.contacts.toLowerCase())}</h2><p>нужен похожий результат? напишите — по мотивам кейса «${esc(c.title)}»</p>
<p><a class="btn" href="mailto:${ORG.email}?subject=${encodeURIComponent('по мотивам кейса «' + c.title + '»')}">${ORG.email}</a> <a class="btn ghost" href="tel:${ORG.tel}">${ORG.phone}</a></p>
<p class="t">${esc(ORG.city.toLowerCase())}, ${esc(ORG.street)}</p></section>
<nav class="pn" aria-label="соседние кейсы">${prev !== id ? `<a href="${prev}.html"><span class="t">← предыдущий</span>${esc(CASES[prev].title)}</a>` : ''}<a href="../index.html?case=${id}" class="w3"><span class="t">в 3D-мире</span>смотреть на месте</a>${next !== id ? `<a href="${next}.html"><span class="t">следующий →</span>${esc(CASES[next].title)}</a>` : ''}</nav>
</main>
<footer class="foot t"><a href="../index.html">oxygen</a> · <a href="index.html">все кейсы</a> · <a href="mailto:${ORG.email}">${ORG.email}</a> · <a href="tel:${ORG.tel}">${ORG.phone}</a> · обновлено ${UPDATED}</footer>
</body>
</html>
`;
}

// ---------- список кейсов по разделам (для главной, страницы кейсов, noscript и llms.txt) ----------
const groups = ['btl', 'atl', 'ai'].map(d => [d, LIST.filter(id => dirOf(id, CASES[id]) === d)]);
const caseLine = (id, pre) => { const c = CASES[id], y = has(c.pass.год) ? ', ' + c.pass.год : ''; return `<li><a href="${pre}${id}.html">${esc(c.title)}</a> — ${esc(c.pass.клиент)}${esc(y)}. ${esc(cap(c.task))}</li>`; };

function casesIndex() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Кейсы Oxygen — BTL, ATL и AI-продакшн</title>
<meta name="description" content="${esc(clip('Кейсы агентства Oxygen: бренд-зоны, фестивали, промо, кампании и AI-продакшн для Ozon, Т-Банка, Дикси, G-Drive, ФК «Зенит», «Балтики», МегаФона и других.', 158))}">
${DRAFT ? '<meta name="robots" content="noindex"><!-- черновик: снять на боевом домене -->\n' : ''}<link rel="canonical" href="${BASE}/cases/">
<meta property="og:title" content="Кейсы Oxygen"><meta property="og:image" content="${BASE}/assets/og.jpg"><meta property="og:locale" content="ru_RU"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#111111"><link rel="icon" href="../assets/iskra.svg"><link rel="stylesheet" href="case.css">
${ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: 'Кейсы Oxygen', url: BASE + '/cases/', hasPart: LIST.map(id => ({ '@type': 'CreativeWork', name: CASES[id].title, url: `${BASE}/cases/${id}.html` })) },
  { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Главная', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: 'Кейсы', item: BASE + '/cases/' }] }, orgLD] })}
</head>
<body>
<header class="top"><a href="../index.html" class="logo"><img src="../assets/logo.svg" alt="Oxygen — на главную" width="118" height="28"></a><nav aria-label="разделы"><a href="#btl">btl</a><a href="#atl">atl</a><a href="#ai">ai</a><a class="go" href="mailto:${ORG.email}">есть задача</a></nav></header>
<main>
<nav class="crumbs t" aria-label="хлебные крошки"><ol><li><a href="../index.html">главная</a></li><li aria-current="page">кейсы</li></ol></nav>
<h1>кейсы</h1>
${groups.map(([d, ids]) => `<section id="${d}"><h2>${esc(DIRN[d])}</h2>${d === 'btl' ? `<p class="lead">${esc(T.btl[0])}. ${esc(T.btl[1])}</p>` : d === 'atl' ? `<p class="lead">${esc(T.atl[0])}. ${esc(T.atl[1])}</p>` : ''}<ul class="list">${ids.map(id => caseLine(id, '')).join('')}</ul></section>`).join('\n')}
</main>
<footer class="foot t"><a href="../index.html">oxygen</a> · <a href="mailto:${ORG.email}">${ORG.email}</a> · <a href="tel:${ORG.tel}">${ORG.phone}</a> · обновлено ${UPDATED}</footer>
</body>
</html>
`;
}

// смысловой слой главной: тот же текст, что в 3D и оверлеях, — обычным HTML (visually-hidden, не display:none)
function homeLayer() {
  return `<main class="vh" id="content">
<h1>${esc(T.h1)}</h1>
<p>${esc(T.h2)}</p>
<section><h2>${esc(T.atl[0])}</h2><p>${esc(T.atl[1])}</p><h3>кейсы ATL</h3><ul>${groups[1][1].map(id => caseLine(id, 'cases/')).join('')}</ul><h3>AI-продакшн</h3><ul>${groups[2][1].map(id => caseLine(id, 'cases/')).join('')}</ul></section>
<section><h2>${esc(T.btl[0])}</h2><p>${esc(T.btl[1])}</p><h3>кейсы BTL</h3><ul>${groups[0][1].map(id => caseLine(id, 'cases/')).join('')}</ul></section>
<section><h2>о нас</h2>${T.about.map(([h, p]) => `<h3>${esc(h)}</h3><p>${esc(p)}</p>`).join('')}</section>
<section><h2>${esc(T.awards)}</h2><ul>${LIST.filter(id => CASES[id].awards.length).map(id => `<li>${esc(CASES[id].awards.join(', '))} — <a href="cases/${id}.html">${esc(CASES[id].title)}</a> (${esc(CASES[id].pass.клиент)})</li>`).join('')}</ul></section>
<section><h2>${esc(T.contacts)}</h2><p>С чем вы приходите?</p><ul>${T.come.map(x => `<li>${esc(x)}</li>`).join('')}</ul><address><a href="mailto:${ORG.email}">${ORG.email}</a>, <a href="tel:${ORG.tel}">${ORG.phone}</a>, ${esc(ORG.city)}, ${esc(ORG.street)}</address></section>
<section><h2>вакансии</h2><p>${esc(T.jobs)}</p></section>
<p><a href="cases/">все кейсы</a> · обновлено ${UPDATED}</p>
</main>
<noscript><div class="ns"><img src="assets/logo.svg" alt="Oxygen" width="160"><p class="nsh">${esc(T.h1)}</p><p>${esc(T.h2)}</p><p>3D-мир сайта не запустился: нужен JavaScript и WebGL. Все кейсы — <a href="cases/">списком</a>. Связаться: <a href="mailto:${ORG.email}">${ORG.email}</a>, <a href="tel:${ORG.tel}">${ORG.phone}</a>.</p></div></noscript>`;
}

function llms() {
  return `# Oxygen

> ${T.h2}

Рекламное агентство из Санкт-Петербурга. Направления: ATL (кампании, бренд-платформы, сезонные рамки, AI-продакшн), BTL (бренд-зоны, фестивали, гонки, марафоны, промо, выездные программы), брендинг, мерч.

- Почта: ${ORG.email}
- Телефон: ${ORG.phone}
- Адрес: ${ORG.city}, ${ORG.street}

${groups.map(([d, ids]) => `## Кейсы: ${DIRN[d]}\n\n${ids.map(id => { const c = CASES[id]; const r = (c.result || []).filter(([n]) => has(n)).map(([n, t]) => `${n} ${t}`).join('; '); return `- [${c.title}](${BASE}/cases/${id}.html): ${c.pass.клиент}${has(c.pass.год) ? ', ' + c.pass.год : ''}. ${cap(c.task)}.${r ? ' Результат: ' + r + '.' : ''}`; }).join('\n')}`).join('\n\n')}

## О нас

${T.about.map(([h, p]) => `- ${h}. ${p}`).join('\n')}
`;
}

mkdirSync('cases', { recursive: true });
LIST.forEach((id, i) => writeFileSync(`cases/${id}.html`, casePage(id, i)));
writeFileSync('cases/index.html', casesIndex());
writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${BASE}/</loc><lastmod>${UPDATED}</lastmod></url>\n<url><loc>${BASE}/cases/</loc><lastmod>${UPDATED}</lastmod></url>\n${LIST.map(id => `<url><loc>${BASE}/cases/${id}.html</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFileSync('llms.txt', llms());
const idx = readFileSync('index.html', 'utf8'), a = idx.indexOf('<!--SEO:start-->'), b = idx.indexOf('<!--SEO:end-->');
if (a < 0 || b < 0) throw new Error('в index.html нет меток <!--SEO:start--> / <!--SEO:end-->');
writeFileSync('index.html', idx.slice(0, a + 16) + '\n' + homeLayer() + '\n' + idx.slice(b));
console.log(`кейсов: ${LIST.length}`, groups.map(([d, x]) => d + ' ' + x.length).join(', '));
