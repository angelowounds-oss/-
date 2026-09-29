#!/usr/bin/env python3
"""One-time splitter: original single-file HTML -> src/ + assets/ + css/ + index.html.
Semantics-preserving: the engine stays one IIFE (see build.py), only the big base64
constants and the LIVE CFD block are pulled into their own files."""
import re, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
L = (root/'original/AETHER_WIND_TUNNEL_SHOWCASE.html').read_text(encoding='utf-8').split('\n')
g = lambda a, b: L[a-1:b]           # 1-indexed inclusive
for d in ('src', 'assets', 'css', 'js'): (root/d).mkdir(exist_ok=True)

# --- assets: single-statement const lines -> window.__ASSETS.NAME
refs = {}
for ln in (1277, 1421, 1889, 2352):
    m = re.match(r'^const (\w+)=(.*);$', L[ln-1], re.S)
    name, expr = m.group(1), m.group(2)
    fn = {'AETHER_CONSOLE_ASSET':'console-asset','VEHICLE_ASSET':'vehicle-asset','FAN_ASSET':'fan-asset','S3_OFFICE_WORKER_SOURCE':'s3-worker'}[name]
    (root/f'assets/{fn}.js').write_text(f'(window.__ASSETS=window.__ASSETS||{{}}).{name}={expr};\n', encoding='utf-8')
    refs[ln] = f'const {name}=window.__ASSETS.{name};'

def seg(a, b):
    out = []
    for i in range(a, b+1):
        out.append(refs.get(i, L[i-1]))
    return '\n'.join(out) + '\n'

(root/'src/engine-a.js').write_text(seg(97, 2109), encoding='utf-8')
(root/'src/live-cfd.js').write_text(seg(2110, 2283), encoding='utf-8')
(root/'src/engine-b.js').write_text(seg(2284, 2455), encoding='utf-8')

# --- css
(root/'css/style.css').write_text('\n'.join(g(7, 37)) + '\n/* showcase */\n' + '\n'.join(g(2457, 2478)) + '\n', encoding='utf-8')
# --- ui
(root/'src/ui.js').write_text('\n;\n'.join(['\n'.join(g(2480, 2505)), '\n'.join(g(2507, 2521)), '\n'.join(g(2523, 2539))]) + '\n', encoding='utf-8')
# --- index.html
head = '\n'.join(g(1, 5)) + '\n<link rel="stylesheet" href="css/style.css"></head>\n'
body = '\n'.join(g(39, 95)) + '\n'
tail = ('<script>window.setStatus=window.setStatus||function(){};</script>\n'
        '<script src="assets/console-asset.js"></script>\n<script src="assets/vehicle-asset.js"></script>\n'
        '<script src="assets/fan-asset.js"></script>\n<script src="assets/s3-worker.js"></script>\n'
        '<script src="js/engine.js"></script>\n<script src="js/ui.js"></script>\n</body></html>\n')
(root/'index.html').write_text(head + body + tail, encoding='utf-8')
print('split ok')
