# ADR-0029 KTX2 압축 텍스처와 에셋 팩

## 상태
채택 (2026-10-27, AAA-PLAN Q0-2). ADR-0013(화질 2단계)과 ADR-0028(에셋 팩·라이선스)을 잇는다.

## 결정
- 고화질 텍스처는 Basis Universal KTX2로 만든다: 색은 ETC1S(q 192), 노멀·거칠기 같은 데이터는 UASTC(RDO 1, 선형). 밉맵을 함께 굽는다. 인코더는 npm `basisu` 바이너리(빌드에서만), 디코더는 three.js의 Basis transcoder(Apache-2.0).
- 결과는 `build/baked/pack/assets.pak`(청크 컨테이너, `src/bakefmt.js`)에 `asset/tex/<이름>`으로 넣고, transcoder js·wasm도 `asset/basis` 청크로 같은 팩에 넣는다. 본체 HTML은 커지지 않는다.
- 팩 폴더의 `index.json`이 `high.pak`(월드)과 `assets.pak`(에셋)을 함께 나열한다. 둘 중 하나만 다시 만들어도 다른 줄은 남는다.
- 런타임(`src/hiassets.js`): 화질이 '고사양'이고 팩이 연결됐을 때만, 로딩 중 월드를 만들기 전에 모든 팩 텍스처를 디코드해 GPU에 올린다(`renderer.initTexture`). 쓰는 쪽은 이름으로 찾고, 없으면 본체 텍스처를 쓴다. 텍스처 종류만 바뀌므로 셰이더는 다시 컴파일되지 않는다.
- 원천은 매니페스트의 `fetch`(내려받기, 해시 고정)와 `pack`(레시피)으로 정한다. 받은 파일은 `build/.asset-cache/`에 두고 커밋하지 않는다.

## 명령
```bash
node build/assets/fetch.mjs --fetch   # 원천 내려받기·해시 고정
node build/assets/pack.mjs            # build/baked/pack/assets.pak + index.json
```

## 첫 적용
- Poly Haven asphalt_04, concrete_pavers 2K(색 + 노멀/거칠기). 본체는 512 px JPG를 그대로 쓴다.
