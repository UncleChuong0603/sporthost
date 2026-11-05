import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import path from 'node:path';
const require=createRequire(import.meta.url);
const binDir=process.platform==='win32'?path.dirname(require.resolve('@remotion/compositor-win32-x64-msvc/package.json')):'';
const ffmpeg=process.env.FFMPEG_PATH||path.join(binDir,'ffmpeg.exe');
const ffprobe=process.env.FFPROBE_PATH||path.join(binDir,'ffprobe.exe');
const output=path.resolve('out/sporthost-promo-vertical.mp4');
async function run(bin,args,binary=false){return new Promise((resolve,reject)=>{const chunks=[];let stderr='';const child=spawn(bin,args,{windowsHide:true});child.stdout.on('data',x=>chunks.push(x));child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>code===0?resolve({stdout:binary?Buffer.concat(chunks):Buffer.concat(chunks).toString(),stderr}):reject(Error(`${path.basename(bin)} failed (${code}): ${stderr.slice(-1500)}`)));});}
const probe=JSON.parse((await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',output])).stdout);
const video=probe.streams.find(x=>x.codec_type==='video'),audio=probe.streams.find(x=>x.codec_type==='audio');
for(const [ok,label] of [[video.codec_name==='h264','H.264'],[video.width===1080&&video.height===1920,'1080×1920'],[video.avg_frame_rate==='30/1','30 fps'],[Number(video.nb_frames)===1290,'1290 frames'],[Math.abs(Number(probe.format.duration)-43)<.1,'43 seconds'],[video.pix_fmt==='yuv420p','yuv420p'],[audio?.codec_name==='aac'&&audio.channels===2,'AAC stereo']]){if(!ok)throw Error(`Verification failed: ${label}`);console.log(`PASS ${label}`);}
await run(ffmpeg,['-hide_banner','-v','error','-threads','2','-i',output,'-c:v','rawvideo','-c:a','pcm_s16le','-f','null','-']);
console.log('PASS complete MP4 decode');
// Remotion's minimal FFmpeg omits volumedetect; inspect decoded PCM directly.
const wav=(await run(ffmpeg,['-hide_banner','-v','error','-threads','2','-i',output,'-vn','-c:a','pcm_s16le','-f','wav','pipe:1'],true)).stdout;
let pcm;
for(let at=12;at+8<wav.length;){const name=wav.toString('ascii',at,at+4),size=wav.readUInt32LE(at+4);if(name==='data'){pcm=wav.subarray(at+8,Math.min(wav.length,at+8+size));break;}at+=8+size+(size%2);}
if(!pcm)throw Error('Decoded WAV data was not found.');
let maxSample=0,squares=0;
for(let i=0;i<pcm.length;i+=2){const v=pcm.readInt16LE(i)/32768;maxSample=Math.max(maxSample,Math.abs(v));squares+=v*v;}
const peak=20*Math.log10(maxSample),rms=20*Math.log10(Math.sqrt(squares/(pcm.length/2)));
if(!Number.isFinite(peak)||peak>=0)throw Error('Audio peak missing or clipping.');
const frames=[90,230,370,495,625,760,895,1075,1220,1289];
// Decode representative moments from the actual MP4 in a browser. No tile or
// select filters are needed, and this additionally checks browser playback.
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#142d35;display:grid;grid-template-columns:repeat(5,270px);width:1350px}canvas{display:block;width:270px;height:480px}video{display:none}</style><video preload="auto" src="sporthost-promo-vertical.mp4"></video><script>(async()=>{try{const v=document.querySelector('video');await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;v.load()});for(const f of ${JSON.stringify(frames)}){await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=f/30+.0001});const c=document.createElement('canvas');c.width=270;c.height=480;c.getContext('2d').drawImage(v,0,0,270,480);document.body.append(c)}window.ready=true}catch(e){window.failure=String(e)}})()</script>`;
await writeFile('out/contact-sheet.html',html);
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath=process.env.REMOTION_BROWSER_EXECUTABLE||(existsSync(edge)?edge:undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try{const page=await browser.newPage({viewport:{width:1350,height:960},deviceScaleFactor:1});await page.goto(pathToFileURL(path.resolve('out/contact-sheet.html')).href);await page.waitForFunction(()=>window.ready||window.failure,{},{timeout:90000});const failure=await page.evaluate(()=>window.failure);if(failure)throw Error(failure);await page.screenshot({path:'out/storyboard-final.png'});}finally{await browser.close();}
await writeFile('out/validation.json',JSON.stringify({verifiedAt:new Date().toISOString(),codec:video.codec_name,width:video.width,height:video.height,fps:video.avg_frame_rate,frames:Number(video.nb_frames),seconds:Number(probe.format.duration),pixelFormat:video.pix_fmt,audio:audio.codec_name,audioChannels:audio.channels,audioPeakDb:Number(peak.toFixed(2)),audioRmsDb:Number(rms.toFixed(2)),completeDecode:true,browserPlayback:true,representativeFrames:frames,fileBytes:Number(probe.format.size)},null,2));
console.log(`PASS audio peak ${peak.toFixed(1)} dBFS; browser playback and final-video contact sheet saved.`);
