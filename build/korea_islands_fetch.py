# Islands of South Korea (KOREA-PLAN B3) from OpenStreetMap through an Overpass mirror: place=island and place=islet nodes.
# Finding (2026-10-19): the nodes cover the southern and western islands but not Ulleungdo or Dokdo, which are mapped as areas (natural=island).
# Those two need an area query (KOREA-PLAN B2) or a fixed coordinate in the plan. Also, the name 독도 in the south coast result is a different islet.
# Writes build/.osm-cache/islands_osm.json and islands_east_osm.json (not committed: ODbL).
# Run: python3 build/korea_islands_fetch.py   (network)
import os, subprocess
URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.osm-cache')
BOXES = {'islands_osm': (33.0, 125.8, 38.7, 129.7), 'islands_east_osm': (36.8, 130.5, 37.8, 132.2)}

def main():
    os.makedirs(HERE, exist_ok=True)
    for name, (s, w, n, e) in BOXES.items():
        q = f'[out:json][timeout:200];node["place"~"^(island|islet)$"]({s},{w},{n},{e});out body;'
        subprocess.run(['curl', '-sS', '-m', '240', '-o', os.path.join(HERE, name + '.json'), '--data-urlencode', f'data={q}', URL], check=True)

if __name__ == '__main__':
    main()
