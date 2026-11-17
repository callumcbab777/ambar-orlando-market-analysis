/* My Orlando · Moments — generative AMBAR mosaic for the landing Moment tiles.
   Each visit, every tile gets its own AMBAR rendering, crop, palette pair, cell shape and mosaic region.
   Hover, keyboard focus, touch or scrolling into view dissolves the mosaic to reveal the rendering.
   Pure canvas, no network calls, no keys. Respects prefers-reduced-motion. */
(function(){
"use strict";
// AMBAR renderings only (see README credits). No other destinations.
var SRC=["hotel-feeling","picture-it","your-visit","x-pool","x-spa","x-v-pool","x-bright","x-bcalm"];
var C={forest:"#0F2D21",olive:"#5A5A37",sage:"#989B74",brown:"#B37D50",cream:"#F4EFE7",gold:"#FFA94A"};
var PAL=[["forest","cream"],["olive","cream"],["brown","cream"],["forest","sage"],["olive","sage"],["forest","brown"]]; // amber is kept as a sparing accent
var SHAPES=["tessera","halftone","arc","louvre"];
var REGIONS=["diagonal","corner","split","band"];
var RM=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)");
var NOHOVER=window.matchMedia&&matchMedia("(hover: none)");
var rm=function(){return !!(RM&&RM.matches)};
var rand=Math.random, pick=function(a){return a[Math.floor(rand()*a.length)]};
var hex=function(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]};
var mix=function(a,b,t){return "rgb("+[0,1,2].map(function(i){return Math.round(a[i]+(b[i]-a[i])*t)}).join(",")+")"};
var ease=function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};

// One roll per tile per page visit; kept for the session so re-renders (e.g. closing a Moment) don't jump.
var order=SRC.slice().sort(function(){return rand()-.5}), rolls={}, n=0;
function roll(id){
  if(rolls[id]) return rolls[id];
  var p=pick(PAL);
  rolls[id]={id:id,src:"assets/img/"+order[n++%order.length]+".jpg",
    x:Math.round(20+rand()*60), y:Math.round(25+rand()*50), z:+(1.08+rand()*.32).toFixed(2),
    dark:p[0], light:p[1], shape:pick(SHAPES), region:pick(REGIONS),
    cell:Math.round(16+rand()*12), seed:Math.floor(rand()*1e9).toString(36)};
  return rolls[id];
}

