# The country's points of interest from one .osm.pbf (EV-72): the shops, fuel stations, banks, hospitals, police and fire stations, restaurants and
# the like that the game's jobs and missions send the player to. Nodes give their position; ways and areas (a mapped building) their bounding box's
# centre. Writes one JSON list of [kind, lat, lon, name] (name '' when the record has none in Korean or at all) that build/world/placeindex.mjs
# projects and packs. Same input as pbf-store.py (the Slice of South Korea, ODbL 1.0).
# usage: python3 build/world/poi-extract.py <file.osm.pbf> [out = build/.osm-cache/poi.json]     needs the osmium module (pip install osmium)
import json, os, sys
import osmium

# the game's kinds, in the order placeindex.mjs and src/placeindex.js number them, and the OSM tags that make each
KINDS = ['fuel', 'convenience', 'supermarket', 'food', 'cafe', 'bank', 'hospital', 'pharmacy', 'police', 'fire', 'car_repair', 'bus_station', 'hotel', 'school']
AMENITY = {'fuel': 'fuel', 'restaurant': 'food', 'fast_food': 'food', 'cafe': 'cafe', 'bank': 'bank', 'atm': 'bank', 'hospital': 'hospital',
           'clinic': 'hospital', 'pharmacy': 'pharmacy', 'police': 'police', 'fire_station': 'fire', 'bus_station': 'bus_station', 'school': 'school'}
SHOP = {'convenience': 'convenience', 'supermarket': 'supermarket', 'car_repair': 'car_repair', 'car': 'car_repair'}
TOURISM = {'hotel': 'hotel', 'motel': 'hotel'}

# the kind of a record's tags, or None
def kind_of(t):
    a = t.get('amenity')
    if a in AMENITY: return AMENITY[a]
    s = t.get('shop')
    if s in SHOP: return SHOP[s]
    u = t.get('tourism')
    if u in TOURISM: return TOURISM[u]
    return None

# the record's name for the player: Korean first
def name_of(t): return t.get('name:ko') or t.get('name') or ''

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.out = []
    # a mapped point
    def node(self, n):
        k = kind_of(n.tags)
        if k and n.location.valid(): self.out.append([KINDS.index(k), round(n.location.lat, 6), round(n.location.lon, 6), name_of(n.tags)])
    # a mapped outline: the centre of its nodes' bounding box (the node locations come from the handler's location index)
    def way(self, w):
        k = kind_of(w.tags)
        if not k: return
        la = [nd.lat for nd in w.nodes if nd.location.valid()]; lo = [nd.lon for nd in w.nodes if nd.location.valid()]
        if la: self.out.append([KINDS.index(k), round((min(la) + max(la)) / 2, 6), round((min(lo) + max(lo)) / 2, 6), name_of(w.tags)])

if __name__ == '__main__':
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else 'build/.osm-cache/poi.json'
    h = H(); h.apply_file(src, locations=True, idx='flex_mem')
    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    with open(dst, 'w') as f: json.dump({'kinds': KINDS, 'source': os.path.basename(src), 'places': h.out}, f, ensure_ascii=False, separators=(',', ':'))
    by = {}
    for p in h.out: by[KINDS[p[0]]] = by.get(KINDS[p[0]], 0) + 1
    print(json.dumps({'total': len(h.out), 'by': by}, ensure_ascii=False))
