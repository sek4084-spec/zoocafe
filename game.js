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
const cafeSolids=[{x:0,y:0,w:960,h:305},{x:55,y:340,w:185,h:110},{x:615,y:340,w:195,h:115},{x:0,y:430,w:115,h:110},{x:835,y:420,w:125,h:120}];
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
function cafeLamp(x,y){
  px(x-2,y-18,4,18,'#493328');R(x-11,y,22,18,'#6c4932','#3d2b24',3);R(x-7,y+4,14,10,'#ffd56d');
  ctx.fillStyle='rgba(255,202,91,.12)';ctx.beginPath();ctx.arc(x,y+9,38,0,Math.PI*2);ctx.fill();
}
function cafePlant(x,y,s=1){
  R(x-12*s,y,24*s,18*s,'#9a603f','#50362b',3);for(const a of [-18,-8,4,15]){ctx.fillStyle=a%2?'#4d8546':'#659a50';ctx.beginPath();ctx.ellipse(x+a*s*.45,y-11*s-Math.abs(a)*.2*s,8*s,17*s,a*.025,0,Math.PI*2);ctx.fill()}
}
function cafeTable(x,y){shadow(x,y+25,50,9,.12);R(x-45,y-18,90,48,'#a66c45','#52372b',4);R(x-38,y-12,76,5,'#c98a58');R(x-34,y+30,8,28,'#5a3a2d');R(x+26,y+30,8,28,'#5a3a2d');flower(x,y+2,'#fff0c5')}
function cafeChairSmall(x,y){R(x-16,y-15,32,29,'#85543a','#4d3329',4);R(x-12,y+13,6,24,'#55372b');R(x+7,y+13,6,24,'#55372b')}
function drawBaristaNPC(){
  const x=480,y=190;shadow(x,y+30,24,7,.15);
  // orange fluffy mane/hair and ears, adapted from the supplied character reference
  for(const [dx,dy,r] of [[-22,-17,13],[-10,-26,14],[5,-28,15],[20,-20,13],[-27,-4,11],[27,-3,11]]){ctx.fillStyle='#e97b2f';ctx.beginPath();ctx.arc(x+dx,y+dy,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#573427';ctx.lineWidth=3;ctx.stroke()}
  ctx.fillStyle='#f4bd55';ctx.beginPath();ctx.arc(x,y-3,25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#573427';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#f4bd55';for(const ex of [-24,24]){ctx.beginPath();ctx.arc(x+ex,y-16,10,0,Math.PI*2);ctx.fill();ctx.stroke()}
  px(x-11,y-8,4,5,'#56382c');px(x+7,y-8,4,5,'#56382c');px(x-3,y,7,5,'#56382c');
  R(x-24,y+19,48,31,'#f4ead5','#573427',3);R(x-20,y+27,40,26,'#513a2f');R(x-6,y+20,12,9,'#376a4a');
  px(x-17,y+29,4,18,'#e97b2f');px(x+13,y+29,4,18,'#e97b2f');
}
function drawCafe(){
  // warm detailed pixel café inspired by the approved mockup
  R(0,0,W,H,'#c48a58');
  // plank floor
  for(let y=210;y<H;y+=24){R(0,y,W,2,'#9a623f');for(let x=((y/24)%2)*58;x<W;x+=116)R(x,y,2,24,'rgba(91,55,39,.22)')}
  // back timber wall
  R(0,0,W,210,'#a66f49');for(let y=18;y<205;y+=34)R(0,y,W,3,'#7d5038');
  for(let x=20;x<W;x+=96)R(x,0,5,210,'rgba(83,52,38,.22)');
  R(0,0,W,12,'#4d3429');R(0,202,W,9,'#62412f');
  // windows
  for(const x of [100,760]){R(x,58,112,92,'#573a2d','#3c2a23',6);R(x+9,67,94,74,'#8fc6cf');R(x+53,67,5,74,'#4d362c');R(x+9,102,94,5,'#4d362c');R(x+12,70,39,29,'#bde1e5');R(x+59,70,41,29,'#bde1e5')}
  // main sign and shelves
  RR(300,26,360,70,5,'#4b3329','#2f231e',6);T('ZOO:CAFE',480,58,31,'#ffe8b2','center',900);T('☕',608,59,24,'#ffe8b2','center',900);
  shelf(300,128,155);shelf(510,126,150);shelf(690,128,92);
  // counter + coffee equipment
  R(286,160,390,94,'#8e593b','#493126',6);R(270,154,422,18,'#c28a58','#493126',4);R(286,232,390,22,'#67432f');
  R(326,174,68,47,'#4f4d49','#342f2c',4);R(334,182,20,12,'#d7ad50');R(365,182,20,12,'#ddd9ce');
  R(548,176,58,42,'#5c5148','#352d29',4);R(615,188,48,31,'#302e2c','#1f1e1d',3);R(625,193,29,16,'#78a8a3');
  // pastry dome
  R(414,202,70,18,'#7a4c34','#4b3228',3);ctx.strokeStyle='#e9dcc2';ctx.lineWidth=4;ctx.beginPath();ctx.arc(449,201,29,Math.PI,0);ctx.stroke();R(427,191,18,9,'#d78a4e');R(452,188,18,12,'#e3a65b');
  drawBaristaNPC();
  // menu board
  R(716,82,126,142,'#38352f','#5c3b2d',6);T('MENU',779,105,18,'#f6dfb1','center',900);['Coffee  ···','Tea     ···','Dessert ···'].forEach((q,i)=>T(q,779,136+i*26,13,'#f6dfb1','center',700));
  // books/cabinets/plants
  bookshelf(55,170);cafePlant(70,152,.9);cafePlant(872,173,.8);R(850,112,82,85,'#845438','#51362b',5);shelf(857,139,68);
  // central rug/table
  R(335,318,290,155,'#687d51','#4b5d3e',5);R(346,329,268,133,'#768b5b');cafeTable(480,382);cafeChairSmall(410,385);cafeChairSmall(550,385);
  // side tables with patrons' spaces
  cafeTable(185,344);cafeChairSmall(120,347);cafeChairSmall(250,347);cafeTable(790,344);cafeChairSmall(725,347);cafeChairSmall(855,347);
  // ambient plants + lamps
  cafePlant(42,455,1.05);cafePlant(918,455,1.05);cafePlant(285,244,.75);cafePlant(686,245,.75);
  for(const [x,y] of [[245,30],[715,30],[90,18]])cafeLamp(x,y);
  // entrance mat
  R(390,505,180,34,'#9e5743','#5a382d',4);T('☕',480,522,18,'#f1d58e','center',900);
  // NPC speech indicator
  RR(CAFE_NPC.x+26,CAFE_NPC.y-60,35,26,12,'#fff8e8','#56382c',3);T('•••',CAFE_NPC.x+43,CAFE_NPC.y-47,12,'#56382c','center',900);
}

const rabbitImgs={};for(const d of ['up','down','left','right'])for(const f of [1,2,3]){const im=new Image();im.src=`images/rabbit/rabbit-${d}-${f}.png`;rabbitImgs[`${d}-${f}`]=im;}
function characterImage(animal,dir,frame){return animal==='rabbit'?rabbitImgs[`${dir}-${frame}`]:imgs[`${dir}-${frame}`];}
function drawNameTitle(name,title,x,y){T(`🐾 ${title||'나그네'} 🐾`,x,y-13,9,'#f6d59a','center',900);T(name||'친구',x,y,11,'#fff7e6','center',900);}
function sprite(p,x,y,animal=(window.ZOO_USER?.animal||'lion')){const im=characterImage(animal,p.dir,p.frame);if(!im)return;shadow(x,y+29,22,7,.17);ctx.drawImage(im,Math.round(x-SPRITE_W/2),Math.round(y-SPRITE_H/2),SPRITE_W,SPRITE_H)}
function animate(p,m){p.moving=m;if(m){if(++p.t>=6){p.t=0;p.frame=p.frame===3?1:p.frame+1}}else{p.t=0;p.frame=2}}
function input(p){let dx=0,dy=0,m=false;if(chatActive)return[0,0,false];
if(mobileMove.active){dx=mobileMove.x*SPEED;dy=mobileMove.y*SPEED;m=Math.hypot(mobileMove.x,mobileMove.y)>.08;if(m){if(Math.abs(mobileMove.x)>Math.abs(mobileMove.y))p.dir=mobileMove.x<0?'left':'right';else p.dir=mobileMove.y<0?'up':'down'}return[dx,dy,m]}
if(keys.w||keys.arrowup){dy=-SPEED;p.dir='up';m=true}if(keys.s||keys.arrowdown){dy=SPEED;p.dir='down';m=true}if(keys.a||keys.arrowleft){dx=-SPEED;p.dir='left';m=true}if(keys.d||keys.arrowright){dx=SPEED;p.dir='right';m=true}if(dx&&dy){dx*=.7071;dy*=.7071}return[dx,dy,m]}
function moveWorld(){let[dx,dy,m]=input(player),nx=clamp(player.x+dx,PH,WORLD_W-PH),ny=clamp(player.y+dy,PH,WORLD_H-PH),b={x:nx-16,y:ny-10,w:32,h:34};if(!worldSolids.some(o=>hit(b,o))){player.x=nx;player.y=ny}animate(player,m)}
function moveCafe(){let[dx,dy,m]=input(cafePlayer),nx=clamp(cafePlayer.x+dx,PH,W-PH),ny=clamp(cafePlayer.y+dy,255,H-PH),b={x:nx-12,y:ny-7,w:24,h:28};if(!cafeSolids.some(o=>hit(b,o))){cafePlayer.x=nx;cafePlayer.y=ny}else{let bx={x:nx-12,y:cafePlayer.y-7,w:24,h:28},by={x:cafePlayer.x-12,y:ny-7,w:24,h:28};if(!cafeSolids.some(o=>hit(bx,o)))cafePlayer.x=nx;if(!cafeSolids.some(o=>hit(by,o)))cafePlayer.y=ny}animate(cafePlayer,m)}
function updateCamera(dt){camera.x=player.x-W/2;camera.y=player.y-H/2}
function nearCafe(){return Math.hypot(player.x-(cafe.door.x+18),player.y-(cafe.door.y+45))<85}
function enter(){if(mode==='world'&&nearCafe()&&cooldown<=0){mode='cafe';syncBgm();cafePlayer={x:480,y:475,dir:'up',frame:2,t:0,moving:false};const spawnBox={x:cafePlayer.x-15,y:cafePlayer.y-9,w:30,h:32};if(cafeSolids.some(o=>hit(spawnBox,o))){cafePlayer.x=480;cafePlayer.y=500;}cooldown=.22}}
function exit(){if(mode==='cafe'&&cooldown<=0){mode='world';syncBgm();player.x=cafe.door.x+18;player.y=cafe.door.y+92;player.dir='down';camera.x=clamp(player.x-W/2,0,WORLD_W-W);camera.y=clamp(player.y-H/2,0,WORLD_H-H);cooldown=.28}}
function escHtml(s){return s.replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function renderChat(){chatLog.innerHTML=chatMessages.length?chatMessages.slice(-7).map(m=>`<div class="chat-row"><span class="who">${escHtml(m.name)}</span><span class="msg">${escHtml(m.text)}</span></div>`).join(''):'<div class="chat-empty">Enter를 눌러 이야기를 시작해보세요.</div>';chatLog.scrollTop=chatLog.scrollHeight}
function openChat(){if(chatActive)return;chatActive=true;for(const k in keys)keys[k]=false;document.body.classList.add('chatting');chatInputWrap.hidden=false;chatInput.value='';setTimeout(()=>chatInput.focus(),0)}
function closeChat(){chatActive=false;document.body.classList.remove('chatting');chatInputWrap.hidden=true;chatInput.blur();for(const k in keys)keys[k]=false}
function addChatMessage(name,text){chatMessages.push({name,text,time:Date.now()});if(chatMessages.length>50)chatMessages.shift();renderChat()}
function sendChat(){const value=chatInput.value.trim();if(!value){closeChat();return}const name=window.ZOO_USER?.nickname||'멍사자';addChatMessage(name,value);bubble={text:value,until:performance.now()+4200};if(window.ZooCafeNet?.connected)window.ZooCafeNet.sendChat(value);window.ZooCafeAI?.hear?.(value);chatInput.value='';closeChat()}
function bubbleText(text,x,y,thinking=false){
 if(!text&&!thinking)return;
 ctx.save();const fontSize=13,lineH=18,padX=12,padY=8,maxW=280,minW=thinking?48:34;
 ctx.font=`800 ${fontSize}px Arial,"Noto Sans KR",sans-serif`;
 const raw=thinking?'...':String(text),lines=[];let line='';
 for(const ch of [...raw]){const test=line+ch;if(ctx.measureText(test).width>maxW-padX*2&&line){lines.push(line);line=ch}else line=test}
 if(line)lines.push(line);const visible=lines.slice(0,4);if(lines.length>4)visible[3]=visible[3].slice(0,-1)+'…';
 const contentW=Math.max(...visible.map(v=>ctx.measureText(v).width),0),tw=Math.max(minW,Math.min(maxW,contentW+padX*2)),bh=Math.max(34,visible.length*lineH+padY*2);
 const bx=clamp(x-tw/2,8,W-tw-8),by=clamp(y-88-(bh-34),8,H-bh-14);RR(bx,by,tw,bh,8,'#fff','#211a17',2);
 ctx.fillStyle='#fff';ctx.strokeStyle='#211a17';ctx.lineWidth=2;ctx.beginPath();const tx=clamp(x,bx+14,bx+tw-14);ctx.moveTo(tx-7,by+bh-1);ctx.lineTo(tx,by+bh+8);ctx.lineTo(tx+7,by+bh-1);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#111';ctx.textAlign='center';ctx.textBaseline='middle';visible.forEach((v,i)=>ctx.fillText(v,bx+tw/2,by+padY+lineH*(i+.5)));ctx.restore();
}

/* ================================================================
   ZOO:CAFE v50 — autonomous character AI foundation
   멍사자 + 쥐무는토끼: wandering, noticing the player, approaching,
   greeting, reacting to chat, resting, and resuming their own routine.
   This behavior runs locally with no external AI/API key.
   ================================================================ */
const aiFriends=[
 {id:'ai-mung',name:'멍사자',animal:'lion',title:'카페지기',room:'cafe',
  x:300,y:455,dir:'right',frame:2,t:0,moving:false,target:null,state:'wander',
  nextThink:0,bubble:'',bubbleUntil:0,lastTalk:0,thinking:false,
  lines:['커피 향이 좋다 ☕','오늘도 천천히 둘러봐야지.','누가 놀러 왔나?','잠깐 창가에 앉아볼까?']},
 {id:'ai-rabbit',name:'쥐무는토끼',animal:'rabbit',title:'이야기 기록자',room:'cafe',
  x:720,y:455,dir:'left',frame:2,t:0,moving:false,target:null,state:'wander',
  nextThink:0,bubble:'',bubbleUntil:0,lastTalk:0,thinking:false,
  lines:['조용히 글을 좀 써볼까…','좋은 이야기는 기억해 둬야지.','커피 한 모금만…','오늘은 어떤 이야기가 생길까?']}
];
function aiPlayer(){return mode==='cafe'?cafePlayer:player}
function aiSay(n,text,ms=4800){
 n.thinking=false;n.bubble=String(text||'').slice(0,260);n.bubbleUntil=performance.now()+ms;n.lastTalk=performance.now();
 addChatMessage(n.name,n.bubble);
}
function aiThinking(n){n.thinking=true;n.bubble='';n.bubbleUntil=performance.now()+15000;}
function aiReply(n,text){
 // v52: language intelligence lives on the server; movement intelligence remains local.
 if(window.ZooCafeNet?.connected&&window.ZooCafeNet.sendNpcChat){
   aiThinking(n);
   window.ZooCafeNet.sendNpcChat(n.id,text);
 }else{
   aiSay(n,'잠깐 연결이 끊겼네. 다시 이야기해줄래?',3200);
 }
}
function aiReceiveThinking(m){
 const n=aiFriends.find(v=>v.id===m.npcId);if(!n)return;
 aiThinking(n);
}
function aiReceiveWelcome(m){
 const n=aiFriends.find(v=>v.id===m.npcId);if(!n)return;
 n.thinking=false;const p=aiPlayer();n.target={x:p.x+(n.x<p.x?-68:68),y:p.y+22};n.state='approach';
 aiSay(n,String(m.text||'').trim()||'다시 왔네!',7600);
}
function aiReceiveReply(m){
 const n=aiFriends.find(v=>v.id===m.npcId);if(!n)return;
 n.thinking=false;
 const p=aiPlayer();
 n.target={x:p.x+(n.x<p.x?-68:68),y:p.y+22};n.state='approach';
 aiSay(n,String(m.text||'').trim()||'응, 듣고 있어.',6200);
}
function aiPickTarget(n){
 const bounds=n.room==='cafe'?{minX:120,maxX:840,minY:330,maxY:485}:{minX:120,maxX:2760,minY:120,maxY:1680};
 n.target={x:bounds.minX+Math.random()*(bounds.maxX-bounds.minX),y:bounds.minY+Math.random()*(bounds.maxY-bounds.minY)};
 n.state='wander';n.nextThink=performance.now()+3500+Math.random()*5000;
}
function aiStep(n){
 if(n.room!==mode)return;
 const now=performance.now(),p=aiPlayer(),dist=Math.hypot(p.x-n.x,p.y-n.y);
 if(dist<230 && now-n.lastTalk>14000){
   n.state='approach';n.target={x:p.x+(n.x<p.x?-72:72),y:p.y+25};
   if(dist<115){n.target=null;n.state='social';aiSay(n,n.animal==='lion'?'어, 왔구나! 여기서 뭐 하고 있었어?':'안녕… 잠깐 이야기할래?');n.nextThink=now+6500;}
 } else if(now>n.nextThink && n.state!=='approach'){
   if(Math.random()<.28){n.state='idle';n.target=null;n.nextThink=now+2500+Math.random()*3500;if(Math.random()<.35)aiSay(n,n.lines[Math.floor(Math.random()*n.lines.length)],3500)}
   else aiPickTarget(n);
 }
 if(n.target){
   const dx=n.target.x-n.x,dy=n.target.y-n.y,d=Math.hypot(dx,dy);
   if(d<8){n.target=null;n.moving=false;n.state='idle';n.nextThink=now+1800+Math.random()*3500}
   else{
     const sp=n.state==='approach'?1.25:.72;n.x+=dx/d*sp;n.y+=dy/d*sp;n.moving=true;
     if(Math.abs(dx)>Math.abs(dy))n.dir=dx<0?'left':'right';else n.dir=dy<0?'up':'down';
     animate(n,true);
   }
 }else animate(n,false);
}
function updateAiFriends(){for(const n of aiFriends)aiStep(n)}
function drawAiFriends(camX=0,camY=0){
 for(const n of aiFriends){if(n.room!==mode)continue;
   const x=n.x-camX,y=n.y-camY,im=characterImage(n.animal,n.dir,n.frame);
   if(im){shadow(x,y+18,22,7,.13);ctx.drawImage(im,Math.round(x-SPRITE_W/2),Math.round(y-SPRITE_H+22),SPRITE_W,SPRITE_H)}
   drawNameTitle(n.name,n.title,x,y-SPRITE_H+8);
   if(n.bubble&&performance.now()<n.bubbleUntil)bubbleText(n.bubble,x,y);
 }}
function aiHearPlayer(text){
 const p=aiPlayer();
 const candidates=aiFriends.filter(n=>n.room===mode).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y));
 const n=candidates[0];if(!n)return;
 const d=Math.hypot(p.x-n.x,p.y-n.y);
 if(d>360)return;
 n.target={x:p.x+(n.x<p.x?-68:68),y:p.y+22};n.state='approach';
 setTimeout(()=>{if(n.room===mode)aiReply(n,text)},120+Math.random()*180);
}
window.ZooCafeAI={friends:aiFriends,hear:aiHearPlayer,receiveThinking:aiReceiveThinking,receiveReply:aiReceiveReply,receiveWelcome:aiReceiveWelcome};

renderChat();
function drawRemote(r,camX=0,camY=0){const im=characterImage(r.animal||'lion',r.dir||'down',r.frame||2);if(!im)return;const x=r.x-camX,y=r.y-camY;shadow(x,y+18,22,7,.13);ctx.drawImage(im,Math.round(x-SPRITE_W/2),Math.round(y-SPRITE_H+22),SPRITE_W,SPRITE_H);drawNameTitle(r.nickname,r.title,x,y-SPRITE_H+8);const b=remoteBubbles.get(r.id);if(b&&performance.now()<b.until)bubbleText(b.text,x,y);}
function drawRemotes(room,camX=0,camY=0){for(const r of remotePlayers.values())if(r.mode===room)drawRemote(r,camX,camY)}
function draw(){ctx.clearRect(0,0,W,H);if(mode==='world'){ctx.save();ctx.translate(-Math.round(camera.x),-Math.round(camera.y));drawWorld();sprite(player,player.x,player.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,player.x,player.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='world')drawRemote(r,0,0);drawAiFriends(camera.x,camera.y);ctx.restore();if(performance.now()<bubble.until)bubbleText(bubble.text,player.x-camera.x,player.y-camera.y);interaction.hidden=chatActive||!nearCafe();interactionText.textContent='카페 들어가기'}else{drawCafe();sprite(cafePlayer,cafePlayer.x,cafePlayer.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,cafePlayer.x,cafePlayer.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='cafe')drawRemote(r,0,0);drawAiFriends(0,0);if(performance.now()<bubble.until)bubbleText(bubble.text,cafePlayer.x,cafePlayer.y);interaction.hidden=true;RR(420,486,120,40,5,'rgba(54,43,34,.94)');RR(432,492,28,28,4,'#f5df9c');T('E',446,506,16,C.ink,'center',900);T('나가기',500,506,15,'#fff7e6','center',800)}}
function loop(now){let dt=Math.min(.033,(now-last)/1000);last=now;cooldown=Math.max(0,cooldown-dt);waterT+=dt;if(ready){if(mode==='world'){moveWorld();updateCamera(dt)}else moveCafe();updateAiFriends();window.ZooCafeNet?.tick?.();draw()}requestAnimationFrame(loop)}
addEventListener('keydown',e=>{if(e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]'))return;let k=e.key.toLowerCase();if(chatActive){if(k==='escape'){e.preventDefault();closeChat()}return}if(k==='enter'){e.preventDefault();openChat();return}keys[k]=true;if(k.startsWith('arrow'))e.preventDefault();if(k==='e'){mode==='world'?enter():exit()}});
addEventListener('keyup',e=>{if(!chatActive)keys[e.key.toLowerCase()]=false});
chatInput.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closeChat();return}if(e.key==='Enter'&&!e.isComposing){e.preventDefault();sendChat()}});
chatInput.addEventListener('keyup',e=>e.stopPropagation());
chatInput.addEventListener('compositionstart',()=>{});
chatPanel.addEventListener('click',openChat);

addEventListener('pointerdown',startBgm,{once:true}); addEventListener('keydown',startBgm,{once:true});
window.ZooCafeAudio={setBgmVolume(v){bgmVolume=Math.max(0,Math.min(1,v));[cityBgm,cafeBgm].forEach(a=>{if(a)a.volume=bgmVolume;});},getBgmVolume(){return bgmVolume;},toggleBgm(on){bgmEnabled=!!on;if(bgmEnabled){bgmStarted=true;syncBgm();}else{[cityBgm,cafeBgm].forEach(a=>{if(a)a.pause();});}}};

window.ZooCafeGame={getState(){const p=mode==='world'?player:cafePlayer;return {mode,x:p.x,y:p.y,dir:p.dir,frame:p.frame,moving:p.moving}},setRoster(list){remotePlayers.clear();const me=window.ZOO_USER?.id;for(const r of list||[])if(r.id!==me)remotePlayers.set(r.id,r)},setRemote(r){if(r&&r.id!==window.ZOO_USER?.id)remotePlayers.set(r.id,r)},remoteChat(m){if(!m||m.id===window.ZOO_USER?.id)return;addChatMessage(m.nickname,m.text);remoteBubbles.set(m.id,{text:m.text,until:performance.now()+5200});window.dispatchEvent(new CustomEvent('zoo-map-chat',{detail:{id:m.id,text:m.text,me:false}}))},clearRemotes(){remotePlayers.clear();remoteBubbles.clear()}};

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
  if(ZA?.loaded&&grasses){for(let y=0;y<WORLD_H;y+=32)for(let x=0;x<WORLD_W;x+=32){const idx=Math.floor(hash2(x,y)*grasses.length);const im=ZA.pick(grasses,idx);if(im)ctx.drawImage(im,x,y,32,32)}}else R(0,0,WORLD_W,WORLD_H,'#72b84f');
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
  if(ZA?.loaded&&grasses){for(let y=0;y<WORLD_H;y+=32)for(let x=0;x<WORLD_W;x+=32){const im=ZA.pick(grasses,Math.floor(hash2(x,y)*grasses.length));if(im)ctx.drawImage(im,x,y,32,32)}}else R(0,0,WORLD_W,WORLD_H,'#72b84f');
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
    ctx.save();ctx.translate(-Math.round(camera.x),-Math.round(camera.y));drawWorld();sprite(player,player.x,player.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,player.x,player.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='world')drawRemote(r,0,0);drawAiFriends(camera.x,camera.y);ctx.restore();
    if(performance.now()<bubble.until)bubbleText(bubble.text,player.x-camera.x,player.y-camera.y);
    const n=nearestEntrance();interaction.hidden=chatActive||!n;interactionText.textContent=n?`${n.name} 들어가기`:'들어가기';
  }else{
    if(mode==='cafe')drawCafe();else drawBlankInterior(mode);
    sprite(cafePlayer,cafePlayer.x,cafePlayer.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,cafePlayer.x,cafePlayer.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode===mode)drawRemote(r,0,0);
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
  // v35 mobile camera: a little closer than v34, but still wider than desktop.
  // Clamp the camera to the world bounds so portrait phones never reveal black voids.
  const MOBILE_WORLD_SCALE=.88;
  const oldUpdateCamera=updateCamera;
  updateCamera=function(dt){
    const vw=W/MOBILE_WORLD_SCALE,vh=H/MOBILE_WORLD_SCALE;
    const maxX=Math.max(0,WORLD_W-vw), maxY=Math.max(0,WORLD_H-vh);
    camera.x=clamp(player.x-vw/2,0,maxX);
    camera.y=clamp(player.y-vh/2,0,maxY);
  };
  const oldDraw=draw;
  draw=function(){
    if(mode!=='world'){oldDraw();return;}
    ctx.clearRect(0,0,W,H);
    ctx.save();ctx.scale(MOBILE_WORLD_SCALE,MOBILE_WORLD_SCALE);ctx.translate(-Math.round(camera.x),-Math.round(camera.y));
    drawWorld();sprite(player,player.x,player.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,player.x,player.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='world')drawRemote(r,0,0);drawAiFriends(camera.x,camera.y);ctx.restore();
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

/* v49 — the garden is a fixed 1 km game field; GPS selects who can share it, game XY moves the avatar. */
moveNearby=function(){let[dx,dy,m]=input(nearbyPlayer);nearbyPlayer.x=clamp(nearbyPlayer.x+dx,PH,Z40_NEAR_W-PH);nearbyPlayer.y=clamp(nearbyPlayer.y+dy,PH,Z40_NEAR_H-PH);animate(nearbyPlayer,m)};
window.ZooCafeGame.getGardenPlayer=function(){return mode==='nearby'?{x:nearbyPlayer.x,y:nearbyPlayer.y,dir:nearbyPlayer.dir,frame:nearbyPlayer.frame,moving:nearbyPlayer.moving}:null};
/* v48 public controls for the full-screen garden UI */
window.ZooCafeGame.returnToCafe=function(){
  if(mode!=='nearby')return false;
  mode='cafe';
  cafePlayer={x:480,y:475,dir:'up',frame:2,t:0,moving:false};
  cooldown=.35;syncBgm();window.ZooCafeNet?.tick?.(true);return true;
};
window.ZooCafeGame.openQuickChat=function(){openChat();};
window.ZooCafeGame.closeQuickChat=function(){closeChat();};
window.ZooCafeGame.sendQuickChat=function(text){
  text=String(text||'').trim().slice(0,80);if(!text)return false;
  const name=window.ZOO_USER?.nickname||'멍사자';
  addChatMessage(name,text);bubble={text,until:performance.now()+5200};
  if(window.ZooCafeNet?.connected)window.ZooCafeNet.sendChat(text);window.ZooCafeAI?.hear?.(text);
  window.dispatchEvent(new CustomEvent('zoo-map-chat',{detail:{id:window.ZOO_USER?.id,text,me:true}}));
  return true;
};
window.ZooCafeGame.getChatMessages=function(){return chatMessages.slice(-50);};
})();

