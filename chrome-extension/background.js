const SERVER='http://localhost:3000';
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(!['pair','assist','status','disconnect','chatList','chatSend','personalChat','personalHistory','questDraft'].includes(message?.type))return;
 (async()=>{
  if(message.type==='disconnect'){await chrome.storage.local.remove('zoocafeExtensionToken');return {ok:true}}
  const stored=await chrome.storage.local.get('zoocafeExtensionToken');
  if(message.type==='status')return {ok:true,connected:!!stored.zoocafeExtensionToken};
  if(message.type==='personalHistory'){
   const response=await fetch(SERVER+'/api/extension/personal-chat',{headers:{Authorization:`Bearer ${stored.zoocafeExtensionToken||''}`}});
   const data=await response.json();if(!response.ok)throw Error(data.error||'개인 대화를 불러올 수 없어요.');return {...data,ok:true};
  }
  if(message.type==='chatList'||message.type==='chatSend'){
   const response=await fetch(SERVER+'/api/extension/chat',{method:message.type==='chatSend'?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${stored.zoocafeExtensionToken||''}`},...(message.type==='chatSend'?{body:JSON.stringify({text:String(message.text||'')})}:{})});
   const data=await response.json();if(!response.ok)throw Error(data.error||`채팅 오류 (${response.status})`);
   return {...data,ok:true};
  }
  const url=message.type==='pair'?'/api/extension/pair':message.type==='personalChat'?'/api/extension/personal-chat':message.type==='questDraft'?'/api/extension/quest-draft':'/api/extension/assist';
  const payload=message.type==='pair'?{code:String(message.code||'').trim()}:message.type==='personalChat'?{text:String(message.text||'')}:message.type==='questDraft'?{question:String(message.question||''),details:String(message.details||'')}:{query:String(message.query||''),question:String(message.question||''),results:Array.isArray(message.results)?message.results:[]};
  const response=await fetch(SERVER+url,{method:'POST',headers:{'Content-Type':'application/json',...(message.type!=='pair'?{Authorization:`Bearer ${stored.zoocafeExtensionToken||''}`}:{})},body:JSON.stringify(payload)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||`서버 오류 (${response.status})`);
  if(message.type==='pair')await chrome.storage.local.set({zoocafeExtensionToken:data.token});
  return {...data,ok:true};
 })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'주카페 서버에 연결할 수 없어요. localhost:3000을 확인해 주세요.'}));
 return true;
});
