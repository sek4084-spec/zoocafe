const DEFAULT_SERVER='http://localhost:3000';
async function serverAddress(){const data=await chrome.storage.local.get('zoocafeServerUrl');return data.zoocafeServerUrl||DEFAULT_SERVER}
function validServer(input){const url=new URL(String(input||'').trim());if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('공개 서버는 HTTPS 주소로 입력해 줘.');return url.origin}
async function searchYoutubeVideos(query,excludeId,terms){
 const searchUrl='https://www.youtube.com/results?search_query='+encodeURIComponent(query.slice(0,120));
 const tab=await chrome.tabs.create({url:searchUrl,active:false});
 try{
  for(let attempt=0;attempt<16;attempt++){
   await new Promise(resolve=>setTimeout(resolve,650));
   let response;
   try{response=await chrome.tabs.sendMessage(tab.id,{type:'collectVideoResults',excludeId,terms})}catch{continue}
   if(response?.videos?.length)return {ok:true,videos:response.videos.slice(0,5),source:'youtube-search'};
  }
  return {ok:false,error:'주제가 제목에 확인되는 영상을 찾지 못했어. 다른 주제를 말하거나 검색 결과를 직접 확인해 줘.',searchUrl};
 }finally{await chrome.tabs.remove(tab.id).catch(()=>{})}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(!['pair','assist','status','disconnect','chatList','chatSend','personalChat','personalHistory','questDraft','videoSearch','serverConfigure'].includes(message?.type))return;
 (async()=>{
  if(message.type==='serverConfigure'){
   const next=validServer(message.url),response=await fetch(next+'/api/health');const health=await response.json();
   if(!response.ok||health.service!=='zoocafe-online')throw Error('주카페 서버 주소인지 확인해 줘.');
   await chrome.storage.local.set({zoocafeServerUrl:next});await chrome.storage.local.remove('zoocafeExtensionToken');
   return {ok:true,server:next,connected:false};
  }
  const SERVER=await serverAddress();
  if(message.type==='videoSearch'){
   const query=String(message.query||'').trim(),excludeId=String(message.excludeId||'');
   if(query.length<3)return {ok:false,error:'영상 제목을 확인할 수 없어. 유튜브 영상에서 다시 시도해 줘.'};
   return searchYoutubeVideos(query,excludeId,Array.isArray(message.terms)?message.terms.slice(0,5):[]);
  }
  if(message.type==='disconnect'){await chrome.storage.local.remove('zoocafeExtensionToken');return {ok:true}}
  const stored=await chrome.storage.local.get('zoocafeExtensionToken');
  if(message.type==='status'){
   if(!stored.zoocafeExtensionToken)return {ok:true,connected:false,server:SERVER};
   const response=await fetch(SERVER+'/api/extension/status',{headers:{Authorization:`Bearer ${stored.zoocafeExtensionToken}`}});
   if(response.status===401){await chrome.storage.local.remove('zoocafeExtensionToken');return {ok:true,connected:false,server:SERVER,reason:'연결이 만료됐어. 주카페에서 새 연결 코드를 받아 다시 연결해 줘.'}}
   if(!response.ok)throw Error('주카페 서버 연결을 확인하지 못했어.');
   return {ok:true,connected:true,server:SERVER};
  }
  if(message.type==='personalHistory'){
   const response=await fetch(SERVER+'/api/extension/personal-chat',{headers:{Authorization:`Bearer ${stored.zoocafeExtensionToken||''}`}});
   const data=await response.json();if(!response.ok)throw Error(data.error||'개인 대화를 불러올 수 없어요.');return {...data,ok:true};
  }
  if(message.type==='chatList'||message.type==='chatSend'){
   const room=['bookshop','workshop','lodge','public'].includes(message.room)?message.room:'bookshop';
   const response=await fetch(SERVER+'/api/extension/chat'+(message.type==='chatList'?`?room=${encodeURIComponent(room)}`:''),{method:message.type==='chatSend'?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${stored.zoocafeExtensionToken||''}`},...(message.type==='chatSend'?{body:JSON.stringify({room,text:String(message.text||'')})}:{})});
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
 })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'주카페 서버 주소와 연결 상태를 확인해 주세요.'}));
 return true;
});
