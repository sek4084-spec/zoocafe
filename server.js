const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(express.json({limit:'32kb'}));
app.use(express.static(__dirname, {extensions:['html']}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'zoocafe-online'}));

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

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const server=app.listen(PORT, '0.0.0.0', ()=>console.log(`ZOO:CAFE Online Multiplayer running on port ${PORT}`));
const wss=new WebSocketServer({server});
const clients=new Map();
const validModes=new Set(['world','cafe','bookshop','workshop','lodge','nearby']);
const wsSend=(ws,obj)=>{if(ws.readyState===1)ws.send(JSON.stringify(obj));};
const NEARBY_RADIUS_M=500;
function distanceM(a,b){if(!a?.geo||!b?.geo)return Infinity;const R=6371000,toRad=v=>v*Math.PI/180,dLat=toRad(b.geo.lat-a.geo.lat),dLon=toRad(b.geo.lon-a.geo.lon),la1=toRad(a.geo.lat),la2=toRad(b.geo.lat);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function publicPlayer(c,viewer=null){const d=viewer?distanceM(viewer,c):null;return {id:c.user.id,nickname:c.user.nickname,animal:c.user.animal||'lion',title:c.user.title||'나그네',x:c.x,y:c.y,dir:c.dir,frame:c.frame,moving:c.moving,mode:c.mode,distanceM:Number.isFinite(d)?Math.round(d):null};}
function nearbyClients(viewer){return [...clients.values()].filter(c=>c.authed&&c.mode==='nearby'&&c.geo&&viewer.geo&&distanceM(viewer,c)<=NEARBY_RADIUS_M);}
function syncNearby(){for(const [ws,c] of clients){if(!c.authed||c.mode!=='nearby')continue;const players=c.geo?nearbyClients(c).map(v=>publicPlayer(v,c)):[publicPlayer(c)];wsSend(ws,{type:'roster',mode:'nearby',radiusM:NEARBY_RADIUS_M,players});}}

function roomPlayers(mode){return [...clients.values()].filter(c=>c.authed&&c.mode===mode).map(c=>({id:c.user.id,nickname:c.user.nickname,animal:c.user.animal||'lion',title:c.user.title||'나그네',x:c.x,y:c.y,dir:c.dir,frame:c.frame,moving:c.moving,mode:c.mode}));}
function broadcastRoom(mode,obj,except=null){const raw=JSON.stringify(obj);for(const [ws,c] of clients)if(ws!==except&&c.authed&&c.mode===mode&&ws.readyState===1)ws.send(raw);}
function syncRoom(mode){const packet={type:'roster',mode,players:roomPlayers(mode)};for(const [ws,c] of clients)if(c.authed&&c.mode===mode)wsSend(ws,packet);}
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
      if(old!==next){old==='nearby'?syncNearby():syncRoom(old);next==='nearby'?syncNearby():syncRoom(next)}
      else if(c.mode==='nearby'){for(const [ow,oc] of clients)if(ow!==ws&&oc.authed&&oc.mode==='nearby'&&oc.geo&&c.geo&&distanceM(c,oc)<=NEARBY_RADIUS_M)wsSend(ow,{type:'state',player:publicPlayer(c,oc)});}else broadcastRoom(c.mode,{type:'state',player:publicPlayer(c)},ws);
    } else if(m.type==='geo'){const lat=Number(m.lat),lon=Number(m.lon);if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){c.geo={lat,lon,at:Date.now()};if(c.mode==='nearby')syncNearby();}
    } else if(m.type==='chat'){
      const text=clean(m.text).slice(0,120);if(!text)return;
      if(c.mode==='nearby'){for(const [ow,oc] of clients)if(oc.authed&&oc.mode==='nearby'&&oc.geo&&c.geo&&distanceM(c,oc)<=NEARBY_RADIUS_M)wsSend(ow,{type:'chat',id:c.user.id,nickname:c.user.nickname,text,at:Date.now()});}else broadcastRoom(c.mode,{type:'chat',id:c.user.id,nickname:c.user.nickname,text,at:Date.now()});
    }
  });
  ws.on('close',()=>{const old=c.mode;clients.delete(ws);if(c.authed){old==='nearby'?syncNearby():syncRoom(old)}});
  ws.on('error',()=>{});
});
