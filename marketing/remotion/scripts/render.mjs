import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill, renderMedia} from '@remotion/renderer';
import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalize} from './normalize.mjs';

process.chdir(fileURLToPath(new URL('../',import.meta.url)));
await mkdir('out/frames',{recursive:true});
const browserExecutable=process.env.REMOTION_BROWSER_EXECUTABLE || (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined);
console.log('Bundling local assets…');
let bundleProgress=-1;
const serveUrl=await bundle({entryPoint:path.resolve('src/index.ts'),outDir:path.resolve('.cache/bundle'),publicDir:path.resolve('public'),onProgress:p=>{const pct=Math.floor(p/25)*25;if(pct!==bundleProgress){bundleProgress=pct;console.log(`Bundle ${pct}%`);}}});
const browser=await openBrowser('chrome',{browserExecutable,logLevel:'error'});
try{
 const composition=await selectComposition({serveUrl,id:'SportHostVertical',puppeteerInstance:browser,logLevel:'error'});
 const shared={serveUrl,composition,puppeteerInstance:browser,logLevel:'error',timeoutInMilliseconds:90000};
 if(process.argv.includes('--stills')||process.argv.includes('--all')){
  const frames=[90,230,370,495,625,760,895,1075,1220,1289];
  for(const frame of frames){await renderStill({...shared,frame,output:path.resolve(`out/frames/${String(frame).padStart(4,'0')}.png`),imageFormat:'png'});console.log(`Frame ${frame} · ${(frame/30).toFixed(2)}s`);}
 }
 if(!process.argv.includes('--stills')){
  let last=-1;
  await renderMedia({...shared,codec:'h264',audioCodec:'aac',audioBitrate:'192k',pixelFormat:'yuv420p',crf:17,x264Preset:'medium',imageFormat:'jpeg',jpegQuality:95,concurrency:Number(process.env.REMOTION_CONCURRENCY||1),outputLocation:path.resolve('out/sporthost-promo-vertical.mp4'),onProgress:p=>{const pct=Math.floor(p.progress*100/5)*5;if(pct!==last){last=pct;console.log(`Render ${pct}% (${p.renderedFrames}/1290 frames)`);}}});
  await normalize(path.resolve('out/sporthost-promo-vertical.mp4'));
  console.log('Completed out/sporthost-promo-vertical.mp4');
 }
 await writeFile('out/composition.json',JSON.stringify({id:composition.id,width:composition.width,height:composition.height,fps:composition.fps,durationInFrames:composition.durationInFrames,durationSeconds:composition.durationInFrames/composition.fps,codec:'h264',pixelFormat:'yuv420p',audioCodec:'aac'},null,2));
}finally{await browser.close({silent:true});}
