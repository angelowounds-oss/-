// Downloads Poly Haven (CC0) models as 1k glTF into <dir>/<id>/<id>.gltf (+ bin + textures) for interior_pack.mjs.
// usage: node interior_fetch.mjs <dir> id1 id2 ...
import fs from 'fs';
import path from 'path';
const dir = process.argv[2].replace(/\/?$/, '/'), ids = process.argv.slice(3);
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return Buffer.from(await r.arrayBuffer()); };
for (const id of ids) {
  try {
    if (fs.existsSync(`${dir}${id}/${id}.gltf`)) { console.log('have', id); continue; }
    const info = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString()), g = info.gltf?.['1k']?.gltf;
    if (!g) { console.log('no gltf', id); continue; }
    fs.mkdirSync(`${dir}${id}`, { recursive: true });
    fs.writeFileSync(`${dir}${id}/${id}.gltf`, await get(g.url));
    for (const [rel, f] of Object.entries(g.include || {})) { const p = `${dir}${id}/${rel}`; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, await get(f.url)); }
    console.log('ok', id);
  } catch (e) { console.log('fail', id, e.message); }
}
