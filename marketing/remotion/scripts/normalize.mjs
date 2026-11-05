import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const binDir=process.platform==='win32'?path.dirname(require.resolve('@remotion/compositor-win32-x64-msvc/package.json')):'';
function run(bin,args){return new Promise((resolve,reject)=>{let stdout='',stderr='';const child=spawn(bin,args,{windowsHide:true});child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(Error(`${path.basename(bin)} failed (${code}): ${stderr.slice(-1200)}`)));});}
export async function normalize(output){
 const ffmpeg=process.env.FFMPEG_PATH||path.join(binDir,'ffmpeg.exe');
 const ffprobe=process.env.FFPROBE_PATH||path.join(binDir,'ffprobe.exe');
 const probe=JSON.parse(await run(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=pix_fmt,color_range','-of','json',output]));
 if(probe.streams[0].pix_fmt==='yuv420p')return;
 const temp=output.replace(/\.mp4$/,'.normalized.mp4');
 console.log('Normalizing full-range capture to limited-range BT.709 / yuv420p…');
 await run(ffmpeg,['-hide_banner','-v','error','-threads','2','-i',output,'-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-threads','2','-preset','fast','-crf','17','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','copy','-movflags','+faststart','-y',temp]);
 const check=JSON.parse(await run(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=pix_fmt','-of','json',temp]));
 if(check.streams[0].pix_fmt!=='yuv420p')throw Error('Color normalization failed. Original render is preserved.');
 await rename(output,output.replace(/\.mp4$/,'.master.mp4'));
 await rename(temp,output);
 console.log('Normalized delivery MP4; original Remotion master preserved.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await normalize(path.resolve('out/sporthost-promo-vertical.mp4'));
