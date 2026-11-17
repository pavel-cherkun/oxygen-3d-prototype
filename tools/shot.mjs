// node tools/shot.mjs <префикс> <id:t | p:t | case:id> ... — кадры через безголовый Chrome (EVAL — выражение в конце, WAIT — пауза, W×H — WIDTH/HEIGHT)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [out, ...shots] = process.argv.slice(2), port = 9561, W = +(process.env.WIDTH || 1200), H = +(process.env.HEIGHT || 750);
const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`, '--hide-scrollbars', `--user-data-dir=${out}-prof`, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 150; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.find(t => t.type === 'page')) break; } catch {} await wait(200); }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
const cmd = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await cmd('Runtime.enable'); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') console.log('ERR', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 760 });
await cmd('Page.navigate', { url: process.env.URL || 'http://127.0.0.1:5181/?dev' });
for (let i = 0; i < 200; i++) { const r = await cmd('Runtime.evaluate', { expression: '!!window.__three', returnByValue: true }); if (r.result.value) break; await wait(500); }
await wait(3000); const cp = await cmd('Runtime.evaluate', { expression: 'window.__three.checkPath().length', returnByValue: true }); console.log('checkPath hits', cp.result.value);
for (const s of shots) {
  const [cid, t] = s.split(':');
  const ex = cid === 'case' ? `(()=>{const b=document.createElement('button');b.dataset.case='${t}';document.body.appendChild(b);b.click();b.remove();})()`
    : cid === 'p' ? `window.__three.go(${t},'btl')` : `(()=>{const T=window.__three,w=T.WORLD.find(w=>w.id==='${cid}');T.go(w.p+w.span*${t},w.r)})()`;
  await cmd('Runtime.evaluate', { expression: ex });
  await wait(+(process.env.WAIT || 4000));
  let r; for (let k = 0; k < 40 && !r?.data; k++) { r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); if (!r?.data) await wait(250); }
  writeFileSync(`${out}-${cid}${t}.jpg`, Buffer.from(r.data, 'base64')); console.log('ok', s);
}
if (process.env.EVAL) { const r = await cmd('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true, awaitPromise: true }); console.log('EVAL', JSON.stringify(r.result.value ?? r.result.description)); }
ch.kill(); process.exit(0);