function Tile(box){
  var t=this; t.box=box; t.r=roll(box.dataset.tile); t.img=box.querySelector("img");
  t.cv=document.createElement("canvas"); t.cv.className="c-mosaic"; t.cv.setAttribute("aria-hidden","true");
  t.img.insertAdjacentElement("afterend",t.cv);
  box.dataset.src=t.r.src.split("/").pop(); box.dataset.seed=t.r.seed; box.dataset.look=t.r.shape+" · "+t.r.dark+"/"+t.r.light;
  t.ctx=t.cv.getContext("2d"); t.state="cover"; t.cells=[]; t.ok=false;
  var go=function(){t.build();};
  if(t.img.complete&&t.img.naturalWidth) t.ok=true;
  t.img.addEventListener("load",function(){t.ok=true;t.build();t.settle();},{once:true});
  t.img.addEventListener("error",function(){t.fail();},{once:true});
  if(t.img.complete&&!t.img.naturalWidth&&t.img.getAttribute("src")) t.fail();
  if(window.ResizeObserver) new ResizeObserver(function(){t.build();t.draw();}).observe(box); else go();
}
Tile.prototype.fail=function(){this.ok=false;this.box.classList.add("no-img");this.build();this.to("cover",null,true);};
Tile.prototype.build=function(){
  var b=this.box,W=b.clientWidth,H=b.clientHeight; if(!W||!H) return;
  var dpr=Math.min(2,window.devicePixelRatio||1);
  this.cv.width=Math.round(W*dpr); this.cv.height=Math.round(H*dpr); this.dpr=dpr; this.W=W; this.H=H;
  var cs=this.r.cell, cols=Math.ceil(W/cs), rows=Math.ceil(H/cs), lum=this.sample(cols,rows), old=this.cells;
  var cells=[], i=0, j, k;
  for(j=0;j<rows;j++)for(k=0;k<cols;k++,i++){
    var prev=old[i]; cells.push({x:k*cs,y:j*cs,u:(k+.5)/cols,v:(j+.5)/rows,l:lum[i],q:Math.floor(rand()*4),jit:rand(),acc:rand()<.035,
      val:prev?prev.val:(this.state==="cover"?0:1),from:0,to:0});}
  this.cells=cells; this.cs=cs; this.mask();
  if(this.state!=="cover") cells.forEach(function(c){c.val=c.to=c.target[this.state]}.bind(this));
  this.draw();
};
// Luminance per cell, sampled from the same crop the photo shows (object-position + scale).
Tile.prototype.sample=function(cols,rows){
  var out=new Array(cols*rows), img=this.img, r=this.r, i;
  try{
    if(!this.ok) throw 0;
    var iw=img.naturalWidth,ih=img.naturalHeight,W=this.W,H=this.H,s0=Math.max(W/iw,H/ih);
    var ox=(W-iw*s0)*r.x/100, oy=(H-ih*s0)*r.y/100, Px=W*r.x/100, Py=H*r.y/100;
    var sx=(Px-Px/r.z-ox)/s0, sy=(Py-Py/r.z-oy)/s0, sw=W/r.z/s0, sh=H/r.z/s0;
    var o=document.createElement("canvas"); o.width=cols; o.height=rows; var x=o.getContext("2d");
    x.drawImage(img,sx,sy,sw,sh,0,0,cols,rows);
    var d=x.getImageData(0,0,cols,rows).data, lo=1, hi=0;
    for(i=0;i<out.length;i++){var L=(.2126*d[i*4]+.7152*d[i*4+1]+.0722*d[i*4+2])/255;out[i]=L;lo=Math.min(lo,L);hi=Math.max(hi,L);}
    for(i=0;i<out.length;i++) out[i]=hi>lo?(out[i]-lo)/(hi-lo):.5;
  }catch(e){ // no image (failed or not yet loaded): abstract field from brand colours
    var a=rand()*6.28,f=1.5+rand()*2;
    for(i=0;i<out.length;i++){var u=(i%cols)/cols,v=Math.floor(i/cols)/rows;out[i]=.5+.5*Math.sin(f*(u*Math.cos(a)+v*Math.sin(a))*3.14+rand()*.6);}
  }
  return out;
};
// Region the mosaic keeps at rest (soft edge), so the rendering shows through the rest.
Tile.prototype.mask=function(){
  var r=this.r, flip=r.seed.charCodeAt(0)%2, th=.42+(r.seed.charCodeAt(1)%20)/100;
  this.cells.forEach(function(c){
    var u=flip?1-c.u:c.u, v=c.v, m;
    if(r.region==="diagonal") m=(u+v)/2;
    else if(r.region==="corner") m=Math.hypot(u,v)/1.414;
    else if(r.region==="split") m=u;
    else m=Math.abs(v-.5)*2;
    var rest=Math.max(0,Math.min(1,(m-th)/.22+(c.jit-.5)*.35)); // 0 = full cell, 1 = gone
    c.target={cover:0,rest:rest,open:1};
  });
};
Tile.prototype.to=function(state,origin,instant){
  if(F.state!=="idle") return; // the completion view owns the tiles while it is showing
  this.state=state; var t=this, now=performance.now();
  var ox=origin?origin[0]:.5+(rand()-.5)*.6, oy=origin?origin[1]:.5+(rand()-.5)*.6;
  this.cells.forEach(function(c){c.from=c.val;c.to=c.target?c.target[state]:(state==="cover"?0:1);
    c.t0=now+(Math.hypot(c.u-ox,c.v-oy)*520+c.jit*160)*(state==="cover"?.6:1);});
  this.box.dataset.state=state;
  if(instant||rm()){this.cells.forEach(function(c){c.val=c.to});this.draw();return;}
  if(!this.raf) this.raf=requestAnimationFrame(function f(ts){var busy=false;
    t.cells.forEach(function(c){var p=Math.max(0,Math.min(1,(ts-c.t0)/380));c.val=c.from+(c.to-c.from)*ease(p);if(p<1)busy=true;});
    t.draw(); t.raf=busy?requestAnimationFrame(f):0;});
};
Tile.prototype.settle=function(){if(this.ok&&this.state==="cover"&&this.seen) this.to("rest");};
Tile.prototype.draw=function(){
  if(F.state!=="idle"&&this.fin) return this.finDraw(F.state==="done"?Infinity:performance.now()-F.t0);
  var x=this.ctx,d=this.dpr||1,r=this.r,cs=this.cs,D=hex(C[r.dark]),Lc=hex(C[r.light]),dk=C[r.dark],lt=C[r.light];
  if(!x||!cs) return; x.setTransform(d,0,0,d,0,0); x.clearRect(0,0,this.W,this.H); x.globalAlpha=.94;
  this.cells.forEach(function(c){
    var s=1-c.val; if(s<=.02) return;
    var w=cs*s, cx=c.x+cs/2, cy=c.y+cs/2, x0=cx-w/2, y0=cy-w/2, L=c.l;
    if(r.shape==="tessera"){x.fillStyle=c.acc?C.gold:mix(D,Lc,L);x.fillRect(x0+.5,y0+.5,w-1,w-1);}
    else if(r.shape==="halftone"){x.fillStyle=lt;x.fillRect(x0,y0,w,w);x.fillStyle=c.acc?C.gold:dk;x.beginPath();x.arc(cx,cy,Math.max(.6,(1-L)*.62*w),0,6.283);x.fill();}
    else if(r.shape==="arc"){x.fillStyle=L>.5?lt:dk;x.fillRect(x0,y0,w,w);x.fillStyle=mix(D,Lc,L>.5?L*.6:.4+L);
      var px=x0+(c.q&1?w:0), py=y0+(c.q&2?w:0); x.beginPath();x.moveTo(px,py);x.arc(px,py,w,c.q*1.5708,c.q*1.5708+1.5708);x.closePath();x.fill();}
    else {x.fillStyle=lt;x.fillRect(x0,y0,w,w);x.fillStyle=dk;var bw=Math.max(1,(1-L)*.85*w);x.fillRect(cx-bw/2,y0,bw,w);}
  });
};

