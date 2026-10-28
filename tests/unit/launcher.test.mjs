// The launcher (launcher/main.go, BLD-06, ADR-0034), built for this machine and run with --no-browser against a small game folder: it serves
// files with fixed MIME types and Range (206), refuses other hosts, requests other sites send, other methods, folders, hidden names and paths outside the folder, says
// who it is, lets a second start for the same folder through and refuses one for another folder, and exits once the page stops pinging or
// says goodbye. It must also build for Windows as a GUI program. Skipped (pass) when Go is not installed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bad = [], metrics = {};
const done = () => { console.log('RESULT ' + JSON.stringify({ test: 'launcher', pass: bad.length === 0, metrics, note: bad.map((b) => b.join(' ')).join(' | ') })); process.exitCode = bad.length ? 1 : 0; };
const findGo = () => { for (const g of [process.env.GO, 'go', '/usr/local/go/bin/go']) { if (!g) continue; try { execFileSync(g, ['version'], { stdio: 'ignore' }); return g; } catch { /* next */ } } return null; };
const go = findGo();
if (!go) { metrics.skipped = 'no Go'; done(); process.exit(); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-launcher-')), bin = path.join(tmp, 'launcher'), env = { ...process.env, XDG_CONFIG_HOME: tmp, HOME: tmp };
execFileSync(go, ['build', '-o', bin, '.'], { cwd: path.join(ROOT, 'launcher'), env: { ...process.env, CGO_ENABLED: '0' } });
const exe = path.join(tmp, 'NeonCity.exe');
execFileSync(go, ['build', '-trimpath', '-ldflags', '-s -w -H=windowsgui', '-o', exe, '.'], { cwd: path.join(ROOT, 'launcher'), env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' } });
{ const b = fs.readFileSync(exe), pe = b.readUInt32LE(0x3c); metrics.exeMB = +(b.length / 1e6).toFixed(1);
  if (b.toString('latin1', 0, 2) !== 'MZ' || b.toString('latin1', pe, pe + 4) !== 'PE\0\0') bad.push(['windows build is not a PE file']);
  else if (b.readUInt16LE(pe + 24 + 68) !== 2) bad.push(['windows build is not a GUI program (a console window would open)']); }

// a small game folder, a secret next to it, a hidden file and a sub folder
const game = path.join(tmp, 'game'), blob = Buffer.alloc(4096); for (let i = 0; i < blob.length; i++) blob[i] = (i * 131 + 7) & 255;
fs.mkdirSync(path.join(game, 'assets'), { recursive: true }); fs.mkdirSync(path.join(game, 'world'));
fs.writeFileSync(path.join(game, 'index.html'), '<!doctype html><title>t</title>'); fs.writeFileSync(path.join(game, 'main.js'), 'void 0;');
fs.writeFileSync(path.join(game, 'assets', 'a-ABC123.glb'), blob); fs.writeFileSync(path.join(game, 'world', 'x.pak'), blob);
fs.writeFileSync(path.join(game, '.hidden'), 'no'); fs.writeFileSync(path.join(tmp, 'secret.txt'), 'no');
const other = path.join(tmp, 'other'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'index.html'), 'x');

// starts the launcher; resolves with {p, url, port} once it printed its address
const start = (args) => new Promise((res, rej) => {
  const p = spawn(bin, args, { env }); let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; const m = out.match(/NEONCITY_URL (http:\/\/127\.0\.0\.1:(\d+)\/)/); if (m) res({ p, url: m[1], port: +m[2] }); });
  p.stderr.on('data', (d) => { err += d; }); p.on('exit', (c) => rej(new Error('exited ' + c + ' ' + err.slice(-300))));
  setTimeout(() => rej(new Error('no address')), 10000);
});
const exited = (p, ms) => new Promise((res) => { if (p.exitCode !== null) return res(p.exitCode); const t = setTimeout(() => res(null), ms); p.on('exit', (c) => { clearTimeout(t); res(c); }); });
const run = (args, ms) => new Promise((res) => { const p = spawn(bin, args, { env }); let all = ''; p.stdout.on('data', (d) => { all += d; }); p.stderr.on('data', (d) => { all += d; }); const t = setTimeout(() => { p.kill(); res({ code: null, all }); }, ms); p.on('exit', (code) => { clearTimeout(t); res({ code, all }); }); });
// raw request: the path is sent as written and the Host header can be anything
const req = (port, p, { method = 'GET', host, headers = {} } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: host || `127.0.0.1:${port}`, ...headers } }, (s) => { const c = []; s.on('data', (d) => c.push(d)); s.on('end', () => res({ status: s.statusCode, h: s.headers, body: Buffer.concat(c) })); });
  r.on('error', rej); r.end();
});

