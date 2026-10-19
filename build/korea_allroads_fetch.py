# All roads of South Korea from OpenStreetMap (KOREA-PLAN D3 + city streets and mountain tracks): every highway class from motorway down to path,
# through an Overpass mirror. The country is cut into boxes; a box that times out is cut into four and retried, down to a small depth.
# Writes one raw JSON per box under build/.osm-cache/allroads/ (not committed: ODbL data, the cache is rebuilt by this script).
# Run: python3 build/korea_allroads_fetch.py   (network; about one hour for the whole country)
import json, os, subprocess, time
URLS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']   # a mirror that times out is replaced by the other
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.osm-cache', 'allroads')
CLASSES = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|path|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'
# South Korea, roughly; boxes over the sea come back empty quickly
S, W, N, E = 33.9, 125.9, 38.7, 129.7
STEP = 0.25

FAILED = []

def fetch(s, w, n, e, depth=0):
    name = f'{s:.3f}_{w:.3f}_{n:.3f}_{e:.3f}'
    out = os.path.join(HERE, name + '.json')
    if os.path.exists(out) and os.path.getsize(out) > 50: return
    q = f'[out:json][timeout:240];way["highway"~"^({CLASSES})$"]({s},{w},{n},{e});out geom tags;'
    for k in range(4):
        r = subprocess.run(['curl', '-sS', '-m', '300', '-o', out + '.part', '-w', '%{http_code}', '--data-urlencode', f'data={q}', URLS[k % len(URLS)]], capture_output=True, text=True)
        if r.stdout.strip() == '200' and os.path.exists(out + '.part') and open(out + '.part').read(1) == '{':
            os.replace(out + '.part', out); print('ok', name, flush=True); return
        time.sleep(10)
    if depth < 3:   # too big or the mirror timed out: four smaller boxes
        sm, wm, nm, em = (s + n) / 2, (w + e) / 2, n, e
        for a, b, c, d in [(s, w, sm, wm), (s, wm, sm, e), (sm, w, n, wm), (sm, wm, n, e)]: fetch(a, b, c, d, depth + 1)
        return
    FAILED.append(name); print('failed', name, flush=True)   # retried once at the end of main()

def main():
    os.makedirs(HERE, exist_ok=True)
    s = S
    while s < N:
        w = W
        while w < E:
            fetch(s, w, min(s + STEP, N), min(w + STEP, E))
            w += STEP
        s += STEP
    for name in list(FAILED):   # a second pass: the mirror often recovers after a minute
        FAILED.remove(name)
        s0, w0, n0, e0 = (float(x) for x in name.split('_'))
        fetch(s0, w0, n0, e0)
    print('failed boxes left:', FAILED, flush=True)
    print('done', flush=True)

if __name__ == '__main__':
    main()
