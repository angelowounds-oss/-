/* Fan placement parameters and the fallback domain frame that FLOW_LAYOUT is derived from.
   (The legacy 32^3 particle/ribbon smoke engine was removed; the smoke is the GPU solver's dye field.) */
const FLOW_PLACEMENT={height:-.12,lateral:0,emitterFraction:.50,layoutError:null};
const FLOW_FRAME={grid:{resolution:[32,32,32],min:AETHER.CFD_DOMAIN.bounds.min.slice(),max:AETHER.CFD_DOMAIN.bounds.max.slice()}};
function smokeNozzleTransform(frame,index){const t=FLOW_LAYOUT.get(frame).nozzleTransforms[index];if(!t)throw Error('FLOW_LAYOUT: invalid nozzle index '+index);return t}
