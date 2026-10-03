/* ===== CAPTURE: still photo (2 frames of 1.5x supersampling, then toBlob in the same task as the last draw) and WebM/MP4 recording of the
   canvas (MediaRecorder). Recording follows the cinematic when armed. Nothing leaves the device: files are saved through a download link. */
const CAP={rec:null,chunks:[],stage:0,pending:false,armed:false,saveCs:null,last:null,err:null};
window.__CAP=CAP;
function capStamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds())}
function capSave(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u)},4000)}
CAP.supported=()=>!!(window.MediaRecorder&&glCanvas.captureStream);
CAP.recording=()=>!!CAP.rec;
CAP.start=()=>{if(CAP.rec||!CAP.supported())return false;
 try{const mimes=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'],mime=mimes.find(m=>window.MediaRecorder.isTypeSupported(m))||'';
  const r=new window.MediaRecorder(glCanvas.captureStream(60),mime?{mimeType:mime,videoBitsPerSecond:12e6}:{});CAP.chunks=[];
  r.ondataavailable=e=>{if(e.data&&e.data.size)CAP.chunks.push(e.data)};
  r.onstop=()=>{const type=r.mimeType||mime||'video/webm',b=new Blob(CAP.chunks,{type});CAP.last=b;CAP.rec=null;capSave(b,'aether-'+capStamp()+(type.includes('mp4')?'.mp4':'.webm'));window.dispatchEvent(new CustomEvent('aether-capture',{detail:{kind:'video',bytes:b.size}}))};
  r.start(1000);CAP.rec=r;return true}
 catch(e){CAP.err=String(e?.message||e);CAP.rec=null;return false}};
CAP.stop=()=>{if(CAP.rec&&CAP.rec.state!=='inactive')CAP.rec.stop()};
CAP.photo=()=>{if(CAP.stage||CAP.pending)return false;CAP.saveCs=LIVE.cs;LIVE.cs=1.5;CAP.stage=2;return true};
/* called at the end of every draw, after the final present pass */
function capAfterDraw(){if(CAP.stage>0){if(--CAP.stage===0)CAP.pending=true;return}
 if(!CAP.pending)return;CAP.pending=false;const cs=CAP.saveCs;
 glCanvas.toBlob(b=>{if(b){CAP.last=b;capSave(b,'aether-'+capStamp()+'.png');window.dispatchEvent(new CustomEvent('aether-capture',{detail:{kind:'photo',bytes:b.size}}))}},'image/png');
 LIVE.cs=cs}
