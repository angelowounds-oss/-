#!/usr/bin/env python3
"""Concatenate src/engine-a.js + live-cfd.js + engine-b.js into js/engine.js (single IIFE scope
is required: the LIVE block uses engine-private names), copy src/ui.js -> js/ui.js.
--standalone OUT.html : additionally emit a single self-contained HTML (assets inlined)."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
rd = lambda p: (root/p).read_text(encoding='utf-8')
(root/'js').mkdir(exist_ok=True)
engine = rd('src/engine-a.js') + rd('src/live-cfd.js') + rd('src/engine-b.js')  # engine-a opens the IIFE, engine-b closes it
(root/'js/engine.js').write_text(engine, encoding='utf-8')
(root/'js/ui.js').write_text(rd('src/ui.js'), encoding='utf-8')
if '--standalone' in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index('--standalone')+1])
    h = rd('index.html')
    h = h.replace('<link rel="stylesheet" href="css/style.css">', '<style>' + rd('css/style.css') + '</style>')
    import re
    h = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>' + rd(m.group(1)) + '</script>', h)
    out.write_text(h, encoding='utf-8'); print('standalone', out, out.stat().st_size)
print('build ok', len(engine))
