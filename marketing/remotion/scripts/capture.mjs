import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

// All writes are restricted to the local demo app whose launcher verifies *_test.
const origin = 'http://127.0.0.1:3217';
const dir = path.resolve('public/screens');
await mkdir(dir,{recursive:true});
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
const context = await browser.newContext({baseURL:origin,viewport:{width:520,height:940},deviceScaleFactor:2,locale:'vi-VN',timezoneId:'Asia/Bangkok',javaScriptEnabled:false});
const page = await context.newPage();
page.setDefaultTimeout(90000);
page.setDefaultNavigationTimeout(120000);
async function go(url){const r=await page.goto(url);if(r.status()!==200)throw Error(`Demo route ${url}: ${r.status()}`);await page.evaluate(()=>document.fonts.ready);}
async function token(){return page.locator('input[name="csrf"]').first().inputValue();}
async function post(url, form){
  const auth=url==='/signup';
  const r=await context.request.post(auth?'/internal/legacy-auth?mode=signup':'/internal/legacy',{form:{...form,csrf:await token()},headers:{Origin:origin,...(auth?{'x-sporthost-auth-mode':'signup'}:{'x-sporthost-legacy-path':url})},maxRedirects:0,timeout:120000});
  if(r.status()!==303)throw Error(`Demo action ${url}: ${r.status()}`);
  return new URL(r.headers().location,origin).pathname;
}
async function capture(name, locator, height=660){
  await page.evaluate(()=>document.activeElement?.blur());
  await locator.waitFor({state:'visible'});
  await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();
  await page.screenshot({path:path.join(dir,`${name}.png`),clip:{x:box.x,y:box.y,width:box.width,height:Math.min(height,box.height)},animations:'disabled'});
  console.log(`Captured ${name}`);
}
try{
  await go('/signup');
  await post('/signup',{email:`sporthost-film-${Date.now()}@example.com`,password:'local-demo-video-only-739!'});
  await go('/clubs/new');
  const clubPath=await post('/clubs',{name:'CLB Cầu Lông · DEMO'});
  const club=clubPath.split('/').at(-1);
  await go(clubPath);
  await post(`${clubPath}/settings`,{location:'Hồ Chí Minh',skill_guidance:'Trung bình – Khá',default_capacity:'16',venue_instructions:'Sân 01 · Dữ liệu minh họa'});
  for(const [i,name,kind,gender,level] of [[1,'Minh Anh · Demo','fixed','female','Khá'],[2,'Hoàng Nam · Demo','fixed','male','Trung bình'],[3,'Linh Chi · Demo','guest','female','Trung bình'],[4,'Đức Huy · Demo','guest','male','Khá']]){
    await post('/workspace/members',{club_id:club,name,phone:`090000010${i}`,kind,gender,level});
  }
  await go(`/members?club_id=${club}`);
  // The screenshot contains only fictional demo records; remove display phone
  // strings so the marketing asset cannot be mistaken for contact information.
  await page.locator('section li p').evaluateAll(nodes=>nodes.forEach(n=>{if(/090000010/.test(n.textContent)) n.textContent=n.textContent.replace(/090000010\d/g,'Số điện thoại demo');}));
  await capture('members',page.locator('main > section').first(),650);
  await go('/schedule/new');
  const gamePaths=[];
  const starts=new Date(Date.now()+7*86400000);
  const date=starts.toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
  for(const [title,offset] of [['Giao lưu tối thứ Bảy',0],['Lên sân cùng CLB',2]]){
    const day=new Date(`${date}T12:00:00+07:00`);day.setDate(day.getDate()+offset);
    const d=day.toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
    gamePaths.push(await post('/workspace/games',{club_id:club,title,venue:'Sân 01 · CLB Demo',starts_at:`${d}T19:00`,capacity:'16',guest_fee:'70000',fixed_fee:'60000',approval_mode:'AUTO_APPROVE',fee_mode:'FIXED_PRICE',weeks:'1'}));
  }
  const gamePath=gamePaths[0];
  await go(gamePath);
  for(const [i,name,gender] of [[1,'Minh Anh · Demo','female'],[2,'Hoàng Nam · Demo','male'],[3,'Linh Chi · Demo','female']]){
    await post(`${gamePath}/walk-ins`,{name,phone:`090000020${i}`,gender});
  }
  await go('/schedule');
  await capture('schedule',page.locator('main'),740);
  await go(gamePath);
  await post(`${gamePath}/lifecycle/start`,{});
  await go(gamePath);
  const people=await page.locator('li[id^="participant-"]').evaluateAll(nodes=>nodes.map(n=>({id:n.id.split('-')[1],version:n.querySelector('input[name="version"]')?.value||'0'})));
  for(const person of people) await post(`${gamePath}/participants/${person.id}/attendance`,{action:'check_in',version:person.version});
  await go(gamePath);
  await page.locator('#attendance article p').evaluateAll(nodes=>nodes.forEach(n=>{if(/090000020/.test(n.textContent))n.textContent='Người chơi demo';}));
  await capture('attendance',page.locator('#attendance'),730);
  await go('/dashboard');
  await capture('dashboard',page.locator('main'),760);
  await go('/finance');
  await capture('finance',page.locator('main'),740);
  await go(gamePath);
  await page.getByText('Liên kết riêng của người chơi',{exact:true}).first().click();
  const privatePath=await page.getByRole('link',{name:'Mở đăng ký & thanh toán',exact:true}).first().getAttribute('href');
  await go(privatePath);
  await capture('payment',page.locator('main'),740);
  // Store route evidence only; never persist private invitation paths or cookies.
  await writeFile(path.join(dir,'capture-info.json'),JSON.stringify({capturedAt:new Date().toISOString(),origin,syntheticData:true,viewport:{width:520,height:940},screens:['members','schedule','attendance','dashboard','finance','payment'],privateLinksPersisted:false},null,2));
}finally{await browser.close();}
