import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Activity, ArrowUpRight, Check, type LucideIcon} from 'lucide-react';
import {BRAND as B} from './config';

export const ease=Easing.bezier(.16,1,.3,1);
export const tween=(frame:number,start:number,end:number,from=0,to=1)=>interpolate(frame,[start,end],[from,to],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
export function useEnter(delay=0){const f=useCurrentFrame();const {fps}=useVideoConfig();return spring({frame:f-delay,fps,config:{damping:23,stiffness:150,mass:.85}});}

export const Brand:React.FC<{size?:number;dark?:boolean;iconOnly?:boolean}>=({size=42,dark=false,iconOnly=false})=><div style={{display:'flex',gap:size*.3,alignItems:'center',color:dark?B.dark:B.white,fontFamily:'Arial, sans-serif',fontWeight:700,fontSize:size,letterSpacing:-size*.035}}><div style={{display:'flex',alignItems:'center',justifyContent:'center',width:size*1.35,height:size*1.35,borderRadius:size*.3,background:B.teal}}><Activity color="white" size={size*.86} strokeWidth={2}/></div>{!iconOnly&&'SportHost'}</div>;

export const Headline:React.FC<{lines:readonly string[];size?:number;delay?:number;color?:string;accent?:number;style?:React.CSSProperties}>=({lines,size=88,delay=0,color=B.white,accent=-1,style})=>{
 const f=useCurrentFrame();return <div style={{fontSize:size,lineHeight:1.19,fontWeight:800,letterSpacing:-size*.045,color,...style}}>{lines.map((line,i)=><div key={line} style={{overflow:'hidden',paddingBottom:8,marginBottom:-5}}><div data-safe-text style={{color:i===accent?B.mint:undefined,transform:`translateY(${tween(f,delay+i*5,delay+i*5+24,110,0)}%)`,opacity:tween(f,delay+i*5,delay+i*5+16)}}>{line}</div></div>)}</div>;
};

export const Eyebrow:React.FC<{children:React.ReactNode;light?:boolean;index?:string}>=({children,light=false,index})=><div data-safe-text style={{display:'flex',alignItems:'center',gap:20,fontSize:24,fontWeight:750,letterSpacing:4,color:light?B.teal:B.mint}}>{index&&<span style={{fontSize:23,letterSpacing:0,border:`1px solid ${light?'#087f6b44':'#b8e6d944'}`,borderRadius:30,padding:'9px 16px'}}>{index}</span>}{children}</div>;

export const Pill:React.FC<{children:React.ReactNode;light?:boolean;Icon?:LucideIcon}>=({children,light=false,Icon=Check})=><div data-safe-text style={{display:'inline-flex',gap:16,alignItems:'center',background:light?'#087f6b10':'#b8e6d913',color:light?B.teal:B.mint,border:`1px solid ${light?'#087f6b30':'#b8e6d930'}`,padding:'19px 28px',borderRadius:60,fontSize:28,fontWeight:650}}><Icon size={29}/>{children}</div>;

export const Court:React.FC<{light?:boolean;strong?:boolean}>=({light=false,strong=false})=>{
 const f=useCurrentFrame();return <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0,opacity:strong?.38:light?.11:.13,transform:`translateY(${Math.sin(f/150)*12}px)`,pointerEvents:'none'}}><g fill="none" stroke={light?B.teal:B.mint} strokeWidth="2"><path d="M-180 1390L660 900L1330 1400L480 2020Z"/><path d="M-90 1430L675 990L1220 1400L465 1930Z"/><path d="M235 1150L899 1650M-20 1600L820 1110M130 1740L995 1240M240 1840L1110 1330"/><path d="M-50 1388L600 1875M110 1293L760 1780"/></g><circle cx="990" cy="680" r="400" fill="none" stroke={light?B.teal:B.mint} strokeWidth="1" opacity=".45"/></svg>;
};

export const Background:React.FC<{light?:boolean;children?:React.ReactNode}>=({light=false,children})=><AbsoluteFill style={{background:light?'linear-gradient(155deg,#f4f9f6 0%,#e6f1ec 75%,#d8ece3 100%)':`radial-gradient(ellipse at 90% 60%,#215246 0%,${B.dark} 58%)`,overflow:'hidden',color:light?B.ink:B.white}}><Court light={light}/>{children}</AbsoluteFill>;

export const SceneHeader:React.FC<{light?:boolean;tag?:string}>=({light=false,tag='DÀNH CHO HOST CẦU LÔNG'})=><div style={{position:'absolute',left:90,right:144,top:145,display:'flex',alignItems:'center',justifyContent:'space-between'}}><Brand size={36} dark={light}/><span style={{fontSize:17,letterSpacing:2,fontWeight:650,color:light?B.muted:B.mint}}>{tag}</span></div>;

export const Shuttle:React.FC<{size?:number;style?:React.CSSProperties}>=({size=380,style})=><svg viewBox="0 0 300 400" width={size} height={size*4/3} style={style}><defs><linearGradient id="feather" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f3fff7"/><stop offset="1" stopColor="#9bcbbd"/></linearGradient></defs><g transform="translate(150 200) rotate(-23) translate(-150 -200)" fill="url(#feather)" stroke="#d8f3e5" strokeWidth="2">{[0,1,2,3,4,5,6].map(i=><path key={i} d={`M${113+i*12} 282 L${18+i*39} ${35+Math.abs(3-i)*8} Q${42+i*33} ${8+Math.abs(3-i)*12} ${55+i*34} ${42+Math.abs(3-i)*8} L${150+i*6} 280Z`}/>)}<path d="M55 130L245 130M76 204L222 204" fill="none" stroke={B.teal} strokeWidth="5"/><path d="M111 274L188 274L188 316Q150 370 112 316Z" fill={B.teal}/><path d="M112 283H188" stroke="white" strokeWidth="7"/></g></svg>;

export const ProductFrame:React.FC<{screen:string;title:string;height?:number;light?:boolean;delay?:number;pan?:number;style?:React.CSSProperties}>=({screen,title,height=830,light=false,delay=12,pan=24,style})=>{
 const f=useCurrentFrame();const enter=useEnter(delay);return <div style={{position:'absolute',left:90,top:625,width:846,height,borderRadius:32,background:B.paper,overflow:'hidden',border:`2px solid ${light?'#142d3533':'#c9ecdc55'}`,boxShadow:'0 35px 70px #071d2633',transform:`translateY(${(1-enter)*100}px) scale(${.96+enter*.04})`,opacity:enter,...style}}>
  <div style={{height:75,background:B.dark,color:B.white,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 28px',borderBottom:'1px solid #ffffff19'}}><div style={{display:'flex',gap:7,alignItems:'center'}}>{[.3,.5,.8].map((o)=><span key={o} style={{width:9,height:9,borderRadius:10,background:B.mint,opacity:o}}/>)}</div><span style={{fontSize:21,fontWeight:650,letterSpacing:.4}}>SportHost / {title}</span><Activity size={24} color={B.mint}/></div>
  <div style={{position:'relative',height:height-75,overflow:'hidden',background:B.paper}}><Img src={staticFile(`screens/${screen}.png`)} style={{display:'block',width:'100%',height:'auto',transform:`translateY(-${tween(f,30,125,0,pan)}px)`}}/></div>
 </div>;
};

export const ArrowCTA:React.FC=()=> <div data-safe-text style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'30px 36px',borderRadius:24,background:B.dark,color:B.white,fontSize:35,fontWeight:750,width:790}}><span>Trải nghiệm SportHost ngay</span><ArrowUpRight size={44}/></div>;