var live=[], io=window.IntersectionObserver?new IntersectionObserver(function(es){es.forEach(function(e){var t=e.target._mo;if(!t)return;
  if(e.isIntersecting&&e.intersectionRatio>=.55){if(!t.seen){t.seen=true;t.settle();}
    else if(NOHOVER&&NOHOVER.matches&&t.ok&&t.state!=="open") t.to("open");}
  else if(!e.isIntersecting&&t.seen&&t.ok&&NOHOVER&&NOHOVER.matches) t.to("rest",null,true);});},{threshold:[0,.55]}):null;

/* ---------- Completion view: once all seven Moments are shared ----------
   The seven tiles become windows onto ONE AMBAR rendering (the aerial of the AMBAR site, assets/img/ambar-aerial.jpg).
   Multi-column grids: rows are stacked edge to edge (card text removed), so the picture runs continuously across the grid.
   Single column (phones): each tile is the next frame of one camera pan across the same rendering, top to bottom.
   One wave, measured in that shared space, gathers every tile into a forest/cream tessera drawn from the aerial,
   then dissolves it to reveal the picture; a few amber tesserae linger last. Reduced motion: final view, simple fade.
   ?demo=complete previews it without touching stored answers. Replay re-runs it. */
var AER="assets/img/ambar-aerial.jpg", FY=.5,
    // Single column: a camera path across the aerial (fractions of the image), one view per tile, towers to lake to clubhouse.
    PATH=[[.20,.30],[.36,.46],[.48,.30],[.62,.42],[.70,.57],[.72,.82],[.90,.80]], PATHW=.42, GATHER=560, HOLD=1150, SPREAD=900;
var DEMO=/(?:^|[?&])demo=complete(?:&|$)/.test(location.search);
var F={state:"idle",t0:0,img:null,ok:false,lay:null,raf:0,pending:false,complete:false,io:null,played:false};
var clamp=function(v){return v<0?0:v>1?1:v};
var ss={get:function(){try{return sessionStorage.getItem("mo-fin")==="1"}catch(e){return false}},
  set:function(v){try{v?sessionStorage.setItem("mo-fin","1"):sessionStorage.removeItem("mo-fin")}catch(e){}}};
