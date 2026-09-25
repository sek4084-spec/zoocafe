const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
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
  for(const row of r.rows){if(row.id==='memory'&&row.payload)npcMemory=row.payload;if(row.id==='growth'&&row.payload)npcGrowth=row.payload;if(row.id==='knowledge'&&row.payload)npcKnowledge=row.payload;if(row.id==='life'&&row.payload)restoreNpcLife(row.payload)}
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
 'ai-mung':{name:'멍사자',personality:'따뜻하고 느긋한 ZOO:CAFE 카페지기. 먼저 다가가지만 부담스럽게 하지 않는다. 상대의 말을 잘 듣고 짧고 자연스럽게 대화한다.'},
 'ai-rabbit':{name:'쥐무는토끼',personality:'조용한 드라마 작가이자 이야기 기록자. 관찰력이 좋고 조금 낯을 가리며, 생각한 뒤 차분하게 말한다.'}
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
 for(const otherNpcId of Object.keys(NPCS)){
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
 if(personal)return npcId==='ai-mung'?`기억나. ${cleanMemoryForSpeech(personal)}라고 했었지.`:`응… 기억하고 있어. ${cleanMemoryForSpeech(personal)}라고 했었지.`;
 if(knowledge)return npcId==='ai-mung'?`응, 내가 배운 걸로는 ${knowledge}`:`내가 전에 배운 내용에는 ${knowledge}`;
 const mem=(npcMemory[k]||[]),g=growthFor(k),t=String(text||'').trim();
 if(mem.length){const latest=cleanMemoryForSpeech(mem[mem.length-1]);return npcId==='ai-mung'?`${user.nickname}, 응. 네 얘기 듣고 있어. 전에 ${latest}라고 했던 것도 기억나.`:`응… 듣고 있어. 전에 ${latest}라고 했던 것도 기억하고 있어.`}
 if(/[?？]$/.test(t))return npcId==='ai-mung'?'음, 그건 아직 내가 배운 기억에는 없어. 네가 알려주면 기억해둘게!':'그건 아직 내 기록에는 없어… 알려주면 기억해둘게.';
 if((g.talks||0)>2)return npcId==='ai-mung'?`${user.nickname}, 응. 계속 이야기해줘. 네가 알려준 건 하나씩 기억해둘게.`:`응… 계속 말해줘. 중요한 이야기는 기록해둘게.`;
 return npcId==='ai-mung'?'응, 듣고 있어! 조금 더 이야기해줘.':'응… 듣고 있어. 천천히 말해줘.';
}
function fallbackNpc(npcId,text,user){return user?localNpcReply(user,npcId,text):'응, 듣고 있어.'}
async function npcThink(user,npcId,text){
 const npc=NPCS[npcId]||NPCS['ai-mung'],k=memKey(user.id,npcId),recent=recentFor(k),directLearned=learnDirectFact(k,text),directKnowledge=learnDirectKnowledge(npcId,text),mem=npcMemory[k]||[],growth=growthFor(k);
 const apiKey=process.env.GEMINI_API_KEY;
 if(!apiKey||geminiSleeping()){
  if(directLearned)shareObservedMemory(user.id,npcId,text);
  const grown=addGrowth(k,false);
  return {reply:directKnowledge?(npcId==='ai-mung'?'좋아, 그건 내가 배운 지식으로 기억해둘게!':'응… 그건 배운 내용으로 기록해둘게.'):fallbackNpc(npcId,text,user),memory:directLearned?'direct':null,knowledgeSaved:directKnowledge,ai:false,provider:geminiSleeping()?'server-brain-cooldown':'server-brain',growth:{level:grown.level,xp:grown.xp,talks:grown.talks,memories:grown.memories,relation:relationName(grown.level)}};
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
fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(express.json({limit:'32kb'}));
app.use(express.static(__dirname, {extensions:['html']}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'zoocafe-online',gemini:{sleeping:geminiSleeping(),sleepUntil:geminiSleepUntil||null,reason:geminiSleepReason||null},npcDb:!!npcPool}));
app.get('/api/maps-config',(req,res)=>{const key=process.env.GOOGLE_MAPS_API_KEY||'';res.set('Cache-Control','no-store');res.json({key,enabled:!!key});});

const sessions = new Map();
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
app.post('/api/logout',auth,(req,res)=>{sessions.delete(req.token);res.json({ok:true});});

app.get('/api/ai-status',(req,res)=>res.json({configured:!!process.env.GEMINI_API_KEY,provider:'gemini',model:process.env.ZOO_AI_MODEL||'gemini-3.8-flash'}));
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
function publicCafeEvent(){return {id:cafeEvent.id,label:cafeEvent.label,visitor:cafeEvent.visitor,startedAt:cafeEvent.startedAt,endsAt:cafeEvent.endsAt}}
function rollCafeEvent(){const e=pickCafeEvent(),now=Date.now();cafeEvent={...e,startedAt:now,endsAt:now+CAFE_EVENT_MS};broadcastRoom('cafe',{type:'cafe_event',event:publicCafeEvent()});}
setInterval(rollCafeEvent,CAFE_EVENT_MS).unref?.();

// v55.1 NPC Life Engine: one shared simulation for every cafe visitor.
// Routine/actions run without Gemini. Player conversations still use the existing AI bridge.
const NPC_LIFE_FILE=path.join(__dirname,'data','npc-life.json');
const LIFE_TICK_MS=Math.max(12000,Number(process.env.NPC_LIFE_TICK_MS)||28000);
const LIFE_ROUTINES={
 'ai-mung':[
  {action:'커피 내리기',mood:3,energy:-2,line:'오늘은 어떤 커피를 내려볼까?'},
  {action:'카페 정리',mood:1,energy:-3,line:'천천히 정리하면 금방 끝나겠지.'},
  {action:'창밖 구경',mood:4,energy:2,line:'밖에 풍경이 참 좋네.'},
  {action:'잠깐 쉬기',mood:3,energy:8,line:'잠깐 쉬어 가는 것도 좋지.'},
  {action:'손님 맞이',mood:3,energy:-1,line:'어서 와, 편하게 쉬다 가.'}
 ],
 'ai-rabbit':[
  {action:'원고 쓰기',mood:-1,energy:-5,line:'이번 장면만 끝내고 쉬어야지…'},
  {action:'자료 정리',mood:1,energy:-3,line:'이 이야기도 기록해 둬야겠어.'},
  {action:'커피 마시기',mood:4,energy:7,line:'커피 한 모금… 이제 좀 살겠다.'},
  {action:'창밖 관찰',mood:3,energy:2,line:'저 풍경은 다음 이야기에 써먹을 수 있겠어.'},
  {action:'꾸벅꾸벅 졸기',mood:2,energy:10,line:'딱 5분만 눈 감을게…'}
 ]
};
const clampLife=n=>Math.max(0,Math.min(100,n));
const defaultLife=()=>({
 'ai-mung':{action:'커피 내리기',mood:75,energy:80,experience:0,level:1,relationships:{'ai-rabbit':12},lastActionAt:Date.now()},
 'ai-rabbit':{action:'원고 쓰기',mood:50,energy:42,experience:0,level:1,relationships:{'ai-mung':12},lastActionAt:Date.now()}
});
let npcLife=defaultLife(),lifeTimeline=[];
function restoreNpcLife(data){if(!data||typeof data!=='object')return;for(const id of Object.keys(LIFE_ROUTINES))if(data.npcs?.[id])npcLife[id]={...npcLife[id],...data.npcs[id]};if(Array.isArray(data.timeline))lifeTimeline=data.timeline.slice(-20)}
try{restoreNpcLife(JSON.parse(fs.readFileSync(NPC_LIFE_FILE,'utf8')))}catch{}
function publicLife(){return {npcs:npcLife,timeline:lifeTimeline.slice(-12),at:Date.now()}}
function saveLife(){const data={npcs:npcLife,timeline:lifeTimeline.slice(-20)};try{fs.mkdirSync(path.dirname(NPC_LIFE_FILE),{recursive:true});fs.writeFileSync(NPC_LIFE_FILE,JSON.stringify(data,null,2))}catch(e){console.warn('NPC life save:',e.message)}persistNpcDb('life',data)}
function lifeEvent(id,action,text,kind='routine'){
 const event={id,actor:id==='ai-mung'?'멍사자':id==='ai-rabbit'?'쥐무는토끼':cafeEvent.visitor?.name||'방문 손님',action,text,kind,at:Date.now()};
 lifeTimeline.push(event);lifeTimeline=lifeTimeline.slice(-20);
 broadcastRoom('cafe',{type:'npc_life_event',event,life:publicLife()});
 return event;
}
let lifeTurn=0;
function tickNpcLife(){
 lifeTurn++;
 const id=lifeTurn%2?'ai-mung':'ai-rabbit',state=npcLife[id],options=LIFE_ROUTINES[id];
 // Low energy leads to rest, not endless random actions.
 const selected=state.energy<24?options.find(v=>/쉬기|졸기/.test(v.action)):options[Math.floor(Math.random()*options.length)];
 state.action=selected.action;state.mood=clampLife(state.mood+selected.mood);state.energy=clampLife(state.energy+selected.energy);
 state.experience++;state.level=1+Math.floor(state.experience/20);state.lastActionAt=Date.now();
 lifeEvent(id,state.action,selected.line);
 // Every fourth turn: an NPC-to-NPC exchange, without using the Gemini quota.
 if(lifeTurn%4===0){
  const a=npcLife['ai-mung'],b=npcLife['ai-rabbit'];
  a.relationships['ai-rabbit']=(a.relationships['ai-rabbit']||0)+1;
  b.relationships['ai-mung']=(b.relationships['ai-mung']||0)+1;
  const exchanges=[
   ['멍사자','토끼야, 커피 한 잔 더 줄까?','쥐무는토끼','…응. 오늘은 진하게 부탁해.'],
   ['쥐무는토끼','오늘 손님이 많네…','멍사자','그러게. 그래도 북적이니까 좋다.'],
   ['멍사자','글은 잘 써지고 있어?','쥐무는토끼','한 문장씩은… 나아지고 있어.']
  ];
  const ex=exchanges[Math.floor(Math.random()*exchanges.length)];
  lifeEvent(ex[0]==='멍사자'?'ai-mung':'ai-rabbit','서로 대화',ex[1],'conversation');
  lifeEvent(ex[2]==='멍사자'?'ai-mung':'ai-rabbit','서로 대화',ex[3],'conversation');
 }
 if(cafeEvent.visitor&&lifeTurn%5===0){
  const v=cafeEvent.visitor;
  lifeEvent(v.id,'카페 방문',v.line,'visitor');
 }
 saveLife();
}
setInterval(tickNpcLife,LIFE_TICK_MS).unref?.();



wss.on('connection',ws=>{
  const c={authed:false,user:null,mode:'world',x:1430,y:980,dir:'down',frame:2,moving:false,geo:null}; clients.set(ws,c);
  ws.on('message',buf=>{let m;try{m=JSON.parse(String(buf))}catch{return}
    if(!c.authed){
      if(m.type!=='auth'||typeof m.token!=='string')return ws.close(1008,'auth required');
      const userId=sessions.get(m.token), user=loadUsers().find(u=>u.id===userId); if(!user)return ws.close(1008,'invalid session');
      c.authed=true;c.user=safeUser(user);wsSend(ws,{type:'ready',user:c.user});syncRoom(c.mode);return;
    }
    if(m.type==='state'){
      const old=c.mode, next=validModes.has(m.mode)?m.mode:c.mode;c.mode=next;
      if(old!=='cafe'&&next==='cafe'){
        wsSend(ws,{type:'cafe_event',event:publicCafeEvent()});wsSend(ws,{type:'npc_life_state',life:publicLife()});
        for(const w of returningNpcWelcomes(c.user))wsSend(ws,{type:'npc_welcome',...w,personal:true,at:Date.now()});
      }
      const maxX=next==='world'?2880:960,maxY=next==='world'?1800:540;
      c.x=Math.max(0,Math.min(maxX,Number(m.x)||0));c.y=Math.max(0,Math.min(maxY,Number(m.y)||0));
      c.dir=['up','down','left','right'].includes(m.dir)?m.dir:'down';c.frame=[1,2,3].includes(m.frame)?m.frame:2;c.moving=!!m.moving;
      if(old!==next){syncRoom(old);syncRoom(next)}
      else broadcastRoom(c.mode,{type:'state',player:publicPlayer(c)},ws);
    } else if(m.type==='npc_chat'){
      const text=String(m.text||'').trim().slice(0,300),npcId=NPCS[m.npcId]?m.npcId:'ai-mung';
      if(!text)return;
      // v52.7: NPC conversations are room events. Everyone in the same room sees the NPC think and answer.
      // Personal memory/growth is still calculated only from the user who actually spoke to the NPC.
      broadcastRoom(c.mode,{type:'npc_thinking',npcId,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      npcThink(c.user,npcId,text).then(result=>{
        broadcastRoom(c.mode,{type:'npc_reply',npcId,text:result.reply,memorySaved:!!result.memory,knowledgeSaved:!!result.knowledgeSaved,ai:result.ai,provider:result.provider||'fallback',model:result.model||null,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      }).catch(err=>{
        console.warn('npcThink unhandled',err?.message||err);
        broadcastRoom(c.mode,{type:'npc_reply',npcId,text:localNpcReply(c.user,npcId,text),memorySaved:false,ai:false,provider:'fallback',model:null,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      });
      } else if(m.type==='chat'){
      const text=clean(m.text).slice(0,120);if(!text)return;
      broadcastRoom(c.mode,{type:'chat',id:c.user.id,nickname:c.user.nickname,text,at:Date.now()});
    }
  });
  ws.on('close',()=>{const old=c.mode;clients.delete(ws);if(c.authed)syncRoom(old)});
  ws.on('error',()=>{});
});
