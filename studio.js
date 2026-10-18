"use strict";
(() => {
 const $=id=>document.getElementById(id),P=window.BatikPatterns,S=1024,KEY='indigo-generative-v2';
 const fresh=()=>({version:2,randomSeed:2718,thickness:65,density:6,strength:65,title:'',seeds:[{id:1,type:'bloom',x:.50,y:.46,angle:.10,spread:75},{id:2,type:'frond',x:.23,y:.76,angle:-.48,spread:46},{id:3,type:'frond',x:.79,y:.23,angle:2.65,spread:46}],gestures:[]});
 let recipe=fresh(),stage='COMPOSE',selected=1,mode='move',wax=P.surface(),cracks=P.surface(),field=null,branches=0,drag=null,pending=0,geometryDirty=false,cracksDirty=false,draft=null,saveTimer=0,toastTimer=0,exportUrl=null,exportBusy=false,warned=false;
 let simulationFrame=0,runElapsed=0,totalDyeSeconds=0,passes=0,history=[],runStart=0,lastFrame=0,accumulator=0;
 const overlay=$('interaction'),octx=overlay.getContext('2d');P.waxPattern(wax,recipe);
 const material=new window.BatikMaterial($('material'),wax,cracks);
 $('renderer-badge').textContent=material.gpu?'实时材质 · GPU 渲染':'实时材质 · 兼容模式';
 const names={bloom:'山花',frond:'枝叶',orbit:'回环'},stages=['COMPOSE','CRACK','DYE','REVEAL','RESULT'];
 const copy=o=>JSON.parse(JSON.stringify(o));
 function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
 function valid(r){
  if(!r||r.version!==2||!Number.isInteger(r.randomSeed)||!Array.isArray(r.seeds)||r.seeds.length<1||r.seeds.length>9||!Array.isArray(r.gestures)||r.gestures.length>48)return null;
  const finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
  if(!finite(r.thickness,20,100)||!finite(r.density,3,10)||!Number.isInteger(r.density)||!finite(r.strength,20,100))return null;
  const ids=new Set();for(const s of r.seeds){if(!s||!Number.isInteger(s.id)||ids.has(s.id)||!Object.hasOwn(names,s.type)||!finite(s.x,.08,.92)||!finite(s.y,.08,.92)||!finite(s.angle,-Math.PI*3,Math.PI*3)||!finite(s.spread,30,100))return null;ids.add(s.id);}
  let total=0;for(const g of r.gestures){if(!g||!finite(g.strength,10,100)||!Array.isArray(g.points)||!g.points.length||g.points.length>400)return null;total+=g.points.length;if(total>12000)return null;for(const p of g.points)if(!p||!finite(p.x,0,S)||!finite(p.y,0,S))return null;}
  return {version:2,randomSeed:r.randomSeed,thickness:r.thickness,density:r.density,strength:r.strength,title:typeof r.title==='string'?Array.from(r.title).slice(0,16).join(''):'',seeds:r.seeds.map(s=>({id:s.id,type:s.type,x:s.x,y:s.y,angle:s.angle,spread:s.spread})),gestures:r.gestures.map(g=>({strength:g.strength,points:g.points.map(p=>({x:p.x,y:p.y}))}))};
 }
 try{draft=valid(JSON.parse(localStorage.getItem(KEY)));}catch{}$('restore-recipe').hidden=!draft;
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(recipe));}catch{if(!warned){warned=true;toast('浏览器无法保存草稿，完成后请导出作品卡与配方。');}}},300);}
 function selectedSeed(){return recipe.seeds.find(s=>s.id===selected)||recipe.seeds[0];}
 function setMode(next){mode=next;$('move-mode').setAttribute('aria-pressed',String(mode==='move'));$('add-mode').setAttribute('aria-pressed',String(mode==='add'));if(stage==='COMPOSE')$('stage-hint').textContent=mode==='add'?'轻点布面 · 种下一簇纹样':'拖动圆点 · 牵引构图；小圆环 · 转动方向';}
 function controls(){
  const s=selectedSeed();selected=s.id;$('spread').value=s.spread;$('spread-value').value=Math.round(s.spread);$('density').value=recipe.density;$('density-value').value=recipe.density;$('thickness').value=recipe.thickness;$('thickness-value').value=recipe.thickness<40?'偏薄':recipe.thickness<75?'中厚':'偏厚';
  $('seed-x').value=Math.round(s.x*100);$('seed-x-value').value=Math.round(s.x*100);$('seed-y').value=Math.round(s.y*100);$('seed-y-value').value=Math.round(s.y*100);let angle=Math.round(s.angle/Math.PI*180);if(angle>180)angle-=360;$('rotation').value=angle;$('rotation-value').value=angle+'°';
  document.querySelectorAll('[data-motif]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.motif===s.type)));$('remove-seed').disabled=recipe.seeds.length<=1;$('seed-count').textContent=recipe.seeds.length+' 处生长点 · 原创形态演绎';$('recipe-id').textContent='SEED / '+recipe.randomSeed;$('art-caption').textContent=stage==='RESULT'?(recipe.title.trim()||'我的一抹蓝'):'花叶与几何 · 原创生成形态';
 }
 function invalidateComposition(){
  if(recipe.gestures.length){recipe.gestures=[];toast('构图已改变，旧裂隙已重置。请重新揉蜡。');}
  field=null;branches=0;geometryDirty=true;material.reset();history=[];totalDyeSeconds=0;passes=0;requestPaint();save();
 }
 function updateCracks(){
  if(!field)field=new P.WaxField(wax);const preview=drag&&drag.type==='crack'?{...recipe,gestures:[...recipe.gestures,drag.gesture]}:recipe;branches=P.generateCracks(cracks,preview,field);material.updateMasks();$('crack-count').textContent=recipe.gestures.length?`${recipe.gestures.length} 次揉动 · ${branches} 段裂隙`:'尚未揉蜡 · 也可保留完整蜡层';$('undo-crack').disabled=$('clear-cracks').disabled=!recipe.gestures.length;
 }
 function requestPaint(){if(!pending)pending=requestAnimationFrame(()=>{pending=0;if(geometryDirty){P.waxPattern(wax,recipe);cracks.getContext('2d').clearRect(0,0,S,S);material.updateMasks();geometryDirty=false;}if(cracksDirty){updateCracks();cracksDirty=false;}material.render(stage==='RESULT'?0:stage==='REVEAL'?1-Number($('reveal').value)/100:1,stage==='DYE');drawHandles();});}
 function directionPoint(s){return{x:s.x*S+Math.sin(s.angle)*84,y:s.y*S-Math.cos(s.angle)*84};}
 function drawHandles(){
  octx.clearRect(0,0,S,S);if(stage==='COMPOSE'){
   for(const s of recipe.seeds){const is=s.id===selected,x=s.x*S,y=s.y*S;octx.save();octx.strokeStyle=is?'#19495b':'#64755eaa';octx.fillStyle=is?'#f7f4e9':'#f7f4e9cc';octx.lineWidth=is?3:2;octx.beginPath();octx.arc(x,y,is?14:10,0,Math.PI*2);octx.fill();octx.stroke();octx.fillStyle='#19495b';octx.beginPath();octx.arc(x,y,3,0,Math.PI*2);octx.fill();if(is){const d=directionPoint(s);octx.setLineDash([5,7]);octx.lineWidth=1.5;octx.beginPath();octx.moveTo(x,y);octx.lineTo(d.x,d.y);octx.stroke();octx.setLineDash([]);octx.lineWidth=2;octx.fillStyle='#f7f4e9';octx.beginPath();octx.arc(d.x,d.y,10,0,Math.PI*2);octx.fill();octx.stroke();}octx.restore();}
  }else if(stage==='CRACK'&&drag&&drag.type==='crack'){
   const pts=drag.gesture.points;octx.strokeStyle='#a67c4399';octx.lineWidth=2;octx.setLineDash([6,8]);octx.beginPath();pts.forEach((p,i)=>i?octx.lineTo(p.x,p.y):octx.moveTo(p.x,p.y));octx.stroke();octx.setLineDash([]);if(pts.length){const p=pts[pts.length-1];octx.strokeStyle='#9f7b49aa';octx.beginPath();octx.arc(p.x,p.y,25+Number($('stress').value)*.15,0,Math.PI*2);octx.stroke();}
  }
 }
 const chapters={
  COMPOSE:['种下纹，<br>染成蓝。','轻轻牵动，纹样舒展。<br>每一次揉动，留下不同的蓝。','从几处生长点开始，生成自己的构图。再让蜡层、裂隙与染液共同完成一块布。','生长中的构图','拖动圆点，牵引纹样','图案决定蜡涂在哪里；蜡与裂隙决定染液如何进入布面。形态与工艺，在这里分别发生。'],
  CRACK:['轻揉蜡，<br>生裂隙。','把手的动作，<br>留在蜡层的细微裂隙里。','蜡守住了白，也会在揉动中裂开。试着改变方向与力度，观察局部裂纹。','揉动中的蜡层','在金色蜡区上，轻轻拖动','裂隙是染液可进入的通道。这里按位置、方向、蜡区边界生成分支，演绎蜡层开裂。'],
  DYE:['循着隙，<br>慢慢蓝。','蜡层守住的地方，<br>染液沿着裂隙寻找入口。','这次浸染不只是颜色覆盖：染液进入通道，沿经纬方向扩散，再逐渐被纤维吸附。','染液与纤维','扩散 / 吸附 / 颜色积累','经纬方向的扩散速率在模型中有所不同。蜡区关闭通道，裂隙则允许染液通过。'],
  REVEAL:['蜡退去，<br>白显现。','白来自蜡的守护，<br>蓝来自染液的到访。','去掉蜡层的显示，观察被保留的浅色，与裂隙里沉积的颜色。','脱蜡后的留白','拖动滑块，揭晓成布','真实工艺通过加热等步骤去蜡。滑块仅作视觉揭晓，不代表实体去蜡方法。'],
  RESULT:['纹与裂，<br>皆是你。','构图是你的选择，<br>裂隙与蓝，记住了这次动作。','保存这一块数字织物，也保存控制点、揉动轨迹与浸染参数，让创作留下可追溯的配方。','这一块，属于你','移动指针，观察织物光泽','这是工艺启发的材料演绎。形态是原创算法生成，参数未经过真实材料实验校准。']
 };
 function setStage(next){
  if(!stages.includes(next))return;stage=next;document.body.dataset.stage=stage;document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==stage);document.querySelectorAll('[data-stage]').forEach(el=>{const index=stages.indexOf(el.dataset.stage);el.classList.toggle('completed',index<stages.indexOf(stage));if(el.dataset.stage===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  const c=chapters[stage];$('chapter-title').innerHTML=c[0];$('chapter-lead').innerHTML=c[1];$('chapter-description').textContent=c[2];$('bench-title').textContent=c[3];$('bench-meta').textContent=c[4];$('principle').textContent=c[5];$('stage-hint').hidden=!['COMPOSE','CRACK'].includes(stage);$('simulation-indicator').hidden=stage!=='DYE';if(stage==='COMPOSE')setMode(mode);if(stage==='CRACK')$('stage-hint').textContent='在蜡区拖动 · 位置与方向都会留下痕迹';
  if(stage==='RESULT'){$('result-seeds').textContent=recipe.seeds.length+' 处';$('result-cracks').textContent=recipe.gestures.length+' 次';$('result-dye').textContent=totalDyeSeconds.toFixed(1)+' 秒';}
  controls();requestPaint();
  const focus={COMPOSE:'move-mode',CRACK:'stress',DYE:'dye-strength',REVEAL:'reveal',RESULT:'title'}[stage];$(focus).focus({preventScroll:true});if(matchMedia('(max-width: 640px)').matches)$('studio').scrollIntoView({block:'start',behavior:'auto'});
 }
 function coords(e){const r=overlay.getBoundingClientRect();return{x:Math.max(0,Math.min(S,(e.clientX-r.left)/r.width*S)),y:Math.max(0,Math.min(S,(e.clientY-r.top)/r.height*S))};}
 function down(e){
  if(!e.isPrimary||drag||(e.pointerType==='mouse'&&e.button!==0)||!['COMPOSE','CRACK'].includes(stage))return;e.preventDefault();const p=coords(e);overlay.setPointerCapture(e.pointerId);
  if(stage==='COMPOSE'){
   if(mode==='add'){if(recipe.seeds.length>=9){toast('最多 9 处生长点。可以先移动或移除一簇。');return;}const s=selectedSeed();const id=Math.max(...recipe.seeds.map(s=>s.id))+1;recipe.seeds.push({id,type:s.type,x:Math.max(.08,Math.min(.92,p.x/S)),y:Math.max(.08,Math.min(.92,p.y/S)),angle:0,spread:45});selected=id;setMode('move');controls();invalidateComposition();drag={type:'move',id:e.pointerId};return;}
   const selectedOne=selectedSeed(),handle=directionPoint(selectedOne);if(Math.hypot(p.x-handle.x,p.y-handle.y)<29){drag={type:'rotate',id:e.pointerId};return;}
   const hit=recipe.seeds.reduce((best,s)=>Math.hypot(p.x-s.x*S,p.y-s.y*S)<Math.hypot(p.x-best.x*S,p.y-best.y*S)?s:best);if(Math.hypot(p.x-hit.x*S,p.y-hit.y*S)>42){toast('拖动圆点牵引构图，或选择“种一簇”加入新形态。');return;}selected=hit.id;drag={type:'move',id:e.pointerId,offset:{x:p.x-hit.x*S,y:p.y-hit.y*S}};controls();requestPaint();
  }else{
   if(recipe.gestures.length>=48){toast('揉动轨迹已较丰富，可以先入染，或撤销部分揉动。');return;}if(!field)field=new P.WaxField(wax);drag={type:'crack',id:e.pointerId,gesture:{strength:Number($('stress').value),points:[p]}};requestPaint();
  }
 }
 function move(e){
  const p=coords(e);
  if(stage==='RESULT'&&e.pointerType==='mouse'){material.light=[(p.x/S-.5)*1.3,(.5-p.y/S)*1.3];requestPaint();return;}
  if(!drag||e.pointerId!==drag.id)return;e.preventDefault();
  if(drag.type==='move'){const s=selectedSeed();s.x=Math.max(.08,Math.min(.92,(p.x-(drag.offset?.x||0))/S));s.y=Math.max(.08,Math.min(.92,(p.y-(drag.offset?.y||0))/S));controls();invalidateComposition();}
  else if(drag.type==='rotate'){const s=selectedSeed();s.angle=Math.atan2(p.x-s.x*S,-(p.y-s.y*S));controls();invalidateComposition();}
  else{const pts=drag.gesture.points,last=pts[pts.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>6&&pts.length<400){pts.push(p);cracksDirty=true;requestPaint();}}
 }
 function up(e){
  if(!drag||e.pointerId!==drag.id)return;
  if(drag.type==='crack'){
   const gesture=drag.gesture,hit=gesture.points.some(p=>field.at(p.x,p.y)>.28);if(hit){recipe.gestures.push(gesture);cracksDirty=true;save();}else toast('这次没有触及蜡区。试着在金色图案上揉动。');
  }drag=null;cracksDirty=stage==='CRACK';requestPaint();
 }
 overlay.addEventListener('pointerdown',down);overlay.addEventListener('pointermove',move);overlay.addEventListener('pointerup',up);overlay.addEventListener('pointercancel',up);overlay.addEventListener('lostpointercapture',up);overlay.addEventListener('pointerleave',()=>{if(stage==='RESULT'){material.light=[-.4,.4];requestPaint();}});
 $('move-mode').onclick=()=>setMode('move');$('add-mode').onclick=()=>setMode('add');
 document.querySelectorAll('[data-motif]').forEach(b=>b.onclick=()=>{selectedSeed().type=b.dataset.motif;controls();invalidateComposition();});
 for(const id of ['spread','density','thickness','seed-x','seed-y','rotation'])$(id).addEventListener('input',()=>{const v=Number($(id).value),s=selectedSeed();if(id==='spread')s.spread=v;else if(id==='density')recipe.density=v;else if(id==='thickness')recipe.thickness=v;else if(id==='seed-x')s.x=v/100;else if(id==='seed-y')s.y=v/100;else s.angle=v/180*Math.PI;controls();invalidateComposition();});
 $('reseed').onclick=()=>{recipe.randomSeed=(recipe.randomSeed+7919)%2147483647;controls();invalidateComposition();};$('remove-seed').onclick=()=>{if(recipe.seeds.length<=1)return;recipe.seeds=recipe.seeds.filter(s=>s.id!==selected);selected=recipe.seeds[0].id;controls();invalidateComposition();};
 $('to-crack').onclick=()=>{if(geometryDirty){P.waxPattern(wax,recipe);geometryDirty=false;}field=new P.WaxField(wax);updateCracks();setStage('CRACK');};$('back-compose').onclick=()=>setStage('COMPOSE');
 $('stress').oninput=()=>{$('stress-value').value=Number($('stress').value)<35?'轻柔':Number($('stress').value)<75?'适中':'较强';};
 $('undo-crack').onclick=()=>{recipe.gestures.pop();cracksDirty=true;requestPaint();save();};$('clear-cracks').onclick=()=>{recipe.gestures=[];cracksDirty=true;requestPaint();save();};
 function beginDye(reset){
  if(simulationFrame)return;if(cracksDirty){updateCracks();cracksDirty=false;}if(reset){material.reset();totalDyeSeconds=0;history=[];passes=0;}
  passes++;runElapsed=0;accumulator=0;lastFrame=0;runStart=performance.now();$('to-reveal').disabled=true;$('to-reveal').textContent='等待布面浸润…';$('dye-pass').textContent='第 '+passes+' 次浸染';setStage('DYE');
  const tick=time=>{
   if(stage!=='DYE'||material.lost){simulationFrame=0;return;}const delta=lastFrame?Math.min(.05,(time-lastFrame)/1000):0;lastFrame=time;
   if(!document.hidden){runElapsed+=delta;totalDyeSeconds+=delta;const speed=material.gpu?(material.n<512?260:400):160;accumulator+=delta*speed;const count=Math.min(20,Math.floor(accumulator));accumulator-=count;const bath=Math.min(1,.02+runElapsed/2.5);if(count){material.step(bath,recipe.strength/100,count);const last=history.at(-1);if(last&&last.bath===bath&&last.strength===recipe.strength)last.steps+=count;else history.push({bath,strength:recipe.strength,steps:count});}
    material.render(1,true);$('dye-seconds').textContent=runElapsed.toFixed(1);$('simulation-status').textContent='染液正在扩散，纤维持续吸附';
    if(runElapsed>2.7){$('to-reveal').disabled=false;$('to-reveal').textContent='结束浸染，去蜡见白 →';}
    if(runElapsed>=35){finishDye();toast('本轮浸染已暂停，可以脱蜡欣赏，或继续浸染。');return;}
   }simulationFrame=requestAnimationFrame(tick);
  };simulationFrame=requestAnimationFrame(tick);
 }
 function finishDye(){cancelAnimationFrame(simulationFrame);simulationFrame=0;$('reveal').value=0;$('reveal-value').value='0%';$('to-result').disabled=true;setStage('REVEAL');save();}
 $('to-dye').onclick=()=>beginDye(true);$('to-reveal').onclick=()=>{if(runElapsed>2.7)finishDye();};$('dye-strength').oninput=()=>{recipe.strength=Number($('dye-strength').value);$('dye-strength-value').value=recipe.strength+'%';save();};
 $('reveal').oninput=()=>{const v=Number($('reveal').value);$('reveal-value').value=v+'%';$('to-result').disabled=v<100;requestPaint();};$('to-result').onclick=()=>{if(Number($('reveal').value)<100)return;setStage('RESULT');save();};$('back-dye').onclick=()=>beginDye(false);$('redye').onclick=()=>beginDye(false);
 $('title').oninput=()=>{recipe.title=Array.from($('title').value).slice(0,16).join('');controls();save();};
 $('new-work').onclick=()=>$('reset-dialog').showModal();$('confirm-reset').onclick=()=>{$('reset-dialog').close();recipe=fresh();selected=1;mode='move';branches=0;field=null;material.reset();geometryDirty=true;history=[];totalDyeSeconds=0;passes=0;$('title').value='';$('dye-strength').value=recipe.strength;$('dye-strength-value').value=recipe.strength+'%';setStage('COMPOSE');save();};
 function restore(input){recipe=copy(input);selected=recipe.seeds[0].id;drag=null;geometryDirty=false;cracksDirty=false;$('title').value=recipe.title;$('dye-strength').value=recipe.strength;$('dye-strength-value').value=recipe.strength+'%';P.waxPattern(wax,recipe);field=new P.WaxField(wax);updateCracks();material.reset();history=[];passes=0;totalDyeSeconds=0;controls();requestPaint();$('restore-recipe').hidden=true;toast('已恢复控制点与揉动轨迹。可调整构图，或重新入染。');}
 $('restore-recipe').onclick=()=>{if(draft)restore(draft);};
 $('import-recipe').onclick=()=>$('recipe-file').click();$('recipe-file').onchange=async()=>{const file=$('recipe-file').files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('size');const imported=valid(JSON.parse(await file.text()));if(!imported)throw Error('format');restore(imported);save();}catch{toast('无法导入：请选择本工坊导出的有效 JSON 配方（不超过 1MB）。');}finally{$('recipe-file').value='';}};
 function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 $('save-recipe').onclick=()=>{downloadBlob(new Blob([JSON.stringify({...recipe,model:'batik-two-field-v2',gridSize:material.n,dyeHistory:history,dyeSeconds:totalDyeSeconds,iterations:material.iterations,notes:'Original generated forms. Heuristic cracks and simplified diffusion/adsorption. Device precision may affect output.'},null,2)],{type:'application/json'}),'蓝生万象-创作配方-'+recipe.randomSeed+'.json');toast('创作配方已导出，包含控制点、揉动轨迹与浸染日程。');};
 async function exportArt(){
  if(exportBusy||stage!=='RESULT')return;exportBusy=true;$('save-art').disabled=true;
  try{
   material.light=[-.4,.4];material.render(0,false);const art=material.capture(),c=document.createElement('canvas');c.width=1440;c.height=1940;const ctx=c.getContext('2d'),font='"Microsoft YaHei","PingFang SC",sans-serif';
   ctx.fillStyle='#f7f4eb';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#173c50';ctx.font='43px '+font;ctx.fillText('蓝生万象',100,105);ctx.fillStyle='#7b817a';ctx.font='17px '+font;ctx.fillText('THE INDIGO ATELIER / II   ·   生纹与染',100,145);ctx.strokeStyle='#d6d7cb';ctx.beginPath();ctx.moveTo(100,177);ctx.lineTo(1340,177);ctx.stroke();ctx.fillStyle='#e5e1d5';ctx.fillRect(84,212,1272,1272);ctx.drawImage(art,100,228,1240,1240);
   const title=recipe.title.trim()||'我的一抹蓝';ctx.fillStyle='#173c50';let size=48;ctx.font=size+'px '+font;while(ctx.measureText(title).width>1220&&size>28)ctx.font=(--size)+'px '+font;ctx.fillText(title,100,1557);ctx.fillStyle='#7b817a';ctx.font='19px '+font;ctx.fillText(`${recipe.seeds.length} 处生长点  ·  ${recipe.gestures.length} 次揉蜡  ·  ${totalDyeSeconds.toFixed(1)} 秒数字浸染  ·  SEED ${recipe.randomSeed}`,100,1609);ctx.strokeStyle='#d6d7cb';ctx.beginPath();ctx.moveTo(100,1655);ctx.lineTo(1340,1655);ctx.stroke();ctx.fillStyle='#173c50';ctx.font='26px '+font;ctx.fillText('蜡守其白，裂隙生蓝。',100,1713);ctx.fillStyle='#7b817a';ctx.font='18px '+font;ctx.fillText('工艺参考：中国非物质文化遗产网《苗族蜡染技艺》',100,1765);ctx.fillText('www.ihchina.cn/project_details/14300/',100,1798);ctx.fillText('原创算法形态 · 简化的裂纹、扩散与吸附模型 · 非传统纹样复刻',100,1848);ctx.font='16px '+font;ctx.fillText('数字浸染时间与参数不对应真实工艺耗时或实测材料常数',100,1885);
   const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG failed')),'image/png'));if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(blob);$('export-image').src=exportUrl;$('download-art').href=exportUrl;$('download-art').download='蓝生万象-'+title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_')+'.png';$('export-dialog').showModal();
  }catch(e){console.error(e);toast('作品卡生成失败，请重试。当前创作仍保留。');}finally{exportBusy=false;$('save-art').disabled=false;}
 }
 $('save-art').onclick=exportArt;
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>$(b.dataset.open).showModal());document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();}));
 material.onLost=()=>{cancelAnimationFrame(simulationFrame);simulationFrame=0;save();toast('图形上下文暂时中断。设计配方已保留，刷新页面可恢复。');};
 window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);try{localStorage.setItem(KEY,JSON.stringify(recipe));}catch{}cancelAnimationFrame(simulationFrame);});
 window.BatikStudio={getRecipe:()=>copy(recipe),getStage:()=>stage,getHistory:()=>copy(history),material,wax,cracks,getField:()=>field,getBranches:()=>branches};
 controls();setMode('move');document.body.dataset.stage='COMPOSE';material.render(1,false);drawHandles();
})();
