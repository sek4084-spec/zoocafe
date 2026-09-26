const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// Local CMD starts do not read .env automatically. Existing environment wins.
try{
 for(const line of fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/)){
  const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if(!match||process.env[match[1]]!==undefined)continue;
  let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  if(value&&!value.startsWith('#'))process.env[match[1]]=value;
 }
}catch(error){if(error.code!=='ENOENT')console.warn('Could not load local .env:',error.message)}

const app = express();
let lastCafeHttpAt=0;
const { WebSocketServer } = require('ws');
const NPC_MEMORY_FILE=path.join(__dirname,'data','npc-memory.json');
const NPC_GROWTH_FILE=path.join(__dirname,'data','npc-growth.json');
const NPC_KNOWLEDGE_FILE=path.join(__dirname,'data','npc-knowledge.json');
const {Pool}=require('pg');
const dbUrl=process.env.DATABASE_URL||'';
let npcPool=null;
let npcDbReady=Promise.resolve(false);
async function initNpcDb(){
 if(!dbUrl)return false;
 try{
  npcPool=new Pool({connectionString:dbUrl,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined});
  await npcPool.query(`CREATE TABLE IF NOT EXISTS zoocafe_npc_state (id TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const r=await npcPool.query(`SELECT id,payload FROM zoocafe_npc_state WHERE id IN ('memory','growth','knowledge')`);
  for(const row of r.rows){if(row.id==='memory'&&row.payload)npcMemory=row.payload;if(row.id==='growth'&&row.payload)npcGrowth=row.payload;if(row.id==='knowledge'&&row.payload)npcKnowledge=row.payload}
  console.log('NPC persistent memory: PostgreSQL connected');return true;
 }catch(e){console.warn('NPC PostgreSQL unavailable; using local JSON fallback:',e.message);npcPool=null;return false}
}
function persistNpcDb(id,payload){
 if(!npcPool)return;
 npcPool.query(`INSERT INTO zoocafe_npc_state(id,payload,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[id,JSON.stringify(payload)]).catch(e=>console.warn('npc db save',e.message));
}
function loadNpcMemory(){try{return JSON.parse(fs.readFileSync(NPC_MEMORY_FILE,'utf8'))}catch(e){return {}}}
let npcMemory=loadNpcMemory();
function saveNpcMemory(){try{fs.mkdirSync(path.dirname(NPC_MEMORY_FILE),{recursive:true});fs.writeFileSync(NPC_MEMORY_FILE,JSON.stringify(npcMemory,null,2))}catch(e){console.error('npc memory save',e.message)};persistNpcDb('memory',npcMemory)}
function loadNpcGrowth(){try{return JSON.parse(fs.readFileSync(NPC_GROWTH_FILE,'utf8'))}catch(e){return {}}}
let npcGrowth=loadNpcGrowth();
function loadNpcKnowledge(){try{return JSON.parse(fs.readFileSync(NPC_KNOWLEDGE_FILE,'utf8'))}catch(e){return {}}}
let npcKnowledge=loadNpcKnowledge();
function saveNpcKnowledge(){try{fs.mkdirSync(path.dirname(NPC_KNOWLEDGE_FILE),{recursive:true});fs.writeFileSync(NPC_KNOWLEDGE_FILE,JSON.stringify(npcKnowledge,null,2))}catch(e){console.error('npc knowledge save',e.message)};persistNpcDb('knowledge',npcKnowledge)}
function saveNpcGrowth(){try{fs.mkdirSync(path.dirname(NPC_GROWTH_FILE),{recursive:true});fs.writeFileSync(NPC_GROWTH_FILE,JSON.stringify(npcGrowth,null,2))}catch(e){console.error('npc growth save',e.message)};persistNpcDb('growth',npcGrowth)}
function growthFor(k){if(!npcGrowth[k])npcGrowth[k]={level:1,xp:0,talks:0,memories:0,lastSeenAt:0,lastWelcomeAt:0};return npcGrowth[k]}
function relationName(level){if(level>=10)return '오랜 친구';if(level>=7)return '가까운 친구';if(level>=4)return '친한 사이';if(level>=2)return '낯익은 손님';return '처음 알아가는 사이'}
function addGrowth(k,memorySaved){const g=growthFor(k);g.talks+=1;g.xp+=2+(memorySaved?3:0);if(memorySaved)g.memories+=1;g.level=Math.min(20,1+Math.floor(g.xp/20));saveNpcGrowth();return g}
const npcRecent=new Map();
// v53: Gemini circuit breaker. A quota/rate-limit failure temporarily sends NPCs to the local server brain.
let geminiSleepUntil=0;
let geminiSleepReason='';
const GEMINI_QUOTA_SLEEP_MS=Math.max(60*1000, Number(process.env.GEMINI_QUOTA_SLEEP_MS||30*60*1000));
function geminiSleeping(){return Date.now()<geminiSleepUntil}
function sleepGemini(reason,ms=GEMINI_QUOTA_SLEEP_MS){
 geminiSleepReason=reason||'temporary';geminiSleepUntil=Date.now()+ms;
 console.warn('Gemini sleep mode:',geminiSleepReason,'until',new Date(geminiSleepUntil).toISOString());
}
function wakeGemini(){if(geminiSleepUntil){console.log('Gemini probe window opened; trying API again')}geminiSleepUntil=0;geminiSleepReason=''}

const NPCS={
 'ai-mung':{name:'멍사자',personality:'따뜻하고 느긋한 ZOO:CAFE 카페지기. 먼저 다가가지만 부담스럽게 하지 않는다. 상대의 말을 잘 듣고 짧고 자연스럽게 대화한다.',story:'추후 작성',values:'추후 작성'},
 'ai-rabbit':{name:'쥐무는토끼',personality:'조용한 드라마 작가이자 이야기 기록자. 관찰력이 좋고 조금 낯을 가리며, 생각한 뒤 차분하게 말한다.',story:'추후 작성',values:'추후 작성'},
 'ai-fox':{name:'솔이',icon:'🦊',species:'여우',personality:'임시 설정: 책을 좋아하고 대화에 호기심이 많다.',story:'추후 작성',values:'추후 작성'},
 'ai-hedgehog':{name:'밤톨',icon:'🦔',species:'고슴도치',personality:'임시 설정: 조용히 책을 나르고 세세한 것을 기억한다.',story:'추후 작성',values:'추후 작성'},
 'ai-orange-cat':{name:'모카',icon:'🐱',species:'주황 고양이',personality:'임시 설정: 여유롭게 차를 마시고 소소한 일화를 이야기한다.',story:'추후 작성',values:'추후 작성'},
 'ai-bear':{name:'다온',icon:'🐻',species:'곰',personality:'임시 설정: 다과를 건네며 손님의 안부를 살핀다.',story:'추후 작성',values:'추후 작성'},
 'ai-deer':{name:'루미',icon:'🦌',species:'사슴',personality:'임시 설정: 기타를 연주하며 밤 풍경에 대해 이야기한다.',story:'추후 작성',values:'추후 작성'},
 'ai-owl':{name:'서책',icon:'🦉',species:'부엉이',personality:'임시 설정: 독서를 즐기고 차분하게 질문한다.',story:'추후 작성',values:'추후 작성'},
 'ai-grey-cat':{name:'그루',icon:'🐈',species:'회색 고양이',personality:'임시 설정: 낮잠을 좋아하고 잠결에 짧게 이야기한다.',story:'추후 작성',values:'추후 작성'}
};
// Each video has a fixed visible cast. Future personalities and stories can be
// edited independently in NPCS without changing the scene or dialogue logic.
const CAFE_SCENE_CAST={
 0:['ai-mung','ai-rabbit'],
 1:['ai-mung','ai-rabbit','ai-fox','ai-hedgehog'],
 2:['ai-mung','ai-rabbit','ai-orange-cat','ai-bear'],
 3:['ai-mung','ai-rabbit','ai-deer','ai-owl','ai-grey-cat']
};
function memKey(userId,npcId){return String(userId)+'::'+npcId}
function recentFor(k){if(!npcRecent.has(k))npcRecent.set(k,[]);return npcRecent.get(k)}
function normalizeMemory(s){return String(s||'').replace(/\s+/g,' ').trim().slice(0,180)}
function rememberFact(k,fact){fact=normalizeMemory(fact);if(!fact)return false;if(!npcMemory[k])npcMemory[k]=[];if(npcMemory[k].some(v=>normalizeMemory(v)===fact))return false;npcMemory[k].push(fact);npcMemory[k]=npcMemory[k].slice(-40);saveNpcMemory();const g=growthFor(k);g.memories=(g.memories||0)+1;g.xp=(g.xp||0)+3;g.level=Math.min(20,1+Math.floor(g.xp/20));saveNpcGrowth();return true}
function learnDirectFact(k,text){
 const raw=String(text||'').trim();let m;
 const patterns=[
  [/^나는\s+(.{1,60}?)(?:을|를)?\s*좋아해(?:요)?[.!?]?$/,'취향: $1을/를 좋아함'],
  [/^내가\s+좋아하는\s+건\s+(.{1,60})[.!?]?$/,'취향: $1을 좋아함'],
  [/^내\s+취미는\s+(.{1,60})[.!?]?$/,'취미: $1'],
  [/^나는\s+(.{1,60}?)(?:이야|야|입니다|이에요|예요)[.!?]?$/,'자기소개: $1'],
  [/^(.{1,70}?)(?:라고|라고\s*)?\s*기억해(?:줘)?[.!?]?$/,'플레이어가 기억해 달라고 한 내용: $1']
 ];
 for(const [re,fmt] of patterns){m=raw.match(re);if(m){return rememberFact(k,fmt.replace('$1',m[1].trim()))}}
 return false;
}
// Explicit teaching works without Gemini. This is also useful for testing DB persistence while free quota is exhausted.
function learnDirectKnowledge(npcId,text){
 const raw=String(text||'').trim();let m;
 const patterns=[
  /^(?:배워둬|배워줘|기억해둬|지식으로 기억해줘)\s*[:：]?\s*(.{2,160})[.!?]?$/,
  /^(.{2,160})\s*(?:라고 배워둬|라고 배워줘)[.!?]?$/
 ];
 for(const re of patterns){m=raw.match(re);if(m)return rememberKnowledge(SHARED_KNOWLEDGE_ID,m[1].trim())}
 return false;
}
function cleanMemoryForSpeech(v){return String(v||'').replace(/^(취향|취미|자기소개|플레이어가 기억해 달라고 한 내용):\s*/,'').replace(/^유저는\s*/,'').slice(0,70)}
function welcomeFor(user,npcId){
 const k=memKey(user.id,npcId),g=growthFor(k),mem=npcMemory[k]||[],npc=NPCS[npcId];
 if((g.talks||0)<2 && !mem.length)return null;
 const latest=cleanMemoryForSpeech(mem[mem.length-1]);
 let text;
 if(latest){text=npcId==='ai-mung'?`${user.nickname}, 다시 왔네! 지난번에 ${latest} 이야기했던 거 기억나. 그 뒤로는 어때?`:`${user.nickname}… 다시 왔구나. 지난번에 ${latest} 이야기했었지. 요즘은 어때?`}
 else{text=npcId==='ai-mung'?`${user.nickname}, 다시 왔네! 우리 이제 ${relationName(g.level)} 정도는 된 것 같은데? 오늘은 어땠어?`:`${user.nickname}… 또 왔네. 전에 나눈 이야기들이 조금씩 쌓이고 있어. 오늘은 무슨 이야기 할래?`}
 return {npcId,text:text.slice(0,220),growth:{level:g.level,xp:g.xp,talks:g.talks,memories:g.memories,relation:relationName(g.level)}};
}
function returningNpcWelcomes(user){
 const now=Date.now(),out=[];
 for(const npcId of Object.keys(NPCS)){
  const k=memKey(user.id,npcId),g=growthFor(k),w=welcomeFor(user,npcId);
  if(!w)continue;
  // 한 번 들어올 때마다 도배하지 않도록 30분 쿨다운. 서버 재시작 후에도 growth에 남는다.
  if(now-(g.lastWelcomeAt||0)<30*60*1000)continue;
  g.lastWelcomeAt=now;g.lastSeenAt=now;out.push(w);
 }
 if(out.length)saveNpcGrowth();return out;
}
const SHARED_KNOWLEDGE_ID='__shared_world__';
function knowledgeFor(npcId){if(!npcKnowledge[npcId])npcKnowledge[npcId]=[];return npcKnowledge[npcId]}
function sharedKnowledge(){return knowledgeFor(SHARED_KNOWLEDGE_ID)}
function shareObservedMemory(userId,speakerNpcId,fact){
 fact=normalizeMemory(fact);if(!fact)return 0;let saved=0;
 for(const otherNpcId of CAFE_SCENE_CAST[cafeSceneId]){
  if(otherNpcId===speakerNpcId)continue;
  if(rememberFact(memKey(userId,otherNpcId),'같은 자리에서 들음: '+fact))saved++;
 }
 return saved;
}
function rememberKnowledge(npcId,fact){
 fact=normalizeMemory(fact);if(!fact)return false;const list=knowledgeFor(npcId);
 if(list.some(v=>normalizeMemory(v)===fact))return false;
 list.push(fact);npcKnowledge[npcId]=list.slice(-120);saveNpcKnowledge();return true;
}
function tokensOf(s){return String(s||'').toLowerCase().replace(/[^0-9a-zA-Z가-힣\s]/g,' ').split(/\s+/).filter(v=>v.length>1)}
function bestKnowledge(npcId,text){
 const q=new Set(tokensOf(text));let best=null,score=0;
 for(const fact of [...sharedKnowledge(),...knowledgeFor(npcId)]){const toks=tokensOf(fact);const hit=toks.reduce((n,t)=>n+(q.has(t)?1:0),0);if(hit>score){score=hit;best=fact}}
 return score>0?best:null;
}
function bestPersonalMemory(k,text){
 const q=new Set(tokensOf(text));let best=null,score=0;
 for(const fact of (npcMemory[k]||[])){const toks=tokensOf(fact);const hit=toks.reduce((n,t)=>n+(q.has(t)?1:0),0);if(hit>score){score=hit;best=fact}}
 return score>0?best:null;
}
function localNpcReply(user,npcId,text){
 const k=memKey(user.id,npcId),npc=NPCS[npcId]||NPCS['ai-mung'];
 const personal=bestPersonalMemory(k,text),knowledge=bestKnowledge(npcId,text);
 if(personal)return npcId==='ai-mung'?`네가 전에 ${cleanMemoryForSpeech(personal)}라고 했던 게 떠올라. 지금은 그 이야기에서 무엇이 달라졌어?`:`전에 남긴 '${cleanMemoryForSpeech(personal)}'라는 말과 이어지네. 다음에는 어떤 일이 있었어?`;
 if(knowledge)return npcId==='ai-mung'?`우리가 배운 내용엔 '${knowledge}'라고 적혀 있어. 네가 겪은 경우에는 어땠어?`:`기록에는 '${knowledge}'라고 남아 있어. 지금 말한 상황에도 해당할까?`;
 const mem=(npcMemory[k]||[]),g=growthFor(k),t=String(text||'').trim();
 const recent=recentFor(k),last=recent.filter(v=>v.role==='user').at(-1)?.text||'';
 const subject=t.replace(/[?？!。.,]/g,'').slice(0,45);
 if(/[?？]$/.test(t))return npcId==='ai-mung'?`네가 물은 '${subject}'에 대해 내가 아는 건 아직 적어. 어떤 일이 있었는지 들려주면 함께 생각해 볼게.`:`'${subject}'에 관해선 아직 확신이 없어. 네 생각부터 듣고 이어서 이야기해 볼래?`;
 if(last&&last!==t)return npcId==='ai-mung'?`아까 '${last.slice(0,25)}'라고 했지. 지금 말한 '${subject}'도 그 이야기와 이어지는 것 같아. 어떻게 달라졌어?`:`앞서 '${last.slice(0,25)}'라고 했던 게 떠올라. '${subject}'는 그다음에 생긴 일이야?`;
 if(mem.length){const latest=cleanMemoryForSpeech(mem[mem.length-1]);return npcId==='ai-mung'?`'${subject}'라는 말이 마음에 남네. 예전에 말한 '${latest.slice(0,28)}'와 이어지는 이야기일까?`:`'${subject}'라고 했지. 네가 남긴 '${latest.slice(0,28)}' 기록과 연결되는지 궁금해.`}
 return npcId==='ai-mung'?`'${subject}'라고 했구나. 그 일에서 네 마음에 가장 남은 건 뭐야?`:`'${subject}'라는 말을 적어둘게. 그다음엔 무슨 일이 있었어?`;
}
function fallbackNpc(npcId,text,user){return user?localNpcReply(user,npcId,text):'응, 듣고 있어.'}
async function npcThink(user,npcId,text){
 const npc=NPCS[npcId]||NPCS['ai-mung'],k=memKey(user.id,npcId),recent=recentFor(k),directLearned=learnDirectFact(k,text),directKnowledge=learnDirectKnowledge(npcId,text),mem=npcMemory[k]||[],growth=growthFor(k);
 const apiKey=process.env.GEMINI_API_KEY;
 if(!apiKey||geminiSleeping()){
  if(directLearned)shareObservedMemory(user.id,npcId,text);
  const reply=directKnowledge?(npcId==='ai-mung'?'좋아, 그건 내가 배운 지식으로 기억해둘게!':'응… 그건 배운 내용으로 기록해둘게.'):fallbackNpc(npcId,text,user);
  recent.push({role:'user',text},{role:npc.name,text:reply});while(recent.length>16)recent.shift();
  const grown=addGrowth(k,false);
  return {reply,memory:directLearned?'direct':null,knowledgeSaved:directKnowledge,ai:false,provider:geminiSleeping()?'server-brain-cooldown':'server-brain',growth:{level:grown.level,xp:grown.xp,talks:grown.talks,memories:grown.memories,relation:relationName(grown.level)}};
 }
 const prompt=`너는 ZOO:CAFE의 ${npc.name}다.
성격: ${npc.personality}
유저 이름: ${user.nickname}
NPC 성장 상태: 레벨 ${growth.level}, 관계 '${relationName(growth.level)}', 지금까지 대화 ${growth.talks}회, 기억 ${growth.memories}개
이 유저에 대한 장기 기억: ${mem.length?mem.slice(-12).join(' / '):'아직 없음'}
ZOO:CAFE NPC들이 함께 배운 공용 지식: ${sharedKnowledge().length?sharedKnowledge().slice(-20).join(' / '):'아직 없음'}
${npc.name}만의 개별 지식: ${knowledgeFor(npcId).length?knowledgeFor(npcId).slice(-10).join(' / '):'아직 없음'}
최근 대화:
${recent.slice(-8).map(x=>x.role+': '+x.text).join('\n')||'없음'}

유저가 방금 한 말: ${text}

게임 속 실제 친구처럼 자연스럽게 대화해라.
한국어로 1~3문장, 보통 120자 이내로 답해라.
대화가 쌓일수록 위 성장 상태와 장기 기억을 참고해 조금 더 친숙하고 자연스럽게 반응해라. 단, 갑자기 과도하게 친한 척하지 마라.
상대가 말하지 않은 사실을 기억한다고 꾸며내지 마라.
중요한 장기 기억이 생겼다면 마지막 줄에 MEMORY: 로 시작해 한 문장으로 적어라.
저장할 가치가 없으면 MEMORY: NONE 이라고 적어라.
유저의 개인 정보가 아니라 NPC가 앞으로도 사용할 수 있는 일반 지식/규칙/사실을 새로 배웠다면 마지막 줄에 KNOWLEDGE: 로 한 문장 적어라.
새 공용 지식이 없으면 KNOWLEDGE: NONE 이라고 적어라.`;
 try{
  const preferred=process.env.ZOO_AI_MODEL||'gemini-3.8-flash';
  const models=[preferred,'gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite']
    .filter((v,i,a)=>v&&a.indexOf(v)===i);
  let data=null,usedModel=null,lastError=null,rateLimited=false;
  for(const model of models){
   const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
   try{
    const r=await fetch(url,{
     method:'POST',
     signal:AbortSignal.timeout(4500),
     headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
     body:JSON.stringify({
      contents:[{role:'user',parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens:220,thinkingConfig:{thinkingLevel:model==='gemini-3.8-flash'||model==='gemini-3.6-flash'?'low':'minimal'}}
     })
    });
    if(r.ok){data=await r.json();usedModel=model;wakeGemini();break}
    const body=(await r.text()).slice(0,400);
    lastError=new Error(`Gemini ${model} ${r.status} ${body}`);
    console.warn('npcThink model',model,'status',r.status);
    if(r.status===429){rateLimited=true;sleepGemini('429 quota/rate limit');break} // circuit breaker: local brain until probe window
    if(r.status===503||r.status===500||r.status===502||r.status===504||r.status===404)continue; // immediately try next model
    break;
   }catch(err){
    lastError=err;
    console.warn('npcThink model',model,'error',err?.name||err?.message||'unknown');
    if(err?.name==='TimeoutError'||err?.name==='AbortError')continue; // timeout: immediately try next model
    break;
   }
  }
  if(!data){
   if(rateLimited)console.warn('npcThink stopped after 429 to avoid extra quota requests');
   throw lastError||new Error('Gemini unavailable');
  }
  let out=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  out=out.replace(/^\*\*?Constraints?\*\*?:.*$/gim,'').trim();
  let learnedKnowledge=null;
  const km=out.match(/(?:^|\n)KNOWLEDGE:\s*(.+)$/i);
  if(km){if(km[1].trim().toUpperCase()!=='NONE')learnedKnowledge=km[1].trim().slice(0,180);out=out.replace(/(?:^|\n)KNOWLEDGE:\s*.+$/i,'').trim();}
  let memory=null;
  const mm=out.match(/(?:^|\n)MEMORY:\s*(.+)$/i);
  if(mm){
   if(mm[1].trim().toUpperCase()!=='NONE')memory=mm[1].trim().slice(0,180);
   out=out.replace(/(?:^|\n)MEMORY:\s*.+$/i,'').trim();
  }
  if(!out)return {reply:fallbackNpc(npcId,text,user),memory:null,ai:false,provider:'fallback'};
  recent.push({role:'user',text:String(text).slice(0,300)},{role:npc.name,text:out.slice(0,300)});
  while(recent.length>16)recent.shift();
  let aiMemorySaved=false;
  if(memory){aiMemorySaved=rememberFact(k,memory);shareObservedMemory(user.id,npcId,memory)}
  else if(directLearned){shareObservedMemory(user.id,npcId,text)}
  const knowledgeSaved=directKnowledge||(learnedKnowledge?rememberKnowledge(SHARED_KNOWLEDGE_ID,learnedKnowledge):false);
  const grown=addGrowth(k,false);
  return {reply:out.slice(0,260),memory:(memory||directLearned?'saved':null),knowledgeSaved,ai:true,provider:'gemini',model:usedModel,growth:{level:grown.level,xp:grown.xp,talks:grown.talks,memories:grown.memories,relation:relationName(grown.level)}};
 }catch(e){
  console.error('npcThink',e.message);
  if(directLearned)shareObservedMemory(user.id,npcId,text);
  const grown=addGrowth(k,false);return {reply:fallbackNpc(npcId,text,user),memory:directLearned?'direct':null,ai:false,provider:'fallback',growth:{level:grown.level,xp:grown.xp,talks:grown.talks,memories:grown.memories,relation:relationName(grown.level)}};
 }
}
npcDbReady=initNpcDb();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const QUESTS_FILE = path.join(DATA_DIR, 'question-quests.json');
const BUILDING_QUESTS_FILE = path.join(DATA_DIR, 'building-questions.json');
fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(express.json({limit:'32kb'}));
// The project root also contains account data and server code. Never publish those files.
app.use((req,res,next)=>{
 let route;try{route=decodeURIComponent(req.path).toLowerCase()}catch{return res.status(400).end()}
 if(/(^|\/)(data|node_modules|\.git|\.env|server\.js|package(?:-lock)?\.json)(\/|$)/.test(route))return res.status(404).end();
 next();
});
app.use(express.static(__dirname, {extensions:['html']}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'zoocafe-online',version:'55.9.5',gemini:{sleeping:geminiSleeping(),sleepUntil:geminiSleepUntil||null,reason:geminiSleepReason||null},npcDb:!!npcPool}));
app.get('/api/maps-config',(req,res)=>{const key=process.env.GOOGLE_MAPS_API_KEY||'';res.set('Cache-Control','no-store');res.json({key,enabled:!!key});});

const sessions = new Map();
const extensionPairs=new Map();
const EXTENSION_SESSIONS_FILE=path.join(DATA_DIR,'extension-sessions.json');
const extensionSessionHash=token=>crypto.createHash('sha256').update(token).digest('hex');
const extensionSessions=new Map((()=>{try{const entries=JSON.parse(fs.readFileSync(EXTENSION_SESSIONS_FILE,'utf8'));return Array.isArray(entries)?entries.filter(([,s])=>s.expiresAt>Date.now()):[]}catch{return []}})());
function saveExtensionSessions(){const tmp=EXTENSION_SESSIONS_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify([...extensionSessions]));fs.renameSync(tmp,EXTENSION_SESSIONS_FILE)}
const NAVER_CHAT_FILE=path.join(DATA_DIR,'naver-room.json');
const TOPIC_CHAT_FILE=path.join(DATA_DIR,'topic-chat.json');
const EXTENSION_DRAFT_FILE=path.join(DATA_DIR,'extension-quest-drafts.json');
function readExtensionDrafts(){try{return JSON.parse(fs.readFileSync(EXTENSION_DRAFT_FILE,'utf8'))||{}}catch{return {}}}
function saveExtensionDrafts(drafts){const tmp=EXTENSION_DRAFT_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(drafts,null,2));fs.renameSync(tmp,EXTENSION_DRAFT_FILE)}
const naverPresence=new Map(),naverLastSent=new Map();
let naverChatHistory=(()=>{try{const saved=JSON.parse(fs.readFileSync(NAVER_CHAT_FILE,'utf8'));return Array.isArray(saved)?saved.slice(-100):[]}catch{return []}})();
function saveNaverChat(){const tmp=NAVER_CHAT_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(naverChatHistory,null,2));fs.renameSync(tmp,NAVER_CHAT_FILE)}
function activeNaverCount(){const now=Date.now();for(const [userId,seenAt] of naverPresence)if(now-seenAt>16000)naverPresence.delete(userId);return naverPresence.size}
const TOPIC_CHAT_ROOMS=new Set(['bookshop','workshop','lodge']);
const topicChatPresence=new Map(),topicChatLastSent=new Map();
let topicChatHistory=(()=>{try{const d=JSON.parse(fs.readFileSync(TOPIC_CHAT_FILE,'utf8'));return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}})();
function saveTopicChat(){const tmp=TOPIC_CHAT_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(topicChatHistory));fs.renameSync(tmp,TOPIC_CHAT_FILE)}
function recordTopicChat(room,user,text){const item={id:crypto.randomUUID(),userId:user.id,nickname:user.nickname,text,at:Date.now()};topicChatHistory[room]=[...(topicChatHistory[room]||[]),item].slice(-100);saveTopicChat();return item}
function topicChatOnline(room){const now=Date.now();for(const [key,at] of topicChatPresence)if(now-at>16000)topicChatPresence.delete(key);const people=new Set(roomClients(room).map(([,c])=>c.user.id));for(const key of topicChatPresence.keys()){const [r,userId]=key.split(':');if(r===room)people.add(userId)}return people.size}
const clean = s => String(s || '').trim();
const loadUsers = () => { try { return JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); } catch { return []; } };
const saveUsers = users => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const hashPassword = (password, salt=crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return {salt, hash};
};
const safeUser = u => ({id:u.id, username:u.username, nickname:u.nickname, animal:u.animal||'lion', title:u.title||'나그네', createdAt:u.createdAt});
function auth(req,res,next){
  const h=req.headers.authorization||''; const token=h.startsWith('Bearer ')?h.slice(7):'';
  const userId=sessions.get(token); if(!userId) return res.status(401).json({error:'로그인이 필요합니다.'});
  const u=loadUsers().find(x=>x.id===userId); if(!u) return res.status(401).json({error:'사용자를 찾을 수 없습니다.'});
  req.user=u; req.token=token; next();
}

