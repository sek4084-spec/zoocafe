/* ZOO:CAFE v8 — full-screen social game client
   Layered canvas renderer, proportional furniture, collisions, animated water,
   outdoor camera dead-zone, and a denser hand-crafted pixel world.
*/
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
const interaction=document.getElementById('interaction'),interactionText=document.getElementById('interactionText');
const chatPanel=document.getElementById('chatPanel'),chatLog=document.getElementById('chatLog'),chatInputWrap=document.getElementById('chatInputWrap'),chatInput=document.getElementById('chatInput');
let chatActive=false,chatMessages=[],bubble={text:'',until:0};
const remotePlayers=new Map(), remoteBubbles=new Map();
const W=canvas.width,H=canvas.height,WORLD_W=1920,WORLD_H=1120,SPEED=3.05,PS=54,PH=PS/2,SPRITE_W=66,SPRITE_H=78;
const keys=Object.create(null),imgs={};let ready=false,loaded=0,last=performance.now(),mode='world',cooldown=0,waterT=0;
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
let player={x:960,y:510,dir:'down',frame:2,t:0,moving:false}, cafePlayer={x:480,y:465,dir:'down',frame:2,t:0,moving:false};
let camera={x:player.x-W/2,y:player.y-H/2};
const cafe={x:790,y:120,w:340,h:235,door:{x:942,y:305,w:36,h:50}};
const worldSolids=[{x:790,y:120,w:340,h:185}];
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
function input(p){let dx=0,dy=0,m=false;if(chatActive)return[0,0,false];if(keys.w||keys.arrowup){dy=-SPEED;p.dir='up';m=true}if(keys.s||keys.arrowdown){dy=SPEED;p.dir='down';m=true}if(keys.a||keys.arrowleft){dx=-SPEED;p.dir='left';m=true}if(keys.d||keys.arrowright){dx=SPEED;p.dir='right';m=true}if(dx&&dy){dx*=.7071;dy*=.7071}return[dx,dy,m]}
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
