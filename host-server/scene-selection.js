/* Café video selection. Loaded independently so a later game script error
   cannot leave the original video permanently selected. */
(()=>{
 const video=document.getElementById('sceneVideo');
 const blur=document.getElementById('sceneVideoBlur');
 const badge=document.querySelector('.version-badge');
 const shell=document.querySelector('.game-shell');
 const clips=['video/cafe-living-v54.mp4','video/cafe-scene-1.mp4','video/cafe-scene-2.mp4','video/cafe-scene-3.mp4'];
 if(!video||!shell)return;
 let inside=false,selected=null,serverChosen=false,serverOutdated=false;
 let polling=false;
 const inCafe=()=>shell.classList.contains('cafe-visual');
 function showStatus(message){if(badge)badge.textContent=serverOutdated?'ZOO:CAFE · 이전 서버 실행 중 · 서버 재시작 필요':message}
 function setSource(element,src){
  if(!element||element.getAttribute('src')===src)return;
  element.pause();
  element.setAttribute('src',src);
  const nested=element.querySelector('source');
  if(nested)nested.setAttribute('src',src);
  element.load();
 }
 function apply(value,fromServer=true){
  const id=Number(value);
  if(!Number.isInteger(id)||id<0||id>=clips.length)return;
  if(fromServer){serverChosen=true;inside=true}
  if(selected!==id&&window.ZooCafeAI)window.ZooCafeAI.lastSpeakerId=null;
  selected=id;
  for(const element of [video,blur])setSource(element,clips[id]);
  showStatus(`ZOO:CAFE · 장면 ${id} / 0–3${serverChosen?'':' · 서버 연결 대기'}`);
  if(inCafe()){
   video.play().catch(()=>{});
   if(blur){blur.muted=true;blur.play().catch(()=>{})}
  }
 }
 function onEnter(){
  if(inside)return;
  inside=true;
  // The server may confirm the scene before the first cafe frame is drawn.
  // Keep that choice instead of replacing it with a local random clip.
  if(serverChosen){apply(selected);return}
  apply(Math.floor(Math.random()*clips.length),false);
  window.ZooCafeNet?.requestCafeScene?.();
 }
 function onLeave(){inside=false;serverChosen=false;selected=null}
 function setServerVersion(version){
  serverOutdated=version!=='55.9.5';
  if(serverOutdated)showStatus('이전 서버 실행 중');
  else showStatus(inside?`ZOO:CAFE · 장면 ${selected??0} / 0–3${serverChosen?'':' · 서버 장면 대기'}`:'ZOO:CAFE · 서버 연결됨 · 카페 입장 시 추첨');
 }
 video.addEventListener('error',()=>showStatus(`장면 ${selected??'?'} 영상 로드 실패 · video 폴더 확인`));
 window.ZooCafeScene={apply,onEnter,onLeave,setServerVersion,current:()=>selected};
 showStatus('ZOO:CAFE · 영상 선택 준비 완료');
 // Check the scene and conversation even if a WebSocket room update was missed.
 async function syncCafe(){
  if(!inCafe()||polling)return;
  onEnter();polling=true;
  try{
   const token=(localStorage.getItem('zoocafe_token')||sessionStorage.getItem('zoocafe_token'));
   if(!token)return;
   const response=await fetch('/api/cafe/live',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(!inCafe())return;
   if(data.version)setServerVersion(data.version);
   apply(data.sceneId);
  }catch(e){window.ZooCafeNet?.requestCafeScene?.()}
  finally{polling=false}
 }
 setInterval(syncCafe,1800);
})();
