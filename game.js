/* ZOO:CAFE v8 — full-screen social game client
   Layered canvas renderer, proportional furniture, collisions, animated water,
   outdoor camera dead-zone, and a denser hand-crafted pixel world.
*/
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
const interaction=document.getElementById('interaction'),interactionText=document.getElementById('interactionText');
const chatPanel=document.getElementById('chatPanel'),chatLog=document.getElementById('chatLog'),chatInputWrap=document.getElementById('chatInputWrap'),chatInput=document.getElementById('chatInput');
let chatActive=false,chatMessages=[],bubble={text:'',until:0};
const remotePlayers=new Map(), remoteBubbles=new Map();
const W=canvas.width,H=canvas.height,WORLD_W=2880,WORLD_H=1800,SPEED=3.05,PS=54,PH=PS/2,SPRITE_W=66,SPRITE_H=78;
const keys=Object.create(null),imgs={};
const mobileMove={x:0,y:0,active:false};let ready=false,loaded=0,last=performance.now(),mode='world',cooldown=0,waterT=0;
const cityBgm=document.getElementById('cityBgm');
const cafeBgm=document.getElementById('cafeBgm');
let bgmStarted=false;
let bgmEnabled=true;
let bgmVolume=.45;
[cityBgm,cafeBgm].forEach(a=>{if(a)a.volume=bgmVolume;});
function syncBgm(){
  if(!bgmStarted||!bgmEnabled)return;
  const active=mode==='world'?cityBgm:cafeBgm;
  const inactive=mode==='world'?cafeBgm:cityBgm;
  if(inactive)inactive.pause();
  if(active)active.play().catch(()=>{});
}
function startBgm(){if(bgmStarted)return;bgmStarted=true;syncBgm();}
for(const d of ['down','left','right','up'])for(const f of [1,2,3]){const im=new Image();im.src=`images/mung-saja-${d}-${f}.png`;im.onload=()=>{if(++loaded===12){ready=true;requestAnimationFrame(loop)}};imgs[`${d}-${f}`]=im}
let player={x:1430,y:980,dir:'down',frame:2,t:0,moving:false}, cafePlayer={x:480,y:465,dir:'down',frame:2,t:0,moving:false};
let camera={x:player.x-W/2,y:player.y-H/2};
const cafe={x:1260,y:430,w:340,h:235,door:{x:1412,y:615,w:36,h:50}};
const worldSolids=[{x:1260,y:430,w:340,h:185}];
const cafeSolids=[{x:0,y:0,w:960,h:236},{x:286,y:132,w:388,h:86},{x:82,y:344,w:160,h:92},{x:368,y:333,w:224,h:72},{x:752,y:350,w:122,h:74},{x:868,y:245,w:78,h:112}];
const C={ink:'#4b3429',ink2:'#654637',grass:'#86c968',grass2:'#70b65a',grass3:'#a5dc79',path:'#dfbd80',path2:'#cfa66a',wood:'#a66f4c',wood2:'#8a583d',cream:'#f2ddb0',wall:'#efd9ad',green:'#5f8550',leaf:'#4f8a46',leaf2:'#78ad50',leaf3:'#a3ce65'};
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function R(x,y,w,h,fill,stroke=null,lw=1){ctx.fillStyle=fill;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.strokeRect(Math.round(x)+.5,Math.round(y)+.5,Math.round(w)-1,Math.round(h)-1)}}
function RR(x,y,w,h,r,fill,stroke=null,lw=1){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke()}}
function T(s,x,y,size=12,color=C.ink,align='left',weight=800){ctx.font=`${weight} ${size}px Arial,"Noto Sans KR",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(s,x,y)}
function shadow(x,y,rx,ry,a=.16){ctx.fillStyle=`rgba(58,39,29,${a})`;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}
function px(x,y,w,h,c){R(x,y,w,h,c)}
function flower(x,y,c='#fff5d6'){px(x-2,y-7,4,14,'#4c8b45');px(x-6,y-5,5,5,c);px(x+2,y-5,5,5,c);px(x-2,y-9,5,5,c);px(x-2,y-1,5,5,c);px(x,y-5,3,3,'#e6ad4e')}
function grassTuft(x,y){px(x,y,3,9,'#4f9349');px(x+5,y-3,3,12,'#5da052');px(x+10,y+1,3,8,'#4f9349')}
function rock(x,y,s=1){shadow(x,y+12*s,18*s,7*s,.13);px(x-17*s,y-7*s,34*s,19*s,'#778077');px(x-12*s,y-12*s,24*s,8*s,'#949b91');px(x-8*s,y-10*s,10*s,5*s,'#adb2a8');px(x+9*s,y-3*s,7*s,10*s,'#5e675f')}
function tree(x,y,s=1){shadow(x,y+42*s,34*s,10*s,.15);px(x-7*s,y+20*s,14*s,38*s,'#755038');px(x-3*s,y+22*s,7*s,34*s,'#9a6844');for(const [dx,dy,r,c] of [[-20,4,24,C.leaf], [18,6,25,C.leaf],[-4,-14,30,C.leaf2],[-30,18,18,'#438141'],[27,20,18,'#438141'],[2,15,27,C.leaf2]]){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x+dx*s,y+dy*s,r*s,0,Math.PI*2);ctx.fill()}for(const [dx,dy] of [[-13,-19],[8,-9],[22,8],[-28,10]])px(x+dx*s,y+dy*s,8*s,7*s,C.leaf3)}
function bush(x,y,s=1){shadow(x,y+13*s,24*s,6*s,.1);for(const [dx,dy,c] of [[-16,0,C.leaf], [14,1,C.leaf],[-4,-9,C.leaf2],[2,7,'#5f9d4e']]){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x+dx*s,y+dy*s,17*s,0,Math.PI*2);ctx.fill()}px(x-8*s,y-12*s,7*s,5*s,C.leaf3)}
function fence(x,y,n=4){for(let i=0;i<n;i++){let xx=x+i*27;px(xx,y-5,7,38,'#684630');px(xx-3,y-8,13,7,'#9b6845')}px(x,y+4,(n-1)*27+7,7,'#9b6845');px(x,y+22,(n-1)*27+7,7,'#85583c')}
function bench(x,y){shadow(x+45,y+28,50,8,.12);px(x,y,92,13,'#89583c');px(x+6,y-24,80,20,'#a66b46');px(x+10,y-20,72,5,'#c18355');px(x+12,y+12,8,25,'#5b3b2c');px(x+72,y+12,8,25,'#5b3b2c')}
function lamp(x,y){shadow(x,y+53,14,5,.12);px(x-4,y,8,54,'#3f3b35');px(x-9,y-10,18,13,'#51463a');px(x-13,y-25,26,19,'#574735');px(x-8,y-21,16,11,'#ffd46f');px(x-3,y-31,6,7,'#44392f')}
function sign(x,y,label){shadow(x+33,y+50,24,5,.1);RR(x,y,67,34,3,'#a66e49','#5c3d2d',4);T(label,x+33,y+17,10,'#fff0c9','center',900);px(x+29,y+34,8,31,'#674531')}
function pot(x,y,s=1){px(x-10*s,y,20*s,13*s,'#b4734d');px(x-13*s,y-3*s,26*s,6*s,'#754832');for(const [dx,dy,c] of [[-9,-12,C.leaf],[8,-13,C.leaf],[-2,-23,C.leaf2]]){ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x+dx*s,y+dy*s,8*s,13*s,dx*.02,0,Math.PI*2);ctx.fill()}}
function cafeExterior(){shadow(cafe.x+cafe.w/2,cafe.y+cafe.h+18,190,18,.14);R(cafe.x,cafe.y,cafe.w,cafe.h,'#f2dfb8',C.ink,7);R(cafe.x-18,cafe.y-62,cafe.w+36,72,'#805239',C.ink,7);for(let x=cafe.x-8;x<cafe.x+cafe.w+8;x+=30){R(x,cafe.y-55,20,50,'#986143');R(x+20,cafe.y-55,10,50,'#754a35')}RR(cafe.x+58,cafe.y+18,224,48,4,'#f8e5b6',C.ink,5);T('☕  ZOO:CAFE',cafe.x+170,cafe.y+43,23,C.ink,'center',900);R(cafe.x+24,cafe.y+80,cafe.w-48,29,'#fff0d0',C.ink,3);for(let i=0;i<10;i++)if(i%2)R(cafe.x+24+i*29,cafe.y+80,29,29,'#d88f68');for(const xx of [cafe.x+32,cafe.x+252]){R(xx,cafe.y+118,48,58,'#a9d8e2',C.ink,5);R(xx+21,cafe.y+118,5,58,C.ink);R(xx,cafe.y+144,48,5,C.ink)}R(cafe.door.x,cafe.door.y,cafe.door.w,cafe.door.h,'#704830',C.ink,5);R(cafe.door.x+7,cafe.door.y+8,22,28,'#9b6746');px(cafe.door.x+25,cafe.door.y+27,4,4,'#f0c85e');pot(cafe.x+12,cafe.y+178,.9);pot(cafe.x+cafe.w-14,cafe.y+178,.9);RR(cafe.x+cafe.w+18,cafe.y+128,76,61,3,'#4b3a31','#684635',5);T('OPEN',cafe.x+cafe.w+56,cafe.y+148,13,'#f6dfb1','center',900);T('coffee',cafe.x+cafe.w+56,cafe.y+169,9,'#f6dfb1','center',700)}

function assetProp(path,x,y,w,h,anchorX=.5,anchorY=1){const im=ZA?.get(path);return assetSprite(im,x,y,w,h,anchorX,anchorY)}
function assetLily(x,y,variant=0){const im=ZA?.pick(ZA.manifest.waterDecor?.lilyPad,variant);if(im)assetSprite(im,x,y+10,32,32,.5,.5)}
function assetReeds(x,y,variant=0,phase=0){const im=ZA?.pick(ZA.manifest.waterDecor?.reeds,variant);if(!im)return;const sway=Math.sin(waterT*1.7+phase)*1.2;assetSprite(im,x+sway,y+14,32,32,.5,1)}
function assetShoreRocks(x,y,s=1){const im=ZA?.pick(ZA.manifest.waterDecor?.shoreRocks);if(im)assetSprite(im,x,y+8,64*s,32*s,.5,1)}
function assetBridge(x,y){const path=ZA?.manifest.props?.bridge,im=path&&ZA.get(path);if(im){shadow(x,y+34,76,12,.18);assetSprite(im,x,y+40,160,96,.5,1);return true}return false}

function drawWorld(){R(0,0,WORLD_W,WORLD_H,C.grass);for(let y=18;y<WORLD_H;y+=48)for(let x=20;x<WORLD_W;x+=52){let q=(x*7+y*11)%17;if(q<5){px(x,y,3,3,C.grass3);px(x+8,y+5,2,2,C.grass2)}}R(0,405,WORLD_W,126,C.path);R(0,409,WORLD_W,6,'#efd19a');R(0,520,WORLD_W,7,C.path2);R(742,0,124,WORLD_H,C.path);R(748,0,6,WORLD_H,'#efd19a');R(858,0,7,WORLD_H,C.path2);
R(0,835,WORLD_W,285,'#55afd0');R(0,835,WORLD_W,10,'#3c8eab');for(let i=0;i<15;i++){let yy=875+(i%3)*64,xx=35+i*126;R(xx,yy,55,4,'#8dd7e8');R(xx+70,yy+24,28,3,'#79c9df')}for(let x=0;x<WORLD_W;x+=42){px(x,825,25,10,'#6da95a');px(x+10,818,20,9,'#87bf67')}
R(742,830,124,290,'#8d5c3e',C.ink,6);for(let y=838;y<1110;y+=27)R(751,y,106,19,'#ad734a');R(750,830,9,290,'#67432f');R(849,830,9,290,'#67432f');
[[90,115,1.15],[340,245,1],[1240,105,1.1],[1515,240,1.1],[85,585,1.2],[345,690,1],[1120,650,1.1],[1435,675,1.25],[1220,465,.9],[520,115,.9],[1740,525,1.1],[1660,730,.9]].forEach(a=>tree(...a));[[190,270,1],[680,260,.8],[1170,280,.9],[1480,590,1],[965,675,.8],[520,750,.9]].forEach(a=>bush(...a));
for(const f of [[230,190],[280,220],[420,320],[470,610],[1020,290],[1210,220],[1310,310],[1560,575],[1060,740],[410,750],[150,745],[1700,690]])flower(...f);for(const g of [[600,245],[1350,500],[270,565],[1620,350],[1150,720]])grassTuft(...g);
fence(80,310,4);fence(1330,310,5);fence(180,650,4);fence(1180,665,5);bench(250,355);bench(1260,355);bench(430,630);lamp(1175,350);lamp(620,370);lamp(1060,635);sign(555,355,'CAFE');sign(1050,580,'♥');sign(110,625,'REST');rock(690,165,1);rock(1460,420,.8);cafeExterior();
R(1550,135,150,94,'#f1d8aa',C.ink,5);R(1530,105,190,40,'#7b5038',C.ink,5);R(1574,165,38,64,'#70462f',C.ink,4);R(1640,165,36,36,'#add7df',C.ink,4)}
function shelf(x,y,w){R(x,y,w,9,'#784c34',C.ink,3);for(let i=0;i<Math.floor(w/26);i++){R(x+7+i*25,y-18,13,15,['#c48a5e','#eee0c3','#80986b'][i%3],C.ink,2)}}
function chair(x,y){shadow(x+20,y+35,23,6,.1);R(x,y,40,24,'#815238',C.ink,4);R(x+5,y+22,7,27,'#57382a');R(x+28,y+22,7,27,'#57382a')}
function bookshelf(x,y){R(x,y,70,94,'#754a32',C.ink,5);for(let i=0;i<4;i++){R(x+8,y+9+i*20,54,11,'#9e6a45');for(let j=0;j<4;j++)R(x+11+j*13,y+11+i*20,8,8,['#c68159','#6f8d66','#b96850','#d2ab6b'][j])}}
function drawCafe(){R(0,0,W,H,C.wall);R(0,235,W,H-235,'#b57c57');for(let y=240;y<H;y+=25){R(0,y,W,2,'#9c684a');for(let x=(y%50?20:0);x<W;x+=120)R(x,y,2,25,'rgba(107,70,50,.18)')}R(0,0,W,8,'#6b4732');R(0,228,W,8,'#6b4732');
R(40,86,90,142,'#724931',C.ink,6);R(50,98,70,58,'#9fd0da',C.ink,4);R(83,98,5,58,C.ink);R(50,124,70,5,C.ink);T('ZOO',85,180,13,'#f5e0b9','center',900);T('CAFE',85,198,13,'#f5e0b9','center',900);R(48,226,75,14,'#66825a',C.ink,3);
R(160,55,112,96,'#acd9e2',C.ink,6);R(212,55,6,96,C.ink);R(160,99,112,6,C.ink);pot(315,83,.8);RR(292,92,42,42,2,'#f8e8c8','#684635',4);T('☕',313,113,18,C.ink,'center',800);
RR(350,28,310,68,4,'#f7e3b3',C.ink,5);T('☕ ZOO:CAFE',505,56,25,C.ink,'center',900);T('a little cafe for little stories',505,81,10,'#76513e','center',700);shelf(355,122,118);shelf(690,117,84);shelf(790,210,95);
R(286,132,388,86,'#96603f',C.ink,6);R(286,128,388,13,'#b97950',C.ink,4);R(286,197,388,21,'#744831');R(305,154,86,48,'#c7e0df',C.ink,4);R(312,161,72,34,'#f0ddb9');R(321,170,20,12,'#c97955');R(351,170,20,12,'#e3a264');
R(462,118,61,39,'#5b5956','#353432',5);R(471,128,14,8,'#e2b64e','#363532',2);R(499,128,14,8,'#e9e7df','#363532',2);R(484,144,17,10,'#403a35');R(540,130,25,28,'#71513b',C.ink,3);R(544,122,17,9,'#8e6549');for(let i=0;i<3;i++)R(584+i*18,178,12,9,'#f2e4c7','#684633',2);
R(785,45,137,145,'#493a31','#684633',6);T('MENU',853,69,17,'#f6dfb1','center',900);['COFFEE   3','LATTE     4','TEA       3','CAKE      4'].forEach((s,i)=>T(s,853,98+i*22,12,'#f6dfb1','center',700));bookshelf(875,235);pot(930,220,.8);
R(82,344,160,92,'#70845e','#4d5d43',6);R(94,357,64,64,'#84976f','#4d5d43',4);R(164,357,64,64,'#84976f','#4d5d43',4);RR(120,398,64,38,18,'#89583b','#563626',4);T('☕',152,417,15,'#f7e3c0','center');pot(250,360,.7);
R(338,292,285,142,'#d7c096','#aa8f65',5);R(349,303,263,120,'#e5d1a9');R(382,337,196,64,'#8b593b',C.ink,5);R(398,347,164,7,'#ad734b');chair(390,300);chair(530,300);chair(390,405);chair(530,405);T('☘',470,369,18,'#4d7541','center');T('▱',526,369,14,'#f0dfbd','center');
ctx.fillStyle='#8b593b';ctx.beginPath();ctx.ellipse(800,371,61,38,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=C.ink;ctx.lineWidth=5;ctx.stroke();R(796,405,8,26,C.ink);chair(742,340);chair(824,340);T('☕',800,368,14,'#f6e2bf','center');pot(700,430,.8);RR(700,472,135,45,3,'#52714b','#3f573b',4);T('WELCOME',767,493,14,'#d8d89c','center',900);}
function sprite(p,x,y){const im=imgs[`${p.dir}-${p.frame}`];if(!im)return;shadow(x,y+29,22,7,.17);ctx.drawImage(im,Math.round(x-SPRITE_W/2),Math.round(y-SPRITE_H/2),SPRITE_W,SPRITE_H)}
function animate(p,m){p.moving=m;if(m){if(++p.t>=6){p.t=0;p.frame=p.frame===3?1:p.frame+1}}else{p.t=0;p.frame=2}}
function input(p){let dx=0,dy=0,m=false;if(chatActive)return[0,0,false];
if(mobileMove.active){dx=mobileMove.x*SPEED;dy=mobileMove.y*SPEED;m=Math.hypot(mobileMove.x,mobileMove.y)>.08;if(m){if(Math.abs(mobileMove.x)>Math.abs(mobileMove.y))p.dir=mobileMove.x<0?'left':'right';else p.dir=mobileMove.y<0?'up':'down'}return[dx,dy,m]}
if(keys.w||keys.arrowup){dy=-SPEED;p.dir='up';m=true}if(keys.s||keys.arrowdown){dy=SPEED;p.dir='down';m=true}if(keys.a||keys.arrowleft){dx=-SPEED;p.dir='left';m=true}if(keys.d||keys.arrowright){dx=SPEED;p.dir='right';m=true}if(dx&&dy){dx*=.7071;dy*=.7071}return[dx,dy,m]}
function moveWorld(){let[dx,dy,m]=input(player),nx=clamp(player.x+dx,PH,WORLD_W-PH),ny=clamp(player.y+dy,PH,WORLD_H-PH),b={x:nx-16,y:ny-10,w:32,h:34};if(!worldSolids.some(o=>hit(b,o))){player.x=nx;player.y=ny}animate(player,m)}
function moveCafe(){let[dx,dy,m]=input(cafePlayer),nx=clamp(cafePlayer.x+dx,PH,W-PH),ny=clamp(cafePlayer.y+dy,255,H-PH),b={x:nx-15,y:ny-9,w:30,h:32};if(!cafeSolids.some(o=>hit(b,o))){cafePlayer.x=nx;cafePlayer.y=ny}else{let bx={x:nx-15,y:cafePlayer.y-9,w:30,h:32},by={x:cafePlayer.x-15,y:ny-9,w:30,h:32};if(!cafeSolids.some(o=>hit(bx,o)))cafePlayer.x=nx;if(!cafeSolids.some(o=>hit(by,o)))cafePlayer.y=ny}animate(cafePlayer,m)}
function updateCamera(dt){const dz={l:330,r:630,t:185,b:355};let tx=camera.x,ty=camera.y,sx=player.x-camera.x,sy=player.y-camera.y;if(sx<dz.l)tx=player.x-dz.l;if(sx>dz.r)tx=player.x-dz.r;if(sy<dz.t)ty=player.y-dz.t;if(sy>dz.b)ty=player.y-dz.b;let k=Math.min(1,dt*8);camera.x+=(tx-camera.x)*k;camera.y+=(ty-camera.y)*k;camera.x=clamp(camera.x,0,WORLD_W-W);camera.y=clamp(camera.y,0,WORLD_H-H)}
function nearCafe(){return Math.hypot(player.x-(cafe.door.x+18),player.y-(cafe.door.y+45))<85}
function enter(){if(mode==='world'&&nearCafe()&&cooldown<=0){mode='cafe';syncBgm();cafePlayer={x:480,y:465,dir:'up',frame:2,t:0,moving:false};cooldown=.22}}
function exit(){if(mode==='cafe'&&cooldown<=0){mode='world';syncBgm();player.x=cafe.door.x+18;player.y=cafe.door.y+92;player.dir='down';camera.x=clamp(player.x-W/2,0,WORLD_W-W);camera.y=clamp(player.y-H/2,0,WORLD_H-H);cooldown=.28}}
function escHtml(s){return s.replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function renderChat(){chatLog.innerHTML=chatMessages.length?chatMessages.slice(-7).map(m=>`<div class="chat-row"><span class="who">${escHtml(m.name)}</span><span class="msg">${escHtml(m.text)}</span></div>`).join(''):'<div class="chat-empty">Enter를 눌러 이야기를 시작해보세요.</div>';chatLog.scrollTop=chatLog.scrollHeight}
function openChat(){if(chatActive)return;chatActive=true;for(const k in keys)keys[k]=false;document.body.classList.add('chatting');chatInputWrap.hidden=false;chatInput.value='';setTimeout(()=>chatInput.focus(),0)}
function closeChat(){chatActive=false;document.body.classList.remove('chatting');chatInputWrap.hidden=true;chatInput.blur();for(const k in keys)keys[k]=false}
function addChatMessage(name,text){chatMessages.push({name,text,time:Date.now()});if(chatMessages.length>50)chatMessages.shift();renderChat()}
function sendChat(){const value=chatInput.value.trim();if(!value){closeChat();return}const name=window.ZOO_USER?.nickname||'멍사자';addChatMessage(name,value);bubble={text:value,until:performance.now()+4200};if(window.ZooCafeNet?.connected)window.ZooCafeNet.sendChat(value);chatInput.value='';closeChat()}
function bubbleText(text,x,y){if(!text)return;ctx.save();ctx.font='800 13px Arial,"Noto Sans KR",sans-serif';const maxW=250,pad=10;let shown=text.length>34?text.slice(0,34)+'…':text;let tw=Math.min(maxW,ctx.measureText(shown).width+pad*2),bh=34,bx=clamp(x-tw/2,8,W-tw-8),by=clamp(y-82,8,H-bh-14);RR(bx,by,tw,bh,7,'rgba(255,249,229,.97)','#5a4031',3);ctx.fillStyle='#5a4031';ctx.beginPath();ctx.moveTo(clamp(x,bx+13,bx+tw-13),by+bh+8);ctx.lineTo(clamp(x-7,bx+9,bx+tw-18),by+bh-1);ctx.lineTo(clamp(x+7,bx+18,bx+tw-9),by+bh-1);ctx.closePath();ctx.fill();T(shown,bx+tw/2,by+17,13,'#49352b','center',800);ctx.restore()}
renderChat();
function drawRemote(r,camX=0,camY=0){const im=imgs[`${r.dir||'down'}-${r.frame||2}`];if(!im)return;const x=r.x-camX,y=r.y-camY;shadow(x,y+18,22,7,.13);ctx.drawImage(im,Math.round(x-SPRITE_W/2),Math.round(y-SPRITE_H+22),SPRITE_W,SPRITE_H);T(r.nickname||'친구',x,y-SPRITE_H+8,11,'#fff7e6','center',900);const b=remoteBubbles.get(r.id);if(b&&performance.now()<b.until)bubbleText(b.text,x,y);}
function drawRemotes(room,camX=0,camY=0){for(const r of remotePlayers.values())if(r.mode===room)drawRemote(r,camX,camY)}
function draw(){ctx.clearRect(0,0,W,H);if(mode==='world'){ctx.save();ctx.translate(-Math.round(camera.x),-Math.round(camera.y));drawWorld();sprite(player,player.x,player.y);for(const r of remotePlayers.values())if(r.mode==='world')drawRemote(r,0,0);ctx.restore();if(performance.now()<bubble.until)bubbleText(bubble.text,player.x-camera.x,player.y-camera.y);interaction.hidden=chatActive||!nearCafe();interactionText.textContent='카페 들어가기'}else{drawCafe();sprite(cafePlayer,cafePlayer.x,cafePlayer.y);for(const r of remotePlayers.values())if(r.mode==='cafe')drawRemote(r,0,0);if(performance.now()<bubble.until)bubbleText(bubble.text,cafePlayer.x,cafePlayer.y);interaction.hidden=true;RR(420,486,120,40,5,'rgba(54,43,34,.94)');RR(432,492,28,28,4,'#f5df9c');T('E',446,506,16,C.ink,'center',900);T('나가기',500,506,15,'#fff7e6','center',800)}}
function loop(now){let dt=Math.min(.033,(now-last)/1000);last=now;cooldown=Math.max(0,cooldown-dt);waterT+=dt;if(ready){if(mode==='world'){moveWorld();updateCamera(dt)}else moveCafe();window.ZooCafeNet?.tick?.();draw()}requestAnimationFrame(loop)}
addEventListener('keydown',e=>{let k=e.key.toLowerCase();if(chatActive){if(k==='escape'){e.preventDefault();closeChat()}return}if(k==='enter'){e.preventDefault();openChat();return}keys[k]=true;if(k.startsWith('arrow'))e.preventDefault();if(k==='e'){mode==='world'?enter():exit()}});
addEventListener('keyup',e=>{if(!chatActive)keys[e.key.toLowerCase()]=false});
chatInput.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closeChat();return}if(e.key==='Enter'&&!e.isComposing){e.preventDefault();sendChat()}});
chatInput.addEventListener('keyup',e=>e.stopPropagation());
chatInput.addEventListener('compositionstart',()=>{});
chatPanel.addEventListener('click',openChat);

addEventListener('pointerdown',startBgm,{once:true}); addEventListener('keydown',startBgm,{once:true});
window.ZooCafeAudio={setBgmVolume(v){bgmVolume=Math.max(0,Math.min(1,v));[cityBgm,cafeBgm].forEach(a=>{if(a)a.volume=bgmVolume;});},getBgmVolume(){return bgmVolume;},toggleBgm(on){bgmEnabled=!!on;if(bgmEnabled){bgmStarted=true;syncBgm();}else{[cityBgm,cafeBgm].forEach(a=>{if(a)a.pause();});}}};

window.ZooCafeGame={getState(){const p=mode==='world'?player:cafePlayer;return {mode,x:p.x,y:p.y,dir:p.dir,frame:p.frame,moving:p.moving}},setRoster(list){remotePlayers.clear();const me=window.ZOO_USER?.id;for(const r of list||[])if(r.id!==me)remotePlayers.set(r.id,r)},setRemote(r){if(r&&r.id!==window.ZOO_USER?.id)remotePlayers.set(r.id,r)},remoteChat(m){if(!m||m.id===window.ZOO_USER?.id)return;addChatMessage(m.nickname,m.text);remoteBubbles.set(m.id,{text:m.text,until:performance.now()+4200})},clearRemotes(){remotePlayers.clear();remoteBubbles.clear()}};

/* ================================================================
   ZOO:CAFE v14 — CLASSIC PIXEL NATURE PASS
   Hand-drawn canvas pixel world: waterfall, stream, ducks, wind,
   layered foliage, detailed grass/path, café garden and bridge.
   ================================================================ */
const nature={seed:4084,ducks:[{x:235,y:860,p:0},{x:475,y:930,p:1.7},{x:1240,y:890,p:3.1},{x:1570,y:1010,p:4.6}]};
function hash2(x,y){let n=(x*374761393+y*668265263+nature.seed*69069)|0;n=(n^(n>>13))*1274126177;return ((n^(n>>16))>>>0)/4294967295}
function pixelGrassPatch(x,y){
  const q=hash2(x,y); if(q>.76){px(x,y,2,7,'#397c3d');px(x+4,y-3,2,10,'#4f9848');px(x+8,y+1,2,6,'#2f7137')}
  else if(q>.62){px(x,y,3,3,'#a8d56a');px(x+6,y+4,2,2,'#5da34d')}
  else if(q>.54){px(x,y,2,2,'#d7d779');px(x+4,y-2,2,2,'#f0e9a1')}
}
function detailedTree(x,y,s=1,phase=0){
  const sway=Math.sin(waterT*1.35+phase+x*.007)*2.2*s;
  shadow(x,y+45*s,37*s,10*s,.18);
  // trunk and roots
  px(x-10*s,y+16*s,20*s,45*s,'#513828');px(x-6*s,y+17*s,12*s,43*s,'#765039');px(x-2*s,y+20*s,5*s,34*s,'#9b6846');
  px(x-18*s,y+54*s,16*s,6*s,'#513828');px(x+3*s,y+55*s,18*s,6*s,'#513828');
  // branch silhouettes
  px(x-23*s+sway,y+8*s,25*s,8*s,'#5e402e');px(x+1*s+sway,y+4*s,26*s,8*s,'#5e402e');
  const blobs=[[-28,5,22,'#2f6d3b'],[27,7,24,'#2f6d3b'],[-9,-17,29,'#397f40'],[8,-25,24,'#438c45'],[-38,24,19,'#33763d'],[37,25,20,'#33763d'],[-8,22,30,'#4b9146'],[17,16,25,'#438943']];
  for(const [dx,dy,r,c] of blobs){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x+(dx*s)+sway,y+dy*s,r*s,0,Math.PI*2);ctx.fill()}
  // blocky leaf clusters/highlights
  for(let i=0;i<15;i++){let a=hash2(Math.round(x)+i*7,Math.round(y));let dx=(-35+a*70)*s+sway,dy=(-35+hash2(i,Math.round(x))*63)*s;let c=i%3===0?'#9acb58':i%2?'#6eae4e':'#58a048';px(x+dx,y+dy,7*s,5*s,c)}
  // occasional tiny falling leaf
  if(((Math.floor(waterT*2)+Math.floor(x))%13)===0){let fy=((waterT*25+phase*17)%70);px(x+34*s+sway,y-5*s+fy,4*s,3*s,'#b6d568')}
}
function waterTile(x,y,w,h){
  R(x,y,w,h,'#3d9fc5');
  for(let yy=y+12;yy<y+h;yy+=28)for(let xx=x+8;xx<x+w;xx+=54){let off=Math.sin(waterT*2+xx*.03+yy*.02)*7;px(xx+off,yy,25,3,'#74cbe0');px(xx+13+off,yy+5,18,2,'#a8e3eb')}
}
function waterfall(x,y,w,h){
  // dark cliff behind water
  R(x-18,y-12,w+36,h+32,'#4c5d4c');
  for(let yy=y-8;yy<y+h+10;yy+=28)for(let xx=x-12;xx<x+w+12;xx+=30){let c=hash2(xx,yy)>.5?'#66715d':'#3f5145';px(xx,yy,25,18,c);px(xx+4,yy+3,14,4,'#7d856d')}
  R(x,y,w,h,'#55b6d5');
  for(let i=0;i<7;i++){let xx=x+8+i*(w-16)/7;let shift=(waterT*45+i*17)%28;for(let yy=y-28+shift;yy<y+h;yy+=28){px(xx,yy,5,17,'#9fe3ee');px(xx+5,yy+6,3,13,'#73cbe0')}}
  // foam
  for(let i=0;i<10;i++){let xx=x-5+i*(w+10)/9, bob=Math.sin(waterT*4+i)*3;px(xx,y+h-4+bob,15,5,'#d9f5f4');px(xx+5,y+h+3+bob,12,4,'#9de1e9')}
}
function duck(x,y,phase=0){
  const bob=Math.sin(waterT*3+phase)*2,dir=Math.sin(waterT*.35+phase)>0?1:-1;
  shadow(x,y+10+bob,18,5,.12);ctx.fillStyle='rgba(220,248,247,.65)';ctx.beginPath();ctx.ellipse(x-5*dir,y+10+bob,24,7,0,0,Math.PI*2);ctx.fill();
  px(x-13,y-6+bob,25,16,'#fff4cf');px(x-8,y-11+bob,16,8,'#fff9dc');px(x+8*dir,y-13+bob,13,13,'#fff7d9');px(x+13*dir,y-15+bob,4,4,'#3d342c');px(x+19*dir,y-9+bob,9*dir,5,'#e8a94d');px(x-7,y-2+bob,11,7,'#e9d6a5');
  // wake
  px(x-27*dir,y+14+bob,15,2,'#b8e8eb');px(x-34*dir,y+18+bob,20,2,'#8bd3df');
}
function pathTexture(x,y,w,h,seed=0){
  // Natural worn-earth texture: tiny pebbles, scuffs and grass at the edges.
  // No large rectangular stepping blocks.
  for(let yy=y+10;yy<y+h-8;yy+=19){
    for(let xx=x+12;xx<x+w-8;xx+=27){
      const q=hash2(Math.floor(xx+seed),Math.floor(yy-seed));
      if(q>.72){px(xx,yy,5,2,'#b58f58');px(xx+7,yy+2,3,2,'#e0bd7b')}
      else if(q>.58){px(xx,yy,2,2,'#9f7d50')}
    }
  }
  for(let yy=y+16;yy<y+h;yy+=34){
    if(hash2(seed,yy)>.45){px(x+3,yy,3,8,'#5d9b47');px(x+w-6,yy+7,3,7,'#4f8f43')}
  }
}
function cafeFootpath(cx,y0,y1){
  // A soft, irregular dirt trail leading to the café instead of block tiles.
  const w=92;
  R(cx-w/2,y0,w,y1-y0,'#c8a365');
  for(let y=y0;y<y1;y+=22){
    const edge=Math.round((hash2(y,91)-.5)*8);
    px(cx-w/2-2+edge,y,7,15,'#72b84f');
    px(cx+w/2-5-edge,y+8,7,14,'#72b84f');
  }
  pathTexture(cx-w/2,y0,w,y1-y0,91);
}
function ivyPixelLeaf(x,y,flip=1){
  // Small angular pixel leaves so the ivy reads as foliage, not green dots.
  px(x,y,7,4,'#356f3b');px(x+2*flip,y-4,6,5,'#4f9147');px(x+5*flip,y-7,4,4,'#70aa50');
}
function cafeExteriorRich(){
  // ivy backdrop and warm café façade
  shadow(cafe.x+cafe.w/2,cafe.y+cafe.h+20,205,20,.18);
  R(cafe.x-14,cafe.y-8,cafe.w+28,cafe.h+18,'#d9bd89','#4d3529',7);
  R(cafe.x-25,cafe.y-60,cafe.w+50,64,'#5d3e2e','#3f2c24',7);
  for(let x=cafe.x-16;x<cafe.x+cafe.w+16;x+=28){R(x,cafe.y-52,18,45,(Math.floor(x/28)%2)?'#81563c':'#6e4935')}
  RR(cafe.x+52,cafe.y+13,236,54,4,'#efd293','#4b3428',5);T('ZOO:CAFE',cafe.x+170,cafe.y+40,24,'#493226','center',900);
  // windows glow
  for(const xx of [cafe.x+24,cafe.x+255]){R(xx,cafe.y+92,61,69,'#563b2e','#3e2c24',5);R(xx+7,cafe.y+99,47,55,'#f1c56d');R(xx+10,cafe.y+102,41,49,'#8eb7a4');px(xx+29,cafe.y+100,4,52,'#4b382d');px(xx+8,cafe.y+125,45,4,'#4b382d')}
  R(cafe.door.x-7,cafe.y+86,50,118,'#51362b','#35251f',5);R(cafe.door.x,cafe.y+96,36,90,'#795039');R(cafe.door.x+7,cafe.y+104,22,36,'#9ac3b4');px(cafe.door.x+27,cafe.y+151,4,4,'#f5d267');
  // ivy: thin climbing stems + small pixel leaves around the façade edges
  ctx.strokeStyle='#3e7440';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cafe.x+8,cafe.y+10);ctx.lineTo(cafe.x+8,cafe.y+82);ctx.lineTo(cafe.x+22,cafe.y+112);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cafe.x+cafe.w-9,cafe.y+8);ctx.lineTo(cafe.x+cafe.w-10,cafe.y+72);ctx.lineTo(cafe.x+cafe.w-24,cafe.y+104);ctx.stroke();
  for(let i=0;i<7;i++){ivyPixelLeaf(cafe.x+5+(i%2)*5,cafe.y+17+i*14,i%2?1:-1);ivyPixelLeaf(cafe.x+cafe.w-12-(i%2)*5,cafe.y+14+i*14,i%2?-1:1)}
  for(let i=0;i<6;i++){ivyPixelLeaf(cafe.x+22+i*19,cafe.y+78+(i%2)*5,i%2?1:-1);ivyPixelLeaf(cafe.x+cafe.w-28-i*18,cafe.y+72+(i%2)*6,i%2?-1:1)}
  // flower boxes and lamps
  R(cafe.x+21,cafe.y+160,66,12,'#744832');R(cafe.x+253,cafe.y+160,66,12,'#744832');for(let i=0;i<8;i++){flower(cafe.x+27+i*8,cafe.y+159,i%2?'#ffd5dd':'#fff0b0');flower(cafe.x+259+i*8,cafe.y+159,i%2?'#d7c7ff':'#fff0b0')}
  lamp(cafe.x-38,cafe.y+117);lamp(cafe.x+cafe.w+38,cafe.y+117);
  RR(cafe.x+cafe.w+24,cafe.y+132,76,66,4,'#3e3b31','#5b3b2d',5);T('COFFEE',cafe.x+cafe.w+62,cafe.y+150,10,'#f5e4b8','center',900);T('FRIENDS',cafe.x+cafe.w+62,cafe.y+168,9,'#f5e4b8','center',800);T('♥',cafe.x+cafe.w+62,cafe.y+185,12,'#e7b55f','center',900)
}

function assetProp(path,x,y,w,h,anchorX=.5,anchorY=1){const im=ZA?.get(path);return assetSprite(im,x,y,w,h,anchorX,anchorY)}
function assetLily(x,y,variant=0){const im=ZA?.pick(ZA.manifest.waterDecor?.lilyPad,variant);if(im)assetSprite(im,x,y+10,32,32,.5,.5)}
function assetReeds(x,y,variant=0,phase=0){const im=ZA?.pick(ZA.manifest.waterDecor?.reeds,variant);if(!im)return;const sway=Math.sin(waterT*1.7+phase)*1.2;assetSprite(im,x+sway,y+14,32,32,.5,1)}
function assetShoreRocks(x,y,s=1){const im=ZA?.pick(ZA.manifest.waterDecor?.shoreRocks);if(im)assetSprite(im,x,y+8,64*s,32*s,.5,1)}
function assetBridge(x,y){const path=ZA?.manifest.props?.bridge,im=path&&ZA.get(path);if(im){shadow(x,y+34,76,12,.18);assetSprite(im,x,y+40,160,96,.5,1);return true}return false}

function drawWorld(){
  // meadow base with individually scattered pixel detail
  R(0,0,WORLD_W,WORLD_H,'#72b84f');
  for(let y=14;y<835;y+=18)for(let x=10;x<WORLD_W;x+=20)pixelGrassPatch(x,y);
  // darker forest edge / depth
  R(0,0,WORLD_W,44,'#396f3b');for(let x=0;x<WORLD_W;x+=36){px(x,34,24,14,'#4f8f43');px(x+12,27,20,14,'#5d9f48')}
  // main worn road: continuous packed earth with subtle pixel texture, no block paving
  R(0,405,WORLD_W,126,'#caa568');R(0,412,WORLD_W,4,'#dfbf7e');R(0,523,WORLD_W,5,'#aa8755');
  pathTexture(0,405,WORLD_W,126,17);
  R(742,0,124,835,'#c7a264');pathTexture(742,0,124,835,43);
  // soften the crossing so the two dirt paths blend as one natural road
  R(742,405,124,126,'#c8a466');pathTexture(742,405,124,126,57);
  // waterfall ravine in upper-left feeding the river
  waterfall(175,78,118,260);
  waterTile(110,326,250,510);
  // banks
  for(let y=335;y<835;y+=38){rock(112,y,.55);rock(360,y+17,.55);bush(132,y+12,.42);bush(340,y+3,.42)}
  // broad lower river
  waterTile(0,835,WORLD_W,285);R(0,835,WORLD_W,8,'#2f7e9c');
  for(let x=0;x<WORLD_W;x+=42){px(x,825,27,11,'#548f47');px(x+9,817,22,10,'#78b657')}
  // wooden bridge
  R(742,830,124,290,'#704832','#493225',6);for(let y=838;y<1110;y+=27){R(751,y,106,19,'#a56b45');px(756,y+4,95,3,'#c08455')}R(750,830,9,290,'#513529');R(849,830,9,290,'#513529');
  // narrow worn trail to the café
  cafeFootpath(936,350,815);
  // dense tree layers with wind animation
  [[62,120,1.22,.2],[350,205,1.05,1],[505,90,.95,2],[1240,92,1.18,3],[1505,185,1.2,4],[1760,120,1.1,5],[80,575,1.2,6],[430,685,1.05,7],[1160,650,1.12,8],[1435,675,1.28,9],[1660,720,1.05,10],[1810,545,1.2,11],[610,665,.9,12]].forEach(a=>detailedTree(...a));
  [[500,290,.9],[650,250,.75],[1180,270,.9],[1490,560,1],[965,690,.8],[540,770,.9],[1690,365,.8]].forEach(a=>bush(...a));
  // flowers / grasses
  for(let i=0;i<34;i++){let x=35+hash2(i,31)*1840,y=100+hash2(i,77)*690;if(x>720&&x<890)continue;flower(x,y,['#fff0bd','#ffd1dc','#d9ccff','#fff7e0'][i%4])}
  for(let i=0;i<26;i++){let x=40+hash2(i,14)*1800,y=80+hash2(i,19)*710;grassTuft(x,y)}
  // garden furniture and village details
  fence(415,342,5);fence(1180,337,5);fence(1320,615,5);bench(470,350);bench(1230,356);bench(1035,650);lamp(675,370);lamp(1120,365);lamp(1085,650);sign(590,355,'CAFE');sign(1270,580,'GARDEN');rock(675,165,.9);rock(1450,430,.8);
  cafeExteriorRich();
  // café terrace
  R(1130,235,120,8,'#8b5a3d');pot(1150,235,.8);pot(1215,235,.8);
  // ducks are actual animated world objects
  for(const d of nature.ducks){let drift=Math.sin(waterT*.42+d.p)*22;duck(d.x+drift,d.y,d.p)}
  // lily pads
}


/* ================================================================
   ZOO:CAFE v16 — ASSET RENDERER
   From here on, map graphics come from /assets. Existing canvas art
   remains as a fallback while the final ZOO:CAFE tileset is produced.
   ================================================================ */
const ZA=window.ZooAssets;
function assetTileImage(group,index=0){return ZA?.pick(group,index)}
function drawAssetTiled(im,x,y,w,h,size=32){if(!im)return false;for(let yy=y;yy<y+h;yy+=size)for(let xx=x;xx<x+w;xx+=size){ctx.drawImage(im,0,0,im.width,im.height,Math.round(xx),Math.round(yy),Math.min(size,x+w-xx),Math.min(size,y+h-yy))}return true}
function assetSprite(im,x,y,w=im?.width,h=im?.height,anchorX=.5,anchorY=1){if(!im)return false;ctx.drawImage(im,Math.round(x-w*anchorX),Math.round(y-h*anchorY),Math.round(w),Math.round(h));return true}
function assetWater(x,y,w,h){const frames=ZA?.manifest.water.frames;const im=frames&&ZA.pick(frames,Math.floor(waterT*3));if(!drawAssetTiled(im,x,y,w,h,32))waterTile(x,y,w,h)}
function assetTree(x,y,s=1,variant=0,phase=0){const im=ZA?.pick(ZA.manifest.nature.tree,variant);if(!im){detailedTree(x,y,s,phase);return}const sway=Math.sin(waterT*1.25+phase)*1.5*s;shadow(x,y+2,35*s,9*s,.16);assetSprite(im,x+sway,y+18*s,96*s,128*s,.5,1)}
function assetBush(x,y,s=1){const im=ZA?.pick(ZA.manifest.nature.bush);if(!im){bush(x,y,s);return}assetSprite(im,x,y+16*s,64*s,48*s,.5,1)}
function assetRock(x,y,s=1){const im=ZA?.pick(ZA.manifest.nature.rock);if(!im){rock(x,y,s);return}assetSprite(im,x,y+12*s,48*s,36*s,.5,1)}
function assetFlower(x,y,variant=0){const im=ZA?.pick(ZA.manifest.nature.flower,variant);if(!im){flower(x,y);return}assetSprite(im,x,y+12,32,32,.5,1)}
function assetGrassTuft(x,y,variant=0,phase=0){const im=ZA?.pick(ZA.manifest.nature.grassTuft,variant);if(!im){grassTuft(x,y);return}const sway=Math.sin(waterT*1.6+phase)*1.1;assetSprite(im,x+sway,y+12,32,32,.5,1)}
function assetDuck(x,y,phase=0){const im=ZA?.pick(ZA.manifest.animals.duck,Math.floor(waterT*3+phase));if(!im){duck(x,y,phase);return}const bob=Math.sin(waterT*3+phase)*2;assetSprite(im,x,y+18+bob,48,40,.5,1)}
function assetWaterfall(x,y,w,h){const frames=ZA?.manifest.water.waterfall;const im=frames&&ZA.pick(frames,Math.floor(waterT*5));if(!im){waterfall(x,y,w,h);return}R(x-18,y-12,w+36,h+28,'#4c5d4c');for(let yy=y;yy<y+h;yy+=64)for(let xx=x;xx<x+w;xx+=64)ctx.drawImage(im,xx,yy,Math.min(64,x+w-xx),Math.min(64,y+h-yy))}

function assetProp(path,x,y,w,h,anchorX=.5,anchorY=1){const im=ZA?.get(path);return assetSprite(im,x,y,w,h,anchorX,anchorY)}
function assetLily(x,y,variant=0){const im=ZA?.pick(ZA.manifest.waterDecor?.lilyPad,variant);if(im)assetSprite(im,x,y+10,32,32,.5,.5)}
function assetReeds(x,y,variant=0,phase=0){const im=ZA?.pick(ZA.manifest.waterDecor?.reeds,variant);if(!im)return;const sway=Math.sin(waterT*1.7+phase)*1.2;assetSprite(im,x+sway,y+14,32,32,.5,1)}
function assetShoreRocks(x,y,s=1){const im=ZA?.pick(ZA.manifest.waterDecor?.shoreRocks);if(im)assetSprite(im,x,y+8,64*s,32*s,.5,1)}
function assetBridge(x,y){const path=ZA?.manifest.props?.bridge,im=path&&ZA.get(path);if(im){shadow(x,y+34,76,12,.18);assetSprite(im,x,y+40,160,96,.5,1);return true}return false}

function drawWorld(){
  // Ground layer: replace grass PNGs later and the whole map updates automatically.
  const grasses=ZA?.manifest.terrain.grass;
  if(grasses){for(let y=0;y<WORLD_H;y+=32)for(let x=0;x<WORLD_W;x+=32){const idx=Math.floor(hash2(x,y)*grasses.length);const im=ZA.pick(grasses,idx);if(im)ctx.drawImage(im,x,y,32,32)}}else R(0,0,WORLD_W,WORLD_H,'#72b84f');
  R(0,0,WORLD_W,44,'#396f3b');for(let x=0;x<WORLD_W;x+=36){px(x,34,24,14,'#4f8f43');px(x+12,27,20,14,'#5d9f48')}
  // Roads are now tile assets.
  const path=ZA?.pick(ZA.manifest.terrain.path);if(!drawAssetTiled(path,0,405,WORLD_W,126,32)){R(0,405,WORLD_W,126,'#caa568');pathTexture(0,405,WORLD_W,126,17)}
  if(!drawAssetTiled(path,742,0,124,835,32)){R(742,0,124,835,'#c7a264');pathTexture(742,0,124,835,43)}
  drawAssetTiled(path,742,405,124,126,32);
  // Animated water assets.
  assetWaterfall(175,78,118,260);assetWater(110,326,250,510);
  for(let y=335;y<835;y+=46){assetRock(112,y,.55);assetRock(360,y+17,.55);assetBush(132,y+12,.42);assetBush(340,y+3,.42)}
  assetWater(0,835,WORLD_W,285);R(0,835,WORLD_W,8,'#2f7e9c');
  for(let x=0;x<WORLD_W;x+=42){px(x,825,27,11,'#548f47');px(x+9,817,22,10,'#78b657')}
  // Water-garden pass: shoreline clusters, reeds, lily pads and a real bridge asset.
  for(const [x,y,s] of [[108,390,.85],[360,455,.8],[110,590,.9],[360,690,.82],[70,842,.9],[520,842,.9],[1060,842,.9],[1510,842,.9]]) assetShoreRocks(x,y,s);
  for(const [x,y,v,p] of [[145,430,0,.2],[330,520,1,1.1],[138,650,1,2],[342,740,0,3],[610,905,1,4],[1290,965,0,5],[1650,900,1,6]]) assetReeds(x,y,v,p);
  for(const [x,y,v] of [[170,500,0],[285,615,1],[155,755,0],[520,900,1],[650,1010,0],[1210,920,1],[1390,1010,0],[1700,930,1]]) assetLily(x,y,v);
  // Bridge is now replaceable through assets/props/bridge_01.png.
  if(!assetBridge(804,945)){R(742,830,124,290,'#704832','#493225',6);for(let y=838;y<1110;y+=27){R(751,y,106,19,'#a56b45');px(756,y+4,95,3,'#c08455')}}
  cafeFootpath(936,350,815);
  const trees=[[62,120,1.22,.2],[350,205,1.05,1],[505,90,.95,2],[1240,92,1.18,3],[1505,185,1.2,4],[1760,120,1.1,5],[80,575,1.2,6],[430,685,1.05,7],[1160,650,1.12,8],[1435,675,1.28,9],[1660,720,1.05,10],[1810,545,1.2,11],[610,665,.9,12]];
  trees.forEach((a,i)=>assetTree(a[0],a[1],a[2],i%3,a[3]));
  [[500,290,.9],[650,250,.75],[1180,270,.9],[1490,560,1],[965,690,.8],[540,770,.9],[1690,365,.8]].forEach(a=>assetBush(...a));
  for(let i=0;i<34;i++){let x=35+hash2(i,31)*1840,y=100+hash2(i,77)*690;if(x>720&&x<890)continue;assetFlower(x,y,i%3)}
  for(let i=0;i<34;i++){let x=40+hash2(i,14)*1800,y=80+hash2(i,19)*710;assetGrassTuft(x,y,i%2,i*.7)}
  fence(415,342,5);fence(1320,615,5);bench(470,350);bench(1035,650);lamp(675,370);lamp(1085,650);sign(590,355,'CAFE');sign(1270,580,'GARDEN');assetRock(675,165,.9);assetRock(1450,430,.8);
  cafeExteriorRich();R(1130,235,120,8,'#8b5a3d');pot(1150,235,.8);pot(1215,235,.8);
  for(const d of nature.ducks){let drift=Math.sin(waterT*.42+d.p)*22;assetDuck(d.x+drift,d.y,d.p)}
  for(const [x,y] of [[120,970],[590,900],[1320,980],[1710,910]]){ctx.fillStyle='#4f994c';ctx.beginPath();ctx.ellipse(x,y,17,8,0,0,Math.PI*2);ctx.fill();px(x+1,y-3,9,3,'#72b85b')}
}

/* ================================================================
   ZOO:CAFE v20 — COZY TIMBER CAFE + CLEAN TERRACE LAYOUT
   The frontage uses a richer asymmetrical timber café asset and a
   deliberately spaced prop layout so tables, signs and lights do not
   overlap each other.
   ================================================================ */
function cafeExteriorRich(){
  const buildingPath=ZA?.manifest.buildings?.cafeExterior;
  const building=buildingPath&&ZA.get(buildingPath);
  if(!building){cafeExterior();return}
  const cx=cafe.x+cafe.w/2, baseY=cafe.y+cafe.h+22;
  shadow(cx,baseY,238,24,.20);
  // richer building silhouette; the gameplay collision box stays unchanged
  assetSprite(building,cx,baseY,450,330,.5,1);

  const table=ZA.get(ZA.manifest.props.cafeTable);
  const umbrella=ZA.get(ZA.manifest.props.umbrella);
  const planter=ZA.get(ZA.manifest.props.planter);
  const board=ZA.get(ZA.manifest.props.chalkboard);
  const barrel=ZA.get(ZA.manifest.props.barrelPlanter);

  // One continuous terrace instead of a pile of independent objects.
  const patioY=cafe.y+cafe.h+30;
  R(cafe.x-132,patioY,cafe.w+264,70,'#b99662');
  px(cafe.x-132,patioY, cafe.w+264,4,'#d3b278');
  for(let x=cafe.x-108;x<cafe.x+cafe.w+110;x+=48)
    RR(x,patioY+15+(Math.floor(x/48)%2)*4,38,17,5,'#d8bb82','#9d7c55',2);

  // Left seating zone: umbrella behind table, enough breathing room from sign/lamp.
  if(umbrella) assetSprite(umbrella,cafe.x-142,patioY+59,112,106,.5,1);
  if(table) assetSprite(table,cafe.x-142,patioY+70,96,72,.5,1);
  if(barrel) assetSprite(barrel,cafe.x-222,patioY+58,58,58,.5,1);

  // Right seating zone. Board sits beside the building, not inside the table.
  if(board) assetSprite(board,cafe.x+cafe.w+46,patioY+24,70,70,.5,1);
  if(table) assetSprite(table,cafe.x+cafe.w+148,patioY+70,96,72,.5,1);
  if(barrel) assetSprite(barrel,cafe.x+cafe.w+220,patioY+58,58,58,.5,1);

  // Planters hug the façade and never occupy the seating footprints.
  if(planter){
    assetSprite(planter,cafe.x+38,cafe.y+cafe.h+22,68,56,.5,1);
    assetSprite(planter,cafe.x+cafe.w-38,cafe.y+cafe.h+22,68,56,.5,1);
  }

  // Two edge lamps frame the terrace rather than cutting through furniture.
  const glow=.58+.18*Math.sin(waterT*2.2);
  for(const [lx,ly] of [[cafe.x-206,patioY+60],[cafe.x+cafe.w+206,patioY+60]]){
    ctx.save();ctx.globalAlpha=glow;ctx.fillStyle='#f4c969';ctx.beginPath();ctx.arc(lx,ly-31,9,0,Math.PI*2);ctx.fill();ctx.restore();
    R(lx-3,ly-31,6,47,'#4d372c');RR(lx-9,ly-43,18,18,2,'#f1c86d','#49342a',3);
  }
}



/* ================================================================
   ZOO:CAFE v21 — GRAND PLAZA / LARGE CAMERA WORLD
   Large exploration map built from the asset system: café garden,
   waterfall creek, bridge, forest lanes, pond and animated wildlife.
   ================================================================ */
function drawV21Path(x,y,w,h,vertical=false){
  const path=ZA?.pick(ZA.manifest.terrain.path);
  if(!drawAssetTiled(path,x,y,w,h,32)){R(x,y,w,h,'#c7a264');pathTexture(x,y,w,h,vertical?43:17)}
}
function drawV21Stream(){
  // upper waterfall -> winding creek -> lower pond/river
  assetWaterfall(250,70,150,300);
  assetWater(205,350,240,960);
  for(let y=370;y<1300;y+=70){
    assetShoreRocks(202,y,.72); assetShoreRocks(448,y+24,.72);
    if((y/70|0)%2===0){assetReeds(226,y+28,(y/70|0)%2,y*.01);assetReeds(425,y+48,1,y*.013)}
  }
  assetWater(0,1300,1040,500);
  for(let x=20;x<1020;x+=96){assetShoreRocks(x,1302,.78); if((x/96|0)%2)assetReeds(x+35,1335,0,x*.01)}
  // bridge across the creek
  if(!assetBridge(325,850)){R(245,810,160,80,'#85573c','#4b3428',5)}
  // water life
  for(const [x,y,v] of [[270,510,0],[385,610,1],[260,1010,1],[390,1170,0],[180,1450,0],[520,1510,1],[780,1410,0]])assetLily(x,y,v);
  const ducks=[[315,470,.3],[345,720,1.5],[300,1080,2.6],[250,1450,3.7],[610,1530,5.1]];
  for(const [x,y,p] of ducks)assetDuck(x+Math.sin(waterT*.35+p)*24,y,p);
}
function drawV21Forest(){
  const trees=[];
  // top forest wall
  for(let x=60,i=0;x<WORLD_W-40;x+=125,i++)trees.push([x,105,1.2,i*.45]);
  // left creek forest and right deep forest
  for(let y=300,i=0;y<1260;y+=145,i++){trees.push([80,y,1.12,i*.6]);trees.push([540,y+45,1.0,i*.7]);trees.push([2440,y,1.2,i*.5]);trees.push([2710,y+60,1.15,i*.55]);}
  // southern grove
  for(let x=1180,i=0;x<2740;x+=155,i++)trees.push([x,1600+(i%2)*65,1.18,i*.4]);
  trees.forEach((a,i)=>assetTree(a[0],a[1],a[2],i%3,a[3]));
  // understory
  for(let i=0;i<38;i++){const x=hash2(i,401)*WORLD_W,y=170+hash2(i,607)*1420;if(x>1100&&x<1850&&y>350&&y<1100)continue;assetBush(x,y,.65+hash2(i,90)*.35)}
}
function drawV21Garden(){
  // café plaza and terrace
  drawV21Path(1080,690,700,170,false);
  drawV21Path(1370,0,120,1320,true);
  drawV21Path(760,790,1620,110,false);
  // small stepping route toward pond
  for(let i=0;i<8;i++)RR(1180+i*92,1110+(i%2)*8,70,34,10,'#d9bb82','#9d7c55',3);
  // garden boundaries and benches
  fence(1020,745,5);fence(1780,745,5);fence(1080,1030,5);fence(1840,1030,5);
  bench(1030,920);bench(1840,920);bench(1640,1130);
  lamp(1160,850);lamp(1710,850);lamp(1290,1080);lamp(1770,1080);
  sign(970,845,'CAFE');sign(1900,845,'FOREST');sign(1060,1180,'POND');
  // flower beds
  for(let i=0;i<26;i++){
    const side=i%2?-1:1, x=1430+side*(220+hash2(i,33)*300), y=930+hash2(i,72)*250;
    assetFlower(x,y,i%3); if(i%3===0)assetGrassTuft(x+14,y+8,i%2,i*.4);
  }
  cafeExteriorRich();
}
function drawV21RightForestPath(){
  drawV21Path(2120,620,150,760,true);
  drawV21Path(2120,620,520,110,false);
  // forest tunnel arch made from dense trees and rocks
  assetRock(2310,620,1.4);assetRock(2425,620,1.25);
  assetTree(2320,585,1.35,1,2);assetTree(2425,585,1.35,2,3);
  RR(2342,602,64,82,30,'#273a2d','#49382c',6);
  T('숲길',2374,705,12,'#f3ddb0','center',900);
  for(let i=0;i<6;i++){assetFlower(2050+i*95,760+(i%2)*22,i%3);assetGrassTuft(2080+i*92,735,i%2,i)}
}
function drawWorld(){
  // 1) meadow tiles across the full 2880x1800 world
  const grasses=ZA?.manifest.terrain.grass;
  if(grasses){for(let y=0;y<WORLD_H;y+=32)for(let x=0;x<WORLD_W;x+=32){const im=ZA.pick(grasses,Math.floor(hash2(x,y)*grasses.length));if(im)ctx.drawImage(im,x,y,32,32)}}else R(0,0,WORLD_W,WORLD_H,'#72b84f');
  // subtle forest horizon
  R(0,0,WORLD_W,55,'#396f3b');for(let x=0;x<WORLD_W;x+=40){px(x,42,27,16,'#4f8f43');px(x+15,34,22,17,'#5d9f48')}
  // 2) environmental zones
  drawV21Stream();
  drawV21Forest();
  drawV21Garden();
  drawV21RightForestPath();
  // 3) meadow detail kept sparse around roads
  for(let i=0;i<72;i++){
    const x=55+hash2(i,31)*(WORLD_W-110),y=170+hash2(i,77)*(WORLD_H-330);
    if((x>1030&&x<1900&&y>360&&y<1250)||(x>180&&x<500&&y>300))continue;
    assetFlower(x,y,i%3);
  }
  for(let i=0;i<60;i++){
    const x=45+hash2(i,114)*(WORLD_W-90),y=160+hash2(i,219)*(WORLD_H-300);
    assetGrassTuft(x,y,i%2,i*.37);
  }
  // rocks and rest points
  [[720,430,.9],[850,1190,1],[1980,420,.8],[2550,1180,1.1],[1160,1450,.9],[2050,1480,1]].forEach(a=>assetRock(...a));
  bench(720,690);bench(2500,850);lamp(830,770);lamp(2300,850);
}

/* ================================================================
   ZOO:CAFE v22 — THREE ENTERABLE BUILDINGS
   Adds three distinct exterior buildings and blank multiplayer rooms.
   ================================================================ */
const extraBuildings=[
  {id:'bookshop',name:'숲속 책방',x:690,y:1120,w:300,h:210,door:{x:824,y:1270,w:34,h:54},accent:'#7e4f39',roof:'#4f3b35',wall:'#e4c98f'},
  {id:'workshop',name:'공방',x:1880,y:1080,w:320,h:220,door:{x:2023,y:1238,w:34,h:56},accent:'#5f7450',roof:'#49604a',wall:'#d9c89a'},
  {id:'lodge',name:'동물회관',x:2310,y:1260,w:350,h:235,door:{x:2468,y:1435,w:36,h:58},accent:'#8a5d3f',roof:'#694536',wall:'#e2c48e'}
];
for(const b of extraBuildings)worldSolids.push({x:b.x,y:b.y,w:b.w,h:b.h-48});
function drawExtraBuilding(b,kind){
  shadow(b.x+b.w/2,b.y+b.h+12,b.w*.48,17,.16);
  // stone foundation + timber body
  R(b.x+8,b.y+18,b.w-16,b.h-18,b.wall,'#49342b',6);
  for(let x=b.x+18;x<b.x+b.w-18;x+=42)R(x,b.y+b.h-24,28,16,'#b99a69');
  // deep roof gives each building a stronger silhouette
  if(kind===0){
    ctx.fillStyle=b.roof;ctx.beginPath();ctx.moveTo(b.x-18,b.y+34);ctx.lineTo(b.x+45,b.y-30);ctx.lineTo(b.x+b.w-42,b.y-30);ctx.lineTo(b.x+b.w+18,b.y+34);ctx.closePath();ctx.fill();ctx.strokeStyle='#3c2b25';ctx.lineWidth=7;ctx.stroke();
  }else if(kind===1){
    R(b.x-16,b.y-25,b.w+32,68,b.roof,'#3c3329',7);for(let x=b.x-7;x<b.x+b.w+5;x+=32)R(x,b.y-18,21,52,kind===1?'#587153':'#7c513c');
  }else{
    ctx.fillStyle=b.roof;ctx.beginPath();ctx.moveTo(b.x-22,b.y+38);ctx.lineTo(b.x+b.w/2,b.y-48);ctx.lineTo(b.x+b.w+22,b.y+38);ctx.closePath();ctx.fill();ctx.strokeStyle='#422e27';ctx.lineWidth=8;ctx.stroke();
  }
  // signboard
  RR(b.x+55,b.y+42,b.w-110,48,5,'#f1d79b','#51372c',5);T(b.name,b.x+b.w/2,b.y+66,kind===2?20:21,'#493329','center',900);
  // timber framing
  R(b.x+20,b.y+96,10,b.h-118,b.accent);R(b.x+b.w-30,b.y+96,10,b.h-118,b.accent);R(b.x+30,b.y+105,b.w-60,8,b.accent);
  // windows
  for(const wx of [b.x+48,b.x+b.w-102]){R(wx,b.y+122,54,52,'#4b392f','#3b2a24',5);R(wx+6,b.y+128,42,40,'#91b9ae');R(wx+25,b.y+128,4,40,'#4a392f');R(wx+6,b.y+146,42,4,'#4a392f')}
  // entrance
  R(b.door.x-7,b.door.y-12,b.door.w+14,b.door.h+12,'#4a3329');R(b.door.x,b.door.y,b.door.w,b.door.h,b.accent);R(b.door.x+7,b.door.y+8,b.door.w-14,24,'#9dc4b8');px(b.door.x+b.door.w-9,b.door.y+38,4,4,'#f4d36e');
  // individual decoration
  if(kind===0){T('BOOKS · TEA',b.x+b.w/2,b.y+101,10,'#76533c','center',800);pot(b.x+26,b.y+b.h-20,.8);pot(b.x+b.w-26,b.y+b.h-20,.8)}
  if(kind===1){RR(b.x+b.w-72,b.y+74,48,30,3,'#3e4637','#49352b',4);T('OPEN',b.x+b.w-48,b.y+89,9,'#f1dfb4','center',900);R(b.x+22,b.y+b.h-28,58,14,'#916344')}
  if(kind===2){for(let i=0;i<5;i++)flower(b.x+70+i*52,b.y+b.h-8,i%2?'#ffd6de':'#fff0ad');T('WELCOME',b.x+b.w/2,b.y+103,10,'#76533c','center',800)}
}
const drawWorldV21Base=drawWorld;
drawWorld=function(){drawWorldV21Base();extraBuildings.forEach((b,i)=>drawExtraBuilding(b,i));};
function nearestEntrance(){
  let best=null,dist=Infinity;
  const all=[{id:'cafe',name:'ZOO:CAFE',door:cafe.door},...extraBuildings];
  for(const b of all){const d=Math.hypot(player.x-(b.door.x+b.door.w/2),player.y-(b.door.y+b.door.h));if(d<dist){dist=d;best=b}}
  return dist<92?best:null;
}
nearCafe=function(){return !!nearestEntrance();};
enter=function(){
  if(mode!=='world'||cooldown>0)return;const b=nearestEntrance();if(!b)return;
  mode=b.id;syncBgm();cafePlayer={x:480,y:455,dir:'up',frame:2,t:0,moving:false};cooldown=.25;
};
exit=function(){
  if(mode==='world'||cooldown>0)return;
  const b=mode==='cafe'?{door:cafe.door}:extraBuildings.find(v=>v.id===mode);mode='world';syncBgm();
  if(b){player.x=b.door.x+b.door.w/2;player.y=b.door.y+b.door.h+55}player.dir='down';camera.x=clamp(player.x-W/2,0,WORLD_W-W);camera.y=clamp(player.y-H/2,0,WORLD_H-H);cooldown=.28;
};
function drawBlankInterior(room){
  const b=extraBuildings.find(v=>v.id===room);const accent=b?.accent||'#795039';
  R(0,0,W,H,'#e9d6ac');R(0,0,W,205,'#e6d1a4');R(0,205,W,8,'#6b4935');R(0,213,W,H-213,'#b77e57');
  for(let y=220;y<H;y+=30){R(0,y,W,2,'rgba(100,64,45,.22)');for(let x=(y%60?30:0);x<W;x+=150)R(x,y,2,30,'rgba(100,64,45,.12)')}
  // empty room shell ready for future furnishing
  R(50,48,860,118,'#d8bd8b','#684735',5);RR(315,72,330,62,5,'#f2d99f','#5b3d30',5);T(b?.name||'건물',480,103,28,'#4a3329','center',900);
  for(const x of [105,750]){R(x,78,105,75,'#523a30','#3d2b25',5);R(x+8,86,89,59,'#9bc1b5');R(x+50,86,5,59,'#4b392f');R(x+8,113,89,5,'#4b392f')}
  R(430,448,100,72,accent,'#493229',6);R(446,460,68,38,'#9bc1b5');T('E  나가기',480,505,15,'#fff4d7','center',900);
  T('아직 비어 있는 공간입니다 · 다음 단계에서 꾸밀 수 있어요',480,188,13,'#7a5a45','center',700);
}
const moveIndoor=moveCafe;
moveCafe=function(){moveIndoor();};
draw=function(){
  ctx.clearRect(0,0,W,H);
  if(mode==='world'){
    ctx.save();ctx.translate(-Math.round(camera.x),-Math.round(camera.y));drawWorld();sprite(player,player.x,player.y);for(const r of remotePlayers.values())if(r.mode==='world')drawRemote(r,0,0);ctx.restore();
    if(performance.now()<bubble.until)bubbleText(bubble.text,player.x-camera.x,player.y-camera.y);
    const n=nearestEntrance();interaction.hidden=chatActive||!n;interactionText.textContent=n?`${n.name} 들어가기`:'들어가기';
  }else{
    if(mode==='cafe')drawCafe();else drawBlankInterior(mode);
    sprite(cafePlayer,cafePlayer.x,cafePlayer.y);for(const r of remotePlayers.values())if(r.mode===mode)drawRemote(r,0,0);
    if(performance.now()<bubble.until)bubbleText(bubble.text,cafePlayer.x,cafePlayer.y);interaction.hidden=true;
    RR(420,486,120,40,5,'rgba(54,43,34,.94)');RR(432,492,28,28,4,'#f5df9c');T('E',446,506,16,C.ink,'center',900);T('나가기',500,506,15,'#fff7e6','center',800);
  }
};
window.ZooCafeGame.getState=function(){const p=mode==='world'?player:cafePlayer;return {mode,x:p.x,y:p.y,dir:p.dir,frame:p.frame,moving:p.moving}};

// v23 mobile-first controls: analog virtual joystick + touch interaction/chat.
(function setupMobileControls(){
  const stick=document.getElementById('virtualStick'),knob=document.getElementById('stickKnob');
  const action=document.getElementById('mobileActionBtn'),chatBtn=document.getElementById('mobileChatBtn');
  if(!stick||!knob||!action)return;
  let pointer=null;
  function setStick(e){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.31;let x=e.clientX-cx,y=e.clientY-cy;const d=Math.hypot(x,y)||1;if(d>max){x=x/d*max;y=y/d*max}knob.style.transform=`translate(${x}px,${y}px)`;mobileMove.x=x/max;mobileMove.y=y/max;mobileMove.active=true;startBgm()}
  function release(e){if(pointer!==null&&e&&e.pointerId!==pointer)return;pointer=null;mobileMove.x=mobileMove.y=0;mobileMove.active=false;knob.style.transform='translate(0px,0px)'}
  stick.addEventListener('pointerdown',e=>{pointer=e.pointerId;stick.setPointerCapture?.(e.pointerId);setStick(e);e.preventDefault()});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===pointer){setStick(e);e.preventDefault()}});
  stick.addEventListener('pointerup',release);stick.addEventListener('pointercancel',release);stick.addEventListener('lostpointercapture',release);
  action.addEventListener('pointerdown',e=>{e.preventDefault();startBgm();if(chatActive){closeChat();return}mode==='world'?enter():exit()});
  chatBtn?.addEventListener('pointerdown',e=>{e.preventDefault();chatActive?closeChat():openChat()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
})();

// v24 — phone view: show more of the map and keep chat collapsed by default.
(function setupMobileViewV24(){
  const coarse=window.matchMedia?.('(hover:none) and (pointer:coarse)').matches;
  if(!coarse)return;
  const MOBILE_WORLD_SCALE=.78;
  const oldUpdateCamera=updateCamera;
  updateCamera=function(dt){
    const vw=W/MOBILE_WORLD_SCALE,vh=H/MOBILE_WORLD_SCALE;
    const dz={l:vw*.34,r:vw*.66,t:vh*.34,b:vh*.66};
    let tx=camera.x,ty=camera.y,sx=player.x-camera.x,sy=player.y-camera.y;
    if(sx<dz.l)tx=player.x-dz.l;if(sx>dz.r)tx=player.x-dz.r;
    if(sy<dz.t)ty=player.y-dz.t;if(sy>dz.b)ty=player.y-dz.b;
    const k=Math.min(1,dt*8);camera.x+=(tx-camera.x)*k;camera.y+=(ty-camera.y)*k;
    camera.x=clamp(camera.x,0,WORLD_W-vw);camera.y=clamp(camera.y,0,WORLD_H-vh);
  };
  const oldDraw=draw;
  draw=function(){
    if(mode!=='world'){oldDraw();return;}
    ctx.clearRect(0,0,W,H);
    ctx.save();ctx.scale(MOBILE_WORLD_SCALE,MOBILE_WORLD_SCALE);ctx.translate(-Math.round(camera.x),-Math.round(camera.y));
    drawWorld();sprite(player,player.x,player.y);for(const r of remotePlayers.values())if(r.mode==='world')drawRemote(r,0,0);ctx.restore();
    if(performance.now()<bubble.until)bubbleText(bubble.text,(player.x-camera.x)*MOBILE_WORLD_SCALE,(player.y-camera.y)*MOBILE_WORLD_SCALE);
    const n=nearestEntrance();interaction.hidden=chatActive||!n;interactionText.textContent=n?`${n.name} 들어가기`:'들어가기';
  };

  const panel=document.getElementById('chatPanel');
  const chatBtn=document.getElementById('mobileChatBtn');
  document.body.classList.remove('mobile-chat-open');
  chatBtn?.addEventListener('pointerdown',e=>{
    e.stopImmediatePropagation();e.preventDefault();
    if(chatActive){closeChat();document.body.classList.remove('mobile-chat-open');return;}
    document.body.classList.toggle('mobile-chat-open');
  },true);
  panel?.addEventListener('click',()=>{document.body.classList.add('mobile-chat-open')});
})();
