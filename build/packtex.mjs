import sharp from 'sharp';
const dir = '/tmp/claude-0/-home-user--/25dfb026-1961-5d75-9962-f3775122370e/scratchpad/tx/';
const S = 512;
for (const id of ['asphalt_04', 'concrete_pavers']) {
  const a = sharp(dir + `${id}_Diffuse.jpg`).resize(S, S).removeAlpha();
  await a.jpeg({ quality: 82 }).toFile(`../assets/tex/${id}_a.jpg`);
  const nor = await sharp(dir + `${id}_nor_gl.jpg`).resize(S, S).removeAlpha().raw().toBuffer();
  const rough = await sharp(dir + `${id}_Rough.jpg`).resize(S, S).greyscale().raw().toBuffer();
  const out = Buffer.alloc(S * S * 3);
  for (let i = 0; i < S * S; i++) { out[i * 3] = nor[i * 3]; out[i * 3 + 1] = nor[i * 3 + 1]; out[i * 3 + 2] = rough[i]; }
  await sharp(out, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 88 }).toFile(`../assets/tex/${id}_n.jpg`);
}
