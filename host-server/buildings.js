(()=>{
 const rooms={bookshop:'애니 이야기관',workshop:'게임 길드',lodge:'생활 정보관'};
 const token=()=>(localStorage.getItem('zoocafe_token')||sessionStorage.getItem('zoocafe_token'));
 const root=document.createElement('div');root.id='buildingBoard';root.innerHTML='<button id="buildingToggle" type="button" hidden></button><section id="buildingSheet" hidden><header><div><strong id="buildingTitle"></strong><small>지금 이 건물에 있는 사람과 채팅하고, 질문은 남겨 둘 수 있어요.</small></div><button id="buildingClose" type="button" aria-label="닫기">×</button></header><div class="building-actions"><button id="buildingChat" type="button">💬 현장 채팅</button></div><form id="buildingForm"><input id="buildingQuestion" maxlength="300" placeholder="나중에 온 사람도 답할 수 있는 질문" required minlength="5"><button>질문 남기기</button></form><p id="buildingNotice" role="status"></p><div id="buildingCards"></div></section>';
 document.body.append(root);
 const $=s=>root.querySelector(s),toggle=$('#buildingToggle'),sheet=$('#buildingSheet'),cards=$('#buildingCards'),notice=$('#buildingNotice');
 let room='',pending=false;
 async function api(path,method='GET',body){const response=await fetch(path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()||''}`},body:body?JSON.stringify(body):undefined,cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'요청에 실패했어요.');return result}
 function say(t){notice.textContent=t||''}
 function el(tag,t){const n=document.createElement(tag);n.textContent=t;return n}
 function makeButton(label,fn){const n=el('button',label);n.type='button';n.onclick=fn;return n}
 async function load(){if(!room||sheet.hidden||!token()||pending)return;const current=room;try{const {questions}=await api('/api/building-questions?room='+encodeURIComponent(room));if(current!==room)return;cards.replaceChildren();if(!questions.length)cards.append(el('p','첫 질문을 남겨 보세요.'));
 for(const q of questions){const card=el('article','');card.className='building-card';card.append(el('strong',q.text),el('small',q.authorName+' · '+(q.resolved?'해결 완료':'답변 기다리는 중')));
 for(const a of q.answers)card.append(el('p',a.authorName+': '+a.text));
 if(!q.resolved){const answer=el('textarea','');answer.maxLength=600;answer.placeholder='알고 있는 내용을 답해 주세요';card.append(answer,makeButton('답변하기',async()=>{try{await api('/api/building-questions/'+encodeURIComponent(q.id)+'/answer','POST',{text:answer.value});say('답변을 남겼어요.');await load()}catch(e){say(e.message)}}));if(q.authorId===window.ZOO_USER?.id&&q.answers.length)card.append(makeButton('해결 완료',async()=>{try{await api('/api/building-questions/'+encodeURIComponent(q.id)+'/resolve','POST');say('질문을 해결했어요!');await load()}catch(e){say(e.message)}}))}
 cards.append(card)}
 }catch(e){say(e.message)}}
 function sync(){const next=window.ZooCafeGame?.getState?.().mode||'world';if(next===room)return;room=rooms[next]?next:'';toggle.hidden=!room;sheet.hidden=true;if(room){toggle.textContent='📌 '+rooms[room]+' · 채팅 / 질문';$('#buildingTitle').textContent=rooms[room];say('')}}
 toggle.onclick=()=>{sheet.hidden=!sheet.hidden;if(!sheet.hidden)load()};$('#buildingClose').onclick=()=>sheet.hidden=true;
 $('#buildingChat').onclick=()=>{sheet.hidden=true;document.getElementById('chatPanel')?.click();document.getElementById('chatInput')?.focus()};
 $('#buildingForm').onsubmit=async e=>{e.preventDefault();if(!room||pending)return;pending=true;try{await api('/api/building-questions','POST',{room,text:$('#buildingQuestion').value});$('#buildingQuestion').value='';say('질문을 이 건물에 남겼어요.')}catch(err){say(err.message)}finally{pending=false;load()}};
 setInterval(sync,450);setInterval(load,12000);
})();
