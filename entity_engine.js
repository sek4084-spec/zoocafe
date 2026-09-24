/* ZOO:CAFE v51 — independent character/entity layer
   Background renderer and character renderer are deliberately separated.
   Future PNG / pixel animation / WebM background changes do not affect NPC visibility.
*/
(()=>{
 const layer=document.getElementById('entityLayer');
 if(!layer)return;
 const ec=layer.getContext('2d'); ec.imageSmoothingEnabled=false;
 const SW=66,SH=78;
 const sprites={lion:{},rabbit:{}};
 let assetsReady=false,loaded=0,total=24;

 function loadSet(animal,path){
   for(const dir of ['down','left','right','up'])for(const frame of [1,2,3]){
     const im=new Image();
     im.onload=()=>{loaded++;assetsReady=loaded>=total};
     im.onerror=()=>{loaded++;assetsReady=loaded>=total};
     im.src=path(dir,frame);sprites[animal][`${dir}-${frame}`]=im;
   }
 }
 loadSet('lion',(d,f)=>`images/mung-saja-${d}-${f}.png`);
 loadSet('rabbit',(d,f)=>`images/rabbit/rabbit-${d}-${f}.png`);

 function label(text,x,y,size=11,color='#fff7e6'){
   ec.save();ec.font=`900 ${size}px monospace`;ec.textAlign='center';ec.textBaseline='middle';
   ec.lineWidth=4;ec.strokeStyle='rgba(48,31,22,.92)';ec.strokeText(text,x,y);
   ec.fillStyle=color;ec.fillText(text,x,y);ec.restore();
 }
 function bubble(text,x,y,thinking=false){
   if(!text&&!thinking)return;const raw=thinking?'...':String(text),maxW=280,padX=12,padY=8,lineH=18;ec.save();ec.font='800 13px monospace';
   const lines=[];let line='';for(const ch of [...raw]){const test=line+ch;if(ec.measureText(test).width>maxW-padX*2&&line){lines.push(line);line=ch}else line=test}
   if(line)lines.push(line);const visible=lines.slice(0,4);if(lines.length>4)visible[3]=visible[3].slice(0,-1)+'…';
   const contentW=Math.max(...visible.map(v=>ec.measureText(v).width),0),w=Math.max(thinking?48:34,Math.min(maxW,contentW+padX*2)),h=Math.max(34,visible.length*lineH+padY*2);
   const bx=Math.max(8,Math.min(960-w-8,x-w/2)),by=Math.max(8,y-88-(h-34));ec.fillStyle='#fff';ec.strokeStyle='#211a17';ec.lineWidth=2;ec.beginPath();ec.roundRect(bx,by,w,h,7);ec.fill();ec.stroke();
   const tx=Math.max(bx+14,Math.min(bx+w-14,x));ec.beginPath();ec.moveTo(tx-7,by+h-1);ec.lineTo(tx,by+h+8);ec.lineTo(tx+7,by+h-1);ec.closePath();ec.fill();ec.stroke();
   ec.fillStyle='#111';ec.textAlign='center';ec.textBaseline='middle';visible.forEach((v,i)=>ec.fillText(v,bx+w/2,by+padY+lineH*(i+.5)));ec.restore();
 }
 function avatar(n,x,y){
   const im=sprites[n.animal||'lion'][`${n.dir||'down'}-${n.frame||2}`];
   // Visible debug fallback: even a missing asset can never make an NPC disappear silently.
   ec.save();
   ec.fillStyle='rgba(45,31,23,.22)';ec.beginPath();ec.ellipse(x,y+28,22,7,0,0,Math.PI*2);ec.fill();
   if(im&&im.complete&&im.naturalWidth){
     ec.drawImage(im,Math.round(x-SW/2),Math.round(y-SH/2),SW,SH);
   }else{
     ec.fillStyle=n.animal==='rabbit'?'#f4ead9':'#d8a15f';
     ec.fillRect(Math.round(x-22),Math.round(y-30),44,52);
     label(n.animal==='rabbit'?'토끼':'사자',x,y-3,10,'#49352b');
   }
   ec.restore();
   label(`🐾 ${n.title||'친구'} 🐾`,x,y-SH/2-18,9,'#f6d59a');
   label(n.name||'친구',x,y-SH/2-5,11);
   if(n.thinking)bubble('',x,y,true);else if(n.bubble&&performance.now()<n.bubbleUntil)bubble(n.bubble,x,y,false);
 }
 function render(){
   ec.clearRect(0,0,960,540);
   try{
     if(typeof mode!=='undefined'&&mode==='cafe'&&typeof aiFriends!=='undefined'&&!document.querySelector('.game-shell')?.classList.contains('cafe-visual')){
       const mobile=typeof Z40_MOBILE==='function'&&Z40_MOBILE();
       if(mobile){
         const scale=1.26,cam=(typeof z40CafeCam!=='undefined'?z40CafeCam:{x:0,y:0});
         ec.save();ec.scale(scale,scale);ec.translate(-Math.round(cam.x),-Math.round(cam.y));
         for(const n of aiFriends)if(n.room==='cafe')avatar(n,n.x,n.y);
         ec.restore();
       }else{
         for(const n of aiFriends)if(n.room==='cafe')avatar(n,n.x,n.y);
       }
     }
   }catch(e){ /* keep game running; renderer retries next frame */ }
   requestAnimationFrame(render);
 }
 requestAnimationFrame(render);

 // Disable old AI painting paths: v51 owns NPC visuals in entityLayer only.
 try{if(typeof drawAiFriends!=='undefined')drawAiFriends=()=>{};}catch(e){}
 try{if(typeof drawAiFriendsVisible!=='undefined')drawAiFriendsVisible=()=>{};}catch(e){}

 // Future background-video hook. Example:
 // ZooCafeScene.setVideo('video/cafe-loop.webm') / ZooCafeScene.clearVideo()
 window.ZooCafeScene={
   setVideo(src){
     const v=document.getElementById('sceneVideo');if(!v)return;
     v.src=src;v.hidden=false;document.body.classList.add('scene-video-active');
     v.play().catch(()=>{});
   },
   clearVideo(){
     const v=document.getElementById('sceneVideo');if(!v)return;
     v.pause();v.removeAttribute('src');v.load();v.hidden=true;
     document.body.classList.remove('scene-video-active');
   }
 };
 window.ZooCafeEntities={layer,sprites,getAI:()=>typeof aiFriends!=='undefined'?aiFriends:[]};
})();