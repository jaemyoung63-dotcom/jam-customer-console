/* =========================================================
   고객 (1·2단계)
========================================================= */
function renderCustomers(){
  header('고객', customers.length+'명 · 방문예정·상담·계약 관리', (typeof voiceSupported==='function' && voiceSupported()) ? startListVoiceCommand : null);
  // filter bar
  let bar='<div class="chips" style="margin-bottom:8px;">';
  ['전체',...SEGMENTS].forEach(s=>{ bar+='<div class="chip'+(custFilter.seg===s?' on':'')+'" onclick="setCF(\'seg\',\''+s+'\')">'+s+'</div>'; });
  bar+='</div><div class="chips" style="margin-bottom:14px;">';
  bar+='<div class="chip'+(custFilter.src==='전체'?' on':'')+'" onclick="setCF(\'src\',\'전체\')">전체</div>';
  SOURCES.forEach(([v,l])=>{ bar+='<div class="chip'+(custFilter.src===v?' on':'')+'" onclick="setCF(\'src\',\''+v+'\')">'+l+'</div>'; });
  bar+='</div>';

  let list = customers.slice().sort((a,b)=>b.updated.localeCompare(a.updated));
  if(custFilter.seg!=='전체') list=list.filter(c=>c.seg===custFilter.seg);
  if(custFilter.src!=='전체') list=list.filter(c=>c.source===custFilter.src);

  let html=bar;
  if(list.length===0){
    html+='<div class="empty"><div class="big">아직 등록된 고객이 없어요</div>오른쪽 아래 + 버튼으로 첫 고객을 등록하세요.</div>';
  } else {
    list.forEach(c=>{
      const src = c.source==='db'?'<span class="badge b-db">DB</span>':'<span class="badge b-acq">지인</span>';
      const seg = c.seg?'<span class="badge b-seg">'+c.seg+'</span>':'';
      const grade = c.grade?'<span class="badge b-grade">'+c.grade+'</span>':'';
      const imgN = (c.images||[]).length;
      const tags=[...(c.product||[]),...(c.situation||[])].slice(0,4).map(t=>'<span class="pt">'+t+'</span>').join('');
      const apBtn = c.apSaved ? '<button class="btn primary sm" style="margin-left:8px;flex-shrink:0" onclick="event.stopPropagation();openAP(\''+c.id+'\')">AP</button>' : '';
      html+='<div class="card tap" onclick="openCustomer(\''+c.id+'\')">'
        +'<div class="row" style="margin-bottom:6px;"><span class="name">'+esc(c.name||'(이름 없음)')+'</span><span class="spacer"></span>'+grade+' '+seg+' '+src+apBtn+'</div>'
        +'<div class="meta">'+(c.age?c.age+' · ':'')+(c.region?esc(c.region):'지역 미입력')
        +(imgN?' · <span>◇ 이미지 '+imgN+'</span>':'')+'</div>'
        +(tags?'<div class="pill-tags">'+tags+'</div>':'')
        +'</div>';
    });
  }
  html+='<div class="divider"></div>';
  html+='<button class="btn primary wide add-btn" onclick="openCustomer(null)">＋ 고객 추가</button>';
  html+='<div class="row" style="margin-top:8px"><button class="btn ghost sm grow" onclick="document.getElementById(\'import-cust-input\').click()">불러오기(복원)</button></div>';
  document.getElementById('cust-list').innerHTML=html;
}
function setCF(k,v){custFilter[k]=v; renderCustomers();}