/* v28 — contextual indoor interaction + approved classic lion barista */
let cafeStyle='cozy';
let cafeNpcMenuOpen=false;
const CAFE_NPC={x:492,y:224};
const CAFE_EXIT={x:480,y:505};

function nearCafeNpc(){return mode==='cafe'&&Math.hypot(cafePlayer.x-CAFE_NPC.x,cafePlayer.y-CAFE_NPC.y)<145}
function nearIndoorExit(){return mode!=='world'&&Math.hypot(cafePlayer.x-CAFE_EXIT.x,cafePlayer.y-CAFE_EXIT.y)<88}

// v29 — external PNG café NPC asset.
// Replace only this file to redesign the café keeper:
// images/npc/cafe-staff-lion.png
const cafeOwnerImage=new Image();
cafeOwnerImage.src='images/npc/cafe-staff-lion.png';
let cafeOwnerImageReady=false;
cafeOwnerImage.onload=()=>{cafeOwnerImageReady=true;};
cafeOwnerImage.onerror=()=>{console.warn('[ZOO:CAFE] NPC PNG not found: images/npc/cafe-staff-lion.png');};

drawBaristaNPC=function(){}; // v33: lion barista is painted into the unified café background; motion is ambient overlay.

function drawCafeStyleExtras(){
  if(cafeStyle==='garden'){
    // indoor greenery: vines and planters, kept away from walk lanes
    for(let x=35;x<930;x+=72){px(x,18,5,18,'#4f8246');px(x+5,30,8,5,'#6c9b55')}
    cafePlant(255,275,.8);cafePlant(705,275,.8);cafePlant(900,285,.9);
    T('GARDEN CAFE',480,286,12,'#46633d','center',900);
  }else if(cafeStyle==='library'){
    bookshelf(250,278);bookshelf(790,278);shelf(355,282,250);
    T('BOOK & COFFEE',480,294,12,'#684934','center',900);
  }else if(cafeStyle==='warm'){
    // extra warm lamps and small pools of light
    cafeLamp(165,245);cafeLamp(795,245);
    ctx.fillStyle='rgba(255,190,80,.055)';ctx.fillRect(0,0,W,H);
    T('EVENING CAFE',480,286,12,'#8b5b35','center',900);
  }
}
const drawCafeV26=drawCafe;
drawCafe=function(){drawCafeV26();drawCafeStyleExtras();};



