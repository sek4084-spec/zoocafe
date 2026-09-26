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
  const r=await npcPool.query(`SELECT id,payload FROM zoocafe_npc_state WHERE id IN ('memory','growth','knowledge','autonomous-life')`);
  for(const row of r.rows){if(row.id==='memory'&&row.payload)npcMemory=row.payload;if(row.id==='growth'&&row.payload)npcGrowth=row.payload;if(row.id==='knowledge'&&row.payload)npcKnowledge=row.payload;if(row.id==='autonomous-life'&&row.payload)npcLife=hydrateNpcLife(row.payload)}
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
fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(express.json({limit:'32kb'}));
app.use(express.static(__dirname, {extensions:['html']}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'zoocafe-online',version:'55.5.1',gemini:{sleeping:geminiSleeping(),sleepUntil:geminiSleepUntil||null,reason:geminiSleepReason||null},npcDb:!!npcPool}));
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
function publicCafeEvent(){return {id:cafeEvent.id,label:cafeEvent.label,visitor:cafeEvent.visitor,startedAt:cafeEvent.startedAt,endsAt:cafeEvent.endsAt}}
function rollCafeEvent(){const e=pickCafeEvent(),now=Date.now();cafeEvent={...e,startedAt:now,endsAt:now+CAFE_EVENT_MS};broadcastRoom('cafe',{type:'cafe_event',event:publicCafeEvent()});}
setInterval(rollCafeEvent,CAFE_EVENT_MS).unref?.();