async function openCustomer(id){
  const c = id ? customers.find(x=>x.id===id) : {id:null,source:'db',seg:'방문예정',product:[],situation:[],images:[]};
  editingCust = JSON.parse(JSON.stringify(c));
  document.getElementById('cust-title').textContent = id?'고객 상세':'고객 등록';
  document.getElementById('c-delete').style.display = id?'flex':'none';
  document.getElementById('c-name').value=c.name||'';
  document.getElementById('c-region').value=c.region||'';
  document.getElementById('c-memo').value=c.memo||'';
  document.getElementById('c-coverage').value=c.coverageText||'';
  document.getElementById('c-birth6').value=c.birth6||'';
  document.getElementById('c-agenum').value=c.ageNum?(c.ageNum+'세'):'';
  fillSelect('c-age',AGES,c.age); fillSelect('c-grade',null,c.grade);
  chipGroup(document.getElementById('cust-source'),SOURCES,editingCust.source,false,v=>{editingCust.source=v; toggleImageBlock();});
  chipGroup(document.getElementById('cust-seg'),SEGMENTS,editingCust.seg,false,v=>editingCust.seg=v);
  chipGroup(document.getElementById('cust-product'),PRODUCTS,editingCust.product,true);
  chipGroup(document.getElementById('cust-situation'),SITUATIONS,editingCust.situation,true);
  toggleImageBlock();
  editingCust.docKind='보장급부';
  chipGroup(document.getElementById('doc-kind'),IMG_KINDS,'보장급부',false,v=>editingCust.docKind=v);
  await renderThumbs();
  custStep(1);
  refreshCoverageUI();
  openSheet('ov-cust');
}
/* ===== 고객 다단계 이동 (2단계) ===== */
function custStep(n){
  for(let i=1;i<=2;i++){ const el=document.getElementById('cstep-'+i); if(el) el.style.display=(i===n)?'block':'none'; }
  const sb=document.getElementById('cust-stepbar');
  if(sb) sb.innerHTML=[1,2].map(i=>'<span class="stepdot'+(i===n?' on':(i<n?' done':''))+'">'+i+'</span>').join('<span class="stepline"></span>');
  if(n===2){
    const nm=(document.getElementById('c-name').value||'').trim();
    const rg=(document.getElementById('c-region').value||'').trim();
    const cx=document.getElementById('cust-ctx2');
    if(cx) cx.innerHTML = nm ? ('<div style="background:var(--accent);color:#fff;border-radius:12px;padding:9px 13px;margin-bottom:12px;font-size:15px;font-weight:700">◉ '+esc(nm)+' 고객'+(rg?' <span style="font-weight:400;opacity:.85;font-size:13px">· '+esc(rg)+'</span>':'')+'</div>') : '';
    refreshCoverageUI();
  }
  const sheet=document.querySelector('#ov-cust .sheet'); if(sheet) sheet.scrollTop=0;
}
function refreshCoverageUI(){
  const txt=(document.getElementById('c-coverage').value||'').trim();
  const hasHist=!!(editingCust&&editingCust.coverageHistory&&editingCust.coverageHistory.length);
  const rb=document.getElementById('result-btn'), hint=document.getElementById('result-hint');
  if(txt||hasHist){ if(hint) hint.style.display='none'; if(rb) rb.style.display='block'; }
  else { if(hint) hint.style.display='block'; if(rb) rb.style.display='none'; }
  renderTidyHistory();
}
function showCoverageResult(){
  const ta=document.getElementById('c-coverage'); const mm=document.getElementById('c-memo');
  if(ta && editingCust && editingCust.coverageText && !(ta.value||'').trim()) ta.value=editingCust.coverageText;
  if(mm && editingCust && editingCust.memo!=null && !(mm.value||'').trim()) mm.value=editingCust.memo;
  resetCovSave();
  openSheet('ov-coverage');
}
/* 기록 목록: 최대 3개만 표시, 나머지는 '이전기록' 버튼으로 펼침 */
function histBlock(cards, idPrefix){
  if(cards.length<=3) return cards.join('');
  return cards.slice(0,3).join('')
    +'<div id="'+idPrefix+'-more" style="display:none">'+cards.slice(3).join('')+'</div>'
    +'<button class="btn ghost sm wide" style="margin-top:6px" onclick="var m=document.getElementById(\''+idPrefix+'-more\');m.style.display=\'block\';this.style.display=\'none\'">이전기록 '+(cards.length-3)+'개 더 보기</button>';
}
function renderTidyHistory(){
  const wrap=document.getElementById('tidy-history'); if(!wrap) return;
  const list=(editingCust&&editingCust.coverageHistory)?editingCust.coverageHistory:[];
  if(!list.length){ wrap.innerHTML=''; return; }
  let h='<label class="f">AI 정리 기록 ('+list.length+')</label>';
  const cards=list.map((e,i)=>
    '<div class="card" style="padding:9px 11px"><div class="row" style="align-items:center">'
      +'<div style="flex:1;min-width:0" onclick="openTidyEntry('+i+')"><div style="font-size:12.5px;font-weight:600">'+esc(e.at||e.date||'')+'</div>'
      +'<div class="meta" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(oneLine(e.text))+'</div></div>'
      +'<button class="btn ghost sm" style="margin-left:8px" onclick="openTidyEntry('+i+')">보기</button>'
      +'<button class="btn danger sm" style="margin-left:6px" onclick="delTidyEntry('+i+')">삭제</button></div></div>');
  wrap.innerHTML=h+histBlock(cards,'tidyhist');
}
function openTidyEntry(i){
  const list=(editingCust&&editingCust.coverageHistory)||[]; const e=list[i]; if(!e) return;
  document.getElementById('c-coverage').value=e.text||'';
  openSheet('ov-coverage');
}
async function delTidyEntry(i){
  if(!editingCust||!editingCust.coverageHistory) return;
  if(!confirm('이 정리 기록을 삭제할까요?')) return;
  editingCust.coverageHistory.splice(i,1);
  if(editingCust.coverageHistory[0]){ editingCust.coverageText=editingCust.coverageHistory[0].text; document.getElementById('c-coverage').value=editingCust.coverageText; }
  if(editingCust.id) await idbPut('customers',editingCust);
  refreshCoverageUI();
}
function computeAge6(d){
  if(!/^\d{6}$/.test(d)) return null;
  let yy=+d.slice(0,2), mm=+d.slice(2,4), dd=+d.slice(4,6);
  if(mm<1||mm>12||dd<1||dd>31) return null;
  const now=new Date(), cy2=now.getFullYear()%100;
  const year=(yy<=cy2)?2000+yy:1900+yy;
  let age=now.getFullYear()-year;
  const bd=new Date(year,mm-1,dd);
  const passed=(now.getMonth()>bd.getMonth())||(now.getMonth()===bd.getMonth()&&now.getDate()>=bd.getDate());
  if(!passed) age--;
  return (age>=0&&age<=120)?age:null;
}
function onBirth6(){
  const d=document.getElementById('c-birth6').value.replace(/\D/g,'').slice(0,6);
  document.getElementById('c-birth6').value=d;
  const age=computeAge6(d);
  editingCust.birth6=d;
  if(age!=null){
    editingCust.ageNum=age;
    document.getElementById('c-agenum').value=age+'세';
    const band=age<30?'20대':age<40?'30대':age<50?'40대':age<60?'50대':'60대+';
    if(!editingCust.age){ editingCust.age=band; document.getElementById('c-age').value=band; }
  } else {
    editingCust.ageNum=null; document.getElementById('c-agenum').value='';
  }
}
function toggleImageBlock(){ /* DB·지인 동일 포맷 — 이미지/보장 단계 항상 표시 */ }
function openLightbox(src){ const lb=document.getElementById('lightbox'); const im=document.getElementById('lightbox-img'); if(im) im.src=src; if(lb) lb.classList.add('show'); }
function startProgress(cb){
  let p=0; try{ cb(0); }catch(e){}
  const id=setInterval(()=>{ p += Math.max(1, Math.round((92-p)*0.07)); if(p>92) p=92; try{ cb(p); }catch(e){} }, 350);
  return { done:(final)=>{ clearInterval(id); try{ cb(final==null?100:final); }catch(e){} } };
}
/* ===== 불명확 확인 질문 UI ===== */
function qPanel(title, questions, onSubmitAttr){
  return '';   // '확인이 필요한 항목' 패널 사용 안 함 (요청으로 삭제)
}
function collectAnswers(box){
  const lines=[]; box.querySelectorAll('.q-answer').forEach(inp=>{ const a=inp.value.trim(); if(a) lines.push('- '+inp.getAttribute('data-q')+' → '+a); });
  return lines;
}
function renderTidyQuestions(questions){
  const box=document.getElementById('tidy-questions'); if(!box) return;
  if(!questions||!questions.length){ box.innerHTML=''; return; }
  box.innerHTML=qPanel('확인', questions, 'resubmitTidy()');
}
function resubmitTidy(){
  const box=document.getElementById('tidy-questions'); const lines=collectAnswers(box);
  if(!lines.length){ alert('확인할 답변을 하나 이상 입력하세요.'); return; }
  tidyCoverage(lines.join('\n'));
}
let planQCust=null;
function renderPlanQuestions(custId, questions){
  const box=document.getElementById('plan-questions'); if(!box) return; planQCust=custId;
  if(!questions||!questions.length){ box.innerHTML=''; return; }
  box.innerHTML=qPanel('확인', questions, 'resubmitPlan()');
}
function resubmitPlan(){
  const box=document.getElementById('plan-questions'); const lines=collectAnswers(box);
  if(!lines.length){ alert('확인할 답변을 하나 이상 입력하세요.'); return; }
  if(planQCust) runPlanAnalysis(planQCust, lines.join('\n'));
}
function enableDrop(el, onFile, filterFn){
  if(!el||el._dropReady) return; el._dropReady=true;
  const ok = filterFn || (f => (f.type&&f.type.indexOf('image')===0)||isPdfFile(f));
  el.addEventListener('dragover',e=>{e.preventDefault(); el.classList.add('drag-over');});
  el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
  el.addEventListener('drop',async e=>{
    e.preventDefault(); el.classList.remove('drag-over');
    const files=(e.dataTransfer&&e.dataTransfer.files)?Array.from(e.dataTransfer.files):[];
    for(const f of files){ if(ok(f)) await onFile(f); }
  });
}
async function renderThumbs(){
  const wrap=document.getElementById('c-thumbs'); if(!wrap) return; wrap.innerHTML='';
  for(const ref of (editingCust.images||[])){
    const rec=await idbGet('images',ref);
    const d=document.createElement('div'); d.className='thumb';
    if(rec&&rec.blob){ d.innerHTML='<img src="'+blobUrl(rec.blob)+'" onclick="event.stopPropagation();openLightbox(this.src)"><span class="k">'+(rec.kind||'')+'</span><button class="del" onclick="removeImage(event,\''+ref+'\')">×</button>'; }
    else d.innerHTML='<span class="k">없음</span>';
    wrap.appendChild(d);
  }
  const add=document.createElement('div'); add.className='add-thumb';
  add.innerHTML='<span style="font-size:22px">＋</span>파일 추가';
  add.onclick=pickImage;
  wrap.appendChild(add);
  const cam=document.createElement('div'); cam.className='add-thumb';
  cam.innerHTML='<span style="font-size:22px">📷</span>카메라 촬영';
  cam.onclick=pickCamera;
  wrap.appendChild(cam);
  enableDrop(wrap, addImageDirect);
}
function removeImage(e,ref){e.stopPropagation(); editingCust.images=editingCust.images.filter(x=>x!==ref); idbDel('images',ref); renderThumbs();}

