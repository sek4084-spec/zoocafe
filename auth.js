(()=>{
  const root=document.getElementById('authScreen'), form=document.getElementById('authForm'), title=document.getElementById('authTitle');
  const username=document.getElementById('authUsername'), password=document.getElementById('authPassword'), nickname=document.getElementById('authNickname');
  const nickWrap=document.getElementById('nicknameWrap'), switchBtn=document.getElementById('authSwitch'), submit=document.getElementById('authSubmit'), msg=document.getElementById('authMessage');
  let mode='login';
  const getToken=()=>sessionStorage.getItem('zoocafe_token')||'';
  const api=async(url,options={})=>{ const headers={'Content-Type':'application/json',...(options.headers||{})}; const t=getToken(); if(t) headers.Authorization=`Bearer ${t}`; const r=await fetch(url,{...options,headers}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error||'요청을 처리하지 못했습니다.'); return data; };
  function setMode(next){mode=next; const reg=mode==='register'; title.textContent=reg?'ZOO:CAFE 회원가입':'ZOO:CAFE 로그인'; nickWrap.hidden=!reg; nickname.required=reg; submit.textContent=reg?'회원가입하고 입장':'로그인하고 입장'; switchBtn.textContent=reg?'이미 계정이 있어요 · 로그인':'처음이신가요? · 회원가입'; msg.textContent='';}
  function enter(user){ window.ZOO_USER=user; document.body.classList.add('authenticated'); root.hidden=true; document.querySelectorAll('[data-user-nickname]').forEach(el=>el.textContent=user.nickname); const ci=document.getElementById('chatInput'); if(ci) ci.placeholder=`${user.nickname}(으)로 메시지 입력...`; window.dispatchEvent(new CustomEvent('zoocafe-auth',{detail:user})); }
  switchBtn.addEventListener('click',()=>setMode(mode==='login'?'register':'login'));
  form.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='';submit.disabled=true; try{const body={username:username.value,password:password.value}; if(mode==='register') body.nickname=nickname.value; const data=await api(`/api/${mode}`,{method:'POST',body:JSON.stringify(body)}); sessionStorage.setItem('zoocafe_token',data.token); enter(data.user);}catch(err){msg.textContent=err.message;}finally{submit.disabled=false;}});
  window.ZOO_LOGOUT=async()=>{try{await api('/api/logout',{method:'POST'});}catch{} sessionStorage.removeItem('zoocafe_token'); location.reload();};
  (async()=>{if(!getToken()) return; try{const d=await api('/api/me');enter(d.user);}catch{sessionStorage.removeItem('zoocafe_token');}})();
})();