function aerial(cb){
  if(F.img){ if(F.img.complete) cb(); else F.img.addEventListener("load",cb,{once:true}),F.img.addEventListener("error",cb,{once:true}); return; }
  F.img=new Image(); F.img.decoding="async";
  F.img.onload=function(){F.ok=true;cb();}; F.img.onerror=function(){F.ok=false;cb();};
  F.img.src=AER;
}
// Shared virtual space for all tiles, and the slice of the rendering each tile shows.
function layout(){
  var ts=live.filter(function(t){return t.W}); if(!ts.length) return null;
  var R=ts.map(function(t){return t.box.getBoundingClientRect()}), rows=[], gap=26;
  R.forEach(function(r,i){var row=null;rows.forEach(function(o){if(Math.abs(o.top-r.top)<4)row=o});
    if(!row){row={top:r.top,h:0,items:[]};rows.push(row);} row.h=Math.max(row.h,r.height); row.items.push(i);});
  rows.sort(function(a,b){return a.top-b.top});
  var left=Math.min.apply(null,R.map(function(r){return r.left})), right=Math.max.apply(null,R.map(function(r){return r.right}));
  var single=rows.every(function(r){return r.items.length===1}), V=[], VW, VH, O;
  if(!single){var y=0;rows.forEach(function(row){row.items.forEach(function(i){V[i]={x:R[i].left-left,y:y,w:R[i].width,h:R[i].height}});y+=row.h+gap;});
    VW=right-left; VH=y-gap; O=[VW/2,VH/2];}
  else {var x=0;rows.forEach(function(row){var i=row.items[0];V[i]={x:x,y:0,w:R[i].width,h:R[i].height};x+=R[i].width+gap;VH=Math.max(VH||0,R[i].height);});
    VW=x-gap; O=[0,VH/2];}
  var iw=F.ok?F.img.naturalWidth:16, ih=F.ok?F.img.naturalHeight:9, s=Math.max(VW/iw,VH/ih), ox=(VW-iw*s)/2, oy=(VH-ih*s)*FY;
  var md=Math.max(Math.hypot(O[0],O[1]),Math.hypot(VW-O[0],O[1]),Math.hypot(O[0],VH-O[1]),Math.hypot(VW-O[0],VH-O[1]));
  ts.forEach(function(t,i){var v=V[i];t.fin={vx:v.x,vy:v.y,vw:v.w,vh:v.h,sx:(v.x-ox)/s,sy:(v.y-oy)/s,sw:v.w/s,sh:v.h/s};t.flum=null;
    if(single&&F.ok){var k=rows.findIndex(function(r){return r.items[0]===i}),pt=PATH[Math.min(k,PATH.length-1)],sw=iw*PATHW,sh=Math.min(ih,sw*v.h/v.w);
      t.fin.sw=sw;t.fin.sh=sh;t.fin.sx=Math.max(0,Math.min(iw-sw,pt[0]*iw-sw/2));t.fin.sy=Math.max(0,Math.min(ih-sh,pt[1]*ih-sh/2));}});
  F.lay={O:O,md:md||1,mode:single?"pan":"grid"};
  var g0=document.getElementById("cards"); if(g0) g0.dataset.finLayout=F.lay.mode;
  return F.lay;
}
// Per tile: cached slice of the rendering at tile size, and its luminance per mosaic cell.
Tile.prototype.finPrep=function(){
  if(!this.fin||!this.W||!this.cs) return;
  var f=this.fin, W=this.W, H=this.H, d=this.dpr||1, cs=this.cs, cols=Math.ceil(W/cs), rows=Math.ceil(H/cs), n=cols*rows, i;
  this.flum=new Array(n);
  if(F.ok){
    var bg=document.createElement("canvas"); bg.width=Math.round(W*d); bg.height=Math.round(H*d);
    bg.getContext("2d").drawImage(F.img,f.sx,f.sy,f.sw,f.sh,0,0,bg.width,bg.height); this.fbg=bg;
    try{var o=document.createElement("canvas");o.width=cols;o.height=rows;var x=o.getContext("2d");x.drawImage(F.img,f.sx,f.sy,f.sw,f.sh,0,0,cols,rows);
      var px=x.getImageData(0,0,cols,rows).data;for(i=0;i<n;i++)this.flum[i]=(.2126*px[i*4]+.7152*px[i*4+1]+.0722*px[i*4+2])/255;}
    catch(e){for(i=0;i<n;i++)this.flum[i]=this.cells[i]?this.cells[i].l:.5;}
  } else { this.fbg=null; for(i=0;i<n;i++) this.flum[i]=this.cells[i]?this.cells[i].l:.5; }
};
Tile.prototype.finDraw=function(T){
  var x=this.ctx, d=this.dpr||1, f=this.fin, cs=this.cs, L=F.lay; if(!x||!cs||!f||!L) return;
  if(!this.flum||this.flum.length!==this.cells.length) this.finPrep();
  var D=hex(C.forest), Lc=hex(C.cream), lum=this.flum, rep=F.replay;
  x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,this.cv.width,this.cv.height);
  if((rep||T>=HOLD-40)&&this.fbg) x.drawImage(this.fbg,0,0);
  x.setTransform(d,0,0,d,0,0); x.globalAlpha=.95;
  this.cells.forEach(function(c,i){
    var acc=c.acc&&c.jit<.55; // about 2% of tesserae carry the amber accent
    var dist=Math.hypot(f.vx+c.u*f.vw-L.O[0],f.vy+c.v*f.vh-L.O[1])/L.md;
    var a=clamp((T-dist*GATHER-c.jit*120)/340), b=clamp((T-HOLD-dist*SPREAD-c.jit*220-(acc?520:0))/440);
    var p0=rep?0:1-c.val, s=(p0+(1-p0)*ease(a))*(1-ease(b)); if(s<=.02) return; // gathers from whatever the tile showed
    var w=cs*s, cx=c.x+cs/2, cy=c.y+cs/2;
    x.fillStyle=acc?C.gold:mix(D,Lc,lum[i]==null?.5:lum[i]); x.fillRect(cx-w/2+.5,cy-w/2+.5,w-1,w-1);
  });
  x.globalAlpha=1; this.box.dataset.fin=T>=FIN_END?"done":T<HOLD?"gather":"reveal";
};
var FIN_END=HOLD+SPREAD+220+520+440+60;
function drawAll(){live.forEach(function(t){if(t.fin)t.draw()});}
// The note above the grid keeps its space from the start, so nothing shifts when it fades in.
function note(mode){
  var el=document.getElementById("fin"); F.note=mode; if(!el) return;
  // reserve: space kept, invisible · show: fading in while the picture resolves · on: settled, Replay enabled
  el.hidden=mode==="off"; el.classList.toggle("on",mode==="on"||mode==="show"); el.setAttribute("aria-hidden",mode==="on"?"false":"true");
  var b=el.querySelector("#fin-replay"); if(b) b.disabled=mode!=="on"; el.dataset.mode=mode;
}
function finish(){F.state="done";F.raf=0;F.replay=false;drawAll();note("on");var g=document.getElementById("cards");if(g)g.dataset.fin="done";
  if(!DEMO&&F.complete) ss.set(true); F.played=true;}
