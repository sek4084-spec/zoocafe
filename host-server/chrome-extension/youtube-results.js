(function(root){
 function collect(document,location,excludeId,terms=[]){
  const found=[],seen=new Set();
  const selectors='ytd-video-renderer a#video-title, ytd-rich-grid-media a#video-title-link, ytd-compact-video-renderer a#video-title, ytd-reel-item-renderer a[href*="/shorts/"], ytd-reel-video-renderer a[href*="/shorts/"], ytd-rich-item-renderer a[href*="/shorts/"], a.shortsLockupViewModelHostEndpoint[href*="/shorts/"]';
  for(const a of document.querySelectorAll(selectors)){
   let url;try{url=new URL(a.href,location.href)}catch{continue}
   if(!['www.youtube.com','youtube.com','m.youtube.com'].includes(url.hostname))continue;
   const shorts=url.pathname.startsWith('/shorts/'),id=shorts?url.pathname.split('/')[2]:url.searchParams.get('v');
   const title=(a.getAttribute('title')||a.getAttribute('aria-label')||a.innerText||a.closest('ytd-reel-item-renderer,ytd-rich-item-renderer')?.querySelector('h3')?.innerText||'').replace(/\s+/g,' ').trim();
   if(!/^[\w-]{11}$/.test(id||'')||id===excludeId||seen.has(id)||title.length<3)continue;
   const normalized=title.toLowerCase();
   if(terms.length&&!terms.some(term=>normalized.includes(String(term).toLowerCase())))continue;
   seen.add(id);found.push({title:title.slice(0,130),url:`https://www.youtube.com/${shorts?'shorts/'+id:'watch?v='+id}`});
   if(found.length>=5)break;
  }
  return found;
 }
 root.ZooCafeVideoResults={collect};
 if(typeof module!=='undefined'&&module.exports)module.exports={collect};
})(typeof globalThis!=='undefined'?globalThis:this);
