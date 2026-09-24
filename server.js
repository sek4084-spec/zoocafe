const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const { WebSocketServer } = require('ws');
const NPC_MEMORY_FILE=path.join(__dirname,'data','npc-memory.json');
const NPC_GROWTH_FILE=path.join(__dirname,'data','npc-growth.json');
function loadNpcMemory(){try{return JSON.parse(fs.readFileSync(NPC_MEMORY_FILE,'utf8'))}catch(e){return {}}}
let npcMemory=loadNpcMemory();
function saveNpcMemory(){try{fs.mkdirSync(path.dirname(NPC_MEMORY_FILE),{recursive:true});fs.writeFileSync(NPC_MEMORY_FILE,JSON.stringify(npcMemory,null,2))}catch(e){console.error('npc memory save',e.message)}}
function loadNpcGrowth(){try{return JSON.parse(fs.readFileSync(NPC_GROWTH_FILE,'utf8'))}catch(e){return {}}}
let npcGrowth=loadNpcGrowth();
function saveNpcGrowth(){try{fs.mkdirSync(path.dirname(NPC_GROWTH_FILE),{recursive:true});fs.writeFileSync(NPC_GROWTH_FILE,JSON.stringify(npcGrowth,null,2))}catch(e){console.error('npc growth save',e.message)}}
function growthFor(k){if(!npcGrowth[k])npcGrowth[k]={level:1,xp:0,talks:0,memories:0};return npcGrowth[k]}
function relationName(level){if(level>=10)return '오랜 친구';if(level>=7)return '가까운 친구';if(level>=4)return '친한 사이';if(level>=2)return '낯익은 손님';return '처음 알아가는 사이'}
function addGrowth(k,memorySaved){const g=growthFor(k);g.talks+=1;g.xp+=2+(memorySaved?3:0);if(memorySaved)g.memories+=1;g.level=Math.min(20,1+Math.floor(g.xp/20));saveNpcGrowth();return g}
const npcRecent=new Map();
const NPCS={
 'ai-mung':{name:'멍사자',personality:'따뜻하고 느긋한 ZOO:CAFE 카페지기. 먼저 다가가지만 부담스럽게 하지 않는다. 상대의 말을 잘 듣고 짧고 자연스럽게 대화한다.'},
 'ai-rabbit':{name:'쥐무는토끼',personality:'조용한 드라마 작가이자 이야기 기록자. 관찰력이 좋고 조금 낯을 가리며, 생각한 뒤 차분하게 말한다.'}
};
function memKey(userId,npcId){return String(userId)+'::'+npcId}
function recentFor(k){if(!npcRecent.has(k))npcRecent.set(k,[]);return npcRecent.get(k)}
function fallbackNpc(npcId,text){return '이해하기 쉽게 다시 말해줄래?'}
async function npcThink(user,npcId,text){
 const npc=NPCS[npcId]||NPCS['ai-mung'],k=memKey(user.id,npcId),mem=npcMemory[k]||[],recent=recentFor(k),growth=growthFor(k);
 const apiKey=process.env.GEMINI_API_KEY;
 if(!apiKey)return {reply:fallbackNpc(npcId,text),memory:null,ai:false,provider:'fallback'};
 const prompt=`너는 ZOO:CAFE의 ${npc.name}다.
성격: ${npc.personality}
유저 이름: ${user.nickname}
NPC 성장 상태: 레벨 ${growth.level}, 관계 '${relationName(growth.level)}', 지금까지 대화 ${growth.talks}회, 기억 ${growth.memories}개
이 유저에 대한 장기 기억: ${mem.length?mem.slice(-12).join(' / '):'아직 없음'}
최근 대화:
${recent.slice(-8).map(x=>x.role+': '+x.text).join('\n')||'없음'}

유저가 방금 한 말: ${text}

게임 속 실제 친구처럼 자연스럽게 대화해라.
한국어로 1~3문장, 보통 120자 이내로 답해라.
대화가 쌓일수록 위 성장 상태와 장기 기억을 참고해 조금 더 친숙하고 자연스럽게 반응해라. 단, 갑자기 과도하게 친한 척하지 마라.
상대가 말하지 않은 사실을 기억한다고 꾸며내지 마라.
중요한 장기 기억이 생겼다면 마지막 줄에 MEMORY: 로 시작해 한 문장으로 적어라.
저장할 가치가 없으면 MEMORY: NONE 이라고 적어라.`;
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
    if(r.ok){data=await r.json();usedModel=model;break}
    const body=(await r.text()).slice(0,400);
    lastError=new Error(`Gemini ${model} ${r.status} ${body}`);
    console.warn('npcThink model',model,'status',r.status);
    if(r.status===429){rateLimited=true;break} // quota/rate limit: do not create more requests
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
  let memory=null;
  const mm=out.match(/(?:^|\n)MEMORY:\s*(.+)$/i);
  if(mm){
   if(mm[1].trim().toUpperCase()!=='NONE')memory=mm[1].trim().slice(0,180);
   out=out.replace(/(?:^|\n)MEMORY:\s*.+$/i,'').trim();
  }
  if(!out)return {reply:fallbackNpc(npcId,text),memory:null,ai:false,provider:'fallback'};
  recent.push({role:'user',text:String(text).slice(0,300)},{role:npc.name,text:out.slice(0,300)});
  while(recent.length>16)recent.shift();
  if(memory){
   if(!npcMemory[k])npcMemory[k]=[];
   if(!npcMemory[k].includes(memory)){
    npcMemory[k].push(memory);npcMemory[k]=npcMemory[k].slice(-30);saveNpcMemory();
   }
  }
  const grown=addGrowth(k,!!memory);
  return {reply:out.slice(0,260),memory,ai:true,provider:'gemini',model:usedModel,growth:{level:grown.level,xp:grown.xp,talks:grown.talks,memories:grown.memories,relation:relationName(grown.level)}};
 }catch(e){
  console.error('npcThink',e.message);
  return {reply:fallbackNpc(npcId,text),memory:null,ai:false,provider:'fallback'};
 }
}
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(express.json({limit:'32kb'}));
app.use(express.static(__dirname, {extensions:['html']}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'zoocafe-online'}));
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
        broadcastRoom(c.mode,{type:'npc_reply',npcId,text:result.reply,memorySaved:!!result.memory,ai:result.ai,provider:result.provider||'fallback',model:result.model||null,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      }).catch(err=>{
        console.warn('npcThink unhandled',err?.message||err);
        broadcastRoom(c.mode,{type:'npc_reply',npcId,text:'이해하기 쉽게 다시 말해줄래?',memorySaved:false,ai:false,provider:'fallback',model:null,byUserId:c.user.id,byNickname:c.user.nickname,at:Date.now()});
      });
      } else if(m.type==='chat'){
      const text=clean(m.text).slice(0,120);if(!text)return;
      broadcastRoom(c.mode,{type:'chat',id:c.user.id,nickname:c.user.nickname,text,at:Date.now()});
    }
  });
  ws.on('close',()=>{const old=c.mode;clients.delete(ws);if(c.authed)syncRoom(old)});
  ws.on('error',()=>{});
});
