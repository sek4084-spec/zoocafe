(()=>{
const layer=document.getElementById('googleGarden'),mapEl=document.getElementById('googleGardenMap'),msg=document.getElementById('gardenMapMessage');
if(!layer||!mapEl)return;
let map,AdvancedMarkerElement,selfMarker,selfPos,watchId,lastMode='',roster=[],loading;const remotes=new Map();
const state=()=>window.ZooCafeGame?.getState?.(),img=a=>a==='rabbit'?'images/rabbit/rabbit-preview.png':'images/mung-saja-down-2.png';
function say(t){msg.textContent=t;msg.hidden=false} function quiet(){msg.hidden=true}
async function load(){if(window.google?.maps&&AdvancedMarkerElement)return true;if(loading)return loading;loading=(async()=>{const key=window.ZOO_MAPS_DEMO_KEY||window.ZOO_MAPS_API_KEY;if(!key){say('Google Maps 키가 없습니다.');return false}say('Google 지도 불러오는 중…');await new Promise((ok,no)=>{if(window.google?.maps)return ok();window.__z45=ok;const s=document.createElement('script');s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__z45&v=weekly&libraries=marker`;s.async=true;s.onerror=no;document.head.appendChild(s)});AdvancedMarkerElement=(await google.maps.importLibrary('marker')).AdvancedMarkerElement;return true})().catch(e=>{console.error(e);say('Google 지도를 불러오지 못했습니다.');return false});return loading}
function el(a,n,s=false,me=false){const d=document.createElement('div');d.className='v45-map-avatar '+(me?'me ':'')+(s?'silhouette':'');d.innerHTML=`<img src="${img(a)}" alt=""><span>${n}</span>`;return d}
function mine(lat,lng){selfPos={lat,lng};if(!map||!AdvancedMarkerElement)return;if(!selfMarker)selfMarker=new AdvancedMarkerElement({map,position:selfPos,content:el(window.ZOO_USER?.animal||'lion','나',false,true),title:'내 위치'});else selfMarker.position=selfPos;map.panTo(selfPos);quiet()}
function sync(){if(!map||!AdvancedMarkerElement)return;const me=window.ZOO_USER?.id,seen=new Set();for(const p of roster){if(!p||p.id===me||p.mode!=='nearby'||!Number.isFinite(p.mapLat)||!Number.isFinite(p.mapLon)||!Number.isFinite(p.distanceM)||p.distanceM>1000)continue;seen.add(p.id);const sil=p.distanceM>500,pos={lat:p.mapLat,lng:p.mapLon},label=sil?`??? · 약 ${Math.round(p.distanceM/50)*50}m`:`${p.nickname} · 약 ${Math.round(p.distanceM/10)*10}m`;let m=remotes.get(p.id);if(!m){m=new AdvancedMarkerElement({map,position:pos,content:el(p.animal,label,sil),title:label});remotes.set(p.id,m)}else m.position=pos}for(const[id,m]of remotes)if(!seen.has(id)){m.map=null;remotes.delete(id)}}
async function open(){layer.hidden=false;document.body.classList.add('v45-map-screen');say('GPS와 Google 지도를 연결하는 중…');if(!(await load()))return;if(!map)map=new google.maps.Map(mapEl,{center:selfPos||{lat:37.5665,lng:126.9780},zoom:17,disableDefaultUI:true,zoomControl:true,gestureHandling:'greedy',
minZoom:15,maxZoom:19,
styles:[
 {elementType:'geometry',stylers:[{color:'#efe1bd'}]},
 {elementType:'labels.text.fill',stylers:[{color:'#654b36'}]},
 {elementType:'labels.text.stroke',stylers:[{color:'#fff5dd'}]},
 {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
 {featureType:'poi.business',stylers:[{visibility:'off'}]},
 {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#b9d79b'}]},
 {featureType:'road',elementType:'geometry',stylers:[{color:'#fff0ca'}]},
 {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#d7bc8e'}]},
 {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
 {featureType:'transit',elementType:'labels.icon',stylers:[{visibility:'off'}]},
 {featureType:'water',elementType:'geometry',stylers:[{color:'#9ed5dc'}]},
 {featureType:'administrative',elementType:'labels',stylers:[{visibility:'simplified'}]}
 ]});if(navigator.geolocation&&watchId==null)watchId=navigator.geolocation.watchPosition(p=>{mine(p.coords.latitude,p.coords.longitude);window.ZooCafeNet?.sendGeo?.(p.coords.latitude,p.coords.longitude)},e=>say(e.code===1?'휴대폰 위치 권한을 허용해 주세요.':'GPS 위치를 확인하지 못했습니다.'),{enableHighAccuracy:true,maximumAge:3000,timeout:15000});sync()}
function close(){layer.hidden=true;document.body.classList.remove('v45-map-screen');if(watchId!=null){navigator.geolocation.clearWatch(watchId);watchId=null}if(selfMarker){selfMarker.map=null;selfMarker=null}for(const m of remotes.values())m.map=null;remotes.clear()}
const h=setInterval(()=>{const g=window.ZooCafeGame;if(!g||g.__v45)return;g.__v45=true;clearInterval(h);const sr=g.setRoster.bind(g),sm=g.setRemote.bind(g);g.setRoster=l=>{roster=Array.isArray(l)?l:[];sr(l);sync()};g.setRemote=p=>{sm(p);if(p){const i=roster.findIndex(x=>x.id===p.id);i>=0?roster[i]={...roster[i],...p}:roster.push(p);sync()}}},50);
setInterval(()=>{const m=state()?.mode||'';if(m!==lastMode){lastMode=m;m==='nearby'?open():close()}},100);
})();