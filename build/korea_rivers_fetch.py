# Real river courses for the map (KOREA-PLAN B1): the six main rivers of South Korea from OpenStreetMap through an Overpass mirror.
# Writes build/.osm-cache/korea_rivers_osm.json (ways with name and lon/lat geometry). The cache is not committed (ODbL, docs/ASSETS.md).
# Run: python3 build/korea_rivers_fetch.py   (network)
import json, os, subprocess, time
URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.osm-cache')
NAMES = '한강|남한강|북한강|낙동강|금강|영산강|섬진강|형산강'
# two boxes south and north of 36.2 N keep each Overpass request small
BOXES = {'rivers_s': (32.8, 125.5, 36.2, 129.8), 'rivers_n': (36.2, 126.0, 38.7, 129.5)}

def fetch(name, box):
    s, w, n, e = box; out = os.path.join(HERE, name + '.json')
    if os.path.exists(out) and os.path.getsize(out) > 200: return out
    q = f'[out:json][timeout:180];way["waterway"="river"]["name"~"^({NAMES})$"]({s},{w},{n},{e});out geom tags;'
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
            ways[e['id']] = {'id': e['id'], 'name': e.get('tags', {}).get('name'),
                'geom': [[round(p['lon'], 5), round(p['lat'], 5)] for p in e['geometry']]}
    json.dump(list(ways.values()), open(os.path.join(HERE, 'korea_rivers_osm.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('ways', len(ways))

if __name__ == '__main__':
    main()
