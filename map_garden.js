(()=>{
const layer=document.getElementById('googleGarden'), mapEl=document.getElementById('googleGardenMap'), msg=document.getElementById('gardenMapMessage');
if(!layer||!mapEl)return;
let map=null, mapsReady=false, loading=false, selfOverlay=null, selfPos=null, geoWatch=null, lastMode='', roster=[];
const overlays=new Map();
const state=()=>window.ZooCafeGame?.getState?.();
const imgFor=a=>a==='rabbit'?'images/rabbit/rabbit-preview.png':'images/mung-saja-down-2.png';
function setMsg(t){msg.textContent=t;layer.classList.remove('ready')}
class CharacterOverlay extends google.maps.OverlayView{
  constructor(pos,opts){super();this.pos=pos;this.opts=opts;this.el=null;this.setMap(map)}
  onAdd(){const d=document.createElement('div');d.className='garden-marker '+(this.opts.me?'me ':'')+(this.opts.silhouette?'silhouette':'');d.innerHTML=`<img src="${imgFor(this.opts.animal)}" alt=""><span class="gm-name">${this.opts.label}</span>`;this.el=d;this.getPanes().overlayMouseTarget.appendChild(d)}
  draw(){if(!this.el)return;const p=this.getProjection().fromLatLngToDivPixel(this.pos);this.el.style.left=p.x+'px';this.el.style.top=p.y+'px'}
  onRemove(){this.el?.remove();this.el=null}
  update(pos,opts){this.pos=pos;this.opts=opts;if(this.el){this.el.className='garden-marker '+(opts.me?'me ':'')+(opts.silhouette?'silhouette':'');this.el.querySelector('img').src=imgFor(opts.animal);this.el.querySelector('.gm-name').textContent=opts.label}this.draw()}
}
async function loadMaps(){if(mapsReady)return true;if(loading)return new Promise(r=>{const t=setInterval(()=>{if(mapsReady){clearInterval(t);r(true)}},100)});loading=true;setMsg('Google 지도 불러오는 중…');try{const c=await fetch('/api/maps-config',{cache:'no-store'}).then(r=>r.json());if(!c.key){setMsg('Render 환경변수 GOOGLE_MAPS_API_KEY를 설정해 주세요.');loading=false;return false}await new Promise((resolve,reject)=>{window.__z44MapsReady=()=>resolve();const sc=document.createElement('script');sc.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(c.key)}&callback=__z44MapsReady&v=weekly`;sc.async=true;sc.onerror=()=>reject(new Error('maps load failed'));document.head.appendChild(sc)});mapsReady=true;loading=false;return true}catch(e){loading=false;setMsg('Google 지도를 불러오지 못했어요. Demo Key 설정과 허용 도메인을 확인해 주세요.');return false}}
function syncRemoteMarkers(){if(!mapsReady||!map)return;const me=window.ZOO_USER?.id, seen=new Set();for(const p of roster){if(!p||p.id===me||p.mode!=='nearby'||!Number.isFinite(p.mapLat)||!Number.isFinite(p.mapLon)||!Number.isFinite(p.distanceM)||p.distanceM>1000)continue;seen.add(p.id);const far=p.distanceM>500,pos=new google.maps.LatLng(p.mapLat,p.mapLon),label=far?`??? · 약 ${Math.round(p.distanceM/50)*50}m`:`${p.nickname} · 약 ${Math.round(p.distanceM/10)*10}m`,opts={animal:p.animal,label,silhouette:far};if(overlays.has(p.id))overlays.get(p.id).update(pos,opts);else overlays.set(p.id,new CharacterOverlay(pos,opts))}for(const [id,o] of overlays)if(!seen.has(id)){o.setMap(null);overlays.delete(id)}}
function updateSelf(pos){selfPos={lat:pos.coords.latitude,lng:pos.coords.longitude};if(!mapsReady||!map)return;const ll=new google.maps.LatLng(selfPos);const opts={me:true,animal:window.ZOO_USER?.animal||'lion',label:'나',silhouette:false};if(!selfOverlay)selfOverlay=new CharacterOverlay(ll,opts);else selfOverlay.update(ll,opts);map.panTo(ll);layer.classList.add('ready')}
async function enterGarden(){layer.hidden=false;document.body.classList.add('z44-garden');if(!(await loadMaps()))return;if(!map){const center=selfPos||{lat:37.5665,lng:126.9780};map=new google.maps.Map(mapEl,{center,zoom:16,disableDefaultUI:true,gestureHandling:'greedy',clickableIcons:false,mapTypeControl:false,streetViewControl:false,fullscreenControl:false});}if(navigator.geolocation&&geoWatch==null){geoWatch=navigator.geolocation.watchPosition(updateSelf,e=>setMsg(e.code===1?'위치 권한을 허용해 주세요.':'현재 위치를 확인하지 못했어요.'),{enableHighAccuracy:true,maximumAge:5000,timeout:15000})}syncRemoteMarkers()}
function leaveGarden(){layer.hidden=true;document.body.classList.remove('z44-garden');if(geoWatch!=null){navigator.geolocation.clearWatch(geoWatch);geoWatch=null}selfOverlay?.setMap(null);selfOverlay=null;for(const o of overlays.values())o.setMap(null);overlays.clear()}
// Capture the roster that the existing multiplayer client already receives.
const hook=()=>{const g=window.ZooCafeGame;if(!g||g.__z44hook)return false;g.__z44hook=true;const sr=g.setRoster.bind(g),sm=g.setRemote.bind(g);g.setRoster=list=>{roster=Array.isArray(list)?list:[];sr(list);syncRemoteMarkers()};g.setRemote=p=>{sm(p);if(p){const i=roster.findIndex(x=>x.id===p.id);if(i>=0)roster[i]={...roster[i],...p};else roster.push(p);syncRemoteMarkers()}};return true};
const hookTimer=setInterval(()=>{if(hook())clearInterval(hookTimer)},50);
setInterval(()=>{const m=state()?.mode||'';if(m!==lastMode){lastMode=m;m==='nearby'?enterGarden():leaveGarden()}},120);
})();