// Shared NPC-to-NPC life. One server clock, so spectators see the same exchange.
const NPC_LIFE_FILE=path.join(__dirname,'data','npc-autonomous-life.json');
const NPC_LIFE_MS=Math.max(12000,Number(process.env.NPC_LIFE_MS)||26000);
const defaultNpcLife=()=>({turn:0,topic:'오늘의 카페',history:[],story:{arc:0,stage:0,summary:'',memories:[]},actors:{
 'ai-mung':{mood:72,energy:78,xp:0,level:1,relationship:12,lastAction:'커피 내리기'},
 'ai-rabbit':{mood:55,energy:62,xp:0,level:1,relationship:12,lastAction:'원고 쓰기'}
}});
function hydrateNpcLife(value){
 const d=defaultNpcLife();if(!value||typeof value!=='object')return d;
 d.turn=Math.max(0,Number(value.turn)||0);d.topic=String(value.topic||d.topic).slice(0,60);
 d.history=Array.isArray(value.history)?value.history.slice(-30).filter(e=>NPCS[e.npcId]&&typeof e.text==='string'):[];
 if(value.story&&typeof value.story==='object')d.story={arc:Math.max(0,Number(value.story.arc)||0),stage:Math.max(0,Math.min(5,Number(value.story.stage)||0)),summary:String(value.story.summary||'').slice(0,180),memories:Array.isArray(value.story.memories)?value.story.memories.slice(-16).map(v=>String(v).slice(0,160)):[]};
 for(const id of Object.keys(d.actors))if(value.actors?.[id]){
  const v=value.actors[id];for(const key of ['mood','energy','xp','level','relationship'])if(Number.isFinite(Number(v[key])))d.actors[id][key]=Number(v[key]);
  d.actors[id].lastAction=String(v.lastAction||d.actors[id].lastAction).slice(0,50);
 }
 return d;
}
let npcLife=(()=>{try{return hydrateNpcLife(JSON.parse(fs.readFileSync(NPC_LIFE_FILE,'utf8')))}catch{return defaultNpcLife()}})();
function saveNpcLife(){try{fs.mkdirSync(path.dirname(NPC_LIFE_FILE),{recursive:true});fs.writeFileSync(NPC_LIFE_FILE,JSON.stringify(npcLife,null,2))}catch(e){console.warn('NPC life save',e.message)}persistNpcDb('autonomous-life',npcLife)}
const npcChapters=[
 {title:'원고의 첫 문장',object:'지워진 원고',memory:'평범한 손님의 웃음에도 사연이 있다',lines:[
  ['첫 문장을 지워 버렸어. 어떻게 다시 쓸까?','지우기 전에 가장 선명했던 장면이 뭐야?','비를 피해 온 손님이 웃던 모습이야.'],
  ['아까 말한 손님은 왜 웃었던 것 같아?','그때는 몰랐어. 그래서 이야기가 멈췄어.','그 마음을 모른다는 사실부터 적어 보면 어때?'],
  ['모른다고 적어 봤어. 다음 문장이 나올까?','그 손님이 앉았던 자리는 기억나?','응, 창가였어. 손에 젖은 편지가 있었지.'],
  ['젖은 편지라면 손님에게 소중한 걸까?','그럴지도. 웃음 뒤에 걱정이 있었겠어.','그 두 마음을 함께 담아 보자.'],
  ['이제 첫 문장을 썼어. 비와 웃음이 같이 있어.','어제 지웠던 때와는 어떻게 달라?','손님의 마음을 서둘러 정하지 않게 됐어.'],
  ['원고를 읽어 봤어. 끝까지 궁금하더라.','고마워. 평범한 웃음에도 사연이 있더라.','그걸 이번 이야기의 기억으로 남기자.']]},
 {title:'창가의 빈 의자',object:'비어 있는 의자',memory:'기다리는 마음도 말로 전할 수 있다',lines:[
  ['늘 창가에 앉던 손님이 며칠째 안 보여.','그 손님이 있던 자리가 그리운 거야?','응, 컵을 두 손으로 감싸던 게 떠올라.'],
  ['어제 그 손님의 컵 이야기를 했지.','맞아. 돌아오면 따뜻한 걸 건네고 싶어.','어떤 말부터 하고 싶어?'],
  ['무사히 지냈냐고 묻고 싶은데 부담스러울까?','그럼 먼저 반가웠다고만 말해 줘.','짧은 말이라면 나도 할 수 있겠어.'],
  ['그 자리에 작은 쪽지를 놓아 봤어.','뭐라고 적었어?','다시 오면 따뜻한 한 잔 준비할게, 라고.'],
  ['오늘 손님이 쪽지를 보고 웃었어.','정말? 어떤 말을 했어?','기다려 줘서 고맙다고 했어.'],
  ['빈 의자를 보던 마음이 조금 달라졌어.','기다리는 마음도 전해질 수 있구나.','응, 그 말을 수첩에 적어 둘게.']]},
 {title:'향을 고르는 일',object:'새로 볶은 원두',memory:'위로는 상대의 이야기를 먼저 듣는 데서 시작한다',lines:[
  ['오늘 볶은 원두 향이 유난히 진해.','네게는 어떤 기억이 떠올라?','일을 마치고 마시던 따뜻한 한 잔.'],
  ['아까 말한 그 커피를 손님에게도 줄 거야?','잠깐, 모두가 같은 향을 좋아하진 않겠지.','손님의 하루를 먼저 물어보면 어떨까?'],
  ['손님에게 어떤 하루였는지 물었어.','뭐라고 하셨어?','조용한 시간이 필요하다고 했어.'],
  ['그럼 오늘은 진한 커피 대신 뭘 건넸어?','부드러운 차를 드렸어. 말은 조금만 했고.','그 선택을 손님은 어떻게 받아들였어?'],
  ['고맙다고 했어. 차보다 조용한 자리가 좋았대.','우리가 처음 떠올린 위로와 다르네.','응. 다음엔 먼저 들어야겠어.'],
  ['손님 이야기를 듣고 나니 내 마음도 편해.','한 가지 방식만 고집하지 않게 됐구나.','그걸 내일 커피를 내릴 때도 기억할게.']]}
];
function storyNpcExchange(){
 const story=npcLife.story,chapter=npcChapters[story.arc%npcChapters.length],rows=chapter.lines[story.stage]||chapter.lines[0];
 const first=story.stage===0&&story.summary?`지난번에 ${story.summary}고 했지. ${rows[0]}`:rows[0];
 return rows.map((line,i)=>[i===1?'ai-mung':'ai-rabbit',i===0?first:line]);
}
async function aiNpcExchange(topic){
 if(!process.env.GEMINI_API_KEY||geminiSleeping())return null;
 const model=process.env.ZOO_AI_MODEL||'gemini-3.8-flash';
 const story=npcLife.story,chapter=npcChapters[story.arc%npcChapters.length];
 const prompt=`주카페의 NPC 두 명이 플레이어와 무관하게 서로 짧게 대화한다. 멍사자는 따뜻하고 느긋한 카페지기, 쥐무는토끼는 조용한 작가다. 현재 이야기: ${chapter.title}, 다음 단계 ${story.stage+1}/6. 지난 이야기의 결론: ${story.summary||'없음'}. 오래 기억하는 일: ${story.memories.slice(-5).join(' / ')||'없음'}. 최근 대화: ${npcLife.history.slice(-9).map(e=>NPCS[e.npcId].name+': '+e.text).join(' / ')}. 첫 대사는 직전 대사의 구체적 내용에 반응하고, 서로 답하면서 한 장면을 앞으로 진행해라. 매번 다시 인사하거나 이미 끝낸 원고를 처음부터 시작하지 마라. NPC의 변화와 배움을 자연스럽게 드러내라. 한국어 JSON 배열만 출력. 정확히 세 항목, 각 항목은 {"npcId":"ai-mung 또는 ai-rabbit","text":"60자 이내 대사"}. 번갈아 말하고 서로의 말에 답해야 한다.`;
 try{
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:AbortSignal.timeout(5500),headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:230,responseMimeType:'application/json'}})});
  if(r.status===429){sleepGemini('429 quota/rate limit');return null}if(!r.ok)return null;
  const data=await r.json(),raw=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
  const turns=JSON.parse(raw);if(!Array.isArray(turns)||turns.length!==3)return null;
  if(!turns.every((v,i)=>NPCS[v.npcId]&&typeof v.text==='string'&&v.text.trim().length>0&&v.text.length<=100&&(i===0||v.npcId!==turns[i-1].npcId)))return null;
  const recent=new Set(npcLife.history.slice(-24).map(e=>e.text.replace(/\s/g,'')));
  if(turns.some(v=>recent.has(v.text.trim().replace(/\s/g,''))))return null;
  return turns.map(v=>[v.npcId,v.text.trim().slice(0,100)]);
 }catch(e){console.warn('Autonomous NPC fallback:',e.message);return null}
}
let npcLifeBusy=false;
async function tickNpcLife(){
 if(npcLifeBusy||roomClients('cafe').length===0)return;npcLifeBusy=true;
 try{
  const chapter=npcChapters[npcLife.story.arc%npcChapters.length];
  const topic=chapter.title;
  let lines=await aiNpcExchange(topic);
  if(!lines)lines=storyNpcExchange();
  npcLife.turn++;npcLife.topic=topic;
  for(let i=0;i<lines.length;i++){
   const [npcId,text]=lines[i],a=npcLife.actors[npcId];
   a.lastAction=i===0?'이야기 꺼내기':'서로 대화';a.xp++;a.level=Math.min(20,1+Math.floor(a.xp/20));
   a.energy=Math.max(20,Math.min(100,a.energy+(npcId==='ai-rabbit'?-1:1)));
   a.mood=Math.min(100,a.mood+1);a.relationship=Math.min(100,a.relationship+1);
   const event={npcId,text,topic,chapter:npcLife.story.stage+1,action:a.lastAction,at:Date.now()+i*4300,turn:npcLife.turn,step:i};
   npcLife.history.push(event);
   broadcastRoom('cafe',{type:'npc_autonomous_turn',event,actors:npcLife.actors});
  }
  npcLife.history=npcLife.history.slice(-30);
  npcLife.story.stage++;
  if(npcLife.story.stage>=chapter.lines.length){
   npcLife.story.summary=chapter.memory;
   if(!npcLife.story.memories.includes(chapter.memory))npcLife.story.memories.push(chapter.memory);
   npcLife.story.memories=npcLife.story.memories.slice(-16);
   npcLife.story.arc++;npcLife.story.stage=0;
   for(const a of Object.values(npcLife.actors)){a.xp+=2;a.level=Math.min(20,1+Math.floor(a.xp/20));a.relationship=Math.min(100,a.relationship+2)}
  }
  saveNpcLife();
 }finally{npcLifeBusy=false}
}
setInterval(()=>tickNpcLife().catch(e=>console.warn('NPC life tick',e.message)),NPC_LIFE_MS).unref?.();



