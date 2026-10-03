import { heightAt, roadsData } from '../src/terrain.js';
let t=performance.now(); roadsData(); console.log('roads ms',(performance.now()-t)|0);
t=performance.now(); let s=0,n=0; for(let x=-1500;x<=1500;x+=10) for(let z=-1500;z<=-1000;z+=10){s+=heightAt(x,z);n++;} console.log('strip ms',(performance.now()-t)|0,'n',n,'avg h',(s/n).toFixed(1));
console.log([0,1050,1100,1200,1262,1350,1450].map(r=>+heightAt(r,r*0.3).toFixed(1)).join(' '));
