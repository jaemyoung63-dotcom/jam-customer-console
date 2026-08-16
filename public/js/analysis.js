/* =========================================================
   분석 (3단계 뼈대)
========================================================= */
const PRICING={opus:[5,25],sonnet:[2,10],haiku:[1,5],fable:[5,25],mythos:[5,25]};
const USD_KRW=1380;
function priceFor(model){const k=Object.keys(PRICING).find(x=>(model||'').includes(x)); return PRICING[k||'sonnet'];}
function loadCost(){try{return JSON.parse(localStorage.getItem('costMeter'))||{balance:null,count:0,correctedAt:null,history:[]};}catch(e){return {balance:null,count:0,correctedAt:null,history:[]};}}
function saveCost(o){try{localStorage.setItem('costMeter',JSON.stringify(o));}catch(e){}}
function addUsage(u,label){
  if(!u) return;
  const pr=priceFor(u.model); const cost=(u.input_tokens/1e6)*pr[0]+(u.output_tokens/1e6)*pr[1];
  const m=loadCost();
  if(m.balance!=null) m.balance=m.balance-cost;
  m.count=(m.count||0)+1;
  m.history=m.history||[];
  m.history.unshift({t:new Date().toISOString(), label:label||'분석', usd:cost});
  if(m.history.length>200) m.history=m.history.slice(0,200);
  saveCost(m);
  return cost;
}
function renderCostMeter(lastCost){
  const el=document.getElementById('cost-meter'); if(!el) return;
  const m=loadCost();
  let s='<div class="card" style="padding:11px 13px"><div class="row"><div style="flex:1">';
  if(m.balance==null){
    s+='<div class="meta">남은 잔액 미설정</div>'
      +'<div style="font-size:15px;font-weight:600;margin-top:2px">보정을 눌러 콘솔 잔액을 입력하세요</div>';
  } else {
    const krw=Math.round(m.balance*USD_KRW);
    s+='<div class="meta">남은 잔액 (추정)'+(m.correctedAt?' · '+m.correctedAt+' 보정':'')+'</div>'
      +'<div style="font-size:16px;font-weight:600;margin-top:2px">US$'+m.balance.toFixed(2)+' <span class="meta" style="font-weight:400">약 '+krw.toLocaleString()+'원 · 보정 후 '+(m.count||0)+'회</span></div>';
  }
  if(lastCost!=null) s+='<div class="meta" style="margin-top:3px">이번 약 US$'+lastCost.toFixed(3)+' ('+Math.round(lastCost*USD_KRW).toLocaleString()+'원) 차감</div>';
  s+='</div></div>'
    +'<div class="row" style="margin-top:8px"><button class="btn ghost sm grow" onclick="correctCost()">보정</button>'
    +'<button class="btn ghost sm grow" onclick="toggleCostHistory()">사용 히스토리</button></div>'
    +'<div id="cost-history" style="display:none;margin-top:8px"></div></div>';
  el.innerHTML=s;
}
function toggleCostHistory(){
  const el=document.getElementById('cost-history'); if(!el) return;
  if(el.style.display!=='none'){el.style.display='none'; return;}
  const m=loadCost(); const h=m.history||[];
  let s='';
  if(!h.length){ s='<div class="stage-note">아직 사용 내역이 없어요.</div>'; }
  else {
    const sum={}; h.forEach(r=>{sum[r.label]=(sum[r.label]||0)+r.usd;});
    s+='<div class="card" style="padding:10px 12px"><div class="meta" style="margin-bottom:4px">종류별 합계</div>';
    Object.keys(sum).forEach(k=>{ s+='<div class="kv"><span class="k">'+esc(k)+'</span><span>US$'+sum[k].toFixed(3)+' · '+Math.round(sum[k]*USD_KRW).toLocaleString()+'원</span></div>'; });
    s+='</div>';
    s+='<div class="card" style="padding:6px 12px;max-height:260px;overflow:auto">';
    h.forEach(r=>{ const d=new Date(r.t); const ds=d.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      s+='<div class="kv"><span class="k">'+ds+' · '+esc(r.label)+'</span><span>US$'+r.usd.toFixed(3)+'</span></div>'; });
    s+='</div>';
  }
  el.innerHTML=s; el.style.display='block';
}
function correctCost(){
  const m=loadCost();
  const cur=(m.balance!=null)?m.balance.toFixed(2):'5.00';
  const v=prompt('콘솔(platform.claude.com)에서 확인한 현재 남은 잔액을 US$ 숫자로 입력하세요.\n이 값으로 맞추고, 이후 분석·정리 때마다 여기서 차감됩니다.\n예: 4.90', cur);
  if(v==null) return;
  const num=parseFloat(v);
  if(isNaN(num)||num<0){alert('숫자로 입력하세요. 예: 4.90'); return;}
  m.balance=num; m.count=0; m.correctedAt=today();
  m.history=m.history||[]; m.history.unshift({t:new Date().toISOString(), label:'보정', usd:0});
  saveCost(m);
  renderCostMeter();
}
function fillAnalysisSelect(){
  header('매니저 상담', '고객 자료를 모아 분석·제안으로 연결');
  renderCostMeter();
  const sel=document.getElementById('an-cust'); sel.innerHTML='<option value="">— 고객 선택 —</option>';
  customers.forEach(c=>{const o=document.createElement('option'); o.value=c.id; o.textContent=c.name+(c.region?' · '+c.region:''); sel.appendChild(o);});
  const pk=document.getElementById('an-picker'); if(pk) pk.style.display=currentCustId?'none':'';
  document.getElementById('an-body').innerHTML='<div class="empty">분석할 고객을 선택하세요.</div>';
}
const ANALYSIS_AREAS=['실손','치매','간병','연금','종신','건강','암','정기'];
async function toggleAnArea(id,kind,area){
  const c=customers.find(x=>x.id===id); if(!c) return;
  const key=kind==='focus'?'focusAreas':'excludeAreas';
  c[key]=c[key]||[]; const i=c[key].indexOf(area);
  if(i>=0){ c[key].splice(i,1); }
  else { c[key].push(area); const other=kind==='focus'?'excludeAreas':'focusAreas'; c[other]=(c[other]||[]).filter(x=>x!==area); }
  await idbPut('customers',c); renderAnalysis();
}
let anStep=1;
function anStepGo(n){ anStep=n; renderAnalysis(); }
function onAnCust(){ currentCustId=document.getElementById('an-cust').value||null; ensurePinsForCustomer(currentCustId); anStep=1; renderAnalysis(); renderPoolCtx(); }
function renderAnalysis(){
  const id=document.getElementById('an-cust').value;
  const body=document.getElementById('an-body');
  const pick=document.getElementById('an-picker'); if(pick) pick.style.display=(id||currentCustId)?'none':'block';
  if(!id){body.innerHTML='<div class="empty">분석할 고객을 선택하세요.</div>'; return;}
  const c=customers.find(x=>x.id===id);
  c.planImages=c.planImages||[];
  const imgN=(c.images||[]).length;
  const want=[...(c.product||[]),...(c.situation||[])];
  const caseList=refPoolAll(c);
  const alist=(c.analyses&&c.analyses.length)?c.analyses:(c.analysis?[{date:c.analysisDate,data:c.analysis}]:[]);
  const hasAnalysis=alist.length>0;
  const hasText=(c.coverageText||'').trim().length>0;
  const palist=(c.planAnalyses&&c.planAnalyses.length)?c.planAnalyses:[];

  let html='<div style="position:sticky;top:0;z-index:5;background:var(--accent);color:#fff;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:15px;font-weight:700">◉ '+esc(c.name)+' 고객'+(c.region?' <span style="font-weight:400;opacity:.85;font-size:13px">· '+esc(c.region)+'</span>':'')+'</div>';
  html+='<div class="stepbar">'
    +'<span class="stepdot'+(anStep===1?' on':(anStep>1?' done':''))+'">1</span><span class="stepline"></span>'
    +'<span class="stepdot'+(anStep===2?' on':(anStep>2?' done':''))+'">2</span><span class="stepline"></span>'
    +'<span class="stepdot'+(anStep===3?' on':'')+'">3</span></div>'
    +'<div class="meta" style="margin:-8px 0 12px 2px">'+(anStep===1?'\u2460 \uace0\uac1d \u00b7 \uc720\uc0ac \uc0c1\ub2f4\uc0ac\ub840':anStep===2?'\u2461 \uc0c1\ub2f4\uc0ac\ub840 \ub9e4\uce6d \ubcf4\uc7a5\ubd84\uc11d':'\u2462 \uac00\uc785\uc124\uacc4')+'</div>';

  if(anStep===1){
    html+='<div class="card"><div class="row" style="margin-bottom:8px;"><span class="name">'+esc(c.name)+'</span><span class="spacer"></span>'
      +(c.source==='db'?'<span class="badge b-db">DB</span>':'<span class="badge b-acq">\uc9c0\uc778</span>')+'</div>'
      +'<div class="kv"><span class="k">\uc5f0\ub839 / \uc9c0\uc5ed</span><span>'+(c.age||'-')+' \u00b7 '+(esc(c.region)||'-')+'</span></div>'
      +'<div class="kv"><span class="k">\uc0c1\ud488 \uad00\uc2ec</span><span>'+((c.product||[]).join(', ')||'-')+'</span></div>'
      +'<div class="kv"><span class="k">\uc0c1\ub2f4 \uc0c1\ud669</span><span>'+((c.situation||[]).join(', ')||'-')+'</span></div>'
      +'<div class="kv"><span class="k">\ubcf4\uc7a5 \uc790\ub8cc</span><span>'+(imgN?'\uc774\ubbf8\uc9c0 '+imgN+'\uc7a5':'\uc5c6\uc74c')+'</span></div></div>';
    html+='<label class="f">참조풀 매칭 ('+caseList.length+') <span style="font-weight:400;color:var(--ink-mute)">· 최대 6개 표시 · 눌러서 전체</span></label>';
    if(caseList.length){ html+=renderPoolCapped(caseList);
    } else { html+='<div class="stage-note">관련 상담사례가 아직 없어요. 참조풀에서 선택(☑)하거나 태그가 겹치는 사례를 쌓으면 매칭됩니다.</div>'; }
    html+='<div class="divider"></div><button class="btn ghost sm wide" onclick="go(\'pools\')">참조풀에서 자료 선택 →</button><button class="btn primary wide" style="margin-top:8px" onclick="anStepGo(2)">\ub2e4\uc74c \u203a</button>';
  } else if(anStep===2){
    html+='<button class="btn ghost sm" onclick="anStepGo(1)">\u2039 \uc0c1\ub2f4\uc0ac\ub840(1\ub2e8\uacc4)</button>';
    html+='<div class="divider"></div>';
    c.focusAreas=c.focusAreas||[]; c.excludeAreas=c.excludeAreas||[];
    html+='<label class="f">\ubd84\uc11d \uc635\uc158 <span style="font-weight:400;color:var(--ink-mute)">\u00b7 \ubcf4\uc7a5\ubd84\uc11d\u00b7\uac00\uc785\uc124\uacc4 \uacf5\ud1b5</span></label>';
    html+='<div class="meta" style="margin:2px 0 4px">\uc9d1\uc911 \ubd84\uc11d(\ud3ec\ud568)</div><div class="chips">'+ANALYSIS_AREAS.map(a=>'<span class="chip'+(c.focusAreas.includes(a)?' on':'')+'" onclick="toggleAnArea(\''+c.id+'\',\'focus\',\''+a+'\')">'+a+'</span>').join('')+'</div>';
    html+='<div class="meta" style="margin:8px 0 4px">\uc81c\uc678</div><div class="chips">'+ANALYSIS_AREAS.map(a=>'<span class="chip'+(c.excludeAreas.includes(a)?' on':'')+'" onclick="toggleAnArea(\''+c.id+'\',\'exclude\',\''+a+'\')">'+a+'</span>').join('')+'</div>';
    const catN=pools.filter(p=>p.poolType==='catalog').length;
    if(catN) html+='<div class="meta" style="margin-top:10px">\u203b \uc0c1\ud488 \uce74\ub2ec\ub85c\uadf8 '+catN+'\uac1c\ub97c \ubcf4\uc7a5\ubd84\uc11d\u00b7\uac00\uc785\uc124\uacc4\uc5d0 \uc790\ub3d9 \ucc38\uc870\ud569\ub2c8\ub2e4.</div>';
    if(pinnedCount()>0) html+='<div class="meta" style="margin-top:4px;color:var(--accent)">\u2713 \ucc38\uc870\ud480\uc5d0\uc11c \uc120\ud0dd(\uccb4\ud06c)\ud55c '+pinnedCount()+'\uac1c \ud56d\ubaa9\uc744 \ubd84\uc11d\uc5d0 \uac15\uc81c \ucc38\uc870\ud569\ub2c8\ub2e4. (\ud574\ub2f9 \uc885\ub958\ub294 \uc790\ub3d9\ub9e4\uce6d \ub300\uc2e0 \uc120\ud0dd\ud56d\ubaa9 \uc0ac\uc6a9)</div>';
    { const rel=refPoolAll(c);
      html+='<label class="f" style="margin-top:10px">참조 자료 ('+rel.length+') <span style="font-weight:400;color:var(--ink-mute)">· 최대 6개 표시 · 눌러서 전체</span></label>';
      if(rel.length){ html+=renderPoolCapped(rel); }
      else html+='<div class="meta">관련 참조자료가 없습니다. 아래에서 선택하거나 태그가 겹치는 자료를 쌓으세요.</div>';
    }
    html+='<button class="btn ghost sm wide" style="margin-top:6px" onclick="go(\'pools\')">참조풀에서 자료 선택/변경 →</button>';
    if(!hasText) html+='<div class="stage-note" style="margin-top:10px">\ubcf4\uc7a5 \ud14d\uc2a4\ud2b8\uac00 \uc544\uc9c1 \uc5c6\uc2b5\ub2c8\ub2e4. \uace0\uac1d \ud654\uba74\uc5d0\uc11c \ucc44\uc6b4 \ub4a4 \ubd84\uc11d\ud558\uc138\uc694.</div>';
    else if(hasAnalysis) html+='<div class="stage-note">\uc800\uc7a5\ub41c \ubcf4\uc7a5 \ubd84\uc11d\uc785\ub2c8\ub2e4 (\ucd5c\uadfc '+esc((alist[0].at||alist[0].date)||'')+' \u00b7 \ucd1d '+alist.length+'\ud68c). \ub2e4\uc2dc \uc2e4\ud589\ud558\uba74 \ube44\uc6a9\uc774 \ud55c \ubc88 \ub354 \ub4ed\ub2c8\ub2e4.</div>';
    else html+='<div class="stage-note">\ubcf4\uc7a5\uae09\ubd80\u00b7\ub0b4\ubcf4\uc7a5\uc790\uc0b0\u00b7\uae30\ud0c0 + \uc0c1\ub2f4\uc0ac\ub840\ub97c \ud568\uaed8 \ubd84\uc11d\ud574 \uc57d 2000\uc790\ub85c \uc815\ub9ac\ud569\ub2c8\ub2e4.</div>';
    if(hasAnalysis){
      html+='<button class="btn result-ready wide" style="margin-top:8px" onclick="openAnResult(\''+c.id+'\')">📄 보장분석 결과 보기 ›</button>';
    } else {
      html+='<button class="btn primary wide" style="margin-top:8px'+(hasText?'':';opacity:.5')+'" onclick="runAnalysis(\''+c.id+'\')">상담사례 매칭 보장분석</button>';
    }
    html+='<div id="an-result" style="margin-top:14px"></div>';
    html+='<div class="divider"></div><button class="btn primary wide" onclick="anStepGo(3)">\ub2e4\uc74c: \uac00\uc785\uc124\uacc4 \u203a</button>';
  } else {
    html+='<div class="row"><button class="btn ghost sm grow" onclick="anStepGo(1)">\u2039 \uc0c1\ub2f4\uc0ac\ub840(1\ub2e8\uacc4)</button><button class="btn ghost sm grow" onclick="anStepGo(2)">\u2039 \ubcf4\uc7a5\ubd84\uc11d(2\ub2e8\uacc4)</button></div>';
    html+='<label class="f" style="margin-top:12px">\uac00\uc785\uc124\uacc4\uc11c \uc774\ubbf8\uc9c0 <span style="font-weight:400;color:var(--ink-mute)">\u00b7 \uc5ec\ub7ec \uc7a5 \ub4f1\ub85d</span></label>';
    html+='<div class="thumbs" id="an-plan-thumbs"></div>';
    const canPlan=hasAnalysis && (c.planImages&&c.planImages.length);
    html+='<button class="btn '+(palist.length?'result-ready':'primary')+' wide" style="margin-top:10px'+(canPlan?'':';opacity:.5')+'" onclick="runPlanAnalysis(\''+c.id+'\')">'+(palist.length?'\u2713 \uac00\uc785\uc124\uacc4 \ubd84\uc11d \uc644\ub8cc \u00b7 \ub2e4\uc2dc \ubd84\uc11d':'\uac00\uc785\uc124\uacc4 \ubd84\uc11d \uc2e4\ud589')+'</button>';
    if(!hasAnalysis) html+='<div class="meta" style="margin-top:6px">\u203b \uba3c\uc800 \u2461 \ubcf4\uc7a5\ubd84\uc11d\uc744 \uc2e4\ud589\ud558\uc138\uc694.</div>';
    else if(!(c.planImages&&c.planImages.length)) html+='<div class="meta" style="margin-top:6px">\u203b \uac00\uc785\uc124\uacc4\uc11c \uc774\ubbf8\uc9c0\ub97c \uba3c\uc800 \ub4f1\ub85d\ud558\uc138\uc694.</div>';
        html+='<div id="an-plan-result" style="margin-top:14px"></div>';
    html+='<div id="plan-questions"></div>';
    html+='<button class="btn ghost wide" style="margin-top:8px" onclick="anStepGo(2)">\u2039 \uc774\uc804 \ud654\uba74 (\ubcf4\uc7a5\ubd84\uc11d)</button>';
    html+='<button class="btn primary wide" style="margin-top:10px" onclick="openAP(\''+c.id+'\')">▶ 고객대면상담</button>';
  }
  body.innerHTML=html;
  if(anStep===3) renderAnPlanThumbs(c);
  if(anStep===3 && palist.length) renderPlanWithHistory(c, 0);
}
/* ---------- 가입설계서 이미지 (고객별) ---------- */
async function renderAnPlanThumbs(c){
  const wrap=document.getElementById('an-plan-thumbs'); if(!wrap) return; wrap.innerHTML='';
  for(const ref of (c.planImages||[])){
    const rec=await idbGet('images',ref);
    const d=document.createElement('div'); d.className='thumb';
    if(rec&&rec.blob){ d.innerHTML='<img src="'+blobUrl(rec.blob)+'" onclick="event.stopPropagation();openLightbox(this.src)"><span class="k">설계서</span><button class="del" onclick="removeAnPlanImage(\''+c.id+'\',\''+ref+'\')">×</button>'; }
    else d.innerHTML='<span class="k">없음</span>';
    wrap.appendChild(d);
  }
  const add=document.createElement('div'); add.className='add-thumb';
  add.innerHTML='<span style="font-size:22px">＋</span>파일 추가'; add.onclick=()=>pickAnPlanImage(c.id);
  wrap.appendChild(add);
  const cam=document.createElement('div'); cam.className='add-thumb';
  cam.innerHTML='<span style="font-size:22px">📷</span>카메라 촬영'; cam.onclick=()=>pickAnPlanCamera(c.id);
  wrap.appendChild(cam);
  enableDrop(wrap, f=>addAnPlanImageDirect(c.id,f));
}
async function removeAnPlanImage(id,ref){
  const c=customers.find(x=>x.id===id); if(!c) return;
  c.planImages=(c.planImages||[]).filter(x=>x!==ref); c.planText=''; c.planTextImgN=-1;
  await idbDel('images',ref); await idbPut('customers',c); renderAnalysis();
}
function pickAnPlanImage(id){
  const inp=document.getElementById('img-input'); inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addAnPlanImageDirect(id,f); } renderAnalysis();
  };
  inp.click();
}
function pickAnPlanCamera(id){
  const inp=document.getElementById('cam-input'); inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addAnPlanImageDirect(id,f); } renderAnalysis();
  };
  inp.click();
}
function addAnPlanImageDirect(id,file){
  if(isPdfFile(file)){ const c=customers.find(x=>x.id===id); if(!c) return Promise.resolve(); c.planImages=c.planImages||[]; return addPdfInto(file, c.planImages, '설계서', ()=>renderAnPlanThumbs(c), c); }
  return new Promise(res=>{
    const c=customers.find(x=>x.id===id); if(!c){res();return;}
    const reader=new FileReader();
    reader.onerror=()=>{alert('사진을 읽지 못했습니다.'); res();};
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>{alert('이미지를 열 수 없습니다. HEIC 등은 JPG로 저장해 올려주세요.'); res();};
      img.onload=()=>{
        try{
          const MAX=1500; let w=img.width,h=img.height;
          if(Math.max(w,h)>MAX){const r=MAX/Math.max(w,h); w=Math.round(w*r); h=Math.round(h*r);}
          const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
          cv.getContext('2d').drawImage(img,0,0,w,h);
          cv.toBlob(async(blob)=>{
            const rid=uid();
            await idbPut('images',{id:rid,kind:'설계서',blob,created:today()});
            c.planImages=c.planImages||[]; c.planImages.push(rid);
            c.planText=''; c.planTextImgN=-1;
            await idbPut('customers',c); await renderAnPlanThumbs(c); res();
          },'image/jpeg',0.72);
        }catch(err){ alert('이미지 처리 오류: '+(err&&err.message?err.message:err)); res(); }
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function renderResultWithHistory(c, idx){
  anResultCustId=c.id;
  const list=(c.analyses&&c.analyses.length)?c.analyses:(c.analysis?[{date:c.analysisDate,data:c.analysis}]:[]);
  const entry=list[idx]; if(!entry) return;
  lastAnalysis=entry.data;
  renderAnalysisResult(entry.data, entry.at||entry.date);
  let hh='<label class="f">보장분석 기록 ('+list.length+')</label>';
  const cards=list.map((e,i)=>{
    const active=i===idx;
    const sm=oneLine((e.data&&e.data.summary)||'');
    return '<div class="card" style="padding:9px 11px;'+(active?'border-color:var(--accent);':'')+'"><div class="row" style="align-items:center">'
      +'<div style="flex:1;min-width:0" onclick="showHistoryEntry(\''+c.id+'\','+i+')"><div style="font-size:12.5px;font-weight:600">'+esc(e.at||e.date||'')+(active?' · 보는 중':'')+'</div><div class="meta" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(sm)+'</div></div>'
      +'<button class="btn ghost sm" style="margin-left:8px" onclick="showHistoryEntry(\''+c.id+'\','+i+')">보기</button>'
      +'<button class="btn danger sm" style="margin-left:6px" onclick="delAnalysisEntry(\''+c.id+'\','+i+')">삭제</button></div></div>';
  });
  hh+=histBlock(cards,'coverhist');
  document.getElementById('anresult-body').insertAdjacentHTML('beforeend', hh);
}
function showHistoryEntry(custId, idx){
  const c=customers.find(x=>x.id===custId); if(!c) return;
  renderResultWithHistory(c, idx);
}
function openAnResult(custId){
  const c=customers.find(x=>x.id===custId); if(!c) return;
  const redo=document.getElementById('anr-redo'); if(redo) redo.onclick=()=>{ closeSheet('ov-anresult'); runAnalysis(custId); };
  const plan=document.getElementById('anr-plan'); if(plan) plan.onclick=()=>{ closeSheet('ov-anresult'); anStepGo(3); };
  openSheet('ov-anresult');
  renderResultWithHistory(c, 0);
}
async function delAnalysisEntry(custId, i){
  const c=customers.find(x=>x.id===custId); if(!c) return;
  if(!confirm('이 보장분석 기록을 삭제할까요?')) return;
  c.analyses=c.analyses||[]; c.analyses.splice(i,1);
  if(c.analyses[0]){ c.analysis=c.analyses[0].data; c.analysisDate=c.analyses[0].date; } else { c.analysis=null; c.analysisDate=null; }
  await idbPut('customers',c); customers=await idbAll('customers'); renderAnalysis();
}
async function runAnalysis(id, confirmations){
  const c=customers.find(x=>x.id===id); if(!c) return;
  if(!(c.coverageText||'').trim()){alert('보장 텍스트가 비어 있어요. 고객 화면에서 OCR 또는 직접 입력으로 채운 뒤 분석하세요.'); return;}
  if(!cloudOn){alert('AI 보장 분석은 로그인 후 사용할 수 있습니다.'); return;}
  const box=document.getElementById('an-result'); box.innerHTML='<div class="stage-note">보장 분석 중입니다… 잠시만 기다려 주세요.</div>';
  const want=[...(c.product||[]),...(c.situation||[])];
  const casePin=pools.filter(p=>p.poolType==='case'&&p.pinned);
  const cases=(casePin.length
    ? casePin.map(p=>({overlap:poolMatchScore(p,c),title:p.title,result:p.result,body:(p.bodyFull||p.body)}))
    : pools.filter(p=>p.poolType==='case').map(p=>{
        const overlap=poolMatchScore(p,c);
        return {overlap,title:p.title,result:p.result,body:(p.bodyFull||p.body)};
      }).filter(m=>m.overlap>0).sort((a,b)=>b.overlap-a.overlap).slice(0,3));
  const episodesText=poolRefText(c,'episode',4);
  let catalogText=''; try{ catalogText=await getCatalogText(box); }catch(e){}
  const _pg=startProgress(p=>{ box.innerHTML='<div class="stage-note">보장 분석 중… '+p+'%</div>'; });
  try{
    const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pw:cloudPW, advisorId, advisorPw, customer:{name:c.name,age:c.age,region:c.region,products:c.product,situations:c.situation},coverageText:c.coverageText,cases,episodesText,catalogText,focusAreas:c.focusAreas||[],excludeAreas:c.excludeAreas||[],confirmations:confirmations||''})});
    const data=await res.json(); _pg.done();
    if(!res.ok){box.innerHTML='<div class="stage-note">분석 실패: '+esc(data.error||'알 수 없는 오류')+'</div>'; return;}
    c.analyses=c.analyses||[]; c.analyses.unshift({at:now(), date:today(), data});
    if(c.analyses.length>50) c.analyses=c.analyses.slice(0,50);
    c.analysis=data; c.analysisDate=today();
    await idbPut('customers',c);
    const lc=addUsage(data._usage,'보장 분석');
    lastAnalysis=data; renderAnalysis(); renderCostMeter(lc); openAnResult(c.id);
  }catch(err){
    try{_pg.done();}catch(e){}
    box.innerHTML='<div class="stage-note">분석 요청을 보내지 못했습니다. 배포된 주소에서 열었는지, 인터넷 연결을 확인하세요.<br><span class="meta">'+esc(err.message||'')+'</span></div>';
  }
}
/* ② 가입설계 분석 */
async function runPlanAnalysis(id, confirmations){
  const c=customers.find(x=>x.id===id); if(!c) return;
  const cov=(c.analyses&&c.analyses[0])?c.analyses[0].data:(c.analysis||null);
  if(!cov){alert('먼저 ② 보장 분석을 실행하세요.'); return;}
  if(!(c.planImages&&c.planImages.length)){alert('가입설계서 이미지를 먼저 등록하세요.'); return;}
  if(!cloudOn){alert('AI 가입설계 분석은 로그인 후 사용할 수 있습니다.'); return;}
  const box=document.getElementById('an-plan-result'); box.innerHTML='<div class="stage-note">가입설계 분석 준비 중…</div>';
  const pq=document.getElementById('plan-questions'); if(pq) pq.innerHTML='';
  // 가입설계서 사진 → base64 (AI 비전 직접 판독)
  const imgs=(c.planImages||[]).slice(0,12); const items=[];
  for(let i=0;i<imgs.length;i++){
    box.innerHTML='<div class="stage-note">설계서 사진 준비 중… '+(i+1)+'/'+imgs.length+'</div>';
    const rec=await idbGet('images',imgs[i]); if(!rec||!rec.blob) continue;
    let b64=''; try{ b64=await blobToScaledBase64(rec.blob,1500,0.72); }catch(e){}
    if(b64) items.push({media_type:'image/jpeg', data:b64});
  }
  if(!items.length){ box.innerHTML='<div class="stage-note">설계서 사진을 읽지 못했습니다. 다시 등록해 주세요.</div>'; return; }
  const episodesText=poolRefText(c,'episode',4);
  const casesText=poolRefText(c,'case',3);
  let catalogText=''; try{ catalogText=await getCatalogText(box); }catch(e){}
  const _pg=startProgress(p=>{ box.innerHTML='<div class="stage-note">AI가 설계서를 직접 판독·분석 중… '+p+'%</div>'; });
  try{
    const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pw:cloudPW, advisorId, advisorPw, mode:'plan', customer:{name:c.name,age:c.age,region:c.region}, coverageText:c.coverageText||'', coverageAnalysis:{summary:cov.summary||'',detail:cov.detail||''}, planImages:items, confirmations:confirmations||'', episodesText, casesText, catalogText, focusAreas:c.focusAreas||[], excludeAreas:c.excludeAreas||[]})});
    const data=await res.json(); _pg.done();
    if(!res.ok){box.innerHTML='<div class="stage-note">가입설계 분석 실패: '+esc(data.error||'알 수 없는 오류')+'</div>'; return;}
    c.planAnalyses=c.planAnalyses||[]; c.planAnalyses.unshift({at:now(), date:today(), data});
    if(c.planAnalyses.length>50) c.planAnalyses=c.planAnalyses.slice(0,50);
    await idbPut('customers',c);
    const lc=addUsage(data._usage,'가입설계 분석(비전)');
    renderAnalysis(); renderCostMeter(lc);
    renderPlanQuestions(c.id, data.questions||[]);
  }catch(err){
    try{_pg.done();}catch(e){}
    box.innerHTML='<div class="stage-note">가입설계 분석 요청 실패: <span class="meta">'+esc(err.message||'')+'</span></div>';
  }
}
async function getCustPlanText(c, box){
  const imgs=c.planImages||[];
  if(c.planText && c.planTextImgN===imgs.length) return c.planText;
  if(!imgs.length) return '';
  await ensureTesseract();
  const parts=[];
  for(let i=0;i<imgs.length;i++){
    const rec=await idbGet('images',imgs[i]); if(!rec||!rec.blob) continue;
    const url=URL.createObjectURL(rec.blob);
    const r=await Tesseract.recognize(url,'kor+eng',{logger:m=>{
      if(box){ const pct=Math.min(99,Math.round(((i+(m.progress||0))/imgs.length)*100));
        box.innerHTML='<div class="stage-note">'+(m.status==='recognizing text'?'설계서 글자 추출 중… ':'설계서 준비 중… ')+pct+'% ('+(i+1)+'/'+imgs.length+')</div>'; }
    }});
    URL.revokeObjectURL(url);
    const t=(r.data.text||'').trim(); if(t) parts.push(t);
  }
  const ocr=parts.join('\n\n').trim();
  c.planText=ocr; c.planTextImgN=imgs.length; try{ await idbPut('customers',c); }catch(e){}
  return ocr;
}
/* 상품카달로그 참조 텍스트 (이미지 OCR, 풀에 캐시) */
async function getCatalogText(box){
  const pin=pools.filter(p=>p.poolType==='catalog' && p.pinned);
  const cats=pin.length?pin:pools.filter(p=>p.poolType==='catalog');
  if(!cats.length) return '';
  const parts=[];
  for(const cat of cats){
    const ctxt=(cat.bodyFull||cat.body)||''; let t='['+(cat.title||'카달로그')+']'; if(ctxt) t+='\n'+ctxt;
    parts.push(t);
  }
  return parts.join('\n\n---\n\n').slice(0,6000);
}
/* 에피소드 참조 텍스트 (고객 태그와 매칭 상위 4) */
function poolMatchScore(p, c){
  const want=[...(c.product||[]),...(c.situation||[]),(c.age||'')].filter(Boolean);
  const tags=[...(p.free||[]),...(p.product||[]),...(p.situation||[]),...(p.age||[])];
  let n=0; tags.forEach(t=>{ t=String(t); if(want.some(w=>w===t||w.includes(t)||t.includes(w))) n++; });
  return n;
}
function getPoolMatchText(c, type, limit){
  const items=pools.filter(p=>p.poolType===type).map(p=>({p,s:poolMatchScore(p,c)})).sort((a,b)=>b.s-a.s).slice(0,limit||4);
  if(!items.length) return '';
  return items.map(m=>'['+(m.p.title||'')+'] '+(((m.p.bodyFull||m.p.body)||'').slice(0,700))).join('\n\n');
}
/* 체크(pinned) 우선 참조: 해당 타입에 선택된 항목이 있으면 그것만 강제 사용, 없으면 자동 매칭 */
function poolRefText(c, type, limit){
  const pin=pools.filter(p=>p.poolType===type && p.pinned);
  if(pin.length) return pin.slice(0,limit||6).map(p=>'['+(p.title||'')+'] '+(((p.bodyFull||p.body)||'').slice(0,700))).join('\n\n');
  return getPoolMatchText(c,type,limit);
}
function getEpisodesText(c){
  const want=[...(c.product||[]),...(c.situation||[])];
  const eps=pools.filter(p=>p.poolType==='episode').map(p=>{
    const overlap=poolMatchScore(p,c);
    return {p,overlap};
  }).sort((a,b)=>b.overlap-a.overlap).slice(0,4);
  if(!eps.length) return '';
  return eps.map(m=>'['+(m.p.title||'에피소드')+'] '+(((m.p.bodyFull||m.p.body)||'').slice(0,700))).join('\n\n');
}
function matchedEpisodes(c){
  const want=[...(c.product||[]),...(c.situation||[])];
  return pools.filter(p=>p.poolType==='episode').map(p=>{
    const overlap=poolMatchScore(p,c);
    return {p,overlap};
  }).sort((a,b)=>b.overlap-a.overlap).slice(0,6);
}
/* 특정 타입에서 '선택(pinned) + 자동선정(태그겹침>0)' 전체를 반환 (선택 먼저, 그다음 점수순) */
function relevantPool(c, type){
  const all=pools.filter(p=>p.poolType===type);
  const scored=all.map(p=>({p, s: p.pinned?99999:poolMatchScore(p,c)}));
  scored.sort((a,b)=>b.s-a.s);
  return scored.map(m=>({p:m.p, tag: m.p.pinned?'☑ 선택':(m.s>0?'자동':'기타')}));
}
/* 참조자료 6개 초과 시 '더 보기' → 전체를 서브페이지로 */
function refPoolAll(c){ return relevantPool(c,'case').concat(relevantPool(c,'episode')).concat(relevantPool(c,'catalog')); }
function showAllRefPool(){
  const id=document.getElementById('an-cust').value; const c=customers.find(x=>x.id===id); if(!c) return;
  const all=refPoolAll(c);
  let h='<div class="meta" style="margin-bottom:10px">전체 '+all.length+'개 · 눌러서 전체 내용</div>';
  all.forEach(m=>{ h+=poolTwoLineBtn(m.p, m.tag); });
  openSubPage('참조 자료 전체 ('+all.length+')', h);
}
/* 6개까지 표시 + 나머지는 더보기 버튼 (items=[{p,tag}]) */
function renderPoolCapped(items){
  let h=''; items.slice(0,6).forEach(m=>{ h+=poolTwoLineBtn(m.p, m.tag); });
  if(items.length>6) h+='<button class="btn ghost sm wide" style="margin-top:6px" onclick="showAllRefPool()">＋ 나머지 '+(items.length-6)+'개 더 보기</button>';
  return h;
}
/* 두줄 버튼 (제목 + 내용 간단요약) — 누르면 전체창 */
function poolTwoLineBtn(p, tag){
  const brief=oneLine(p.summaryFull||p.body||p.bodyFull||'', 42);
  const rc=(p.poolType==='case'&&p.result)?RESULTS.find(r=>r[0]===p.result):null;
  return '<div onclick="showPoolItemFull(\''+p.id+'\')" style="cursor:pointer;border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin-bottom:7px;background:#fff">'
    +'<div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      +(tag?'<span style="font-size:11px;color:var(--accent);font-weight:600;margin-right:5px">'+tag+'</span>':'')
      +esc(p.title||'(제목 없음)')
      +(rc?' <span class="badge b-'+rc[1]+'" style="font-size:10px">'+p.result+'</span>':'')+'</div>'
    +'<div class="meta" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(brief||'(내용 없음)')+' ›</div></div>';
}
function showPoolItemFull(id){
  const p=pools.find(x=>x.id===id); if(!p){ openSubPage('전체 보기','<div class="stage-note">항목을 찾을 수 없습니다.</div>'); return; }
  const tags=[...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].map(t=>'<span class="pt">'+esc(t)+'</span>').join('');
  let h='';
  if(tags) h+='<div class="pill-tags" style="margin-bottom:10px">'+tags+'</div>';
  if(p.summaryFull) h+='<div style="font-weight:700;margin-bottom:4px">간단 요약</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--ink-soft);margin-bottom:14px">'+esc(p.summaryFull)+'</div>';
  h+='<div style="font-weight:700;margin-bottom:4px">전체 내용</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.75;color:var(--ink)">'+esc(p.bodyFull||p.body||'(내용 없음)')+'</div>';
  openSubPage(p.title||'전체 보기', h);
}
function showEpisodes(){
  const id=document.getElementById('an-cust').value; const c=customers.find(x=>x.id===id);
  if(!c){ openSubPage('참고 에피소드','<div class="stage-note">고객을 먼저 선택하세요.</div>'); return; }
  const eps=relevantPool(c,'episode').slice(0,3);
  if(!eps.length){ openSubPage('참고 에피소드','<div class="stage-note">관련 에피소드가 없습니다. 참조풀에서 선택(☑)하거나 태그가 겹치는 에피소드를 추가하세요.</div>'); return; }
  const pinN=eps.filter(e=>e.tag==='☑ 선택').length;
  let h='<div class="meta" style="margin-bottom:10px">가입설계 상담용 · 최대 3개 (선택 '+pinN+' + 자동 '+(eps.length-pinN)+') · 눌러서 전체 내용</div>';
  eps.forEach(e=>{ h+=poolTwoLineBtn(e.p, e.tag); });
  openSubPage('참고 에피소드 ('+eps.length+')', h);
}
function showAnalysisHelp(){
  const h=''
    +'<div class="card"><div class="name" style="font-size:15px">① 고객 상세 · "AI로 정리·분석"</div>'
    +'<div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-top:6px">고객 화면에 올린 보장 자료 사진을 기기에서 글자 인식(OCR)해, <b>[보장급부] / [내보장자산]</b>을 엄격히 구분해 정리하고, 마지막에 <b>[종합분석]</b> 요점을 뽑습니다. 결과 = "보장 텍스트"로, ②·③의 입력이 됩니다.</div></div>'
    +'<div class="card"><div class="name" style="font-size:15px">② 매니저 상담 · "상담사례 매칭 보장분석"</div>'
    +'<div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-top:6px">보장 텍스트 + <b>상담사례 풀</b> + <b>상품카달로그 풀</b> + 고객별 <b>집중/제외 담보</b>를 함께 분석합니다. 결과: 요약·영역별 판정·보강 우선순위·상세 보장분석(핵심 담보 3000만원↑ <b>갱신형 여부</b> 포함). 각 버튼을 누르면 서브페이지로 열립니다.</div></div>'
    +'<div class="card"><div class="name" style="font-size:15px">③ 매니저 상담 · "가입설계 분석"</div>'
    +'<div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-top:6px">보장 텍스트 + ②의 보장분석 결과 + <b>가입설계서 이미지</b> + <b>에피소드 풀</b> + 상품카달로그를 엮어, 이 설계가 부족 보장을 얼마나 채우는지 봅니다. 결과: <b>잔여 부족율</b>, 보완·추가 제안, 핵심 차이(전/후), 가입설계 이후 보완, 가입설계 분석. 완료 후 <b>참고 에피소드</b> 버튼으로 상담용 에피소드를 볼 수 있습니다.</div></div>'
    +'<div class="meta" style="margin-top:4px">※ 모든 분석은 사진 대신 OCR 텍스트만 사용합니다. 부족율·갱신형은 참고치이니 원본과 대조하세요.</div>';
  openSubPage('세 가지 분석 도움말', h);
}
/* ---------- 분석결과 JSON 2차 복구 (백엔드가 원문을 넘겼거나 옛 기록이 깨진 경우) ---------- */
function _feTryParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }
function _feRepair(s){
  let out='',inStr=false,esc=false;
  for(let i=0;i<s.length;i++){const ch=s[i];
    if(inStr){ if(esc){out+=ch;esc=false;continue;} if(ch==='\\'){out+=ch;esc=true;continue;} if(ch==='"'){inStr=false;out+=ch;continue;}
      if(ch==='\n'){out+='\\n';continue;} if(ch==='\r'){out+='\\r';continue;} if(ch==='\t'){out+='\\t';continue;} out+=ch; continue; }
    if(ch==='"'){inStr=true;out+=ch;continue;} out+=ch;
  }
  return out.replace(/,\s*([}\]])/g,'$1');
}
/* 잘린(truncation) JSON 복구: 미완성 문자열·괄호를 닫아 유효 JSON으로 */
function _feClose(s){
  let inStr=false,esc=false; const st=[];
  for(let i=0;i<s.length;i++){ const ch=s[i];
    if(inStr){ if(esc){esc=false;} else if(ch==='\\'){esc=true;} else if(ch==='"'){inStr=false;} continue; }
    if(ch==='"'){inStr=true;} else if(ch==='{'||ch==='['){st.push(ch);} else if(ch==='}'||ch===']'){st.pop();}
  }
  let out=s;
  if(inStr) out+='"';
  out=out.replace(/[,:]\s*$/,'');
  for(let i=st.length-1;i>=0;i--) out += (st[i]==='{'?'}':']');
  return out;
}
function feParseJson(text){
  if(!text) return null;
  let t=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
  let p=_feTryParse(t); if(p) return p;
  const a=t.indexOf('{'),b=t.lastIndexOf('}');
  if(a>=0&&b>a){ const core=t.slice(a,b+1); p=_feTryParse(core)||_feTryParse(_feRepair(core)); if(p) return p; }
  // 잘림 복구: 여는 중괄호부터 끝까지 잡아 닫아준다
  if(a>=0){ const tail=t.slice(a); p=_feTryParse(_feClose(_feRepair(tail))); if(p) return p; }
  return null;
}
/* 원문이 detail/planDetail에 문자열로 박혀 있거나 _raw가 있으면 재파싱해 구조를 복원 */
function rescueResult(d){
  if(!d||typeof d!=='object') return d;
  const looksRaw=(v)=>typeof v==='string' && /["']?(summary|areas|priorities|planDetail|shortfallRate)["']?\s*:/.test(v);
  let src=null;
  if(typeof d._raw==='string') src=d._raw;
  else if(looksRaw(d.detail)) src=d.detail;
  else if(Array.isArray(d.detail)&&d.detail.length===1&&looksRaw(d.detail[0])) src=d.detail[0];
  else if(looksRaw(d.planDetail)) src=d.planDetail;
  else if(Array.isArray(d.planDetail)&&d.planDetail.length===1&&looksRaw(d.planDetail[0])) src=d.planDetail[0];
  if(!src) return d;
  const re=feParseJson(src);
  if(re&&typeof re==='object'){ re._raw=src; return re; }
  return d;
}
function showRaw(which){
  const d=(which==='plan'?lastPlan:lastAnalysis)||{};
  const raw=d._raw||'';
  openSubPage('원문 보기', raw?('<pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;color:var(--ink-soft)">'+esc(raw)+'</pre>'):'<div class="stage-note">보관된 원문이 없습니다.</div>');
}
function renderAnalysisResult(d, date){
  d=rescueResult(d);
  const box=document.getElementById('anresult-body'); if(!box) return; lastAnalysis=d; let h='';
  if(date) h+='<div class="meta" style="margin:0 2px 8px">분석일 '+esc(date)+'</div>';
  if(d.summary) h+='<div class="card"><div style="font-size:14px;line-height:1.7;color:var(--ink-soft)">'+bulletize(d.summary)+'</div></div>';
  h+='<div class="btn-grid">';
  if(d.areas&&d.areas.length) h+='<button class="btn ghost" onclick="showAreas()">영역별 판정</button>';
  if(d.priorities&&d.priorities.length) h+='<button class="btn ghost" onclick="showPriorities()">보강 우선순위</button>';
  if(hasLines(d.detail)) h+='<button class="btn ghost" onclick="showDetail()">상세 보장분석</button>';
  if(d._raw) h+='<button class="btn ghost" onclick="showRaw(\'cover\')">원문 보기</button>';
  h+='<button class="btn primary" onclick="ttsResult()">▶ 음원으로 듣기</button>';
  h+='</div>';
  if(d.questions&&d.questions.length) h+=qPanel('확인', d.questions, 'resubmitCoverage()');
  box.innerHTML=h;
}
let anResultCustId=null;
function resubmitCoverage(){
  const box=document.getElementById('anresult-body'); const lines=collectAnswers(box);
  if(!lines.length){ alert('확인할 답변을 하나 이상 입력하세요.'); return; }
  if(anResultCustId){ closeSheet('ov-anresult'); runAnalysis(anResultCustId, lines.join('\n')); }
}
/* AI 분석 신뢰도(확정/추정/자료부족) 배지 — certainty 필드가 없는 옛 분석 결과는 배지 없이 그냥 넘어감(하위호환) */
function certBadge(certainty){
  if(!certainty) return '';
  const map={ '확정':'sure', '추정':'guess', '자료부족':'lack' };
  const cls=map[certainty]; if(!cls) return '';
  return '<span class="badge small b-cert-'+cls+'" style="align-self:flex-start">'+esc(certainty)+'</span>';
}
function showAreas(){
  const d=lastAnalysis||{}; let h='';
  (d.areas||[]).forEach((a,i,arr)=>{
    const lv=a.level||''; const cls=lv==='충분'?'ok':(lv==='보통'?'hold':'no'); const col=lv==='충분'?'var(--ok)':(lv==='보통'?'var(--hold)':'var(--no)');
    h+='<div style="display:flex;gap:10px;padding:12px 4px;border-left:3px solid '+col+';padding-left:12px;'+(i<arr.length-1?'border-bottom:1px solid var(--line);':'')+'">'
      +'<div style="flex:1"><div style="font-size:15px">'+esc(a.name||'')+'</div><div class="meta" style="margin-top:3px">'+hlText(esc(a.reason||''))+'</div></div>'
      +'<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'
      +'<span class="badge b-'+cls+'">'+esc(lv)+'</span>'+certBadge(a.certainty)
      +'</div></div>';
  });
  openSubPage('영역별 판정', h||'<div class="stage-note">내용이 없습니다.</div>');
}
function showPriorities(){
  const d=lastAnalysis||{}; let h='';
  (d.priorities||[]).forEach((p,i,arr)=>{h+='<div class="row" style="padding:10px 4px;'+(i<arr.length-1?'border-bottom:1px solid var(--line);':'')+'"><span class="badge b-seg" style="min-width:24px;text-align:center">'+(i+1)+'</span><span style="font-size:15px;margin-left:10px">'+hlText(esc(p))+'</span></div>';});
  openSubPage('보강 우선순위', h||'<div class="stage-note">내용이 없습니다.</div>');
}
function showDetail(){
  const d=lastAnalysis||{};
  openSubPage('상세 보장분석', linesBlock(d.detail));
}
function hasLines(v){ return Array.isArray(v) ? v.length>0 : !!String(v||'').trim(); }
function linesBlock(v){
  const arr=Array.isArray(v)?v:String(v||'').split('\n');
  let h='<div style="font-size:14px;line-height:1.75;color:var(--ink-soft)">';
  arr.forEach(x=>{ const s=String(x==null?'':x).trim(); if(!s) return;
    if(/^\[.*\]$/.test(s)) h+='<div style="font-weight:700;color:var(--ink);margin:10px 0 3px">'+esc(s)+'</div>';
    else h+='<div style="padding:1px 0 1px 2px">· '+hlText(esc(s.replace(/^[-•]\s*/,'')))+'</div>';
  });
  return h+'</div>';
}
function openSubPage(title, html){
  document.getElementById('subpage-title').textContent=title;
  document.getElementById('subpage-body').innerHTML=html;
  openSheet('ov-subpage');
  const sh=document.querySelector('#ov-subpage .sheet'); if(sh) sh.scrollTop=0;
}