function play(again){
  if(!live.length) return;
  F.pending=false; cancelAnimationFrame(F.raf); F.replay=!!again&&F.state==="done";
  aerial(function(){
    layout(); live.forEach(function(t){t.finPrep();});
    var g=document.getElementById("cards"); if(g) g.dataset.fin="playing";
    note(F.replay?"show":"reserve");
    if(rm()){ // reduced motion: straight to the final view, with a gentle fade
      live.forEach(function(t){t.cv.style.transition="none";t.cv.style.opacity="0";});
      finish(); void document.body.offsetWidth;
      live.forEach(function(t){t.cv.style.transition="opacity .6s ease";t.cv.style.opacity="1";});
      return;
    }
    live.forEach(function(t){t.cv.style.transition="";t.cv.style.opacity="";});
    F.state="play"; F.t0=performance.now();
    F.raf=requestAnimationFrame(function step(ts){var T=ts-F.t0; drawAll(); if(T>=HOLD+SPREAD*.4&&F.note!=="show"){F.note="show";note("show");}
      if(T<FIN_END) F.raf=requestAnimationFrame(step); else finish();});
  });
}
function whenVisible(fn){
  if(F.io) F.io.disconnect();
  var first=live[0]&&live[0].box; if(!first||!window.IntersectionObserver){fn();return;}
  F.io=new IntersectionObserver(function(es){if(es.some(function(e){return e.isIntersecting&&e.intersectionRatio>=.5})){F.io.disconnect();F.io=null;fn();}},{threshold:[0,.5]});
  F.io.observe(first);
}
function ensureNote(root){
  if(document.getElementById("fin")||!root) return;
  var el=document.createElement("div"); el.id="fin"; el.className="fin"; el.hidden=true; el.setAttribute("role","status");
  el.innerHTML='<div class="fin-txt"><p class="eyebrow">All seven Moments shared</p><h3>Every Moment, one view of AMBAR.</h3>'+
    '<p class="fin-sub">Seven tiles, one picture: the AMBAR Orlando residences, taking shape from everything you shared.'+(DEMO?' <span class="fin-demo">Preview only. Your saved answers are unchanged.</span>':'')+'</p></div>'+
    '<div class="fin-act"><button type="button" class="btn ghost sm" id="fin-replay">Replay</button><button type="button" class="btn link sm" id="fin-sum">See Your Orlando on one page</button></div>';
  root.parentNode.insertBefore(el,root);
  el.querySelector("#fin-replay").addEventListener("click",function(){play(true);});
  el.querySelector("#fin-sum").addEventListener("click",function(){var s=document.querySelector(".summary");if(s)s.scrollIntoView({behavior:rm()?"auto":"smooth",block:"start"});});
}
// Called after every tiles mount. complete = all seven shared in stored answers.
function sync(root,complete){
  F.complete=!!complete;
  var on=F.complete||DEMO;
  if(!F.complete&&!DEMO){ss.set(false);F.played=false;}
  cancelAnimationFrame(F.raf); F.raf=0; if(F.io){F.io.disconnect();F.io=null;}
  if(!on){F.state="idle";note("off");var g=document.getElementById("cards");if(g)delete g.dataset.fin;return;}
  ensureNote(root);
  F.state="idle"; note("reserve");
  if(document.body.classList.contains("lock")){F.pending=true;return;} // a Moment is still open; play once it closes
  // wait for the tiles' first layout (ResizeObserver) before measuring
  requestAnimationFrame(function(){requestAnimationFrame(function(){ aerial(function(){
    if(F.played||(!DEMO&&ss.get())){layout();live.forEach(function(t){t.finPrep();});finish();}
    else whenVisible(function(){play();});
  });});});
}
var rz=0; window.addEventListener("resize",function(){clearTimeout(rz);rz=setTimeout(function(){if(F.state!=="idle"){layout();live.forEach(function(t){t.flum=null;});drawAll();}},120);});

