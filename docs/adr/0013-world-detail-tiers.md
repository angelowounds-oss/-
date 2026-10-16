# ADR-0013: world detail tiers and the chunk container

Status: accepted (2026-10-16), step 1 of the bake expansion (plan: more baked data, "laptop" world embedded + optional "high" pack).

## Decision
- **Two world details.** "laptop" is inside the page (`neon_city_v9.html`, target ≤150 MB); "high" is an optional folder `world/` (`index.json` + `*.pak`, made with `node build/bake.mjs --pack`) that is put in front of the embedded data. The detail is chosen at the title screen only (never during play), default by `navigator.deviceMemory`/`hardwareConcurrency`, remembered in `localStorage` (`neon_detail`). Mobile is not a target of this work.
- **Chunk container v2** (`src/bakefmt.js`): `[magic][indexLen][index JSON][chunks]`, each chunk its own `deflate-raw` block with a `cyrb53` hash in the index. A reader takes only the chunks it needs (`File.slice` for a pack of any size). The embedded world is the same container, base64 in `<script id="baked">`; `WorldData` (`src/chunkstore.js`) finds a key in the first source that has it, verifies the hash, inflates in a worker, caches the decoded object. The `core` chunk (coarse world, roads, city layouts) is still published as `globalThis.__BAKED`.
- **Pack access.** A page cannot read a sibling folder from `file://`: the title screen has "고화질 팩 연결" (`showDirectoryPicker`, handle kept in IndexedDB; a file input fallback where the API is missing). A stored handle needing permission puts the title in `needs-permission` and the same button asks again.
- **Bake.** `build/bake.mjs` runs jobs (`JOBS`, generators in `build/jobs.mjs`) in up to 4 worker threads; each result is cached in `build/baked/cache` by the hash of the job's source files, so unchanged jobs are not redone. Same sources give the same bytes. Baked output is not committed; the built HTML and the pack are delivered outside the repository.
- Saves may be reset when the world data changes (no compatibility code); the key is bumped by the step that changes the terrain.

## Consequences
New data goes in as chunks (`h8/…`, `city/…`, `forest/…`) with a job each; consumers read `__WORLD` and fall back to the embedded chunk (or the generator in `WORLD=small`) when a pack chunk is missing. Tests: `unit/bake` (determinism, container), `unit/chunkpack` (pack mount, hash/size refusal, parallel + cache).
