import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

await mkdir('public/fonts',{recursive:true});
await mkdir('public/audio',{recursive:true});
for(const subset of ['latin','vietnamese']){
  const src=`node_modules/@fontsource-variable/manrope/files/manrope-${subset}-wght-normal.woff2`;
  if(!existsSync(src))throw Error('Install dependencies before preparing assets.');
  await copyFile(src,`public/fonts/manrope-${subset}.woff2`);
}
await copyFile('node_modules/@fontsource-variable/manrope/LICENSE','public/fonts/OFL.txt');

// Original procedural music. No samples, copyrighted recordings or network APIs.
// 120 BPM: synthesized drums, warm bass and an original A-minor pluck progression.
const sr=48000, seconds=43, n=sr*seconds;
const left=new Float32Array(n), right=new Float32Array(n);
const TAU=Math.PI*2;
function event(start,duration,fn,gain=.2,pan=0){
 const a=Math.max(0,Math.floor(start*sr)),b=Math.min(n,Math.floor((start+duration)*sr));
 for(let i=a;i<b;i++){const t=(i-a)/sr,v=fn(t,i-a)*gain;left[i]+=v*(1-pan*.4);right[i]+=v*(1+pan*.4);}
}
function noise(i,seed=0){let v=(i+seed*1013)|0;v=Math.imul(v^(v>>>16),0x45d9f3b);v=Math.imul(v^(v>>>16),0x45d9f3b);return ((v^(v>>>16))>>>0)/2147483648-1;}
const hz=m=>440*2**((m-69)/12);
const chords=[[45,57,60,64],[41,53,57,60],[48,55,60,64],[43,55,59,62]];
for(let beat=0;beat<86;beat++){
 const t=beat*.5,bar=Math.floor(beat/4),ch=chords[Math.floor(bar/2)%4];
 const energy=t>=10&&t<38?1:.72;
 event(t,.34,x=>Math.sin(TAU*(48*x+(160-48)*.025*(1-Math.exp(-x/.025))))*Math.exp(-x*14),.42*energy);
 if(beat%2===1)event(t,.19,(x,i)=>(noise(i,bar+41)*.75+Math.sin(TAU*180*x)*.23)*Math.exp(-x*29),.14*energy,.07);
 for(let sub=0;sub<2;sub++)event(t+sub*.25,.07,(x,i)=>noise(i,beat*2+sub+12)*Math.exp(-x*70)*(1-Math.exp(-x*2000)),.052*energy,sub?.35:-.35);
 const bassNote=ch[0]+(beat%8===7?7:0);
 event(t+.02,.38,x=>{const a=Math.min(1,x/.009)*Math.exp(-x*7);return (Math.sin(TAU*hz(bassNote)*x)+.22*Math.sin(TAU*hz(bassNote)*2*x))*a;},.24*energy);
 if(beat%2===0||t>=10){
  const note=ch[1+((beat+bar)%3)]+12;
  event(t+.125,.64,x=>(Math.sin(TAU*hz(note)*x)+.22*Math.sin(TAU*hz(note)*2.003*x))*Math.min(1,x/.006)*Math.exp(-x*9),.09*energy,(beat%3-1)*.4);
  event(t+.375,.8,x=>Math.sin(TAU*hz(note)*x)*Math.min(1,x/.01)*Math.exp(-x*7),.022*energy,-(beat%3-1)*.4);
 }
}
// Soft tonal accents at scene changes; sustained final tonic for the brand hold.
for(const t of [0,5,10,14,18.5,23,27.5,32,38]){
 event(t,.65,(x,i)=>(Math.sin(TAU*880*x)*.4+noise(i,80)*.15)*Math.exp(-x*9),.085);
}
for(const note of [57,60,64,69])event(40,3,x=>Math.sin(TAU*hz(note)*x)*Math.min(1,x/.025)*Math.exp(-x*1.8),.04,(note%3-1)*.4);
const wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);
let peak=0;
for(let i=0;i<n;i++){
 const t=i/sr,fade=Math.min(1,t/.12,(seconds-t)/1.7);
 const l=Math.tanh(left[i]*1.15)*.8*fade,r=Math.tanh(right[i]*1.15)*.8*fade;
 peak=Math.max(peak,Math.abs(l),Math.abs(r));
 wav.writeInt16LE(Math.round(l*32767),44+i*4);wav.writeInt16LE(Math.round(r*32767),46+i*4);
}
await writeFile('public/audio/sporthost-original.wav',wav);
console.log(`Original stereo score: ${seconds}s / ${sr}Hz / peak ${(20*Math.log10(peak)).toFixed(1)} dBFS`);
