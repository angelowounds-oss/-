# Every city and town of South Korea with its population and position (KOREA-PLAN C): OpenStreetMap place nodes through an Overpass mirror.
# Writes build/.osm-cache/korea_places_osm.json. The cache is not committed (ODbL, docs/ASSETS.md).
# Run: python3 build/korea_places_fetch.py   (network)
import json, os, subprocess, time
URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.osm-cache')
BOXES = {'p_s': (32.8, 125.5, 36.0, 129.8), 'p_n': (36.0, 126.0, 38.7, 129.6)}

def fetch(name, box):
    s, w, n, e = box; out = os.path.join(HERE, name + '.json')
    if os.path.exists(out) and os.path.getsize(out) > 200: return out
    q = f'[out:json][timeout:180];node["place"~"^(city|town)$"]({s},{w},{n},{e});out body;'
    for _ in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '240', '-o', out, '-w', '%{http_code}', '--data-urlencode', f'data={q}', URL], capture_output=True, text=True)
        if r.stdout.strip() == '200' and os.path.getsize(out) > 200 and open(out).read(1) == '{': return out
        time.sleep(8)
    raise RuntimeError('failed ' + name)

def main():
    os.makedirs(HERE, exist_ok=True); nodes = {}
    for name, box in BOXES.items():
        for e in json.load(open(fetch(name, box))).get('elements', []):
            if e.get('type') != 'node': continue
            t = e.get('tags', {})
            nodes[e['id']] = {'id': e['id'], 'lon': e['lon'], 'lat': e['lat'], 'place': t.get('place'), 'name': t.get('name'), 'name_en': t.get('name:en'), 'population': t.get('population'), 'is_in': t.get('is_in')}
    json.dump(list(nodes.values()), open(os.path.join(HERE, 'korea_places_osm.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('places', len(nodes))

if __name__ == '__main__':
    main()
