import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('../assets/ferrari.glb');
const drop = /^(interior_light|interior_dark|leather|carpet|carbon_fibre_trim|carbon fibre|steering_.*|wipers|brakes|brake|leds|metal|nuts|centre)$/;
for (const n of doc.getRoot().listNodes()) if (drop.test(n.getName())) { const m = n.getMesh(); if (m) n.setMesh(null); }
await doc.transform(prune(), dedup());
await io.write('../assets/ferrari.glb', doc);