wss.on('connection',ws=>{
  const c={authed:false,user:null,mode:'world',x:1430,y:980,dir:'down',frame:2,moving:false,geo:null}; clients.set(ws,c);
  ws.on('message',buf=>{let m;try{m=JSON.parse(String(buf))}catch{return}
    if(!c.authed){
      if(m.type!=='auth'||typeof m.token!=='string')return ws.close(1008,'auth required');
      const userId=sessions.get(m.token), user=loadUsers().find(u=>u.id===userId); if(!user)return ws.close(1008,'invalid session');
      c.authed=true;c.user=safeUser(user);wsSend(ws,{type:'ready',user:c.user,serverVersion:'55.5.1'});syncRoom(c.mode);return;
    }
    if(m.type==='state'){
      const old=c.mode, next=validModes.has(m.mode)?m.mode:c.mode;
      const cafeWasEmpty=old!=='cafe'&&next==='cafe'&&roomClients('cafe').length===0;
      c.mode=next;
      if(old!=='cafe'&&next==='cafe'){
        if(cafeWasEmpty)chooseCafeScene();
        wsSend(ws,{type:'cafe_scene',sceneId:cafeSceneId,weights:[25,25,25,25]});
        wsSend(ws,{type:'cafe_event',event:publicCafeEvent()});
        wsSend(ws,{type:'npc_autonomous_state',life:npcLife});
        // Entry does not trigger an unsolicited NPC line.
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
