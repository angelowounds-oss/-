#!/usr/bin/env node
// Lint the assembled engine (source files share one scope, so they are linted after concatenation).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs')], { stdio: 'inherit' });
try { execFileSync(process.execPath, ['/opt/node22/lib/node_modules/eslint/bin/eslint.js', 'js/engine.js', 'js/ui.js', 'tools', 'tests'], { cwd: root, stdio: 'inherit' }); console.log('eslint: 0 problems'); }
catch { process.exit(1); }
