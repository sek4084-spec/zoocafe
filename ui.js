(()=>{
const layer=document.getElementById('modalLayer'), content=document.getElementById('modalContent'), close=document.getElementById('modalClose');
const playerImg='images/mung-saja-down-2.png';
const panels={
menu:()=>`<h2 class="modal-title">ZOO:CAFE 메뉴</h2><div class="menu-grid"><button class="menu-tile" data-go="profile"><span>♟</span>프로필</button><button class="menu-tile" data-go="inventory"><span>▣</span>가방</button><button class="menu-tile" data-go="map"><span>⌖</span>지도</button><button class="menu-tile"><span>♧</span>친구</button><button class="menu-tile"><span>✉</span>우편함</button><button class="menu-tile"><span>★</span>도감</button><button class="menu-tile" data-go="settings"><span>⚙</span>설정</button><button class="menu-tile" data-close="1"><span>↩</span>게임으로</button></div>`,
profile:()=>`<h2 class="modal-title">내 프로필</h2><div class="profile-card"><div class="profile-hero"><img src="${playerImg}"><h3>멍사자</h3><small>Lv. 5 · ZOO:CAFE</small></div><div class="profile-lines"><div><b>상태 메시지</b><br><small>좋은 커피, 좋은 사람, 좋은 이야기 ☕</small></div><div><b>현재 위치</b><br><small>ZOO:CAFE 광장</small></div><div><b>칭호</b><br><small>카페를 좋아하는 중</small></div><div><b>오늘의 발걸음</b><br><small>320 / 500</small></div></div></div>`,
inventory:()=>`<h2 class="modal-title">가방</h2><div class="inventory-grid">${['☕','🍰','🌼','🪑','🥖','🌸','🐟','🍯','📖','🎁','','','','','','','',''].map(x=>`<div class="slot">${x}</div>`).join('')}</div><p style="text-align:right;color:#806b55">9 / 18</p>`,
map:()=>`<h2 class="modal-title">지도</h2><div class="map-box"></div><p>현재 위치: <b>ZOO:CAFE 광장</b> · 나중에 지역 이동과 실제 플레이어 위치를 연결할 수 있어요.</p>`,
settings:()=>`<h2 class="modal-title">설정</h2><div class="settings-list"><div class="setting"><b>부드러운 카메라 이동</b><span class="toggle"></span></div><div class="setting"><b>채팅 말풍선</b><span class="toggle"></span></div><div class="setting"><b>픽셀 그래픽 선명하게</b><span class="toggle"></span></div><div class="setting"><b>도시 BGM</b><label><input id="bgmToggle" type="checkbox" checked> ON</label></div><div class="setting"><b>BGM 볼륨</b><input id="bgmVolume" type="range" min="0" max="100" value="45"></div><div class="setting"><b>효과음</b><span>80%</span></div></div>`};
function show(name){content.innerHTML=(panels[name]||panels.menu)();layer.hidden=false;document.body.classList.add('menu-open');for(const k in window.keys||{})window.keys[k]=false;if(name==='settings'){const v=document.getElementById('bgmVolume'),t=document.getElementById('bgmToggle');if(v&&window.ZooCafeAudio){v.value=Math.round(window.ZooCafeAudio.getBgmVolume()*100);v.addEventListener('input',()=>window.ZooCafeAudio.setBgmVolume(Number(v.value)/100));}if(t&&window.ZooCafeAudio)t.addEventListener('change',()=>window.ZooCafeAudio.toggleBgm(t.checked));}}
function hide(){layer.hidden=true;document.body.classList.remove('menu-open')}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.panel)));
close.addEventListener('click',hide);layer.addEventListener('click',e=>{if(e.target===layer)hide();const go=e.target.closest('[data-go]');if(go)show(go.dataset.go);if(e.target.closest('[data-close]'))hide()});
addEventListener('keydown',e=>{if(e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]'))return;if(!layer.hidden){if(e.key==='Escape'){e.preventDefault();hide()}return}if(document.activeElement?.id==='chatInput')return;const k=e.key.toLowerCase();if(k==='escape'){e.preventDefault();show('menu')}else if(k==='i'){e.preventDefault();show('inventory')}else if(k==='m'){e.preventDefault();show('map')}} ,true);
document.querySelectorAll('.chat-tabs button').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();document.querySelectorAll('.chat-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));
})();


/* v48 — conversation-first garden controls */
(()=>{
const ret=document.getElementById('gardenCafeReturn'),bubbleBtn=document.getElementById('gardenBubbleChat'),fullBtn=document.getElementById('gardenFullChat');
const quick=document.getElementById('z48QuickChat'),qi=document.getElementById('z48QuickInput'),qs=document.getElementById('z48QuickSend');
const full=document.getElementById('z48FullChat'),fc=document.getElementById('z48FullChatClose'),log=document.getElementById('z48FullChatLog'),form=document.getElementById('z48FullChatForm'),fi=document.getElementById('z48FullChatInput');
const esc=s=>{const d=document.createElement('div');d.textContent=String(s||'');return d.innerHTML};
function render(){const ms=window.ZooCafeGame?.getChatMessages?.()||[];log.innerHTML=ms.length?ms.map(m=>`<div class="z48-chat-row"><b>${esc(m.name)}</b><span>${esc(m.text)}</span></div>`).join(''):'<div class="z48-chat-empty">아직 이야기가 없어요.<br>먼저 인사해보세요 ☕</div>';log.scrollTop=log.scrollHeight}
function send(v){if(window.ZooCafeGame?.sendQuickChat?.(v)){render();return true}return false}
ret?.addEventListener('click',e=>{e.preventDefault();window.ZooCafeGame?.returnToCafe?.()});
bubbleBtn?.addEventListener('click',()=>{quick.hidden=!quick.hidden;if(!quick.hidden)setTimeout(()=>qi.focus(),0)});
function quickSend(){if(send(qi.value)){qi.value='';quick.hidden=true}}
qs?.addEventListener('click',quickSend);qi?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();quickSend()}else if(e.key==='Escape')quick.hidden=true});
fullBtn?.addEventListener('click',()=>{full.hidden=false;render();setTimeout(()=>fi.focus(),0)});
fc?.addEventListener('click',()=>full.hidden=true);
form?.addEventListener('submit',e=>{e.preventDefault();if(send(fi.value)){fi.value='';setTimeout(render,0)}});
setInterval(()=>{if(full&&!full.hidden)render()},700);
})();
