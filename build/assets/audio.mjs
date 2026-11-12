// Sound pipeline (EV-60): manifest entries with "kind": "audio" are fetched by fetch.mjs into build/.asset-cache/<id>/, then converted here to
// Opus in Ogg, mono or stereo as the source, loudness-normalised to -18 LUFS integrated with true peak <= -1.5 dBTP (EBU R128, two-pass
// ffmpeg loudnorm), into assets/audio/<id>.ogg. The manifest's licence check and the credits screen cover them like every other asset.
// Usage: node build/assets/audio.mjs [--convert] [--measure [files...]]
//   --convert  convert every audio entry whose cache source exists (then run fetch.mjs --update to record the hashes)
//   --measure  print loudness (LUFS), true peak (dBTP) and length of the shipped audio files, or of the files given (audio-loudness tool)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const TARGET = { I: -18, TP: -1.5, LRA: 11 };

// ffmpeg with its report (it writes it to stderr); a failure throws with the report's end
function ff(args) { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg failed: ' + String(r.stderr).slice(-400)); return r.stderr; }
// loudness of a file: integrated LUFS, true peak dBTP and loudness range (ffmpeg's EBU R128 scanner)
export function measure(file) {
  const all = ff(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']), s = all.slice(all.lastIndexOf('Summary:')), num = (re) => { const m = s.match(re); return m ? +m[1] : null; };
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), tp: num(/Peak:\s+(-?[\d.]+) dBFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/) };
}
// one file to Opus at the target loudness: pass 1 measures, pass 2 applies the linear correction with those numbers
export function convert(src, dst, { bitrate = '96k', target = TARGET } = {}) {
  const lt = `I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`;
  const p1 = ff(['-i', src, '-af', `loudnorm=${lt}:print_format=json`, '-f', 'null', '-']);
  const j = JSON.parse(p1.slice(p1.lastIndexOf('{'), p1.lastIndexOf('}') + 1));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  ff(['-y', '-i', src, '-af', `loudnorm=${lt}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, '-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on', dst]);
  return { input: { lufs: +j.input_i, tp: +j.input_tp }, output: measure(dst) };
}
if (process.argv[1] && process.argv[1].endsWith('audio.mjs')) {
  const args = process.argv.slice(2), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/assets/manifest.json'), 'utf8'));
  const audio = man.assets.filter((a) => a.kind === 'audio');
  if (args.includes('--convert')) {
    for (const a of audio) {
      const s = (a.fetch || [])[0]; if (!s) { console.warn(a.id, ': no fetch source'); continue; }
      const src = path.join(ROOT, 'build/.asset-cache', a.id, s.to); if (!fs.existsSync(src)) { console.warn(a.id, ': not fetched (node build/assets/fetch.mjs --fetch)'); continue; }
      const r = convert(src, path.join(ROOT, 'assets/audio', a.id + '.ogg'), { bitrate: a.bitrate || '96k' }); console.info(a.id, JSON.stringify(r));
    }
  }
  if (args.includes('--measure')) {
    const given = args.filter((x) => !x.startsWith('--')), dir = path.join(ROOT, 'assets/audio');
    const files = given.length ? given : fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)) : [];
    for (const f of files) { const m = measure(f); console.info(path.basename(f).padEnd(32), JSON.stringify(m), Math.abs(m.lufs - TARGET.I) > 1 || m.tp > TARGET.TP + 0.5 ? 'OFF TARGET' : 'ok'); }
    if (!files.length) console.info('no shipped audio files yet (assets/audio/)');
  }
  if (!audio.length) console.info('the manifest has no audio entries yet ("kind": "audio")');
}
