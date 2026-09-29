#!/usr/bin/env node
// Record a milestone snapshot of dist/aether.html: sha256, size, regression summary. The commit that
// adds dist/snapshots/<M>.json also contains the exact dist file (git history is the archive, QUESTIONS Q5).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = process.argv[2]; if (!M) throw Error('usage: node tools/snapshot.mjs M0 [regressionTag]');
const html = fs.readFileSync(path.join(root, 'dist/aether.html'));
const reg = path.join(root, 'tests/out', process.argv[3] || M.toLowerCase(), 'regression.json');
const r = fs.existsSync(reg) ? JSON.parse(fs.readFileSync(reg, 'utf8')) : null;
const snap = { milestone: M, time: new Date().toISOString(), bytes: html.length, sha256: crypto.createHash('sha256').update(html).digest('hex'),
  regression: r ? { failed: r.failed, total: r.checks.length, time: r.time } : null };
fs.mkdirSync(path.join(root, 'dist/snapshots'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/snapshots', M + '.json'), JSON.stringify(snap, null, 1));
console.log(JSON.stringify(snap));