function mount(root,complete){
  live=[]; if(io) io.disconnect();
  (root||document).querySelectorAll(".c-img[data-tile]").forEach(function(box){
    var card=box.closest(".card"), t=new Tile(box); box._mo=t; live.push(t);
    if(io) io.observe(box); else {t.seen=true;t.settle();}
    var pt=function(e){var b=box.getBoundingClientRect();return e&&e.clientX!=null?[(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height]:null;};
    card.addEventListener("pointerenter",function(e){if(e.pointerType==="mouse"&&t.ok)t.to("open",pt(e));});
    card.addEventListener("pointerleave",function(e){if(e.pointerType==="mouse"&&t.ok)t.to("rest",pt(e));});
    card.addEventListener("pointerdown",function(e){if(e.pointerType!=="mouse"&&t.ok)t.to("open",pt(e));});
    card.addEventListener("focusin",function(){if(t.ok)t.to("open");});
    card.addEventListener("focusout",function(e){if(t.ok&&!card.contains(e.relatedTarget))t.to("rest");});
  });
  sync(root||document.getElementById("cards"),complete);
}
window.MoTiles={roll:roll,mount:mount,tiles:function(){return live},finale:{play:play,state:function(){return F.state},t0:function(){return F.t0},demo:DEMO}};
})();
