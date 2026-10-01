// print N chars of context around every occurrence of an identifier in a file:  node tools/ctx.mjs <file> <ident> [chars=120]
import fs from 'node:fs';
const [file, id, n = '120'] = process.argv.slice(2); const t = fs.readFileSync('src/engine/' + file, 'utf8'); const re = new RegExp('\\b' + id + '\\b', 'g'); let m;
while ((m = re.exec(t))) { const ln = t.slice(0, m.index).split('\n').length; console.log('@' + ln + ': …' + t.slice(Math.max(0, m.index - +n), m.index + id.length + +n).replace(/\n/g, '⏎') + '…\n'); }
