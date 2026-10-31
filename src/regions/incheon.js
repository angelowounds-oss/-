// 인천광역시 (ADR-0036). The airport city on Yeongjong (WLD-22a); its id stays 'airfield' for the saves, the bake keys and the tests.
import { project } from '../koreamap.js';

export default {
  id: 'incheon',
  cities: [{
    // On the airfield of Incheon International Airport on Yeongjong (ADR-0037), fixed: the 15 km spacing of placeCities had pushed it 84 km south.
    // r 1100 keeps its flat ground (1.15 r) west of where the compiled region's roads stop (x -6243 local) and off Incheon itself; the region's
    // ground gives way to it there (region.js) and its real motorways (공항고속도로, 인천대교) reach it by connectors (roadnet.js), not a generated highway.
    def: { id: 'airfield', name: '인천', type: 'airport', ...project(126.41, 37.462), r: 1100, fixed: true, viaRegion: true },
    // the city recipe (citylayout.js): street pattern, block pitch, heights, palette, sign words
    style: { pattern: 'radial', pitch: [104, 104], jitter: 0.08, roadW: 18, hMax: 110,  hBase: 12,  palette: [0xb8bec6, 0xa4adb8, 0xc9ccd2, 0x8f99a6, 0xd5d8dc, 0x7d8794, 0x9aa5b1, 0xbfc3c8], accents: [1, 3, 5],   lang: 'en', words: ['SKYPORT', 'DEPARTURES', 'JET FUEL', 'AIR CAFE', 'HANGAR 3', 'CREW INN', 'DUTY FREE', 'RUNWAY BAR'],     density: 0.8 },
    rules: { police: '공항 경찰대',     econ: 1.15, wet: -0.2, tint: [1.0, 1.03, 1.1],     pop: 0.7,  tag: '공항' },   // cityrules.js
    pitched: 0,       // share of pitched roofs (citydetail.js)
    treeRows: 0.35,   // street trees, 1 = every row (citydetail.js)
    villageLang: 'en',
  }],
  // The sea bridges with a main span (ADR-0037): real metres, at the centre of the main span. The compiler lifts the deck there to the navigation
  // clearance at the height scale of the terrain (build/world/roads.mjs) and the game draws the pylons and cables (bridges.js). 인천대교: the
  // cable-stayed section is OpenStreetMap's layer-3 way of 1478 m (80 + 260 + 800 + 260 + 80); 영종대교: the self-anchored suspension span; its
  // clearance is not in our sources, so the deck keeps the compiler's minimum height over the sea.
  bridges: [
    { id: 'incheon-bridge', name: '인천대교', ref: '110', type: 'cable-stayed', lon: 126.5668, lat: 37.4137, span: 800, side: 260, clearance: 74, pylon: 238.5 },
    { id: 'yeongjong-bridge', name: '영종대교', ref: '130', type: 'suspension', lon: 126.588, lat: 37.5464, span: 300, side: 125, clearance: 0, pylon: 107 },
  ],
};