try {
  const a = await start(['--dir', game, '--port', '0', '--no-browser', '--idle', '3']);
  const ix = await req(a.port, '/');
  if (ix.status !== 200 || !/^text\/html/.test(ix.h['content-type']) || ix.h['x-content-type-options'] !== 'nosniff') bad.push(['index', ix.status, ix.h['content-type']]);
  const js = await req(a.port, '/main.js'); if (!/^text\/javascript/.test(js.h['content-type'])) bad.push(['js mime', js.h['content-type']]);
  const rg = await req(a.port, '/assets/a-ABC123.glb', { headers: { Range: 'bytes=100-1123' } });
  if (rg.status !== 206 || !rg.body.equals(blob.subarray(100, 1124)) || !/immutable/.test(rg.h['cache-control'] || '') || rg.h['content-encoding']) bad.push(['range', rg.status, rg.body.length, rg.h['cache-control']]);
  const pk = await req(a.port, '/world/x.pak', { method: 'HEAD' });
  if (pk.status !== 200 || +pk.h['content-length'] !== blob.length || pk.h['cache-control'] !== 'no-cache' || pk.h['content-type'] !== 'application/octet-stream') bad.push(['pak head', pk.status, pk.h['content-length'], pk.h['cache-control'], pk.h['content-type']]);
  const refused = { host: (await req(a.port, '/', { host: 'evil.example:' + a.port })).status, post: (await req(a.port, '/', { method: 'POST' })).status,
    folder: (await req(a.port, '/world/')).status, hidden: (await req(a.port, '/.hidden')).status, up: (await req(a.port, '/../secret.txt')).status,
    upEnc: (await req(a.port, '/%2e%2e/secret.txt')).status, back: (await req(a.port, '/..%5csecret.txt')).status, missing: (await req(a.port, '/nope.js')).status,
    crossSite: (await req(a.port, '/__neoncity/bye', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, sameSite: (await req(a.port, '/index.html', { headers: { 'Sec-Fetch-Site': 'same-site' } })).status,
    sameOrigin: (await req(a.port, '/index.html', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, typed: (await req(a.port, '/', { headers: { 'Sec-Fetch-Site': 'none' } })).status };
  metrics.refused = refused;
  if (refused.host !== 403 || refused.post !== 405 || refused.crossSite !== 403 || refused.sameSite !== 403) bad.push(['host/method/other site', JSON.stringify(refused)]);
  if (refused.sameOrigin !== 200 || refused.typed !== 200) bad.push(['own page refused', refused.sameOrigin, refused.typed]);
  for (const k of ['folder', 'hidden', 'up', 'upEnc', 'back', 'missing']) if (refused[k] !== 404) bad.push(['not refused', k, refused[k]]);
  const id = JSON.parse((await req(a.port, '/__neoncity/id')).body); if (id.app !== 'neoncity' || id.dir !== game) bad.push(['id', JSON.stringify(id)]);
  // pings keep it alive past the idle time; then silence ends it
  for (let i = 0; i < 4; i++) { await req(a.port, '/__neoncity/ping'); await new Promise((r) => setTimeout(r, 1000)); }
  if (a.p.exitCode !== null) bad.push(['exited while pinged']);
  const t0 = Date.now(), code = await exited(a.p, 8000); metrics.idleExitS = +((Date.now() - t0) / 1000).toFixed(1);
  if (code !== 0) bad.push(['no exit after idle', code]);

  // a goodbye beacon (POST, as sendBeacon sends) ends it 10 s later unless the page pings again
  const b = await start(['--dir', game, '--port', '0', '--no-browser', '--idle', '600']);
  await req(b.port, '/__neoncity/ping'); await req(b.port, '/__neoncity/bye', { method: 'POST' });
  const t1 = Date.now(), code2 = await exited(b.p, 15000); metrics.byeExitS = +((Date.now() - t1) / 1000).toFixed(1);
  if (code2 !== 0) bad.push(['no exit after bye', code2]);

  // default ports: a second start for the same folder only opens a window; one for another folder is refused
  const c = await start(['--dir', game, '--no-browser', '--idle', '600']); metrics.defaultPort = c.port;
  if (c.port < 47820 || c.port > 47829) bad.push(['default port', c.port]);
  if (fs.readFileSync(path.join(tmp, 'NeonCity', 'port.txt'), 'utf8').trim() !== String(c.port)) bad.push(['port not remembered']);
  const same = await run(['--dir', game, '--no-browser'], 8000), diff = await run(['--dir', other, '--no-browser'], 8000);
  if (same.code !== 0 || !/already running/.test(same.all)) bad.push(['second start', same.code, same.all.slice(-200)]);
  if (diff.code !== 1 || !/다른 폴더의 NeonCity/.test(diff.all)) bad.push(['other folder', diff.code, diff.all.slice(-200)]);
  c.p.kill();
  // a missing game folder is explained, not served
  const none = await run(['--dir', path.join(tmp, 'nothing'), '--port', '0', '--no-browser'], 8000);
  if (none.code !== 1 || !/압축을 모두 푼 뒤/.test(none.all)) bad.push(['missing folder', none.code]);
} catch (e) { bad.push(['error', e.message]); }
fs.rmSync(tmp, { recursive: true, force: true });
done();
