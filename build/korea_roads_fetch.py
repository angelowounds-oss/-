# Real Korean road network for the map (WLD-20f): motorways and national trunk roads from OpenStreetMap through an Overpass mirror, in boxes
# small enough not to time out. Writes build/.osm-cache/korea_roads_osm.json (a flat list of ways with ref, name, lanes, maxspeed, bridge, tunnel and
# lon/lat geometry). The cache is not committed: OpenStreetMap data is ODbL, so a derived asset needs a licence decision first (docs/ASSETS.md).
# The raw result also holds Japan (Kyushu), North Korea and both carriageways of every motorway: filter by the land mask and merge the pairs.
# Run: python3 build/korea_roads_fetch.py   (network)
import json, os, subprocess, time
URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.osm-cache')
LON = [124.0, 126.5, 129.0, 131.6]; LAT = [32.8, 34.8, 36.8, 38.9]
BOXES = {'jeju': (33.0, 126.1, 33.7, 127.0)}
for a in range(3):
    for b in range(3):
        if (a, b) == (1, 2):   # the Seoul / Gangwon box times out: split it in 3 x 3
            lo = [126.5, 127.25, 128.0, 129.0]; la = [36.8, 37.4, 38.0, 38.9]
            for c in range(3):
                for d in range(3): BOXES[f'n{c}_{d}'] = (la[d], lo[c], la[d + 1], lo[c + 1])
        elif (a, b) != (0, 0):   # the south-west box is sea apart from Jeju
            BOXES[f'{a}_{b}'] = (LAT[b], LON[a], LAT[b + 1], LON[a + 1])

def fetch(name, box):
    s, w, n, e = box; out = os.path.join(HERE, name + '.json')
    if os.path.exists(out) and os.path.getsize(out) > 200: return out
    q = f'[out:json][timeout:180];way["highway"~"^(motorway|trunk)$"]({s},{w},{n},{e});out geom tags;'
    for _ in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '240', '-o', out, '-w', '%{http_code}', '--data-urlencode', f'data={q}', URL], capture_output=True, text=True)
        if r.stdout.strip() == '200' and os.path.getsize(out) > 200 and open(out).read(1) == '{': return out
        time.sleep(8)
    raise RuntimeError('failed ' + name)

def main():
    os.makedirs(HERE, exist_ok=True); ways = {}
    for name, box in BOXES.items():
        for e in json.load(open(fetch(name, box))).get('elements', []):
            if e.get('type') != 'way' or 'geometry' not in e: continue
            t = e.get('tags', {})
            ways[e['id']] = {'id': e['id'], 'hw': t.get('highway'), 'ref': t.get('ref'), 'name': t.get('name'), 'name_en': t.get('name:en'), 'lanes': t.get('lanes'),
                'maxspeed': t.get('maxspeed'), 'oneway': t.get('oneway'), 'bridge': t.get('bridge'), 'tunnel': t.get('tunnel'),
                'geom': [[round(p['lon'], 5), round(p['lat'], 5)] for p in e['geometry']]}
    json.dump(list(ways.values()), open(os.path.join(HERE, 'korea_roads_osm.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('ways', len(ways))

if __name__ == '__main__':
    main()