function drawCafeAmbient(){
  const t=waterT;
  ctx.save();

  // 1) Pendant lights — independent warm flicker, never harsh on/off.
  const lamps=[[96,58,44,0],[231,100,32,.8],[310,100,32,1.7],[645,100,34,2.4],[720,58,46,3.1],[856,157,28,4.2],[326,516,34,1.2],[584,516,34,2.7],[919,476,38,3.7]];
  for(const [x,y,r,ph] of lamps){
    const slow=.5+.5*Math.sin(t*2.0+ph), fast=.5+.5*Math.sin(t*6.2+ph*1.9);
    const a=.055+slow*.035+fast*.014;
    const g=ctx.createRadialGradient(x,y,1,x,y,r);
    g.addColorStop(0,`rgba(255,236,164,${a*3.1})`);
    g.addColorStop(.30,`rgba(255,188,77,${a*1.35})`);
    g.addColorStop(1,'rgba(255,137,35,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }

  // 2) Both windows — drifting clouds, breeze in foliage, tiny passing leaves.
  const windows=[[82,96,105,82],[688,96,112,82]];
  windows.forEach(([x,y,w,h],wi)=>{
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    const cloudSpeed=5.5+wi*1.2;
    for(let i=0;i<3;i++){
      const cx=x-40+((t*cloudSpeed+i*(w*.58+35))%(w+90));
      const cy=y+15+i*17+(wi?3:0);
      ctx.fillStyle='rgba(255,252,226,.22)';
      ctx.fillRect(Math.round(cx),Math.round(cy),30,4);
      ctx.fillRect(Math.round(cx+7),Math.round(cy-4),16,4);
      ctx.fillRect(Math.round(cx+17),Math.round(cy+4),19,3);
    }
    const sway=Math.sin(t*1.05+wi*.8)*3.2;
    ctx.fillStyle='rgba(70,113,53,.20)';
    for(let i=0;i<5;i++){
      const bx=x+7+i*(w/4)+sway*(i%2?1:-.7);
      const by=y+h-15-(i%3)*7;
      ctx.beginPath();ctx.arc(bx,by,10+(i%2)*3,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<4;i++){
      const lx=x+((t*(8+wi)+i*37)%(w+16))-8;
      const ly=y+24+((i*17)%46)+Math.sin(t*1.7+i)*4;
      ctx.fillStyle='rgba(118,151,70,.34)';ctx.fillRect(Math.round(lx),Math.round(ly),3,2);
    }
    ctx.restore();
  });

  // 3) Sunlight reacts to passing clouds. Baked sunbeams remain, but their intensity and shadows breathe.
  const cloud=(.5+.5*Math.sin(t*.24))*(.5+.5*Math.sin(t*.11+1.3));
  ctx.save();ctx.beginPath();ctx.rect(0,300,960,240);ctx.clip();
  ctx.globalCompositeOperation='multiply';
  const shadeAlpha=.018+cloud*.075;
  ctx.fillStyle=`rgba(83,72,62,${shadeAlpha})`;
  const drift=((t*13)%125)-70;
  ctx.save();ctx.translate(drift,0);ctx.rotate(-.11);
  ctx.fillRect(110,270,105,330);ctx.fillRect(370,270,145,330);ctx.fillRect(720,270,90,330);
  ctx.restore();
  ctx.globalCompositeOperation='screen';
  const warm=.018+(1-cloud)*.035;
  const sg=ctx.createLinearGradient(0,300,620,540);sg.addColorStop(0,`rgba(255,210,117,${warm})`);sg.addColorStop(1,'rgba(255,185,70,0)');ctx.fillStyle=sg;ctx.fillRect(0,300,720,240);
  ctx.restore();

  // 4) Sleeping cat — slow breathing plus an occasional tiny tail/ear twitch.
  const breath=.5+.5*Math.sin(t*1.35);
  ctx.fillStyle=`rgba(255,232,186,${.025+breath*.035})`;
  ctx.beginPath();ctx.ellipse(64,285,28+breath*1.2,8+breath*.6,0,0,Math.PI*2);ctx.fill();
  if((t%9.2)>8.35){ctx.strokeStyle='rgba(116,69,39,.42)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(86,286,8,5,.2,1.7);ctx.stroke();}

  // 5) Espresso / hot-cup steam — soft, intermittent motion around the barista station.
  const steam=t%7.2;
  if(steam<4.8){for(let i=0;i<3;i++){const life=(steam+i*.8)%4.8;const a=Math.max(0,.22-life*.035);ctx.strokeStyle=`rgba(255,248,231,${a})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(477+Math.sin(t*1.8+i)*3,246-life*8-i*2,5+i*1.5,.15*Math.PI,1.08*Math.PI);ctx.stroke();}}

  // 6) Barista is part of the painting. Animate facial/working details on top so it never looks pasted on.
  // blink
  if((t%5.6)>5.35){ctx.strokeStyle='rgba(74,46,31,.92)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(485,223);ctx.lineTo(489,223);ctx.moveTo(496,223);ctx.lineTo(500,223);ctx.stroke();}
  // subtle breathing / apron light pulse
  const nb=.5+.5*Math.sin(t*1.55);
  ctx.fillStyle=`rgba(255,228,163,${.018+nb*.018})`;ctx.beginPath();ctx.ellipse(492,241,18,10,0,0,Math.PI*2);ctx.fill();
  // occasional hand-to-cup gesture suggested by a tiny warm moving highlight
  const work=t%8.0;if(work>5.6&&work<7.2){const p=(work-5.6)/1.6;ctx.fillStyle='rgba(255,220,151,.34)';ctx.beginPath();ctx.arc(506+p*8,241-Math.sin(p*Math.PI)*4,2.2,0,Math.PI*2);ctx.fill();}

  ctx.restore();
}
/* ================================================================
   ZOO:CAFE v33 — UNIFIED LIVING CAFE
   Replace assets/cafe/interior/cafe-background.png to redesign the
   entire café interior without touching game.js.
   Lion café staff is animated as a living foreground layer at the POS area.
   ================================================================ */
const cafeInteriorImage=new Image();
let cafeInteriorImageReady=false;
cafeInteriorImage.src='assets/cafe/interior/cafe-background.png';
cafeInteriorImage.onload=()=>{cafeInteriorImageReady=true;};
cafeInteriorImage.onerror=()=>console.warn('[ZOO:CAFE] café background PNG not found');

const drawCafeLegacyV30=drawCafe;
drawCafe=function(){
  if(!cafeInteriorImageReady){drawCafeLegacyV30();return;}
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(cafeInteriorImage,0,0,W,H);
  drawCafeAmbient();
};

function ensureCafeNpcMenu(){
  let el=document.getElementById('cafeNpcMenu');
  if(el)return el;
  el=document.createElement('div');el.id='cafeNpcMenu';el.className='cafe-npc-menu';el.hidden=true;
  el.innerHTML=`<div class="npc-card"><button class="npc-close" type="button">×</button><div class="npc-face">🦁</div><div class="npc-copy"><b>카페지기</b><p>어서 와요! 오늘 카페 분위기를 어떻게 꾸며볼까요?</p></div><div class="npc-choices"><button data-style="cozy">1. 기본 카페</button><button data-style="garden">2. 초록 정원</button><button data-style="library">3. 책 카페</button><button data-style="warm">4. 따뜻한 조명</button></div><small>선택하면 카페 내부에 바로 적용돼요.</small></div>`;
  document.getElementById('gameStage')?.appendChild(el);
  el.querySelector('.npc-close')?.addEventListener('click',closeCafeNpcMenu);
  el.querySelectorAll('[data-style]').forEach(btn=>btn.addEventListener('click',()=>{cafeStyle=btn.dataset.style;closeCafeNpcMenu();}));
  return el;
}
function openCafeNpcMenu(){if(mode!=='cafe'||!nearCafeNpc())return; cafeNpcMenuOpen=true;keys.w=keys.a=keys.s=keys.d=keys.arrowup=keys.arrowdown=keys.arrowleft=keys.arrowright=false;const el=ensureCafeNpcMenu();el.hidden=false;}
function closeCafeNpcMenu(){cafeNpcMenuOpen=false;const el=document.getElementById('cafeNpcMenu');if(el)el.hidden=true;}
function cafeInteract(){
  if(mode==='world'){enter();return}
  if(mode==='cafe'&&nearCafeNpc()){openCafeNpcMenu();return}
  if(nearIndoorExit()){exit();return}
}

// Intercept E before the older global handler so E only exits beside the indoor door.
window.addEventListener('keydown',e=>{
  if(e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]'))return;
  if(e.key.toLowerCase()==='e'&&!chatActive){e.preventDefault();e.stopImmediatePropagation();if(!cafeNpcMenuOpen)cafeInteract();return}
  if(cafeNpcMenuOpen){
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeCafeNpcMenu();return}
    const map={'1':'cozy','2':'garden','3':'library','4':'warm'};if(map[e.key]){e.preventDefault();e.stopImmediatePropagation();cafeStyle=map[e.key];closeCafeNpcMenu();}
  }
},true);

// Replace the old mobile action behavior with the same contextual interaction.
const v27Action=document.getElementById('mobileActionBtn');
v27Action?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopImmediatePropagation();startBgm();if(chatActive){closeChat();return}if(!cafeNpcMenuOpen)cafeInteract();},true);

// Context-sensitive prompt inside buildings.
const drawV27Base=draw;
draw=function(){
  drawV27Base();
  if(mode==='cafe'){
    if(nearCafeNpc()){
      RR(385,474,190,48,6,'rgba(54,43,34,.95)');RR(397,483,28,28,4,'#f5df9c');T('E',411,497,16,C.ink,'center',900);T('카페지기와 대화',493,497,14,'#fff7e6','center',800);
    }else if(nearIndoorExit()){
      RR(410,486,140,40,5,'rgba(54,43,34,.95)');RR(422,492,28,28,4,'#f5df9c');T('E',436,506,16,C.ink,'center',900);T('나가기',500,506,15,'#fff7e6','center',800);
    }
  }else if(mode!=='world'&&nearIndoorExit()){
    RR(410,486,140,40,5,'rgba(54,43,34,.95)');RR(422,492,28,28,4,'#f5df9c');T('E',436,506,16,C.ink,'center',900);T('나가기',500,506,15,'#fff7e6','center',800);
  }
};
ensureCafeNpcMenu();

/* v38 GPS Nearby Plaza */
const nearbyPlayer={x:480,y:350,dir:'down',frame:2,t:0,moving:false};let nearbyGeoStatus='위치 권한을 기다리는 중',nearbyWatchId=null,nearbyRadiusM=500;
function requestNearbyLocation(){if(!navigator.geolocation){nearbyGeoStatus='이 기기에서는 위치 기능을 사용할 수 없어요';return Promise.resolve(false)}nearbyGeoStatus='내 주변 친구를 찾는 중…';return new Promise(resolve=>{navigator.geolocation.getCurrentPosition(pos=>{nearbyGeoStatus=`내 주변 ${nearbyRadiusM}m · 정확한 위치는 다른 사람에게 공개되지 않아요`;window.ZooCafeNet?.sendGeo?.(pos.coords.latitude,pos.coords.longitude);if(nearbyWatchId==null)nearbyWatchId=navigator.geolocation.watchPosition(p=>window.ZooCafeNet?.sendGeo?.(p.coords.latitude,p.coords.longitude),()=>{},{enableHighAccuracy:false,maximumAge:30000,timeout:12000});resolve(true)},err=>{nearbyGeoStatus=err.code===1?'위치 권한을 허용하면 주변 친구가 보여요':'현재 위치를 확인하지 못했어요';resolve(false)},{enableHighAccuracy:false,maximumAge:30000,timeout:12000})})}
async function enterNearbyFromCafe(){mode='nearby';cooldown=.3;nearbyPlayer.x=480;nearbyPlayer.y=350;nearbyPlayer.dir='down';syncBgm();window.ZooCafeNet?.tick?.(true);await requestNearbyLocation();window.ZooCafeNet?.tick?.(true)}
function drawNearbyPlaza(){R(0,0,W,H,'#8fc66e');for(let y=0;y<H;y+=24)for(let x=0;x<W;x+=24)if(((x+y)/24)%3===0)px(x+5,y+8,2,5,'#6aaa57');R(0,245,W,95,'#d8c49a');R(420,0,120,H,'#d8c49a');shadow(480,274,92,18,.16);ctx.beginPath();ctx.ellipse(480,260,72,38,0,0,Math.PI*2);ctx.fillStyle='#b8a57d';ctx.fill();ctx.beginPath();ctx.ellipse(480,253,58,29,0,0,Math.PI*2);ctx.fillStyle='#78b9c5';ctx.fill();RR(397,22,166,88,5,'#e7c993','#4d3529',5);R(426,54,108,56,'#7b5138','#4d3529',4);T('ZOO:CAFE',480,44,16,'#4b3428','center',900);T('E  카페로 들어가기',480,129,12,'#5d4737','center',800);for(const [x,y] of [[170,205],[790,205],[170,390],[790,390]]){R(x-42,y-9,84,18,'#85583c','#4d3529',3);R(x-34,y+9,7,20,'#5b3d2e');R(x+27,y+9,7,20,'#5b3d2e')}for(const [x,y] of [[80,75],[880,75],[75,465],[885,465]])detailedTree(x,y,1.05);RR(18,16,350,58,7,'rgba(55,45,35,.88)','#ead6a8',2);T('내 주변 광장',34,36,15,'#fff3d5','left',900);T(nearbyGeoStatus,34,57,10,'#f3dfbb','left',700)}
function moveNearby(){let[dx,dy,m]=input(nearbyPlayer);nearbyPlayer.x=clamp(nearbyPlayer.x+dx,PH,W-PH);nearbyPlayer.y=clamp(nearbyPlayer.y+dy,145,H-PH);animate(nearbyPlayer,m)}
function nearNearbyCafe(){return Math.hypot(nearbyPlayer.x-480,nearbyPlayer.y-118)<75}
const v38Exit=exit;exit=function(){if(mode==='cafe'&&cooldown<=0){enterNearbyFromCafe();return}if(mode==='nearby'&&cooldown<=0&&nearNearbyCafe()){mode='cafe';cafePlayer={x:480,y:475,dir:'up',frame:2,t:0,moving:false};cooldown=.3;syncBgm();window.ZooCafeNet?.tick?.(true);return}v38Exit()};
const v38Enter=enter;enter=function(){if(mode==='nearby'&&cooldown<=0&&nearNearbyCafe()){exit();return}v38Enter()};
const v38Draw=draw;draw=function(){if(mode!=='nearby'){v38Draw();return}ctx.clearRect(0,0,W,H);drawNearbyPlaza();sprite(nearbyPlayer,nearbyPlayer.x,nearbyPlayer.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,nearbyPlayer.x,nearbyPlayer.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='nearby')drawRemote(r,0,0);if(performance.now()<bubble.until)bubbleText(bubble.text,nearbyPlayer.x,nearbyPlayer.y);interaction.hidden=chatActive||!nearNearbyCafe();interactionText.textContent='카페로 들어가기'};
const v38State=window.ZooCafeGame.getState;window.ZooCafeGame.getState=function(){if(mode==='nearby')return {mode,x:nearbyPlayer.x,y:nearbyPlayer.y,dir:nearbyPlayer.dir,frame:nearbyPlayer.frame,moving:nearbyPlayer.moving};return v38State()};
const v38MoveCafe=moveCafe;moveCafe=function(){if(mode==='nearby')moveNearby();else v38MoveCafe()};

/* ZOO:CAFE v40 — mobile GPS HUD + nearby/cafe follow camera */
const Z40_MOBILE=()=>window.matchMedia?.('(hover:none) and (pointer:coarse)').matches||innerWidth<=760;
const Z40_NEAR_W=2880,Z40_NEAR_H=1800;
let z40NearCam={x:960,y:720},z40CafeCam={x:0,y:0},z40GpsAccuracy=null,z40GpsOk=false,z40GpsMessage='GPS 연결 대기 중';
function z40Hud(){return document.getElementById('gpsStatusHud')}
function z40UpdateHud(){const el=z40Hud();if(!el)return;el.hidden=mode!=='nearby';if(mode!=='nearby')return;const count=Math.max(1,remotePlayers.size+1);const nearest=[...remotePlayers.values()].filter(p=>p.mode==='nearby'&&Number.isFinite(p.distanceM)).sort((a,b)=>a.distanceM-b.distanceM)[0];el.innerHTML=`<strong><span class="gps-dot ${z40GpsOk?'ok':''}"></span>${z40GpsOk?'GPS 연결됨':z40GpsMessage}</strong><span>내 위치: ${z40GpsOk?'GPS 수신됨':'확인 중'} · 반경 500m · 접속 ${count}명</span><span>${z40GpsAccuracy!=null?`정확도 약 ${z40GpsAccuracy}m`:''}${nearest?` · 가장 가까운 친구 약 ${nearest.distanceM}m`:''}</span>`}
function z40ApplyGeo(pos){z40GpsOk=true;z40GpsAccuracy=Math.round(pos.coords.accuracy||0);z40GpsMessage='GPS 연결됨';window.ZooCafeNet?.sendGeo?.(pos.coords.latitude,pos.coords.longitude);z40UpdateHud()}
requestNearbyLocation=function(){if(!navigator.geolocation){z40GpsOk=false;z40GpsMessage='GPS 사용 불가';z40UpdateHud();return Promise.resolve(false)}z40GpsMessage='GPS 연결 중…';z40UpdateHud();return new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>{z40ApplyGeo(p);if(nearbyWatchId==null)nearbyWatchId=navigator.geolocation.watchPosition(z40ApplyGeo,()=>{}, {enableHighAccuracy:true,maximumAge:10000,timeout:15000});resolve(true)},err=>{z40GpsOk=false;z40GpsMessage=err.code===1?'위치 권한 필요':'GPS 확인 실패';z40UpdateHud();resolve(false)},{enableHighAccuracy:true,maximumAge:10000,timeout:15000}))}
enterNearbyFromCafe=async function(){mode='nearby';cooldown=.3;nearbyPlayer.x=1440;nearbyPlayer.y=1030;nearbyPlayer.dir='down';z40NearCam.x=nearbyPlayer.x-W/2;z40NearCam.y=nearbyPlayer.y-H/2;syncBgm();window.ZooCafeNet?.tick?.(true);z40UpdateHud();await requestNearbyLocation();window.ZooCafeNet?.tick?.(true)}
function z40DrawNearbyWorld(){R(0,0,Z40_NEAR_W,Z40_NEAR_H,'#8fc66e');for(let y=0;y<Z40_NEAR_H;y+=32)for(let x=0;x<Z40_NEAR_W;x+=32)if(((x/32)*7+(y/32)*11)%5===0)px(x+7,y+9,3,8,'#68a957');R(0,850,Z40_NEAR_W,160,'#d8c49a');R(1360,0,160,Z40_NEAR_H,'#d8c49a');for(let x=0;x<Z40_NEAR_W;x+=54)px(x,928,30,4,'#c0a97e');for(let y=0;y<Z40_NEAR_H;y+=50)px(1438,y,4,28,'#c0a97e');shadow(1440,930,118,25,.16);ctx.beginPath();ctx.ellipse(1440,905,95,52,0,0,Math.PI*2);ctx.fillStyle='#b8a57d';ctx.fill();ctx.beginPath();ctx.ellipse(1440,897,77,39,0,0,Math.PI*2);ctx.fillStyle='#78b9c5';ctx.fill();ctx.beginPath();ctx.ellipse(1440,890,42,20,0,0,Math.PI*2);ctx.fillStyle='#a7d8df';ctx.fill();RR(1320,560,240,150,7,'#e7c993','#4d3529',6);R(1360,620,160,90,'#7b5138','#4d3529',5);T('ZOO:CAFE',1440,595,22,'#4b3428','center',900);T('E  카페로 들어가기',1440,740,13,'#5d4737','center',800);for(const [x,y] of [[1050,760],[1830,760],[1040,1110],[1840,1110],[650,450],[2230,450],[650,1400],[2230,1400]])detailedTree(x,y,1.15);for(const [x,y] of [[1160,805],[1720,805],[1160,1080],[1720,1080]]){R(x-50,y-10,100,20,'#85583c','#4d3529',3);R(x-38,y+10,8,24,'#5b3d2e');R(x+30,y+10,8,24,'#5b3d2e')}}
moveNearby=function(){let[dx,dy,m]=input(nearbyPlayer);nearbyPlayer.x=clamp(nearbyPlayer.x+dx,PH,Z40_NEAR_W-PH);nearbyPlayer.y=clamp(nearbyPlayer.y+dy,PH,Z40_NEAR_H-PH);animate(nearbyPlayer,m);const tx=clamp(nearbyPlayer.x-W/2,0,Z40_NEAR_W-W),ty=clamp(nearbyPlayer.y-H/2,0,Z40_NEAR_H-H);z40NearCam.x+=(tx-z40NearCam.x)*.14;z40NearCam.y+=(ty-z40NearCam.y)*.14}
nearNearbyCafe=function(){return Math.hypot(nearbyPlayer.x-1440,nearbyPlayer.y-735)<110}
const z40MoveCafeBase=moveCafe;moveCafe=function(){if(mode==='nearby'){moveNearby();return}z40MoveCafeBase();if(mode==='cafe'&&Z40_MOBILE()){const vw=760,vh=430;z40CafeCam.x+=(clamp(cafePlayer.x-vw/2,0,W-vw)-z40CafeCam.x)*.16;z40CafeCam.y+=(clamp(cafePlayer.y-vh/2,0,H-vh)-z40CafeCam.y)*.16}}
const z40DrawBase=draw;draw=function(){
 if(mode==='nearby'){ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-Math.round(z40NearCam.x),-Math.round(z40NearCam.y));z40DrawNearbyWorld();sprite(nearbyPlayer,nearbyPlayer.x,nearbyPlayer.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,nearbyPlayer.x,nearbyPlayer.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='nearby'){drawRemote(r,0,0);if(Number.isFinite(r.distanceM))T(`약 ${r.distanceM}m`,r.x,r.y-SPRITE_H-17,10,'#fff4d2','center',900)}ctx.restore();if(performance.now()<bubble.until)bubbleText(bubble.text,nearbyPlayer.x-z40NearCam.x,nearbyPlayer.y-z40NearCam.y);interaction.hidden=chatActive||!nearNearbyCafe();interactionText.textContent='카페로 들어가기';z40UpdateHud();return}
 if(mode==='cafe'&&Z40_MOBILE()){ctx.clearRect(0,0,W,H);const scale=1.26;ctx.save();ctx.scale(scale,scale);ctx.translate(-Math.round(z40CafeCam.x),-Math.round(z40CafeCam.y));drawCafe();sprite(cafePlayer,cafePlayer.x,cafePlayer.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,cafePlayer.x,cafePlayer.y-SPRITE_H/2-4);for(const r of remotePlayers.values())if(r.mode==='cafe')drawRemote(r,0,0);drawAiFriends(0,0);if(performance.now()<bubble.until)bubbleText(bubble.text,cafePlayer.x,cafePlayer.y);ctx.restore();interaction.hidden=true;z40UpdateHud();return}
 z40DrawBase();z40UpdateHud();
};
const z40GetState=window.ZooCafeGame.getState;window.ZooCafeGame.getState=function(){if(mode==='nearby')return {mode,x:nearbyPlayer.x,y:nearbyPlayer.y,dir:nearbyPlayer.dir,frame:nearbyPlayer.frame,moving:nearbyPlayer.moving};return z40GetState()};
const z40SetRoster=window.ZooCafeGame.setRoster;window.ZooCafeGame.setRoster=function(list){z40SetRoster(list);setTimeout(z40UpdateHud,0)};

/* ZOO:CAFE v41 — 1km nearby tiers: full <=500m, silhouette 501-1000m */
const Z41_FULL_RADIUS=500,Z41_MAX_RADIUS=1000;
nearbyRadiusM=Z41_MAX_RADIUS;
function z41DrawSilhouette(r){
  const im=characterImage(r.animal||'lion',r.dir||'down',r.frame||2);if(!im)return;
  const x=r.x,y=r.y;
  shadow(x,y+18,22,7,.12);
  ctx.save();ctx.globalAlpha=.72;ctx.filter='brightness(0)';
  ctx.drawImage(im,Math.round(x-SPRITE_W/2),Math.round(y-SPRITE_H+22),SPRITE_W,SPRITE_H);
  ctx.restore();
  T('???',x,y-SPRITE_H+8,11,'#f5e8cf','center',900);
  if(Number.isFinite(r.distanceM))T(`약 ${Math.round(r.distanceM/50)*50}m`,x,y-SPRITE_H-17,10,'#fff4d2','center',900);
  const b=remoteBubbles.get(r.id);if(b&&performance.now()<b.until)bubbleText(b.text,x,y);
}
function z41NearbyCounts(){let close=0,far=0;for(const r of remotePlayers.values()){if(r.mode!=='nearby'||!Number.isFinite(r.distanceM))continue;if(r.distanceM<=Z41_FULL_RADIUS)close++;else if(r.distanceM<=Z41_MAX_RADIUS)far++;}return {close,far,total:close+far+1}}
z40UpdateHud=function(){const el=z40Hud();if(!el)return;el.hidden=mode!=='nearby';if(mode!=='nearby')return;const c=z41NearbyCounts();el.innerHTML=`<strong><span class="gps-dot ${z40GpsOk?'ok':''}"></span>${z40GpsOk?'GPS 연결됨':z40GpsMessage}</strong><span>내 위치: ${z40GpsOk?'GPS 수신됨':'확인 중'} · 탐색 반경 1km · 접속 ${c.total}명</span><span>${z40GpsAccuracy!=null?`정확도 약 ${z40GpsAccuracy}m · `:''}500m 이내 ${c.close}명 · 실루엣 ${c.far}명</span>`}
const z41DrawBase=draw;
draw=function(){
 if(mode!=='nearby'){z41DrawBase();return}
 ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-Math.round(z40NearCam.x),-Math.round(z40NearCam.y));z40DrawNearbyWorld();
 sprite(nearbyPlayer,nearbyPlayer.x,nearbyPlayer.y);drawNameTitle(window.ZOO_USER?.nickname,window.ZOO_USER?.title,nearbyPlayer.x,nearbyPlayer.y-SPRITE_H/2-4);
 for(const r of remotePlayers.values())if(r.mode==='nearby'){
   if(Number.isFinite(r.distanceM)&&r.distanceM>Z41_FULL_RADIUS)z41DrawSilhouette(r);
   else {drawRemote(r,0,0);if(Number.isFinite(r.distanceM))T(`약 ${Math.round(r.distanceM/10)*10}m`,r.x,r.y-SPRITE_H-17,10,'#fff4d2','center',900)}
 }
 ctx.restore();if(performance.now()<bubble.until)bubbleText(bubble.text,nearbyPlayer.x-z40NearCam.x,nearbyPlayer.y-z40NearCam.y);
 interaction.hidden=chatActive||!nearNearbyCafe();interactionText.textContent='카페로 들어가기';z40UpdateHud();
};


/* ZOO:CAFE v42 — symmetric nearby sync + device-safe mobile camera */
function z42ViewportInfo(){
  const vv=window.visualViewport;
  return {w:Math.round(vv?.width||innerWidth),h:Math.round(vv?.height||innerHeight),dpr:window.devicePixelRatio||1};
}
function z42RefreshViewport(){
  const v=z42ViewportInfo();
  document.documentElement.style.setProperty('--z42-vw',v.w+'px');
  document.documentElement.style.setProperty('--z42-vh',v.h+'px');
}
addEventListener('resize',z42RefreshViewport,{passive:true});
addEventListener('orientationchange',()=>setTimeout(z42RefreshViewport,120),{passive:true});
window.visualViewport?.addEventListener('resize',z42RefreshViewport,{passive:true});
z42RefreshViewport();

// v40 already provides the café follow camera. Recalculate it every frame so
// iOS touch/viewport changes cannot leave the camera one movement step behind.
const z42DrawBase=draw;
draw=function(){
  if(mode==='cafe'&&Z40_MOBILE()){
    const viewW=760,viewH=430;
    const tx=clamp(cafePlayer.x-viewW/2,0,Math.max(0,W-viewW));
    const ty=clamp(cafePlayer.y-viewH/2,0,Math.max(0,H-viewH));
    z40CafeCam.x+=(tx-z40CafeCam.x)*.18;
    z40CafeCam.y+=(ty-z40CafeCam.y)*.18;
  }
  z42DrawBase();
};


/* v44 — Google Maps garden bridge. GPS, not joystick, is the garden position. */
const z44NearCafeBase=nearNearbyCafe;
nearNearbyCafe=function(){return mode==='nearby'?true:z44NearCafeBase()};


/* ================================================================
   ZOO:CAFE v50.1 — AI visibility + complete GPS plaza rollback
   ================================================================ */

// The old v38 GPS-plaza exit override was still active in the legacy chain.
// Restore the normal indoor -> outdoor-world exit path.
exit=function(){
  if(mode==='world'||cooldown>0)return;
  const b=mode==='cafe'?{door:cafe.door}:extraBuildings.find(v=>v.id===mode);
  mode='world';syncBgm();
  if(b){player.x=b.door.x+b.door.w/2;player.y=b.door.y+b.door.h+55}
  player.dir='down';
  camera.x=clamp(player.x-W/2,0,WORLD_W-W);
  camera.y=clamp(player.y-H/2,0,WORLD_H-H);
  cooldown=.28;
  window.ZooCafeNet?.tick?.(true);
};

// Desktop's later legacy draw override omitted AI friends from the café.
// Draw them with the exact same sprite() renderer used by the player.
function drawAiFriendsVisible(){
  if(mode!=='cafe')return;
  for(const n of aiFriends){
    if(n.room!=='cafe')continue;
    sprite(n,n.x,n.y,n.animal);
    drawNameTitle(n.name,n.title,n.x,n.y-SPRITE_H/2-4);
    if(n.bubble&&performance.now()<n.bubbleUntil)bubbleText(n.bubble,n.x,n.y);
  }
}
const z501DrawBase=draw;
draw=function(){
  z501DrawBase();
  // Mobile v40 already paints AI friends inside its scaled café renderer.
  // Desktop needs this final overlay because a later legacy renderer replaced the v50 draw.
  if(mode==='cafe' && !Z40_MOBILE())drawAiFriendsVisible();
};

// No GPS UI/mode should be reachable in v50.1.
window.ZooCafeGame.returnToCafe=function(){
  if(mode==='world')return false;
  exit();
  return true;
};


/* v51 — final navigation guard: retired GPS/nearby mode cannot be entered. */
try{
  enterNearbyFromCafe=async function(){ exit(); return false; };
  requestNearbyLocation=function(){ return Promise.resolve(false); };
}catch(e){}


/* ================================================================
   ZOO:CAFE v54 — Illustrated Café Scene
   Replaces only the café visual layer. World/network/AI logic stays intact.
   ================================================================ */
const z54CafeBg=new Image();
let z54CafeBgReady=false;
z54CafeBg.onload=()=>{z54CafeBgReady=true};
z54CafeBg.src='images/cafe-illustrated-v54.png';
const z54OldDrawCafe=drawCafe;
drawCafe=function(){
  if(!z54CafeBgReady){z54OldDrawCafe();return;}
  ctx.save();
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(z54CafeBg,0,0,W,H);
  // Gentle veil behind moving sprites so live characters remain readable.
  const g=ctx.createLinearGradient(0,H*.45,0,H);
  g.addColorStop(0,'rgba(20,12,8,0)');g.addColorStop(1,'rgba(20,12,8,.08)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.restore();
};
const z54DrawBase=draw;
draw=function(){
  document.querySelector('.game-shell')?.classList.toggle('cafe-visual',mode==='cafe');
  z54DrawBase();
};
addEventListener('DOMContentLoaded',()=>{
  const chat=()=>{try{openChat()}catch(e){document.getElementById('chatInputWrap').hidden=false;document.getElementById('chatInput')?.focus()}};
  document.getElementById('cafeChatBtn')?.addEventListener('click',chat);
  document.getElementById('cafeStoryBtn')?.addEventListener('click',chat);
});

/* ================================================================
   ZOO:CAFE v54.1 — Background Cast Café
   In the illustrated café, the characters painted into the background
   ARE the AI NPCs. No live player/NPC/remote sprites are drawn indoors.
   Player text is input-only; only NPC replies appear as speech bubbles.
   ================================================================ */
let z541Turn=0;
const z541NpcAnchors={
  'ai-mung':{x:338,y:385},
  'ai-rabbit':{x:503,y:385}
};

// In this fixed illustrated scene, proximity no longer chooses the speaker.
// Alternate the visible responder so both personalities take turns; v53.1
// server-side shared-ears memory still lets the other NPC learn what was said.
aiHearPlayer=function(text){
  if(mode!=='cafe')return;
  const order=['ai-mung','ai-rabbit'];
  const id=order[(z541Turn++)%order.length];
  const n=aiFriends.find(v=>v.id===id);
  if(!n)return;
  setTimeout(()=>{if(mode==='cafe')aiReply(n,text)},140);
};
window.ZooCafeAI.hear=aiHearPlayer;

function z541DrawNpcBubble(n){
  const a=z541NpcAnchors[n.id];if(!a)return;
  if(n.thinking){bubbleText('...',a.x,a.y);return;}
  if(n.bubble&&performance.now()<n.bubbleUntil)bubbleText(n.bubble,a.x,a.y);
}

const z541DrawBefore=draw;
draw=function(){
  document.querySelector('.game-shell')?.classList.toggle('cafe-visual',mode==='cafe');
  if(mode!=='cafe'){z541DrawBefore();return;}
  // Background-only café: no player sprite, no multiplayer avatars, no pixel NPCs.
  ctx.clearRect(0,0,W,H);
  drawCafe();
  for(const n of aiFriends)if(n.room==='cafe')z541DrawNpcBubble(n);
  interaction.hidden=true;
};

/* ================================================================
   ZOO:CAFE v54.2 — Storybook Bubble Polish
   - crops the baked decorative bottom chat strip out of the café artwork
   - keeps only the real interactive input when the player chooses to chat
   - NPC replies use warm parchment bubbles matched to the illustration
   ================================================================ */
const z542DrawCafeBase=drawCafe;
drawCafe=function(){
  if(!z54CafeBgReady){z54OldDrawCafe();return;}
  ctx.save();ctx.imageSmoothingEnabled=true;
  // The source artwork contains a decorative, non-functional bottom chat bar.
  // Crop that strip away and fit the clean scene to the game canvas.
  const cropH=Math.floor(z54CafeBg.naturalHeight*0.885);
  ctx.drawImage(z54CafeBg,0,0,z54CafeBg.naturalWidth,cropH,0,0,W,H);
  const g=ctx.createLinearGradient(0,H*.58,0,H);
  g.addColorStop(0,'rgba(34,20,11,0)');g.addColorStop(1,'rgba(34,20,11,.035)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.restore();
};

// Re-aligned to the characters after the clean artwork crop.
z541NpcAnchors['ai-mung']={x:338,y:424};
z541NpcAnchors['ai-rabbit']={x:503,y:424};

function z542StoryBubble(text,x,y,thinking=false,npcId=''){
  if(!text&&!thinking)return;
  ctx.save();
  const fontSize=13,lineH=19,padX=15,padY=10,maxW=300,minW=thinking?54:72;
  ctx.font=`700 ${fontSize}px "Noto Sans KR","Malgun Gothic",sans-serif`;
  const raw=thinking?'…':String(text),lines=[];let line='';
  for(const ch of [...raw]){const test=line+ch;if(ctx.measureText(test).width>maxW-padX*2&&line){lines.push(line);line=ch}else line=test}
  if(line)lines.push(line);const visible=lines.slice(0,4);if(lines.length>4)visible[3]=visible[3].slice(0,-1)+'…';
  const contentW=Math.max(...visible.map(v=>ctx.measureText(v).width),0);
  const tw=Math.max(minW,Math.min(maxW,contentW+padX*2)),bh=Math.max(39,visible.length*lineH+padY*2);
  const bx=clamp(x-tw/2,12,W-tw-12),by=clamp(y-104-(bh-39),12,H-bh-20);
  // soft shadow + parchment body
  RR(bx+3,by+5,tw,bh,13,'rgba(43,25,14,.22)');
  RR(bx,by,tw,bh,13,'rgba(255,246,222,.96)','#8b6747',1.5);
  // tiny warm accent line differentiates the two characters without looking gamey
  ctx.fillStyle=npcId==='ai-rabbit'?'rgba(202,142,132,.72)':'rgba(167,112,62,.72)';
  ctx.fillRect(bx+14,by+7,Math.min(42,tw-28),2);
  // tail
  ctx.fillStyle='rgba(255,246,222,.96)';ctx.strokeStyle='#8b6747';ctx.lineWidth=1.5;
  ctx.beginPath();const tx=clamp(x,bx+18,bx+tw-18);ctx.moveTo(tx-7,by+bh-1);ctx.lineTo(tx,by+bh+8);ctx.lineTo(tx+8,by+bh-1);ctx.closePath();ctx.fill();ctx.stroke();
  // redraw bottom edge over tail seams
  ctx.strokeStyle='rgba(139,103,71,.45)';ctx.beginPath();ctx.moveTo(bx+12,by+bh);ctx.lineTo(tx-7,by+bh);ctx.moveTo(tx+8,by+bh);ctx.lineTo(bx+tw-12,by+bh);ctx.stroke();
  ctx.fillStyle='#4a3425';ctx.textAlign='center';ctx.textBaseline='middle';
  visible.forEach((v,i)=>ctx.fillText(v,bx+tw/2,by+padY+lineH*(i+.5)+2));ctx.restore();
}

z541DrawNpcBubble=function(n){
  const a=z541NpcAnchors[n.id];if(!a)return;
  if(n.thinking){z542StoryBubble('…',a.x,a.y,true,n.id);return;}
  if(n.bubble&&performance.now()<n.bubbleUntil)z542StoryBubble(n.bubble,a.x,a.y,false,n.id);
};

/* ================================================================
   ZOO:CAFE v54.3 — Living Video Cafe
   The uploaded 10-second Flow clip is the real cafe background.
   Canvas stays transparent indoors and is used only for AI bubbles.
   The clip loops continuously. Its own ambience is enabled after the
   first cafe interaction (browser autoplay policies require a gesture).
   ================================================================ */
const z543CafeVideo=document.getElementById('sceneVideo');
let z543VideoSoundUnlocked=false;
function z543VideoOn(){
  if(!z543CafeVideo)return;
  z543CafeVideo.hidden=false;
  document.body.classList.add('scene-video-active');
  // Start muted so every browser can autoplay. First user gesture unlocks audio.
  if(!z543VideoSoundUnlocked)z543CafeVideo.muted=true;
  z543CafeVideo.play().catch(()=>{});
  if(z543VideoSoundUnlocked&&cafeBgm)cafeBgm.pause();
}
function z543VideoOff(){
  if(!z543CafeVideo)return;
  z543CafeVideo.pause();
  z543CafeVideo.hidden=true;
  document.body.classList.remove('scene-video-active');
}
function z543UnlockVideoSound(){
  if(mode!=='cafe'||!z543CafeVideo)return;
  z543VideoSoundUnlocked=true;
  z543CafeVideo.muted=false;
  z543CafeVideo.volume=Math.max(.15,Math.min(1,bgmVolume));
  if(cafeBgm)cafeBgm.pause();
  z543CafeVideo.play().catch(()=>{});
}
addEventListener('pointerdown',z543UnlockVideoSound,{passive:true});
addEventListener('keydown',()=>{if(mode==='cafe')z543UnlockVideoSound()});

// Keep the old world BGM, but let the uploaded video provide the cafe ambience.
const z543SyncBgmBase=syncBgm;
syncBgm=function(){
  if(mode==='cafe'){
    if(cityBgm)cityBgm.pause();
    if(cafeBgm)cafeBgm.pause();
    z543VideoOn();
    return;
  }
  z543VideoOff();
  z543SyncBgmBase();
};

// Final cafe renderer: video below, storybook AI bubbles above.
const z543DrawBase=draw;
draw=function(){
  document.querySelector('.game-shell')?.classList.toggle('cafe-visual',mode==='cafe');
  if(mode!=='cafe'){
    z543VideoOff();
    z543DrawBase();
    return;
  }
  z543VideoOn();
  ctx.clearRect(0,0,W,H);
  for(const n of aiFriends)if(n.room==='cafe')z541DrawNpcBubble(n);
  interaction.hidden=true;
};

// If the game is restored/reloaded while already in the cafe, synchronize video.
addEventListener('visibilitychange',()=>{
  if(document.hidden){z543CafeVideo?.pause();return;}
  if(mode==='cafe')z543VideoOn();
});


/* ================================================================
   ZOO:CAFE v54.4 — Social Video Cafe
   Clear character faces, clickable sidebars, café BGM + video ambience.
   Multiplayer/network state is untouched.
   ================================================================ */
// Speech tails point above the characters instead of across their faces.
z541NpcAnchors['ai-mung']={x:360,y:330};
z541NpcAnchors['ai-rabbit']={x:545,y:330};

// Keep the uploaded wave/lantern ambience and layer the café BGM beneath it.
function z544CafeAudio(){
  if(mode!=='cafe')return;
  if(!bgmStarted)bgmStarted=true;
  if(!bgmEnabled){ if(cafeBgm)cafeBgm.pause(); return; }
  if(cafeBgm){cafeBgm.volume=Math.max(.08,Math.min(.34,bgmVolume*.58));cafeBgm.play().catch(()=>{});}
  if(z543CafeVideo){
    z543CafeVideo.volume=Math.max(.10,Math.min(.42,bgmVolume*.72));
    if(z543VideoSoundUnlocked)z543CafeVideo.muted=false;
    z543CafeVideo.play().catch(()=>{});
  }
}
const z544SyncBgmBase=syncBgm;
syncBgm=function(){
  if(mode==='cafe'){
    if(cityBgm)cityBgm.pause();
    z543VideoOn();z544CafeAudio();return;
  }
  z544SyncBgmBase();
};
const z544UnlockBase=z543UnlockVideoSound;
z543UnlockVideoSound=function(){z544UnlockBase();z544CafeAudio();};

addEventListener('DOMContentLoaded',()=>{
  const chat=()=>{try{openChat()}catch(e){chatInputWrap.hidden=false;chatInput?.focus()}};
  document.getElementById('cafeBarChat')?.addEventListener('click',chat);
  const sound=document.getElementById('cafeBarSound');
  sound?.addEventListener('click',()=>{
    bgmEnabled=!bgmEnabled;
    sound.classList.toggle('sound-off',!bgmEnabled);
    sound.querySelector('span').textContent=bgmEnabled?'🎵':'🔇';
    if(bgmEnabled){bgmStarted=true;z543VideoSoundUnlocked=true;if(z543CafeVideo)z543CafeVideo.muted=false;z544CafeAudio();}
    else{if(cafeBgm)cafeBgm.pause();if(z543CafeVideo)z543CafeVideo.muted=true;}
  });
  document.getElementById('cafeBarFriends')?.addEventListener('click',()=>{
    // Existing multiplayer roster is already rendered in .player-list; expose it in a small modal via profile/menu UI fallback.
    document.querySelector('[data-panel="profile"]')?.click();
  });
});

// Mirror current-room online count into the café bar without changing network logic.
setInterval(()=>{
  const n=document.querySelectorAll('.player-list > *').length;
  document.querySelectorAll('.cafe-online-count').forEach(el=>el.textContent=String(n+1));
},1000);


/* ================================================================
   ZOO:CAFE v54.5 — Full View + Conversation History
   - Never crop the living cafe video: full 16:9 frame is always visible.
   - Chat button opens the real conversation history and input together.
   - NPC lines are already recorded by aiSay(); multiplayer lines stay shared.
   ================================================================ */
function z545OpenCafeChat(){
  document.body.classList.add('cafe-chat-history-open');
  try{openChat()}catch(e){if(chatInputWrap){chatInputWrap.hidden=false;chatInput?.focus();}}
}
function z545CloseCafeChatHistory(){document.body.classList.remove('cafe-chat-history-open')}
const z545CloseChatBase=closeChat;
closeChat=function(){z545CloseChatBase();z545CloseCafeChatHistory();};
const z545OpenChatBase=openChat;
openChat=function(){
  z545OpenChatBase();
  if(mode==='cafe')document.body.classList.add('cafe-chat-history-open');
};
addEventListener('DOMContentLoaded',()=>{
  const b=document.getElementById('cafeBarChat');
  if(b){
    // Replace the v54.4 listener effect by stopping later duplicate clicks from toggling other UI.
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();z545OpenCafeChat();},{capture:true});
  }
});


/* v54.6 — sync the blurred live backdrop used by the portrait mobile lounge. */
const z546BlurVideo=document.getElementById('sceneVideoBlur');
function z546SyncBlurVideo(){
  if(!z546BlurVideo||!z543CafeVideo)return;
  if(mode!=='cafe'){z546BlurVideo.pause();return;}
  z546BlurVideo.muted=true;
  if(Math.abs((z546BlurVideo.currentTime||0)-(z543CafeVideo.currentTime||0))>.35){try{z546BlurVideo.currentTime=z543CafeVideo.currentTime||0}catch{}}
  z546BlurVideo.play().catch(()=>{});
}
setInterval(z546SyncBlurVideo,1200);
addEventListener('visibilitychange',()=>{if(!document.hidden)z546SyncBlurVideo()});
