// Lint (EV-94): ESLint with build/eslint.config.mjs on the lines this branch changed against a base (default: the merge base with main),
// uncommitted ones and new files included; problems on untouched lines of a touched file are old debt and are not reported. `--all` lints everything and prints counts per rule (the debt to pay down, not a gate).
// Usage: node build/lint.mjs [--base <ref>] [--all] [--json] [files...]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), all = args.includes('--all'), bi = args.indexOf('--base');
const base = bi >= 0 ? args[bi + 1] : null, given = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--base');
// generated sources (korearoads.js) diff by hundreds of MB, more than the default 1 MB buffer
const git = (c) => execSync('git ' + c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 }).split('\n').filter(Boolean);
// the files the branch touched: committed since the base, staged, unstaged and untracked
function changed() {
  let mb = base; if (!mb) { for (const b of ['origin/main', 'main']) { try { mb = git(`merge-base HEAD ${b}`)[0]; break; } catch { /* next */ } } }
  MB = mb; const set = new Set([...(mb ? git(`diff --name-only ${mb}...HEAD`) : []), ...git('diff --name-only HEAD'), ...git('ls-files --others --exclude-standard')]);
  return [...set].filter((f) => /\.(m|c)?js$/.test(f) && fs.existsSync(path.join(ROOT, f)) && !f.startsWith('build/baked/') && !f.startsWith('dist/'));
}
// the line numbers each changed file added or modified since the base (null: the whole file is new)
let MB = null;
function addedLines(f) {
  if (git(`ls-files --others --exclude-standard -- ${f}`).length) return null;
  const set = new Set(); const d = execSync(`git diff -U0 ${MB || 'HEAD'} -- ${f}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 });
  for (const m of d.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) { const a = +m[1], n = m[2] === undefined ? 1 : +m[2]; for (let i = a; i < a + n; i++) set.add(i); }
  return set;
}
const files = all ? ['src', 'build/*.mjs', 'build/world', 'build/lab', 'build/lint', 'tests'] : given.length ? given : changed();
if (!files.length) { console.info('lint: no changed files'); process.exit(0); }
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: path.join(ROOT, 'build', 'eslint.config.mjs'), errorOnUnmatchedPattern: false });
const res = await eslint.lintFiles(files);
if (!all && !given.length) for (const r of res) {   // keep the problems on changed lines only
  const lines = addedLines(path.relative(ROOT, r.filePath)); if (!lines) continue;
  r.messages = r.messages.filter((m) => !m.line || lines.has(m.line)); r.errorCount = r.messages.filter((m) => m.severity === 2).length; r.warningCount = r.messages.length - r.errorCount;
  r.fixableErrorCount = r.fixableWarningCount = 0;
}
if (all) {
  const per = {}; for (const r of res) for (const m of r.messages) per[m.ruleId || 'parse'] = (per[m.ruleId || 'parse'] || 0) + 1;
  console.info(JSON.stringify({ files: res.length, per }, null, 1));
}
// --json: the problems as data (for tools that fix them), else the readable report
if (args.includes('--json')) { console.info(JSON.stringify(res.filter((r) => r.messages.length).map((r) => ({ file: r.filePath, messages: r.messages })))); process.exit(0); }
const out = (await eslint.loadFormatter('stylish')).format(res); if (out) console.info(out);
const errs = res.reduce((s, r) => s + r.errorCount, 0); console.info(`lint: ${res.length} files, ${errs} errors`);
process.exitCode = errs && !all ? 1 : 0;
