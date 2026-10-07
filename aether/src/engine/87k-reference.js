/* Precomputed reference results ("사전 계산 기준 결과").
   These are NOT live results. They are numbers computed earlier by an offline run (the same AETHER MAC solver on finer grids in the build sandbox) or supplied from an external CFD run, and they are
   shown only together with their label (method, grid, conditions, date, source, limits). Sources: built-in (assets/reference-results.js, produced by tools/offline/make-reference.mjs from
   actual runs) or a JSON file chosen by the user (read locally, never uploaded). A file without a complete label is rejected, so an unlabelled number can never be displayed.
   Schema aether-reference-v1: { schema, car, label:{title?, method, source, gridCellM, gridCells?, U, yawDeg, simTimeS?, averagedWindowS?, date, limits}, forces:{Cd, CdStd?, Cl?, ClStd?, A?}, gridStudy?:[{cellM, Cd, CdStd?, Cl?, simTimeS?}] } */
const REF={mode:/ref=0/.test(location.hash)?'off':'builtin',items:[],file:null,err:null,active:null,limit:1048576};
window.__REF=REF;
REF.builtin=()=>{const a=window.__ASSETS?.REFERENCE_RESULTS;return Array.isArray(a)?a:[]};
REF.validate=o=>{const bad=m=>({ok:false,why:m}),fin=v=>typeof v==='number'&&Number.isFinite(v),str=v=>typeof v==='string'&&v.trim().length>1;
 if(!o||typeof o!=='object')return bad('JSON 객체가 아닙니다');if(o.schema!=='aether-reference-v1')return bad('schema가 aether-reference-v1이 아닙니다');
 if(!str(o.car))return bad('car(차량 id)가 없습니다');const L=o.label;if(!L||typeof L!=='object')return bad('label이 없습니다(라벨 없는 결과는 표시하지 않습니다)');
 for(const k of ['method','source','date','limits'])if(!str(L[k]))return bad('label.'+k+'이(가) 없습니다');
 for(const k of ['gridCellM','U','yawDeg'])if(!fin(L[k]))return bad('label.'+k+'이(가) 숫자가 아닙니다');if(!(L.gridCellM>0&&L.gridCellM<5))return bad('label.gridCellM 범위 오류');
 const F=o.forces;if(!F||!fin(F.Cd)||!(F.Cd>-5&&F.Cd<20))return bad('forces.Cd가 없거나 범위를 벗어났습니다');for(const k of ['CdStd','Cl','ClStd','A'])if(F[k]!==undefined&&!fin(F[k]))return bad('forces.'+k+'이(가) 숫자가 아닙니다');
 if(o.gridStudy!==undefined){if(!Array.isArray(o.gridStudy)||o.gridStudy.length>20)return bad('gridStudy 형식 오류');for(const g of o.gridStudy)if(!g||!fin(g.cellM)||!fin(g.Cd))return bad('gridStudy 항목 오류')}
 return {ok:true}};
REF.refresh=()=>{const all=REF.mode==='file'&&REF.file?[REF.file]:(REF.mode==='builtin'?REF.builtin():[]);REF.items=all.filter(o=>REF.validate(o).ok);
 const car=window.__VEHICLE?.id;REF.active=REF.mode==='off'?null:(REF.items.find(o=>o.car===car)||(REF.mode==='file'?REF.items[0]:null))||null;return REF.active};
REF.setMode=m=>{if(!['off','builtin','file'].includes(m))return false;REF.mode=m;try{localStorage.setItem('aether.ref',m==='file'?'builtin':m)}catch(e){void e}REF.refresh();return true};
REF.loadText=txt=>{REF.err=null;if(typeof txt!=='string'||txt.length>REF.limit){REF.err='파일이 비었거나 1 MB를 넘습니다';return false}
 let o;try{o=JSON.parse(txt)}catch(e){REF.err='JSON을 읽을 수 없습니다: '+String(e.message).slice(0,80);return false}
 const v=REF.validate(o);if(!v.ok){REF.err=v.why;return false}REF.file=o;REF.mode='file';REF.refresh();return true};
/* label text and the live comparison, used by the card and by the wall display */
REF.labelLine=o=>{const L=o.label;return `${L.title||'사전 계산(오프라인, 실시간 아님)'} · ${L.method} · 셀 ${(L.gridCellM*100).toFixed(1)} cm · ${L.U} m/s · 요각 ${L.yawDeg}° · ${L.date} · 출처: ${L.source}`};
REF.compare=()=>{const o=REF.active,F=LIVE.forces;if(!o||!F||!Number.isFinite(F.Cd))return null;const live=F.CdMean??F.Cd;return {live,ref:o.forces.Cd,ratio:live/o.forces.Cd}};
try{if(!/ref=/.test(location.hash)){const s=localStorage.getItem('aether.ref');if(s==='off')REF.mode='off'}}catch(e){void e}
REF.refresh();
