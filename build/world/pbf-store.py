# The whole country's OpenStreetMap records from one .osm.pbf (WLD-25a, docs/IMPROVEMENTS-2026-11-11.md 4.4) into a tile store the world compiler reads
# instead of Overpass (build/world/osm.mjs localAnswer): every element the compiler's queries ask for, in the shape Overpass gives with `out geom`
# (ways with their geometry, relations with their member ways' geometry, nodes with lat/lon), filed under each 0.05 degree tile its bounding box touches.
# The pbf comes from OSM by the Slice (slice.openstreetmap.us, a polygon of South Korea, ODbL 1.0): download.geofabrik.de is closed to the build container.
# usage: python3 build/world/pbf-store.py <file.osm.pbf> [out dir = build/.osm-cache/pbf]     needs the osmium module (pip install osmium)
import json, math, os, re, sys
from collections import defaultdict
import osmium

STEP = 0.05
ROAD_MAJOR = set('motorway trunk primary secondary motorway_link trunk_link primary_link secondary_link tertiary tertiary_link'.split())
ROAD_MINOR = set('residential unclassified living_street'.split())
PLACE = set('city town village suburb'.split())
STREET_NODE = set('traffic_signals crossing bus_stop street_lamp stop give_way'.split())
AMENITY = set('bench waste_basket vending_machine fire_hydrant'.split())

# which of the compiler's queries an element answers (build/world/osm.mjs REGION_QL, compile.mjs water, fetch-detail.mjs tileQuery)
def kinds_way(t):
    k = []
    if t.get('natural') in ('coastline', 'water') or t.get('waterway') in ('riverbank', 'river'): k.append('water')
    hw = t.get('highway')
    if hw in ROAD_MAJOR: k.append('roads')
    if hw in ROAD_MINOR: k.append('minor')
    if 'building' in t or 'building:part' in t: k.append('detail')
    return k
def kinds_rel(t):
    k = []
    if t.get('natural') == 'water' or t.get('waterway') == 'riverbank': k.append('water')
    if 'building' in t and t.get('type') == 'multipolygon': k.append('detail')
    return k
def kinds_node(t):
    k = []
    if t.get('place') in PLACE and 'name' in t: k.append('places')
    if t.get('highway') in STREET_NODE or t.get('natural') == 'tree' or t.get('railway') == 'subway_entrance' or t.get('amenity') in AMENITY or t.get('emergency') == 'fire_hydrant' \
       or (t.get('public_transport') == 'platform' and t.get('bus') == 'yes'): k.append('detail')
    return k

def tiles_of(minlat, minlon, maxlat, maxlon):
    for i in range(math.floor(minlat / STEP), math.floor(maxlat / STEP) + 1):
        for j in range(math.floor(minlon / STEP), math.floor(maxlon / STEP) + 1): yield f'{i}_{j}'

class Out:
    # one append-only JSON-lines file per kind and tile, opened lazily (a few thousand files, flushed by size)
    def __init__(self, root): self.root = root; self.buf = defaultdict(list); self.n = 0
    def put(self, kind, key, line):
        self.buf[(kind, key)].append(line); self.n += 1
        if self.n >= 400000: self.flush()
    def flush(self):
        for (kind, key), lines in self.buf.items():
            d = os.path.join(self.root, kind); os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, key + '.jsonl'), 'a', encoding='utf8') as f: f.write('\n'.join(lines) + '\n')
        self.buf.clear(); self.n = 0

def geom(nodes):
    g = []
    for n in nodes:
        if n.location.valid(): g.append({'lat': round(n.location.lat, 7), 'lon': round(n.location.lon, 7)})
    return g

def main(pbf, root):
    if os.path.exists(root):
        for k in os.listdir(root):
            p = os.path.join(root, k)
            if os.path.isdir(p):
                for f in os.listdir(p): os.remove(os.path.join(p, f))
    os.makedirs(root, exist_ok=True)
    # pass 1: the relations asked for, and the ways they are made of
    rels, want = {}, defaultdict(list)
    for r in osmium.FileProcessor(pbf, osmium.osm.RELATION):
        t = dict(r.tags); k = kinds_rel(t)
        if not k: continue
        rels[r.id] = {'tags': t, 'kinds': k, 'members': [(m.ref, m.role) for m in r.members if m.type == 'w']}
        for ref, _ in rels[r.id]['members']: want[ref].append(r.id)
    print(f'relations {len(rels)}, member ways {len(want)}', flush=True)
    out, member_geom, st = Out(root), {}, defaultdict(int)
    # pass 2: nodes and ways with their locations
    for o in osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY).with_locations('flex_mem'):
        if o.is_node():
            if not len(o.tags): continue
            t = dict(o.tags); k = kinds_node(t)
            if not k or not o.location.valid(): continue
            lat, lon = round(o.location.lat, 7), round(o.location.lon, 7)
            line = json.dumps({'type': 'node', 'id': o.id, 'lat': lat, 'lon': lon, 'tags': t}, ensure_ascii=False, separators=(',', ':'))
            key = next(tiles_of(lat, lon, lat, lon))
            for kind in k: out.put(kind, key, line); st[kind] += 1
        elif o.is_way():
            t = dict(o.tags) if len(o.tags) else {}; k = kinds_way(t) if t else []
            if not k and o.id not in want: continue
            g = geom(o.nodes)
            if len(g) < 2: continue
            if o.id in want: member_geom[o.id] = g
            if not k: continue
            la = [p['lat'] for p in g]; lo = [p['lon'] for p in g]
            line = json.dumps({'type': 'way', 'id': o.id, 'bounds': {'minlat': min(la), 'minlon': min(lo), 'maxlat': max(la), 'maxlon': max(lo)}, 'tags': t, 'geometry': g}, ensure_ascii=False, separators=(',', ':'))
            for key in tiles_of(min(la), min(lo), max(la), max(lo)):
                for kind in k: out.put(kind, key, line)
            for kind in k: st[kind] += 1
    # the relations, with their member ways' geometry
    for rid, r in rels.items():
        mem = [{'type': 'way', 'ref': ref, 'role': role, 'geometry': member_geom[ref]} for ref, role in r['members'] if ref in member_geom]
        if not mem: continue
        la = [p['lat'] for m in mem for p in m['geometry']]; lo = [p['lon'] for m in mem for p in m['geometry']]
        line = json.dumps({'type': 'relation', 'id': rid, 'bounds': {'minlat': min(la), 'minlon': min(lo), 'maxlat': max(la), 'maxlon': max(lo)}, 'tags': r['tags'], 'members': mem}, ensure_ascii=False, separators=(',', ':'))
        for key in tiles_of(min(la), min(lo), max(la), max(lo)):
            for kind in r['kinds']: out.put(kind, key, line)
        for kind in r['kinds']: st['rel_' + kind] += 1
    out.flush()
    meta = {'source': os.path.basename(pbf), 'step': STEP, 'counts': dict(st)}
    with open(os.path.join(root, 'meta.json'), 'w') as f: json.dump(meta, f)
    print(json.dumps(meta), flush=True)

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', '.osm-cache', 'pbf'))
