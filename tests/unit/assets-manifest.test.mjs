// The asset manifest (ADR-0028) covers every file under assets/ with a matching hash and an allowed licence, and the credit line names every
// attribution; a disallowed licence or an unlisted file is caught (checked on a copy of the manifest).
import fs from 'node:fs';
const { check } = await import('../../build/assets/fetch.mjs');
const man = JSON.parse(fs.readFileSync(new URL('../../build/assets/manifest.json', import.meta.url), 'utf8'));
const bad = [], r = check(man);
if (r.errors.length) bad.push(['manifest errors', r.errors.join('; ')]);
const gpl = structuredClone(man); gpl.assets.find((a) => a.id === 'ferrari').licence = 'GPL-3.0'; if (!check(gpl).errors.some((e) => e.includes('not allowed'))) bad.push(['GPL licence not caught']);
const gone = structuredClone(man); gone.assets = gone.assets.filter((a) => a.id !== 'ph-ground'); if (!check(gone).errors.some((e) => e.includes('unlisted'))) bad.push(['unlisted file not caught']);
const nocredit = structuredClone(man); delete nocredit.assets.find((a) => a.id === 'ferrari').credit; if (!check(nocredit).errors.some((e) => e.includes('credit'))) bad.push(['missing credit not caught']);
console.log('RESULT ' + JSON.stringify({ test: 'assets-manifest', pass: bad.length === 0, metrics: { entries: r.entries, warnings: r.warnings.length }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
