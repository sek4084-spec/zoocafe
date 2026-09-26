/* ZOO:CAFE Asset System v1
   All map art can now live under assets/. Replace PNG files without rewriting game logic.
*/
window.ZooAssets = (() => {
  const manifest = {
    terrain: {
      grass: ['assets/terrain/grass_01.png','assets/terrain/grass_02.png','assets/terrain/grass_03.png'],
      path: 'assets/terrain/path_dirt.png'
    },
    water: {
      frames: ['assets/water/water_01.png','assets/water/water_02.png','assets/water/water_03.png'],
      waterfall: ['assets/water/waterfall_01.png','assets/water/waterfall_02.png','assets/water/waterfall_03.png']
    },
    nature: {
      tree: ['assets/nature/tree_01.png','assets/nature/tree_02.png','assets/nature/tree_03.png'],
      bush: 'assets/nature/bush_01.png',
      rock: 'assets/nature/rock_01.png',
      flower: ['assets/nature/flower_01.png','assets/nature/flower_02.png','assets/nature/flower_03.png'],
      grassTuft: ['assets/nature/grass_tuft_01.png','assets/nature/grass_tuft_02.png']
    },
    animals: { duck: ['assets/animals/duck_01.png','assets/animals/duck_02.png'] },
    props: { bridge: 'assets/props/bridge_01.png', steppingStones: 'assets/props/stepping_stones_01.png', cafeTable: 'assets/props/cafe_table_01.png', umbrella: 'assets/props/umbrella_01.png', planter: 'assets/props/planter_01.png', chalkboard: 'assets/props/chalkboard_01.png', barrelPlanter: 'assets/props/barrel_planter_01.png' },
    buildings: { cafeExterior: 'assets/buildings/cafe_exterior_01.png' },
    cafe: { interior: 'assets/cafe/interior/cafe-background.png' },
    waterDecor: { lilyPad: ['assets/water/lilypad_01.png','assets/water/lilypad_02.png'], reeds: ['assets/water/reeds_01.png','assets/water/reeds_02.png'], shoreRocks: 'assets/nature/shore_rocks_01.png' }
  };
  const images = new Map();
  let loaded = false;
  function flatten(obj,out=[]){for(const v of Object.values(obj)){if(typeof v==='string')out.push(v);else if(Array.isArray(v))out.push(...v);else flatten(v,out)}return out}
  async function load(){
    const paths=[...new Set(flatten(manifest))];
    await Promise.all(paths.map(src=>new Promise(resolve=>{const im=new Image();im.onload=()=>{images.set(src,im);resolve()};im.onerror=()=>resolve();im.src=src})));
    loaded=true; return api;
  }
  function get(path){return images.get(path)}
  function pick(group,index=0){const v=group;if(Array.isArray(v))return get(v[((index%v.length)+v.length)%v.length]);return get(v)}
  function draw(path,x,y,w,h){const im=get(path);if(!im)return false;ctx.drawImage(im,Math.round(x),Math.round(y),Math.round(w??im.width),Math.round(h??im.height));return true}
  function tile(path,x,y,w,h,tileSize=32){const im=get(path);if(!im)return false;for(let yy=y;yy<y+h;yy+=tileSize)for(let xx=x;xx<x+w;xx+=tileSize)ctx.drawImage(im,0,0,im.width,im.height,Math.round(xx),Math.round(yy),Math.min(tileSize,x+w-xx),Math.min(tileSize,y+h-yy));return true}
  const api={manifest,images,load,get,pick,draw,tile,get loaded(){return loaded}};
  load(); return api;
})();