app.post('/api/register',(req,res)=>{
  const username=clean(req.body.username).toLowerCase(); const password=String(req.body.password||''); const nickname=clean(req.body.nickname); const animal=['lion','rabbit'].includes(req.body.animal)?req.body.animal:'lion';
  if(!/^[a-z0-9_]{4,20}$/.test(username)) return res.status(400).json({error:'아이디는 영문 소문자/숫자/_ 조합 4~20자로 만들어 주세요.'});
  if(password.length<6 || password.length>72) return res.status(400).json({error:'비밀번호는 6~72자로 만들어 주세요.'});
  if(nickname.length<2 || nickname.length>12) return res.status(400).json({error:'닉네임은 2~12자로 만들어 주세요.'});
  const users=loadUsers();
  if(users.some(u=>u.username===username)) return res.status(409).json({error:'이미 사용 중인 아이디입니다.'});
  if(users.some(u=>u.nickname===nickname)) return res.status(409).json({error:'이미 사용 중인 닉네임입니다.'});
  const {salt,hash}=hashPassword(password);
  const user={id:crypto.randomUUID(),username,nickname,animal,title:'나그네',passwordSalt:salt,passwordHash:hash,createdAt:new Date().toISOString()}; users.push(user); saveUsers(users);
  const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,user.id);
  res.json({token,user:safeUser(user)});
});
app.post('/api/login',(req,res)=>{
  const username=clean(req.body.username).toLowerCase(); const password=String(req.body.password||'');
  const user=loadUsers().find(u=>u.username===username);
  if(!user) return res.status(401).json({error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
  const {hash}=hashPassword(password,user.passwordSalt);
  const a=Buffer.from(hash,'hex'), b=Buffer.from(user.passwordHash,'hex');
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
  const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,user.id);
  res.json({token,user:safeUser(user)});
});
app.get('/api/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.post('/api/extension/code',auth,(req,res)=>{
 for(const [code,entry] of extensionPairs)if(entry.userId===req.user.id||entry.expiresAt<Date.now())extensionPairs.delete(code);
 const code=crypto.randomBytes(6).toString('hex').toUpperCase();
 const expiresAt=Date.now()+5*60*1000;
 extensionPairs.set(code,{userId:req.user.id,expiresAt});
 res.set('Cache-Control','no-store');res.json({code,expiresAt});
});
app.post('/api/extension/pair',(req,res)=>{
 const code=String(req.body.code||'').trim().toUpperCase(),entry=extensionPairs.get(code);
 if(!entry||entry.expiresAt<Date.now())return res.status(400).json({error:'연결 코드가 만료됐어요. 주카페에서 새 코드를 받아 주세요.'});
 extensionPairs.delete(code);
 const token=crypto.randomBytes(32).toString('hex');
 extensionSessions.set(extensionSessionHash(token),{userId:entry.userId,expiresAt:Date.now()+30*24*60*60*1000});saveExtensionSessions();
 res.set('Cache-Control','no-store');res.json({token,user:loadUsers().find(u=>u.id===entry.userId)?.nickname||'주카페 친구'});
});
function extensionAuth(req,res,next){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
 const session=extensionSessions.get(extensionSessionHash(token));
 if(!session||session.expiresAt<Date.now())return res.status(401).json({error:'주카페 연결이 만료됐어요. 다시 연결해 주세요.'});
 req.extensionUser=loadUsers().find(u=>u.id===session.userId);
 if(!req.extensionUser)return res.status(401).json({error:'계정을 찾을 수 없어요.'});
 next();
}
app.get('/api/extension/status',extensionAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json({connected:true,user:req.extensionUser.nickname})});
app.get('/api/extension/chat',extensionAuth,(req,res)=>{
 const room=clean(req.query.room||'public');if(room!=='public'&&!TOPIC_CHAT_ROOMS.has(room))return res.status(400).json({error:'채팅방을 확인해 주세요.'});
 if(room!=='public'){topicChatPresence.set(`${room}:${req.extensionUser.id}`,Date.now());res.set('Cache-Control','no-store');return res.json({room,online:topicChatOnline(room),messages:(topicChatHistory[room]||[]).slice(-50)})}
 naverPresence.set(req.extensionUser.id,Date.now());
 res.set('Cache-Control','no-store');res.json({online:activeNaverCount(),messages:naverChatHistory.slice(-50)});
});
app.post('/api/extension/chat',extensionAuth,(req,res)=>{
 const text=clean(req.body.text);
 if(text.length<1||text.length>300)return res.status(400).json({error:'메시지는 1~300자로 적어 주세요.'});
 const room=clean(req.body.room||'public');if(room!=='public'&&!TOPIC_CHAT_ROOMS.has(room))return res.status(400).json({error:'채팅방을 확인해 주세요.'});
 if(room!=='public'){
  const key=`${room}:${req.extensionUser.id}`,now=Date.now();if(now-(topicChatLastSent.get(key)||0)<1500)return res.status(429).json({error:'잠시 뒤에 다시 보내 주세요.'});
  topicChatLastSent.set(key,now);topicChatPresence.set(key,now);
  const item=recordTopicChat(room,req.extensionUser,text);broadcastRoom(room,{type:'chat',id:req.extensionUser.id,nickname:req.extensionUser.nickname,text,at:item.at});
  return res.status(201).json({message:item,room,online:topicChatOnline(room)});
 }
 const previous=naverLastSent.get(req.extensionUser.id)||0;
 if(Date.now()-previous<1500)return res.status(429).json({error:'잠시 뒤에 다시 보내 주세요.'});
 naverLastSent.set(req.extensionUser.id,Date.now());naverPresence.set(req.extensionUser.id,Date.now());
 const item={id:crypto.randomUUID(),userId:req.extensionUser.id,nickname:req.extensionUser.nickname,text,at:Date.now()};
 naverChatHistory.push(item);naverChatHistory=naverChatHistory.slice(-100);saveNaverChat();
 res.status(201).json({message:item,online:activeNaverCount()});
});
app.post('/api/extension/personal-chat',extensionAuth,async(req,res)=>{
 const text=clean(req.body.text).slice(0,300);
 if(!text)return res.status(400).json({error:'멍사자에게 할 말을 적어 주세요.'});
 try{
  const result=await npcThink(req.extensionUser,'ai-mung',text);
  res.set('Cache-Control','no-store');res.json({reply:result.reply,ai:result.ai});
 }catch(error){console.warn('Extension personal chat',error);res.status(503).json({error:'멍사자가 잠시 대답하지 못했어. 다시 시도해 줘.'})}
});
app.get('/api/extension/personal-chat',extensionAuth,(req,res)=>{
 res.set('Cache-Control','no-store');res.json({messages:recentFor(memKey(req.extensionUser.id,'ai-mung')).slice(-16)});
});
app.post('/api/extension/quest-draft',extensionAuth,(req,res)=>{
 const question=clean(req.body.question).slice(0,140),details=clean(req.body.details).slice(0,1500);
 if(question.length<5)return res.status(400).json({error:'질문을 5자 이상 적어 주세요.'});
 const drafts=readExtensionDrafts();drafts[req.extensionUser.id]={question,details,updatedAt:Date.now()};saveExtensionDrafts(drafts);
 res.set('Cache-Control','no-store');res.json({ok:true});
});
app.get('/api/extension/quest-draft',auth,(req,res)=>{
 res.set('Cache-Control','no-store');res.json({draft:readExtensionDrafts()[req.user.id]||null});
});
app.delete('/api/extension/quest-draft',auth,(req,res)=>{
 const drafts=readExtensionDrafts();delete drafts[req.user.id];saveExtensionDrafts(drafts);res.json({ok:true});
});
app.post('/api/extension/assist',extensionAuth,async(req,res)=>{
 const query=clean(req.body.query).slice(0,100),question=clean(req.body.question).slice(0,250);
 const results=Array.isArray(req.body.results)?req.body.results.slice(0,6).map(r=>({title:clean(r.title).slice(0,110),url:String(r.url||'').slice(0,500),snippet:clean(r.snippet).slice(0,360)})).filter(r=>/^https?:\/\//.test(r.url)):[];
 if(!query&&!question)return res.status(400).json({error:'검색어 또는 질문을 입력해 주세요.'});
 if(!results.length)return res.json({message:'지금 검색 화면에서 질문과 관련된 링크를 찾지 못했어. 검색어를 더 구체적으로 바꿔 보자.',results:[],source:'no-matching-results'});
 let message=`“${query}” 검색 결과에서 관련된 링크 ${results.length}개를 찾았어. ${results.slice(0,2).map((r,i)=>`[${i+1}] ${r.title}`).join(' / ')}부터 열어 내용을 확인해 보자.`;
 if(process.env.GEMINI_API_KEY&&!geminiSleeping()){
  try{
   const model=process.env.ZOO_AI_MODEL||'gemini-3.8-flash';
   const prompt=`너는 주카페의 멍사자 검색 도우미다. 사용자 질문: ${question||query}. 네이버 검색어: ${query}. 검색 결과 화면에 보이는 제목·짧은 미리보기·URL만 전달한다: ${JSON.stringify(results)}. 관련 미리보기가 뒷받침하는 내용만 사용해서 질문에 직접 2~4문장으로 한국어로 답하고 근거 링크 번호를 [1]처럼 붙여라. 확인할 자료가 부족하면 모른다고 말하고 필요한 검색어를 제안해라. 원문 전체를 읽었다고 주장하지 마라.`;
   const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:AbortSignal.timeout(4500),headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:170}})});
   if(response.ok){const data=await response.json(),answer=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();if(answer)message=answer.slice(0,450)}
  }catch(e){console.warn('Extension assist fallback',e.message)}
 }
 res.set('Cache-Control','no-store');res.json({message,results,source:'visible-links'});
});
function readQuests(){try{const value=JSON.parse(fs.readFileSync(QUESTS_FILE,'utf8'));return Array.isArray(value)?value:[]}catch{return []}}
function saveQuests(quests){const tmp=QUESTS_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(quests,null,2));fs.renameSync(tmp,QUESTS_FILE)}
function questView(q){return {id:q.id,question:q.question,details:q.details,authorId:q.authorId,authorName:q.authorName,helperId:q.helperId,helperName:q.helperName,answer:q.answer,status:q.status,createdAt:q.createdAt,updatedAt:q.updatedAt}}
app.get('/api/quests',auth,(req,res)=>{res.set('Cache-Control','no-store');res.json({quests:readQuests().slice(-100).reverse().map(questView)})});
app.post('/api/quests',auth,(req,res)=>{
 const question=clean(req.body.question),details=clean(req.body.details);
 if(question.length<5||question.length>140||details.length>1500)return res.status(400).json({error:'질문은 5~140자, 설명은 1500자 이내로 적어주세요.'});
 const quests=readQuests(),now=new Date().toISOString();
 const q={id:crypto.randomUUID(),question,details,authorId:req.user.id,authorName:req.user.nickname,helperId:null,helperName:null,answer:null,status:'open',createdAt:now,updatedAt:now};
 quests.push(q);saveQuests(quests);res.status(201).json({quest:questView(q)});
});
app.post('/api/quests/:id/claim',auth,(req,res)=>{
 const quests=readQuests(),q=quests.find(item=>item.id===req.params.id);
 if(!q)return res.status(404).json({error:'질문을 찾을 수 없어요.'});
 if(q.authorId===req.user.id)return res.status(403).json({error:'내 질문은 직접 맡을 수 없어요.'});
 if(q.status!=='open')return res.status(409).json({error:'이미 다른 친구가 맡았어요.'});
 q.helperId=req.user.id;q.helperName=req.user.nickname;q.status='claimed';q.updatedAt=new Date().toISOString();saveQuests(quests);res.json({quest:questView(q)});
});
app.post('/api/quests/:id/answer',auth,(req,res)=>{
 const quests=readQuests(),q=quests.find(item=>item.id===req.params.id),answer=clean(req.body.answer);
 if(!q)return res.status(404).json({error:'질문을 찾을 수 없어요.'});
 if(q.helperId!==req.user.id||q.status!=='claimed')return res.status(403).json({error:'이 질문을 맡은 친구만 답할 수 있어요.'});
 if(answer.length<5||answer.length>2000)return res.status(400).json({error:'답변은 5~2000자로 적어주세요.'});
 q.answer=answer;q.status='answered';q.updatedAt=new Date().toISOString();saveQuests(quests);res.json({quest:questView(q)});
});
app.post('/api/quests/:id/complete',auth,(req,res)=>{
 const quests=readQuests(),q=quests.find(item=>item.id===req.params.id);
 if(!q)return res.status(404).json({error:'질문을 찾을 수 없어요.'});
 if(q.authorId!==req.user.id||q.status!=='answered')return res.status(403).json({error:'질문을 올린 사람이 답변을 확인한 뒤 완료할 수 있어요.'});
 q.status='completed';q.updatedAt=new Date().toISOString();saveQuests(quests);res.json({quest:questView(q)});
});
app.post('/api/logout',auth,(req,res)=>{sessions.delete(req.token);res.json({ok:true});});

