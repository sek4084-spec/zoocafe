(()=>{
 const overlay=document.getElementById('questOverlay'),list=document.getElementById('questList'),form=document.getElementById('questForm'),notice=document.getElementById('questNotice');
 if(!overlay||!list||!form)return;
 let busy=false;
 const token=()=>(localStorage.getItem('zoocafe_token')||sessionStorage.getItem('zoocafe_token'));
 const me=()=>window.ZOO_USER?.id;
 const message=value=>{notice.textContent=value||''};
 async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()||''}`,...options.headers},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'요청을 처리하지 못했어요.');
  return data;
 }
 function node(tag,content,cls){const el=document.createElement(tag);if(content!=null)el.textContent=String(content);if(cls)el.className=cls;return el}
 function button(label,action){const b=node('button',label);b.type='button';b.addEventListener('click',action);return b}
 async function update(){
  if(!token()){message('로그인한 뒤 질문 퀘스트를 이용할 수 있어요.');return}
  try{
   const {quests}=await api('/api/quests');list.replaceChildren();
   if(!quests.length){list.append(node('p','첫 질문을 올려 보세요.'));return}
   const labels={open:'도움을 기다려요',claimed:'친구가 알아보는 중',answered:'답변을 확인해 주세요',completed:'해결 완료'};
   for(const q of quests){
    const card=node('article',null,'quest-card');
    card.append(node('strong',q.question),node('small',`${q.authorName} · ${labels[q.status]||q.status}`));
    if(q.details)card.append(node('p',q.details));
    if(q.helperName)card.append(node('small',`돕는 친구: ${q.helperName}`));
    if(q.answer){card.append(node('p',`답변: ${q.answer}`,'quest-answer'))}
    const submit=async(path,payload)=>{if(busy)return;busy=true;try{await api(`/api/quests/${encodeURIComponent(q.id)}/${path}`,{method:'POST',body:JSON.stringify(payload||{})});message('반영했어요.');await update()}catch(e){message(e.message)}finally{busy=false}};
    if(q.status==='open'&&q.authorId!==me())card.append(button('이 퀘스트 맡기',()=>submit('claim')));
    if(q.status==='claimed'&&q.helperId===me()){
     const answer=node('textarea',null,'quest-answer-input');answer.maxLength=2000;answer.placeholder='찾아낸 정보와 근거를 적어 주세요.';card.append(answer,button('답변 보내기',()=>submit('answer',{answer:answer.value})));
    }
    if(q.status==='answered'&&q.authorId===me())card.append(button('해결 완료',()=>submit('complete')));
    list.append(card);
   }
  }catch(e){message(e.message)}
 }
 async function loadDraft(){
  if(!token())return;
  try{const {draft}=await api('/api/extension/quest-draft');if(!draft)return;
   form.elements.question.value=draft.question;form.elements.details.value=draft.details;
   message('멍사자가 가져온 질문 초안이야. 내용을 확인하고 직접 올려 줘.');
  }catch(e){message(e.message)}
 }
 function open(){overlay.hidden=false;message('');update();loadDraft()}
 function close(){overlay.hidden=true}
 const launchers=['cafeQuestBtn','cafeHotQuestBtn','worldQuestBtn'].map(id=>document.getElementById(id)).filter(Boolean);
 document.getElementById('questPairCodeBtn')?.addEventListener('click',async()=>{
  try{const data=await api('/api/extension/code',{method:'POST'});document.getElementById('questPairCode').textContent=`${data.code} · 5분 동안 유효`;message('이 코드를 웹사이트의 멍사자 창에 입력해 주세요.')}catch(e){message(e.message)}
 });
 const counters=launchers.map(button=>{const count=node('span',null,'quest-count');count.hidden=true;button.append(count);button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open()});return count});
 async function checkAvailable(){
  if(!token()||!me())return;
  try{const {quests}=await api('/api/quests');const available=quests.filter(q=>q.status==='open'&&q.authorId!==me()).length;for(const counter of counters){counter.hidden=!available;counter.textContent=String(available)}}catch{}
 }
 document.getElementById('questClose')?.addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden){e.stopImmediatePropagation();close()}},true);
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;try{const fields=new FormData(form);await api('/api/quests',{method:'POST',body:JSON.stringify({question:fields.get('question'),details:fields.get('details')})});await api('/api/extension/quest-draft',{method:'DELETE'}).catch(()=>{});form.reset();message('질문이 퀘스트로 등록됐어요.');await update()}catch(err){message(err.message)}finally{busy=false}});
 setInterval(()=>{if(!overlay.hidden&&!busy)update()},12000);
 setInterval(checkAvailable,15000);
 function openFromExtension(){if(location.hash==='#quests'&&token())open()}
 window.addEventListener('zoocafe-auth',()=>{checkAvailable();openFromExtension()});
 window.addEventListener('hashchange',openFromExtension);
 if(window.ZOO_USER){checkAvailable();openFromExtension()}
})();
