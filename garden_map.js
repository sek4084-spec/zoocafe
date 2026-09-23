(()=>{
let map=null, AdvancedMarkerElement=null, selfMarker=null, loaded=null;
const remoteMarkers=new Map();
const el=()=>document.getElementById('gardenMap');
const status=()=>document.getElementById('gardenMapStatus');
function key(){return String(window.ZOO_MAPS_DEMO_KEY||'').trim()}
function setStatus(t,bad=false){const s=status();if(s){s.textContent=t;s.classList.toggle('bad',bad)}}
function load(){
 if(window.google?.maps?.importLibrary)return Promise.resolve();
 if(loaded)return loaded;
 const k=key();
 if(!k||k.includes('PASTE_YOUR'))return Promise.reject(new Error('Demo Key를 map_config.js에 붙여넣어 주세요.'));
 loaded=new Promise((resolve,reject)=>{
  const cb='__zooGardenMapsReady';window[cb]=()=>{delete window[cb];resolve()};
  const sc=document.createElement('script');sc.async=true;sc.onerror=()=>reject(new Error('Google 지도 스크립트를 불러오지 못했습니다.'));
  sc.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(k)}&loading=async&callback=${cb}&libraries=marker&language=ko&region=KR`;
  document.head.appendChild(sc);
 });return loaded;
}
function markerContent(animal='lion',silhouette=false,self=false){
 const wrap=document.createElement('div');wrap.className='zoo-map-marker'+(silhouette?' silhouette':'')+(self?' self':'');
 const img=document.createElement('img');img.src=animal==='rabbit'?'images/rabbit/rabbit-preview.png':'images/mung-saja-down-2.png';img.alt='';wrap.appendChild(img);
 if(self){const b=document.createElement('b');b.textContent='나';wrap.appendChild(b)}return wrap;
}
async function ensure(center){
 await load();
 if(!map){
  const {Map}=await google.maps.importLibrary('maps');({AdvancedMarkerElement}=await google.maps.importLibrary('marker'));
  map=new Map(el(),{center,zoom:17,mapId:'DEMO_MAP_ID',disableDefaultUI:true,zoomControl:true,gestureHandling:'greedy',clickableIcons:false});
 }
 return map;
}
async function setSelf(lat,lon,animal){
 const p={lat, lng:lon};
 try{await ensure(p);setStatus('GPS 위치를 지도에 표시 중');
  if(!selfMarker)selfMarker=new AdvancedMarkerElement({map,position:p,content:markerContent(animal,false,true),zIndex:9999,title:'내 위치'});else selfMarker.position=p;
  map.panTo(p);
 }catch(e){setStatus(e.message||'지도를 불러오지 못했습니다.',true)}
}
async function setRemotes(players=[]){
 if(!map||!AdvancedMarkerElement)return;
 const keep=new Set();
 for(const p of players){if(p.mode!=='nearby'||!Number.isFinite(p.displayLat)||!Number.isFinite(p.displayLon))continue;keep.add(p.id);const pos={lat:p.displayLat,lng:p.displayLon};const sil=p.visibility==='silhouette'||p.distanceM>500;let m=remoteMarkers.get(p.id);
  if(!m){m=new AdvancedMarkerElement({map,position:pos,content:markerContent(p.animal,sil,false),title:sil?'1km 이내 친구':(p.nickname||'주변 친구')});remoteMarkers.set(p.id,m)}else m.position=pos;
 }
 for(const [id,m] of remoteMarkers)if(!keep.has(id)){m.map=null;remoteMarkers.delete(id)}
}
function show(){const d=el();if(d)d.hidden=false;document.body.classList.add('garden-map-mode')}
function hide(){const d=el();if(d)d.hidden=true;document.body.classList.remove('garden-map-mode')}
window.ZooGardenMap={show,hide,setSelf,setRemotes,recenter(){if(window.ZOO_LAST_GEO)setSelf(window.ZOO_LAST_GEO.lat,window.ZOO_LAST_GEO.lon,window.ZOO_USER?.animal)}};
})();
