/* Vehicle profiles: the car is chosen at boot (hash #car=bmw|agera, else the last choice kept in localStorage, else the BMW) and everything downstream (dimensions, contract checks, CFD solid, rolling-road stations) is built for that car.
   Switching cars from the UI therefore reloads the page with the other profile: the engine, the tunnel and the CFD solid are initialised once per car, which keeps every consistency check valid. */
const VEHICLE_PROFILES={
 bmw:{id:'bmw',label:'BMW M4 GT3 EVO',asset:window.__ASSETS.VEHICLE_ASSET,dims:{lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023},paintDefault:'원본(블랙)'}};
if(window.__ASSETS.VEHICLE_AGERA)VEHICLE_PROFILES.agera={id:'agera',label:'Koenigsegg Agera',asset:window.__ASSETS.VEHICLE_AGERA,dims:window.__ASSETS.VEHICLE_AGERA.dims,paintDefault:'원본(주황)'};
const VEHICLE_ID=(()=>{let id=(location.hash.match(/[#&]car=(\w+)/)||[])[1];if(!id){try{id=localStorage.getItem('aether.car')}catch(e){void e}}return VEHICLE_PROFILES[id]?id:'bmw'})();
const VP=VEHICLE_PROFILES[VEHICLE_ID];
window.__VEHICLE={id:VEHICLE_ID,label:VP.label,list:Object.values(VEHICLE_PROFILES).map(p=>({id:p.id,label:p.label})),
 set(id){if(!VEHICLE_PROFILES[id]||id===VEHICLE_ID)return false;try{localStorage.setItem('aether.car',id)}catch(e){void e}
  const h=location.hash.replace(/[#&]car=\w+/g,'').replace(/^#?&?/,'');location.hash=(h?h+'&':'')+'car='+id;location.reload();return true}};
