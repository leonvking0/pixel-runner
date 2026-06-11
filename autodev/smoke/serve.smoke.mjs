import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let child = null;
function cleanup() {
  if (child) {
    try { child.kill('SIGTERM'); } catch {}
    child = null;
  }
}
process.on('exit', cleanup);
// 'exit' never fires on default signal death — trap signals so the python server can't leak.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { cleanup(); process.exit(1); });
}

function fail(msg) {
  console.error('SMOKE FAIL: ' + msg);
  cleanup();
  process.exit(1);
}

const watchdog = setTimeout(() => fail('hard timeout (90s)'), 90000);

(async () => {
  const PORTS = [8741, 8742, 8743, 8744, 8745];
  let port = null;
  let html = null;
  let ready = false;

  for (const p of PORTS) {
    child = spawn('python3', ['-m', 'http.server', String(p), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
    let exited = false;
    child.on('exit', () => { exited = true; });

    for (let i = 0; i < 20; i++) {
      if (exited) break;
      await new Promise(r => setTimeout(r, 250));
      // re-check liveness around the fetch: a collision kills python during the sleep,
      // and a pre-existing listener on the port must never be validated as ours
      if (exited) break;
      try {
        const res = await fetch('http://127.0.0.1:' + p + '/index.html');
        if (res.ok && !exited) {
          html = await res.text();
          ready = true;
          break;
        }
      } catch {}
    }
    if (ready) { port = p; break; }
    if (child) { try { child.kill('SIGTERM'); } catch {} }
    child = null;
  }

  if (!ready) fail('no port became ready');

  if (!html.includes('<canvas')) fail('missing canvas');
  const m = html.match(/<p[^>]*id="controls"[^>]*>([\s\S]*?)<\/p>/);
  if (!m) fail('missing controls block');
  const hints = m[1];
  if (!html.includes('<script type="module" src="src/shell/main.mjs">')) fail('missing module script tag');

  const modRes = await fetch('http://127.0.0.1:' + port + '/src/shell/main.mjs');
  if (modRes.status !== 200) fail('module fetch failed');

  const shellDir = join(ROOT, 'src', 'shell');
  const idSet = new Set();
  for (const file of readdirSync(shellDir)) {
    if (!file.endsWith('.mjs')) continue;
    const text = readFileSync(join(shellDir, file), 'utf8');
    for (const match of text.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) idSet.add(match[1]);
    for (const match of text.matchAll(/querySelector\(\s*['"]#([^'"]+)['"]\s*\)/g)) idSet.add(match[1]);
  }
  if (idSet.size === 0) fail('zero JS-referenced ids extracted');
  for (const id of idSet) {
    if (!html.includes('id="' + id + '"')) fail('missing id in html: ' + id);
  }

  const inputText = readFileSync(join(ROOT, 'src', 'shell', 'input.mjs'), 'utf8');
  const keySet = new Set();
  for (const match of inputText.matchAll(/case\s+['"]([^'"]+)['"]/g)) keySet.add(match[1]);
  for (const match of inputText.matchAll(/\.code\s*===\s*['"]([^'"]+)['"]/g)) keySet.add(match[1]);
  if (keySet.size === 0) fail('zero key strings extracted from input.mjs');
  for (const key of keySet) {
    if (!hints.includes(key)) fail('missing key in hints: ' + key);
  }

  clearTimeout(watchdog);
  cleanup();
  console.log(`SMOKE OK: served on :${port}; page + module 200; ${idSet.size} ids linked; ${keySet.size} keys in hints`);
  process.exit(0);
})();
