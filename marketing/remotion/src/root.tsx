import React from 'react';
import {AbsoluteFill, Composition, Html5Audio, Sequence, staticFile, useCurrentFrame, interpolate, delayRender, continueRender, cancelRender} from 'remotion';
import {Hook, Problem, Reveal, Feature, Benefits, Outro} from './scenes';
import {BRAND, CUTS, FEATURES, VIDEO} from './config';
import './style.css';

const fontWait=delayRender('Load bundled Vietnamese typography');
Promise.all([
 new FontFace('Manrope',`url("${staticFile('fonts/manrope-latin.woff2')}")`,{weight:'200 800',unicodeRange:'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'}).load(),
 new FontFace('Manrope',`url("${staticFile('fonts/manrope-vietnamese.woff2')}")`,{weight:'200 800',unicodeRange:'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'}).load(),
]).then(fonts=>{fonts.forEach(font=>document.fonts.add(font));continueRender(fontWait);}).catch(cancelRender);

const Transition:React.FC=()=>{
 const frame=useCurrentFrame();const cut=CUTS.find(c=>frame>=c-6&&frame<c+8);
 if(cut===undefined)return null;
 const p=(frame-(cut-6))/14;
 return <AbsoluteFill style={{pointerEvents:'none'}}><div style={{position:'absolute',left:interpolate(p,[0,1],[-1800,1500]),top:-200,width:1400,height:2400,transform:'skewX(-15deg)',background:BRAND.teal}}/><div style={{position:'absolute',left:interpolate(p,[0,1],[-1900,1400]),top:-200,width:80,height:2400,transform:'skewX(-15deg)',background:BRAND.mint}}/></AbsoluteFill>;
};

export const SportHostVideo:React.FC=()=>{
 const f=useCurrentFrame();return <AbsoluteFill style={{fontFamily:'Manrope, Arial, sans-serif',background:BRAND.dark}}>
  <Sequence from={0} durationInFrames={150} name="01 · Hook"><Hook/></Sequence>
  <Sequence from={150} durationInFrames={150} name="02 · Vấn đề của host"><Problem/></Sequence>
  <Sequence from={300} durationInFrames={120} name="03 · SportHost"><Reveal/></Sequence>
  {FEATURES.map(feature=><Sequence key={feature.index} from={feature.from} durationInFrames={feature.duration} name={`${feature.index} · ${feature.label}`}><Feature feature={feature}/></Sequence>)}
  <Sequence from={960} durationInFrames={180} name="08 · Giá trị"><Benefits/></Sequence>
  <Sequence from={1140} durationInFrames={150} name="09 · Trải nghiệm SportHost"><Outro/></Sequence>
  <Transition/>
  <Html5Audio src={staticFile('audio/sporthost-original.wav')} volume={frame=>interpolate(frame,[0,20,1220,1289],[0,.65,.65,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
  {/* Finish on the brand, with a gentle tail rather than an empty end frame. */}
  <AbsoluteFill style={{background:BRAND.dark,opacity:interpolate(f,[1271,1289],[0,.08],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),pointerEvents:'none'}}/>
 </AbsoluteFill>;
};
export const Root:React.FC=()=> <Composition id={VIDEO.id} component={SportHostVideo} width={VIDEO.width} height={VIDEO.height} fps={VIDEO.fps} durationInFrames={VIDEO.frames}/>;
