(()=>{
 if(document.getElementById('zoocafe-mung-host'))return;
 const host=document.createElement('div');host.id='zoocafe-mung-host';
 host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647';
 document.documentElement.append(host);
 const root=host.attachShadow({mode:'closed'});
 const css=document.createElement('style');css.textContent=`
 :host{font-family:system-ui,'Malgun Gothic',sans-serif;color:#332217}
 button,input,textarea{font:inherit}button{cursor:pointer}
 .bubble{display:block;margin-left:auto;padding:10px 13px;border:1px solid #a3774a;border-radius:30px;background:#4a3022;color:#fff0cf;box-shadow:0 8px 25px #0005;font-size:14px}
 .panel{width:min(365px,calc(100vw - 28px));max-height:min(78vh,670px);display:none;overflow:auto;margin-bottom:10px;border:2px solid #bc8b54;border-radius:20px;background:#fff5e6;box-shadow:0 12px 40px #0006;padding:16px;box-sizing:border-box}
 .panel.open{display:block}.head{display:flex;align-items:center;gap:11px}.face{flex:none;width:58px;height:58px;border-radius:50%;border:2px solid #ad7d48;background-color:#67432d;background-repeat:no-repeat;background-position:-82px -152px;background-size:640px 427px}.head strong{font-size:18px}.head small{display:block;color:#705f52}.head button{margin-left:auto;border:0;background:none;font-size:22px}
 .section{margin:13px 0;padding:12px;border-radius:12px;background:#f6e7d0}.section h3{font-size:14px;margin:0 0 8px}.section p{font-size:13px;line-height:1.5;margin:8px 0;white-space:pre-wrap}.section input,.section textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid #b99470;border-radius:8px;background:#fff}.section textarea{min-height:64px;resize:vertical}.section button{border:0;border-radius:8px;background:#835329;color:#fff;padding:8px 10px;margin:7px 5px 0 0;font-size:12px}.section small{display:block;margin-top:7px;color:#766657}.result{display:block;padding:7px 0;border-top:1px solid #dfcbb3;font-size:12px;line-height:1.35;overflow-wrap:anywhere}.result a{color:#644321}.hint{font-size:12px;color:#765f48}#status{font-size:13px;color:#684426;min-height:20px}
 .tabs{display:flex;gap:5px;margin:14px 0 0}.tabs button{flex:1;padding:9px 2px;border:1px solid #b99470;border-radius:9px;background:#f6e7d0;color:#644321;font-size:12px}.tabs button.active{background:#835329;color:white}.section[hidden],.tabs[hidden]{display:none!important}
 .chat-lines{height:220px;overflow:auto;background:#fff9ef;border:1px solid #d6bc98;border-radius:9px;padding:8px;box-sizing:border-box}.chat-item{font-size:12px;line-height:1.45;margin:0 0 8px;overflow-wrap:anywhere}.chat-item b{color:#885a34;margin-right:5px}.chat-item time{font-size:10px;color:#907c69;margin-left:5px}.chat-compose{display:flex;gap:5px;margin-top:8px}.chat-compose input{flex:1;min-width:0}.chat-compose button{margin:0;flex:none}.chat-head{display:flex;align-items:center;justify-content:space-between;gap:5px}.chat-head small{color:#6d8961}
 `;root.append(css);
 const panel=document.createElement('div');panel.className='panel';panel.innerHTML=`
 <div class="head"><div class="face" aria-label="멍사자"></div><div><strong>멍사자</strong><small>어디서나 함께하는 주카페 친구</small></div><button id="close" aria-label="닫기">×</button></div>
 <section id="pair" class="section"><h3>주카페 계정 연결</h3><p>주카페의 질문 퀘스트 창에서 연결 코드를 받아 적어 줘.</p><input id="code" maxlength="12" autocomplete="off" placeholder="12자리 연결 코드"><button id="connect">연결하기</button><small>PC에서 주카페 서버 localhost:3000이 실행 중이어야 해요.</small></section>
 <nav id="tabs" class="tabs" aria-label="멍사자 기능" hidden><button type="button" data-tab="personal" class="active">멍사자</button><button type="button" data-tab="tools">같이 검색</button><button type="button" data-tab="naverChat">친구 채팅</button></nav>
 <section id="shareActions" class="section"><h3>지금 보는 페이지 가져오기</h3><small id="pageTitle"></small><button id="pageFind">🔎 찾아보기</button><button id="pageAsk">💬 사람에게 묻기</button><button id="pageQuest">📜 의뢰 만들기</button><div id="candidateLinks"></div><small>주카페에서 질문을 확인하고 직접 공유해요. 페이지 본문은 자동으로 전송하지 않아요.</small></section>
 <section id="personal" class="section" hidden><h3>멍사자와 개인 대화</h3><div id="personalLines" class="chat-lines" role="log" aria-label="멍사자와 개인 대화"></div><form id="personalForm" class="chat-compose"><input id="personalInput" maxlength="300" autocomplete="off" placeholder="멍사자에게 이야기하기"><button type="submit">전송</button></form><small>카페에서 나눈 대화와 같은 기억으로 이어져요. 공용 채팅에는 보이지 않아요.</small></section>
 <section id="tools" class="section" hidden><h3>같이 검색해 볼까?</h3><input id="search" placeholder="찾고 싶은 내용을 적어 줘"><button id="searchGo">네이버에서 검색</button><textarea id="question" placeholder="검색하면서 궁금한 점을 적어 줘"></textarea><button id="assist">검색하고 멍사자에게 묻기</button><button id="draftQuest">질문 퀘스트 초안 만들기</button><button id="quests">질문 퀘스트 열기</button><small>검색 결과 화면에 표시된 관련 링크의 제목·주소·짧은 미리보기만 물어보기 버튼을 누른 뒤 주카페 서버에 보냅니다. 원문 전체를 읽지는 않습니다.</small><div id="results"></div></section>
 <section id="naverChat" class="section" hidden><div class="chat-head"><h3>주카페 친구 채팅</h3><small id="chatOnline">접속 확인 중</small></div><div id="chatLines" class="chat-lines" role="log" aria-label="공용 채팅"></div><form id="chatForm" class="chat-compose"><input id="chatInput" maxlength="300" autocomplete="off" placeholder="다른 주카페 친구에게 말하기" aria-label="채팅 메시지"><button type="submit">전송</button></form><small>멍사자 확장 프로그램에 연결한 주카페 친구끼리 쓰는 공용 방이에요.</small></section>
 <p id="status" role="status"></p><button class="bubble" id="toggle" hidden>☕ 멍사자</button>`;
 root.append(panel);
 const toggle=document.createElement('button');toggle.className='bubble';toggle.textContent='☕ 멍사자';root.append(toggle);
 panel.querySelector('.face').style.backgroundImage=`url("${chrome.runtime.getURL('assets/cafe-portrait.png')}")`;
 const find=id=>panel.querySelector('#'+id),status=find('status');
 find('pageTitle').textContent=document.title.slice(0,90);
 function openPage(urlValue,titleValue,intent){const url=new URL('http://localhost:3000/');url.searchParams.set('share',urlValue);url.searchParams.set('title',titleValue.slice(0,140));url.searchParams.set('intent',intent);window.open(url.href,'_blank','noopener')}
 for(const [id,intent] of [['pageFind','find'],['pageAsk','ask'],['pageQuest','quest']])find(id).addEventListener('click',()=>{
  openPage(location.href,document.title,intent);
 });
 const candidates=[],seen=new Set();
 for(const a of document.querySelectorAll('a[href]')){
  const label=(a.innerText||'').replace(/\s+/g,' ').trim(),href=a.href;
  if(candidates.length>=5)break;
  if(label.length<8||label.length>110||!a.getClientRects().length||!/^https?:/.test(href)||seen.has(href)||!/(추천|질문|찾아|알려|도와|궁금|어떻게|해주세요|부탁|추천받)/.test(label))continue;
  seen.add(href);candidates.push({title:label,url:href});
 }
 if(candidates.length){const box=find('candidateLinks'),heading=document.createElement('small');heading.textContent='지금 보이는 글에서 발견한 질문 후보';box.append(heading);for(const item of candidates){const row=document.createElement('div');row.className='result';const label=document.createElement('span');label.textContent=item.title;const button=document.createElement('button');button.textContent='의뢰 초안';button.type='button';button.onclick=()=>openPage(item.url,item.title,'quest');row.append(label,button);box.append(row)}}
 const call=message=>new Promise(resolve=>chrome.runtime.sendMessage(message,r=>resolve(r||{ok:false,error:chrome.runtime.lastError?.message||'확장 프로그램 연결 오류'})));
 function currentQuery(){return new URL(location.href).searchParams.get('query')||document.querySelector('input[name="query"],#query')?.value||''}
 const isSearchPage=()=>location.hostname==='search.naver.com'&&location.pathname.startsWith('/search.naver');
 function visibleLinks(query){
  if(!isSearchPage())return [];
  const area=document.querySelector('#main_pack');if(!area)return [];
  const terms=String(query||'').toLowerCase().split(/\s+/).filter(t=>t.length>=2);
  const seen=new Set(),links=[];
  for(const a of area.querySelectorAll('a[href]')){
   const title=(a.innerText||'').replace(/\s+/g,' ').trim(),url=a.href;
   if(title.length<8||title.length>125||!/^https?:/.test(url)||seen.has(url)||!a.getClientRects().length)continue;
   if(/^(adcr|aderes|m\.ad|search)\.naver\.com$/.test(new URL(url).hostname))continue;
   const card=a.closest('.api_subject_bx, .total_wrap, .sc_new, .view_wrap')||a.parentElement;
   const snippet=(card?.innerText||'').replace(/\s+/g,' ').trim().slice(0,360);
   const match=(title+' '+snippet).toLowerCase();
   const score=terms.reduce((n,t)=>n+(match.includes(t)?1:0),0);
   if(terms.length&&!score)continue;
   seen.add(url);links.push({title,url,snippet,score});
  }
  return links.sort((a,b)=>b.score-a.score).slice(0,6).map(({title,url,snippet})=>({title,url,snippet}));
 }
 function renderLinks(links){const box=find('results');box.replaceChildren();if(!links.length)return;const head=document.createElement('p');head.textContent='검색어와 관련된 화면 링크 · 원문은 직접 확인해 줘';box.append(head);for(const item of links){const row=document.createElement('div'),a=document.createElement('a');row.className='result';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title;row.append(a);box.append(row)}}
 function show(text){status.textContent=text}
 let activeTab='personal';
 function selectTab(tab){activeTab=tab;for(const id of ['personal','tools','naverChat'])find(id).hidden=id!==tab;for(const button of find('tabs').querySelectorAll('button')){const selected=button.dataset.tab===tab;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected))}if(tab==='naverChat')updateChat();if(tab==='personal')loadPersonalHistory()}
 find('tabs').addEventListener('click',e=>{const tab=e.target.closest('button[data-tab]')?.dataset.tab;if(tab)selectTab(tab)});
 let personalLoading=false;
 async function loadPersonalHistory(){if(personalLoading||find('personal').hidden)return;personalLoading=true;try{const r=await call({type:'personalHistory'});if(r.ok){const lines=find('personalLines');lines.replaceChildren();for(const item of r.messages||[])addPersonalLine(item.role==='user'?'나':'멍사자',item.text);lines.scrollTop=lines.scrollHeight}else show(r.error)}finally{personalLoading=false}}
 function addPersonalLine(name,value){const row=document.createElement('div'),label=document.createElement('b'),body=document.createElement('span');row.className='chat-item';label.textContent=name;body.textContent=value;row.append(label,document.createElement('br'),body);find('personalLines').append(row)}
 async function refresh(){const r=await call({type:'status'});find('pair').hidden=!!r.connected;find('tabs').hidden=!r.connected;find('personal').hidden=true;find('tools').hidden=true;find('naverChat').hidden=true;find('search').value=currentQuery();if(r.connected){renderLinks(visibleLinks(currentQuery()));selectTab(activeTab)}}
 find('personalForm').addEventListener('submit',async e=>{
  e.preventDefault();const input=find('personalInput'),message=input.value.trim();if(!message)return;
  const button=find('personalForm').querySelector('button');button.disabled=true;
  const result=await call({type:'personalChat',text:message});button.disabled=false;
  if(!result.ok){show(result.error);return}
  addPersonalLine('나',message);addPersonalLine('멍사자',result.reply);find('personalLines').scrollTop=find('personalLines').scrollHeight;input.value='';show('');
 });
 let lastChatId=null,chatBusy=false;
 async function updateChat(){
  if(chatBusy)return;chatBusy=true;
  try{
   const data=await call({type:'chatList'});
   if(!data.ok){if(panel.classList.contains('open'))find('chatOnline').textContent=data.error;return}
   find('chatOnline').textContent=`접속 ${data.online}명`;
   toggle.textContent=`☕ 멍사자 · 채팅 ${data.online}`;
   const messages=data.messages||[],last=messages.at(-1)?.id||null;
   if(last===lastChatId)return;
   lastChatId=last;const box=find('chatLines');
   const stick=box.scrollHeight-box.scrollTop-box.clientHeight<45;
   box.replaceChildren();
   for(const item of messages){const row=document.createElement('div'),name=document.createElement('b'),time=document.createElement('time'),body=document.createElement('span');row.className='chat-item';name.textContent=item.nickname;time.textContent=new Date(item.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});body.textContent=item.text;row.append(name,time,document.createElement('br'),body);const share=document.createElement('button');share.type='button';share.textContent='멍사자에게 전달';share.title='이 메시지를 개인 대화에 직접 전달';share.addEventListener('click',()=>{selectTab('personal');find('personalInput').value=`${item.nickname}의 공개 채팅: ${item.text}`.slice(0,300);find('personalInput').focus();show('내용을 확인한 뒤 개인 대화에서 전송해 줘.')});row.append(document.createElement('br'),share);box.append(row)}
   if(stick||messages.length<8)box.scrollTop=box.scrollHeight;
  }finally{chatBusy=false}
 }
 find('chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=find('chatInput'),text=input.value.trim();if(!text)return;const r=await call({type:'chatSend',text});if(!r.ok){show(r.error);return}input.value='';await updateChat()});
 setInterval(()=>{if(!find('naverChat').hidden)updateChat()},4000);
 toggle.addEventListener('click',()=>{panel.classList.toggle('open');if(panel.classList.contains('open'))refresh()});find('close').addEventListener('click',()=>panel.classList.remove('open'));
 find('connect').addEventListener('click',async()=>{const r=await call({type:'pair',code:find('code').value});show(r.ok?`${r.user}님, 주카페와 연결됐어!`:r.error);if(r.ok)refresh()});
 function navigate(query){location.assign('https://search.naver.com/search.naver?query='+encodeURIComponent(query))}
 find('searchGo').addEventListener('click',()=>{const query=find('search').value.trim();if(query)navigate(query)});
 async function assist(question,query){
  const button=find('assist');button.disabled=true;show('검색 결과를 함께 살펴보고 있어…');
  const links=visibleLinks(query);
  if(!links.length){show('현재 검색 결과에서 관련 자료를 찾지 못했어. 다른 검색어로 다시 찾아보자.');renderLinks([]);button.disabled=false;return}
  const r=await call({type:'assist',query,question,results:links});show(r.ok?r.message:r.error);renderLinks(links);button.disabled=false;
 }
 find('assist').addEventListener('click',async()=>{
  const question=find('question').value.trim(),typed=find('search').value.trim();
  if(!isSearchPage()){
   const query=question||typed;
   if(!query){show('먼저 무엇을 찾고 싶은지 적어 줘.');return}
   await chrome.storage.local.set({zoocafePendingSearch:{query,question,createdAt:Date.now()}});
   navigate(query);return;
  }
  const query=currentQuery()||typed;
  if(!query){show('먼저 검색어를 입력해 줘.');return}
  await assist(question,query);
 });
 find('draftQuest').addEventListener('click',async()=>{
  const query=(find('search').value||currentQuery()).trim(),asked=find('question').value.trim();
  const question=(asked||query).slice(0,140);
  if(question.length<5){show('퀘스트로 만들 질문을 5자 이상 적어 줘.');return}
  const links=visibleLinks(query).slice(0,3);
  const details=[query?`검색어: ${query}`:'',links.length?'확인해 볼 검색 결과 (내용을 직접 확인해 주세요):':'',...links.map((item,i)=>`${i+1}. ${item.title}\n${item.url}`)].filter(Boolean).join('\n').slice(0,1500);
  const r=await call({type:'questDraft',question,details});show(r.ok?'초안을 카페로 보냈어. 카페에서 확인하고 질문을 올려 줘.':r.error);
  if(r.ok)window.open('http://localhost:3000/#quests','_blank','noopener');
 });
 find('quests').addEventListener('click',()=>window.open('http://localhost:3000/#quests','_blank','noopener'));
 refresh();
 if(isSearchPage())chrome.storage.local.get('zoocafePendingSearch').then(async({zoocafePendingSearch:pending})=>{
  if(!pending)return;
  await chrome.storage.local.remove('zoocafePendingSearch');
  if(Date.now()-pending.createdAt>60000||pending.query!==currentQuery())return;
  panel.classList.add('open');selectTab('tools');find('question').value=pending.question;
  setTimeout(()=>assist(pending.question,pending.query),900);
 });
})();
