// The sound pipeline (EV-60, build/assets/audio.mjs): a loud and a quiet test tone both come out of convert() as Opus at -18 LUFS (within
// 1 LU) with the true peak at or under -1 dBTP; every audio entry of the manifest names a fetch source. Needs ffmpeg (skipped without it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const bad = [], m = {};
if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.log('RESULT ' + JSON.stringify({ test: 'audio-pipeline', pass: true, metrics: {}, note: 'skipped: no ffmpeg' }));
} else {
  const { convert, TARGET } = await import('../../build/assets/audio.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'));
  for (const [k, gain] of [['loud', 6], ['quiet', -12]]) {
    const src = path.join(dir, k + '.wav'), dst = path.join(dir, k + '.ogg');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-f', 'lavfi', '-i', 'anoisesrc=d=4:a=0.05', '-filter_complex', `amix=inputs=2,volume=${gain}dB`, src]);
    const r = convert(src, dst); m[k] = r;
    if (Math.abs(r.output.lufs - TARGET.I) > 1) bad.push([k, 'loudness', r.output.lufs]);
    if (r.output.tp > -1) bad.push([k, 'true peak', r.output.tp]);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', dst], { encoding: 'utf8' }).stdout.trim(); if (probe !== 'opus') bad.push([k, 'codec', probe]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const man = JSON.parse(fs.readFileSync(new URL('../../build/assets/manifest.json', import.meta.url), 'utf8'));
  for (const a of man.assets.filter((x) => x.kind === 'audio')) if (!(a.fetch || []).length) bad.push([a.id, 'no fetch source']);
  console.log('RESULT ' + JSON.stringify({ test: 'audio-pipeline', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
  process.exitCode = bad.length ? 1 : 0;
}
