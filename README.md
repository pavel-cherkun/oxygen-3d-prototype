# Прототип 3D-главной Oxygen

Запуск: из этой папки `python3 -m http.server 5184`, открыть http://127.0.0.1:5184. Интернет не нужен: three.js и Draco лежат в `vendor/three` (0.169.0, лицензия MIT).

- `index.html` — разметка, оверлеи, HTML-слой для поисковиков (между `<!--SEO:start-->` и `<!--SEO:end-->` — генерируется).
- `world.js` — 3D-мир: кварталы, маршруты btl / atl+ai, остановки у кейсов, камера, листание, облегчённый режим для телефонов (`LITE`, `?lite`).
- `zones/zones.js` — 3D-зоны кейсов (модели в `assets/zones/models`).
- `cases.js` — тексты кейсов Никиты; из него `node tools/build-pages.mjs` собирает `cases/*.html`, `sitemap.xml`, `llms.txt` и HTML-слой главной.
- `404.html`, `privacy.html` (заглушка), `robots.txt`.

Тексты: прелоадер, первый экран, разделы, «о нас», подписи — Никита Лопатин, «Копирайт для сайта», 17.11.

## Модели и лицензии
- «2018 Ford Mustang GT Convertible» — adrianaflak09, Sketchfab, CC BY 4.0. Убрана крыша, перекрашен, добавлен брендинг G-Drive × Iron Star.
- «Chery Tiggo 8 Pro» — niev, Sketchfab, CC BY 4.0. Убраны посторонние объекты, упрощён, перекрашен, добавлен брендинг G-Drive.
- Кондиционер, гидрант, урна, электрощиток, подвесная лампа — Poly Haven, CC0.
- Синегривый лев — сгенерирован в Higgsfield по рендерам маскота «Зенита».