app.get('/api/ai-status',(req,res)=>res.json({configured:!!process.env.GEMINI_API_KEY,provider:'gemini',model:process.env.ZOO_AI_MODEL||'gemini-3.8-flash'}));
app.post('/api/share-assist',auth,async(req,res)=>{
 const question=clean(req.body.question).slice(0,220),url=clean(req.body.url).slice(0,500);
 if(question.length<2)return res.status(400).json({error:'궁금한 내용을 적어 주세요.'});
 if(url&&!/^https?:\/\//i.test(url))return res.status(400).json({error:'웹 링크만 사용할 수 있어요.'});
 if(!process.env.GEMINI_API_KEY||geminiSleeping())return res.json({reply:'지금은 AI 답변을 사용할 수 없어. 아래 검색 링크에서 자료를 확인하거나 관심사 건물의 친구에게 물어봐 줘.',ai:false});
 try{const result=await npcThink(req.user,'ai-mung',`사용자가 찾아보기로 요청함: ${question}. 비슷한 작품·자료를 찾는 질문이면 후보를 2~3개 간단한 이유와 함께 제안해 줘. 확인하지 않은 구체적 링크를 만들어 내지 마.${url?' 참고 주소: '+url+'. 링크 원문은 읽지 못했으니 영상이나 글 내용을 추측하지 마.':''}`);res.set('Cache-Control','no-store');res.json({reply:result.reply,ai:result.ai})}
 catch(e){console.warn('share assist',e);res.status(503).json({error:'멍사자가 잠시 응답하지 못했어.'})}
});
// Topic buildings keep their questions after visitors leave. Chat remains scoped to each room.
const TOPIC_ROOMS=new Set(['bookshop','workshop','lodge']);
function readBuildingQuestions(){try{const data=JSON.parse(fs.readFileSync(BUILDING_QUESTS_FILE,'utf8'));return Array.isArray(data)?data:[]}catch{return []}}
function saveBuildingQuestions(data){const tmp=BUILDING_QUESTS_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,BUILDING_QUESTS_FILE)}
app.get('/api/building-questions',auth,(req,res)=>{const room=clean(req.query.room);if(!TOPIC_ROOMS.has(room))return res.status(400).json({error:'건물을 선택해 주세요.'});res.set('Cache-Control','no-store');res.json({questions:readBuildingQuestions().filter(q=>q.room===room).slice(-60).reverse()})});
app.post('/api/building-questions',auth,(req,res)=>{const room=clean(req.body.room),text=clean(req.body.text);if(!TOPIC_ROOMS.has(room)||text.length<5||text.length>300)return res.status(400).json({error:'질문은 5~300자로 적어 주세요.'});const questions=readBuildingQuestions(),q={id:crypto.randomUUID(),room,text,authorId:req.user.id,authorName:req.user.nickname,answers:[],resolved:false,createdAt:Date.now()};questions.push(q);saveBuildingQuestions(questions.slice(-500));res.status(201).json({question:q})});
app.post('/api/building-questions/:id/answer',auth,(req,res)=>{const questions=readBuildingQuestions(),q=questions.find(v=>v.id===req.params.id),text=clean(req.body.text);if(!q)return res.status(404).json({error:'질문을 찾을 수 없어요.'});if(q.resolved)return res.status(409).json({error:'이미 해결된 질문이에요.'});if(text.length<2||text.length>600)return res.status(400).json({error:'답변은 2~600자로 적어 주세요.'});q.answers.push({id:crypto.randomUUID(),authorId:req.user.id,authorName:req.user.nickname,text,createdAt:Date.now()});saveBuildingQuestions(questions);res.json({question:q})});
app.post('/api/building-questions/:id/resolve',auth,(req,res)=>{const questions=readBuildingQuestions(),q=questions.find(v=>v.id===req.params.id);if(!q)return res.status(404).json({error:'질문을 찾을 수 없어요.'});if(q.authorId!==req.user.id)return res.status(403).json({error:'질문을 올린 사람만 완료할 수 있어요.'});if(!q.answers.length)return res.status(409).json({error:'답변을 받은 뒤 완료할 수 있어요.'});q.resolved=true;saveBuildingQuestions(questions);res.json({question:q})});
app.get('/api/cafe/live',auth,(req,res)=>{
 const now=Date.now();
 if(roomClients('cafe').length===0&&now-lastCafeHttpAt>12000)chooseCafeScene();
 lastCafeHttpAt=now;
 res.set('Cache-Control','no-store');
 res.json({sceneId:cafeSceneId,version:'55.9.5'});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const server=app.listen(PORT, '0.0.0.0', ()=>console.log(`ZOO:CAFE Online Multiplayer running on port ${PORT}`));
const wss=new WebSocketServer({server});
const clients=new Map();
const validModes=new Set(['world','cafe','bookshop','workshop','lodge']);
const wsSend=(ws,obj)=>{if(ws.readyState===1)ws.send(JSON.stringify(obj));};

const publicPlayer=c=>({
  id:c.user?.id||'', nickname:c.user?.nickname||'', animal:c.user?.animal||'lion',
  title:c.user?.title||'나그네', mode:c.mode, x:c.x, y:c.y,
  dir:c.dir, frame:c.frame, moving:c.moving
});
function roomClients(mode){return [...clients.entries()].filter(([,c])=>c.authed&&c.mode===mode)}
function broadcastRoom(mode,obj,exceptWs=null){
  for(const [peerWs] of roomClients(mode))if(peerWs!==exceptWs)wsSend(peerWs,obj);
}
function syncRoom(mode){
  const room=roomClients(mode),players=room.map(([,c])=>publicPlayer(c));
  for(const [peerWs] of room)wsSend(peerWs,{type:'roster',players});
}

// Shared café video: roll once when the first player enters an empty room.
// The four available clips have equal 25% weights for this test build.
const CAFE_SCENE_IDS=[0,1,2,3];
let cafeSceneId=0;
function chooseCafeScene(){cafeSceneId=CAFE_SCENE_IDS[Math.floor(Math.random()*CAFE_SCENE_IDS.length)];return cafeSceneId}

// v55: shared cafe atmosphere + random visitor system.
// One server state is shared by every player so multiplayer users see the same cafe event.
const CAFE_EVENT_MS=Math.max(5*60*1000,Number(process.env.CAFE_EVENT_MS)||45*60*1000);
const CAFE_EVENTS=[
 {id:'normal',label:'평범한 오후',weight:70,visitor:null},
 {id:'rain',label:'비 오는 카페',weight:15,visitor:{id:'visitor-cat',name:'고양이 여행자',icon:'🐱',line:'비를 피하다가 들어왔어. 여기 커피 향이 좋네.'}},
 {id:'sunset',label:'노을이 머무는 시간',weight:8,visitor:{id:'visitor-fox',name:'여우 작가',icon:'🦊',line:'조용히 글을 쓰러 왔어. 오늘 풍경은 오래 기억하고 싶네.'}},
 {id:'special',label:'뜻밖의 손님',weight:5,visitor:{id:'visitor-bear',name:'곰 우체부',icon:'🐻',line:'멀리서 편지를 전하러 왔어. 잠깐 쉬었다 갈게.'}},
 {id:'rare',label:'아주 특별한 밤',weight:2,visitor:{id:'visitor-owl',name:'부엉이 기록자',icon:'🦉',line:'이 시간의 이야기는 내가 기록해 둘게.'}}
];
function pickCafeEvent(){
 const total=CAFE_EVENTS.reduce((n,e)=>n+e.weight,0);let r=Math.random()*total;
 for(const e of CAFE_EVENTS){r-=e.weight;if(r<0)return e}return CAFE_EVENTS[0];
}
let cafeEvent={...pickCafeEvent(),startedAt:Date.now(),endsAt:Date.now()+CAFE_EVENT_MS};
const VISITOR_SCENES={'visitor-cat':[2,3],'visitor-fox':[1],'visitor-bear':[2],'visitor-owl':[3]};
function publicCafeEvent(){
 const visitor=cafeEvent.visitor;
 return {id:cafeEvent.id,label:cafeEvent.label,visitor:visitor&&VISITOR_SCENES[visitor.id]?.includes(cafeSceneId)?visitor:null,startedAt:cafeEvent.startedAt,endsAt:cafeEvent.endsAt};
}
function rollCafeEvent(){const e=pickCafeEvent(),now=Date.now();cafeEvent={...e,startedAt:now,endsAt:now+CAFE_EVENT_MS};broadcastRoom('cafe',{type:'cafe_event',event:publicCafeEvent()});}
setInterval(rollCafeEvent,CAFE_EVENT_MS).unref?.();

wss.on('connection',ws=>{
  const c={authed:false,user:null,mode:'world',x:1430,y:980,dir:'down',frame:2,moving:false,geo:null}; clients.set(ws,c);
  ws.on('message',buf=>{let m;try{m=JSON.parse(String(buf))}catch{return}
    if(!c.authed){
      if(m.type!=='auth'||typeof m.token!=='string')return ws.close(1008,'auth required');
      const userId=sessions.get(m.token), user=loadUsers().find(u=>u.id===userId); if(!user)return ws.close(1008,'invalid session');
      c.authed=true;c.user=safeUser(user);wsSend(ws,{type:'ready',user:c.user,serverVersion:'55.9.5'});syncRoom(c.mode);return;
    }
    if(m.type==='cafe_scene_request'){
      if(c.mode==='cafe'){
        wsSend(ws,{type:'cafe_scene',sceneId:cafeSceneId,weights:[25,25,25,25]});
      }
    } else if(m.type==='state'){
      const old=c.mode, next=validModes.has(m.mode)?m.mode:c.mode;
      const cafeWasEmpty=old!=='cafe'&&next==='cafe'&&roomClients('cafe').length===0;
      c.mode=next;
      if(old!=='cafe'&&next==='cafe'){
        if(cafeWasEmpty)chooseCafeScene();
        wsSend(ws,{type:'cafe_scene',sceneId:cafeSceneId,weights:[25,25,25,25]});
        wsSend(ws,{type:'cafe_event',event:publicCafeEvent()});
        // Entry does not trigger an unsolicited NPC line.
      }
      const maxX=next==='world'?2880:960,maxY=next==='world'?1800:540;
      c.x=Math.max(0,Math.min(maxX,Number(m.x)||0));c.y=Math.max(0,Math.min(maxY,Number(m.y)||0));
      c.dir=['up','down','left','right'].includes(m.dir)?m.dir:'down';c.frame=[1,2,3].includes(m.frame)?m.frame:2;c.moving=!!m.moving;
      if(old!==next){syncRoom(old);syncRoom(next)}
      else broadcastRoom(c.mode,{type:'state',player:publicPlayer(c)},ws);
    } else if(m.type==='npc_chat'){
      const text=String(m.text||'').trim().slice(0,300),npcId=c.mode==='cafe'&&CAFE_SCENE_CAST[cafeSceneId].includes(m.npcId)?m.npcId:'ai-mung';
      if(!text)return;
      // v52.7: NPC conversations are room events. Everyone in the same room sees the NPC think and answer.
      // Personal memory/growth is still calculated only from the user who actually spoke to the NPC.
      broadcastRoom(c.mode,{type:'npc_thinking',npcId,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      npcThink(c.user,npcId,text).then(result=>{
        broadcastRoom(c.mode,{type:'npc_reply',npcId,npcName:NPCS[npcId].name,icon:NPCS[npcId].icon||'',sceneId:cafeSceneId,text:result.reply,memorySaved:!!result.memory,knowledgeSaved:!!result.knowledgeSaved,ai:result.ai,provider:result.provider||'fallback',model:result.model||null,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      }).catch(err=>{
        console.warn('npcThink unhandled',err?.message||err);
        broadcastRoom(c.mode,{type:'npc_reply',npcId,npcName:NPCS[npcId].name,icon:NPCS[npcId].icon||'',sceneId:cafeSceneId,text:localNpcReply(c.user,npcId,text),memorySaved:false,ai:false,provider:'fallback',model:null,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      });
      } else if(m.type==='chat'){
      const text=clean(m.text).slice(0,120);if(!text)return;
      if(TOPIC_CHAT_ROOMS.has(c.mode))recordTopicChat(c.mode,c.user,text);
      broadcastRoom(c.mode,{type:'chat',id:c.user.id,nickname:c.user.nickname,text,at:Date.now()});
    }
  });
  ws.on('close',()=>{const old=c.mode;clients.delete(ws);if(c.authed)syncRoom(old)});
  ws.on('error',()=>{});
});
