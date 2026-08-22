/* ===================== AP · 고객 대면 화면 =====================
   2026-08-14: 1~5단계 화면으로 재구성.
   1단계 = AI 대면 멘트 만들기(예전엔 마지막 페이지에 있던 걸 맨 앞으로 옮김).
   2~5단계 = 아이스브레이크·보장분석·에피소드·가입설계 — 각 단계는 설명 → "선택한 자료 보기" 버튼(누르면 팝업으로 내용 확인) → 생성된 멘트 → 다음, 형태로 통일. */
let apCustId=null, apStage=1;
const AP_STAGES=[
  {n:2,key:'ice', icon:'🤝', t:'아이스<br>브레이크', frame:'먼저 편안하게. 웃으며 라포(친밀감)를 만드세요. 급할 필요 없습니다 — 오늘의 첫 3분이 오늘 전체를 좌우합니다.'},
  {n:3,key:'cov', icon:'🛡️', t:'보장<br>분석', frame:'고객의 현재 보장을 차분히 짚어드리세요. 팔지 말고, 사실만 보여주세요. 사실이 신뢰를 만듭니다.'},
  {n:4,key:'epi', icon:'💬', t:'에피소드<br>·정보', frame:'공감 이야기로 마음을 여세요. 설득이 아니라 공감입니다. 고객이 스스로 필요를 느끼게 하세요.'},
  {n:5,key:'plan',icon:'📝', t:'가입<br>설계', frame:'자연스럽게 제안으로. 당신은 파는 게 아니라, 고객에게 꼭 필요한 것을 권하는 것입니다. 당당하게.'}
];
/* 하단 탭 "상담"의 화면 진입점. currentCustId가 있으면 바로 그 고객으로, 없으면 고객 선택 드롭다운을 보여준다(분석 탭과 같은 방식). */
function fillApSelect(){
  header('AP · 고객 대면', '멘트 만들기 → 아이스브레이크 → 보장분석 → 에피소드 → 가입설계, 순서대로');
  const sel=document.getElementById('ap-custsel'); if(sel){
    sel.innerHTML='<option value="">— 고객 선택 —</option>';
    customers.forEach(c=>{const o=document.createElement('option'); o.value=c.id; o.textContent=c.name+(c.region?' · '+c.region:''); sel.appendChild(o);});
  }
  const pk=document.getElementById('ap-picker'); if(pk) pk.style.display=currentCustId?'none':'';
  if(currentCustId && customers.some(c=>c.id===currentCustId)){
    if(sel) sel.value=currentCustId;
    ensurePinsForCustomer(currentCustId);
    if(apCustId!==currentCustId){ apCustId=currentCustId; apStage=1; }
    renderAP();
  } else {
    apCustId=null;
    const body=document.getElementById('ap-body'); if(body) body.innerHTML='<div class="empty">상담할 고객을 선택하세요.</div>';
  }
}
function onApCustSel(){
  currentCustId=document.getElementById('ap-custsel').value||null;
  const pk=document.getElementById('ap-picker'); if(pk) pk.style.display=currentCustId?'none':'';
  if(currentCustId){ ensurePinsForCustomer(currentCustId); apCustId=currentCustId; apStage=1; renderAP(); }
  else { apCustId=null; const body=document.getElementById('ap-body'); if(body) body.innerHTML='<div class="empty">상담할 고객을 선택하세요.</div>'; }
}
/* 고객 목록·가입설계 화면의 "AP 열기" 버튼에서 특정 고객으로 바로 진입 */
function openAP(id){
  const c=customers.find(x=>x.id===id); if(!c){ alert('고객을 찾을 수 없습니다.'); return; }
  currentCustId=id; ensurePinsForCustomer(id);
  apCustId=id; apStage=1;
  go('ap');
}
function apGo(n){ apStage=n; renderAP(); window.scrollTo(0,0); }
function showApMaterial(key){
  const c=customers.find(x=>x.id===apCustId); if(!c) return;
  const stageName={ice:'선택한 아이스브레이크 자료',cov:'보장분석 결과',epi:'선택한 에피소드 자료',plan:'가입설계 결과'};
  let html='';
  if(key==='ice') html=apPoolBlock(c,'icebreak');
  else if(key==='epi') html=apPoolBlock(c,'episode');
  else if(key==='cov') html=apResultBlock((c.analyses&&c.analyses[0])?c.analyses[0].data:null);
  else if(key==='plan') html=apResultBlock((c.planAnalyses&&c.planAnalyses[0])?c.planAnalyses[0].data:null);
  openSubPage(stageName[key]||'자료', html||'<div class="stage-note">내용이 없습니다.</div>');
}
function apResultBlock(d){
  if(!d) return '<div class="stage-note">저장된 결과가 없습니다. 매니저 상담에서 먼저 분석을 실행하세요.</div>';
  d=rescueResult(d); let h='';
  if(typeof d.shortfallRate!=='undefined' && d.shortfallRate!==null){ const rate=Math.max(0,Math.min(100,Math.round(Number(d.shortfallRate)||0))); h+='<div class="meta" style="margin:0 2px 8px">잔여 부족율 '+rate+'%</div>'; }
  if(d.summary) h+='<div class="ap-sum">'+esc(d.summary)+'</div>';
  if(d.areas&&d.areas.length){ h+='<div class="ap-h">영역별 판정</div>'; d.areas.forEach(a=>{ h+='<div class="ap-li"><b>'+esc(a.name||'')+'</b> — '+esc(a.level||'')+(a.reason?(' · '+esc(a.reason)):'')+' '+certBadge(a.certainty)+'</div>'; }); }
  if(d.priorities&&d.priorities.length){ h+='<div class="ap-h">보강 우선순위</div>'; d.priorities.forEach((p,i)=>{ h+='<div class="ap-li">'+(i+1)+'. '+esc(p)+'</div>'; }); }
  if(hasLines(d.detail)) h+='<div class="ap-h">상세</div>'+linesBlock(d.detail);
  if(hasLines(d.planDetail)) h+='<div class="ap-h">상세</div>'+linesBlock(d.planDetail);
  return h||'<div class="stage-note">내용이 없습니다.</div>';
}
function apPoolBlock(c, type){
  const items=relevantPool(c,type);
  if(!items.length) return '<div class="stage-note">등록된 '+(type==='icebreak'?'아이스브레이크':'에피소드')+' 자료가 없어요. 참조풀에 추가하면 여기에 뜹니다.</div>';
  let h=''; items.slice(0,6).forEach(m=>{ const p=m.p; const body=(p.bodyFull||p.body||''); h+='<div class="ap-card"><div class="ap-card-t">'+(m.tag==='☑ 선택'?'☑ ':'')+esc(p.title||'')+'</div>'+(body?('<div class="ap-card-b">'+esc(body.length>500?body.slice(0,500)+'…':body)+'</div>'):'')+'</div>'; });
  if(items.length>6) h+='<div class="meta">외 '+(items.length-6)+'개 더 (참조풀에서 확인)</div>';
  return h;
}
function apMaterialText(c, stageKey){
  if(stageKey==='ice'){ return relevantPool(c,'icebreak').slice(0,6).map(m=>'- '+(m.p.title||'')+': '+(m.p.bodyFull||m.p.body||'')).join('\n'); }
  if(stageKey==='epi'){ return relevantPool(c,'episode').slice(0,6).map(m=>'- '+(m.p.title||'')+': '+(m.p.bodyFull||m.p.body||'')).join('\n'); }
  if(stageKey==='cov'){ const e=(c.analyses&&c.analyses[0]); const d=e&&rescueResult(e.data); if(!d) return ''; return [d.summary||'', (d.areas||[]).map(a=>a.name+' '+a.level+' '+(a.reason||'')).join('; '), (d.priorities||[]).join('; '), Array.isArray(d.detail)?d.detail.join('\n'):(d.detail||'')].filter(Boolean).join('\n'); }
  if(stageKey==='plan'){ const e=(c.planAnalyses&&c.planAnalyses[0]); const d=e&&rescueResult(e.data); if(!d) return ''; return [d.summary||'', (typeof d.shortfallRate!=='undefined'?('잔여 부족율 '+d.shortfallRate+'%'):''), Array.isArray(d.planDetail)?d.planDetail.join('\n'):(d.planDetail||'')].filter(Boolean).join('\n'); }
  return '';
}
function renderAP(){
  const c=customers.find(x=>x.id===apCustId); const box=document.getElementById('ap-body'); if(!c||!box) return;
  let h='';
  // 히어로(용기)
  h+='<div class="ap-hero"><div class="ah-t">🌟 '+esc(c.name)+' 님과의 상담, 준비됐습니다</div><div class="ah-s">당신은 이 고객에게 필요한 사람입니다. 순서대로 편안하게 — ① 멘트 만들기 → ② 아이스브레이크 → ③ 보장분석 → ④ 에피소드 → ⑤ 가입설계.</div></div>';
  // 1~5단계 탭
  h+='<div class="ap-tabs">';
  h+='<div class="ap-tab'+(apStage===1?' on':'')+'" onclick="apGo(1)"><span class="at-i">🤖</span>①멘트<br>만들기</div>';
  AP_STAGES.forEach(s=>{ h+='<div class="ap-tab'+(s.n===apStage?' on':'')+'" onclick="apGo('+s.n+')"><span class="at-i">'+s.icon+'</span>'+(s.n)+'.'+s.t+'</div>'; });
  h+='</div>';

  if(apStage===1){
    // 1단계: AI 대면 멘트 만들기 — 필요한 단계를 체크해 한 번에 생성
    h+='<div class="ap-frame"><span class="af-ic">🤖</span><div><b>1단계 · AI 대면 멘트 만들기</b><br>이번 상담에서 참고할 멘트를 미리 만들어두세요. 만든 멘트는 각 단계 화면에서 볼 수 있습니다.</div></div>';
    h+='<div class="ap-gen-box">';
    h+='<div class="meta" style="margin-bottom:8px">멘트가 필요한 단계를 체크한 뒤 생성하세요.</div>';
    [['ice','아이스브레이크'],['cov','보장분석'],['epi','에피소드'],['plan','가입설계']].forEach(([k,label])=>{
      const has=(c.ap&&c.ap.scripts&&c.ap.scripts[k])?' <span style="color:var(--ok);font-weight:700">✓ 생성됨</span>':'';
      h+='<label class="ap-ck"><input type="checkbox" class="ap-genck" value="'+k+'"'+(has?'':' checked')+'> '+label+has+'</label>';
    });
    h+='<button class="btn btn-ai wide" style="margin-top:10px" id="ap-genbtn" onclick="genApScripts()">🤖 체크된 단계 상담 멘트 생성</button>';
    h+='</div>';
    h+='<div id="ap-prog" class="stage-note" style="margin-top:8px;display:none"></div>';
    h+='<div class="divider"></div><div class="row"><button class="btn primary grow" onclick="apGo(2)">다음 ›</button></div>';
  } else {
    const st=AP_STAGES.find(s=>s.n===apStage);
    // 프레이밍
    h+='<div class="ap-frame"><span class="af-ic">'+st.icon+'</span><div><b>'+st.n+'단계 · '+st.t.replace('<br>','')+'</b><br>'+st.frame+'</div></div>';
    // 자료는 버튼으로만 — 누르면 팝업으로 확인
    h+='<button class="btn ghost wide" onclick="showApMaterial(\''+st.key+'\')">📎 선택한 '+st.t.replace('<br>','')+' 자료 보기</button>';
    // AI 대면 멘트 (1단계에서 생성한 것을 여기서 보여줌)
    const script=(c.ap&&c.ap.scripts&&c.ap.scripts[st.key])||'';
    if(script){ h+='<div class="ap-h">🤖 AI 대면 멘트 (설계사 참조용)</div><div class="ap-script"><div class="ap-script-h">이렇게 말해보세요</div>'+esc(script)+'</div>'; }
    else { h+='<div class="stage-note" style="margin-top:10px">이 단계의 AI 멘트는 <b>① 멘트 만들기</b> 단계에서 만들 수 있어요.</div>'; }
    // 하단 네비
    h+='<div class="divider"></div><div class="row">';
    h+='<button class="btn ghost grow" onclick="apGo('+(apStage-1)+')">‹ 이전</button>';
    if(apStage<5) h+='<button class="btn primary grow" onclick="apGo('+(apStage+1)+')">다음 ›</button>';
    else h+='<button class="btn primary grow" onclick="saveAP()">✓ AP 저장하고 닫기</button>';
    h+='</div>';
  }
  box.innerHTML=h;
}
async function genApScripts(){
  const c=customers.find(x=>x.id===apCustId); if(!c) return;
  const cks=Array.from(document.querySelectorAll('.ap-genck:checked')).map(x=>x.value);
  if(!cks.length){ alert('멘트를 만들 단계를 하나 이상 체크하세요.'); return; }
  if(!cloudOn){ alert('AI 멘트 생성은 로그인 후 사용할 수 있습니다.'); return; }
  const prog=document.getElementById('ap-prog'); const btn=document.getElementById('ap-genbtn');
  const stageName={ice:'아이스브레이크(첫 만남 라포 형성)',cov:'보장분석 설명',epi:'공감 에피소드 전달',plan:'가입설계 제안'};
  if(btn){ btn.disabled=true; }
  c.ap=c.ap||{scripts:{}}; c.ap.scripts=c.ap.scripts||{};
  let done=0, fail=0;
  for(let i=0;i<cks.length;i++){
    const k=cks[i];
    if(prog){ prog.style.display='block'; prog.textContent='AI 대면 멘트 생성 중… ('+(i+1)+'/'+cks.length+' · '+stageName[k]+')'; }
    try{
      const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pw:cloudPW, advisorId, advisorPw, mode:'ap', stage:stageName[k], customer:{name:c.name,age:c.age,region:c.region}, material:apMaterialText(c,k)})});
      const data=await res.json();
      if(!res.ok){ throw new Error(data.error||('HTTP '+res.status)); }
      const txt=(data.text||'').trim();
      if(txt){ c.ap.scripts[k]=txt; if(data._usage) addUsage(data._usage,'AP 멘트'); done++; } else { fail++; }
    }catch(err){ fail++; }
  }
  await idbPut('customers',c); customers=await idbAll('customers');
  if(prog){ prog.textContent='완료 · 생성 '+done+'개'+(fail?(' · 실패 '+fail+'개'):'')+'. 각 단계 탭에서 확인하세요.'; }
  renderAP();
}
async function saveAP(){
  const c=customers.find(x=>x.id===apCustId); if(!c){ go('customers'); return; }
  c.ap=c.ap||{scripts:{}}; c.ap.savedAt=now(); c.apSaved=true;
  await idbPut('customers',c); customers=await idbAll('customers');
  toast('✓ AP 저장됨 · 고객 목록에 AP 버튼이 생겼어요'); setTimeout(toastHide,2200);
  go('customers');
}
let lastPlan=null;
function renderPlanResult(d, date){
  d=rescueResult(d);
  const box=document.getElementById('an-plan-result'); if(!box) return; lastPlan=d; let h='';
  if(date) h+='<div class="meta" style="margin:0 2px 8px">가입설계 분석일 '+esc(date)+'</div>';
  const rate=Math.max(0,Math.min(100, Math.round(Number(d.shortfallRate)||0)));
  const col=rate>=60?'var(--no)':(rate>=30?'var(--hold)':'var(--ok)');
  h+='<div class="card"><div class="row" style="align-items:center;margin-bottom:8px"><span style="font-size:14px">잔여 부족율</span><span class="spacer"></span><span style="font-size:26px;font-weight:700;color:'+col+'">'+rate+'%</span></div>';
  h+='<div style="height:12px;border-radius:6px;background:var(--line);overflow:hidden"><div style="height:100%;width:'+rate+'%;background:'+col+'"></div></div></div>';
  // 부족율 아래 요약창 (보장분석과 동일한 별도 카드)
  if(d.summary) h+='<div class="card"><div style="font-size:14px;line-height:1.7;color:var(--ink-soft)">'+bulletize(d.summary)+'</div></div>';
  h+='<div class="btn-grid">';
  if(hasLines(d.planDetail)) h+='<button class="btn primary" onclick="showPlanDetail()">상세 분석</button>';
  if(pools.some(p=>p.poolType==='episode')) h+='<button class="btn ghost" onclick="showEpisodes()">🗣 참고 에피소드</button>';
  if(d._raw) h+='<button class="btn ghost" onclick="showRaw(\'plan\')">원문 보기</button>';
  h+='</div>';
  box.innerHTML=h;
}
function renderPlanWithHistory(c, idx){
  const list=(c.planAnalyses&&c.planAnalyses.length)?c.planAnalyses:[];
  const entry=list[idx]; if(!entry) return;
  renderPlanResult(entry.data, entry.at||entry.date);
  let hh='<label class="f">가입설계 기록 ('+list.length+')</label>';
  const cards=list.map((e,i)=>{
    const active=i===idx; const d=e.data||{};
    const sm=oneLine('부족율 '+(d.shortfallRate!=null?d.shortfallRate+'%':'-')+' · '+(d.summary||(Array.isArray(d.planDetail)?d.planDetail.find(x=>x&&!/^\[.*\]$/.test(String(x).trim()))||'':'')));
    return '<div class="card" style="padding:9px 11px;'+(active?'border-color:var(--accent);':'')+'"><div class="row" style="align-items:center">'
      +'<div style="flex:1;min-width:0" onclick="showPlanEntry(\''+c.id+'\','+i+')"><div style="font-size:12.5px;font-weight:600">'+esc(e.at||e.date||'')+(active?' · 보는 중':'')+'</div><div class="meta" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(sm)+'</div></div>'
      +'<button class="btn ghost sm" style="margin-left:8px" onclick="showPlanEntry(\''+c.id+'\','+i+')">보기</button>'
      +'<button class="btn danger sm" style="margin-left:6px" onclick="delPlanEntry(\''+c.id+'\','+i+')">삭제</button></div></div>';
  });
  hh+=histBlock(cards,'planhist');
  document.getElementById('an-plan-result').insertAdjacentHTML('beforeend', hh);
}
function showPlanEntry(custId, idx){ const c=customers.find(x=>x.id===custId); if(c) renderPlanWithHistory(c, idx); }
async function delPlanEntry(custId, i){
  const c=customers.find(x=>x.id===custId); if(!c) return;
  if(!confirm('이 가입설계 기록을 삭제할까요?')) return;
  c.planAnalyses=c.planAnalyses||[]; c.planAnalyses.splice(i,1);
  await idbPut('customers',c); customers=await idbAll('customers'); renderAnalysis();
}
function showDifference(){
  const d=lastPlan||{};
  openSubPage('보장분석 vs 가입설계 · 핵심 차이', linesBlock(d.difference));
}
function showAfterGaps(){
  const d=lastPlan||{};
  openSubPage('가입설계 이후 추가 보완', linesBlock(d.afterPlanGaps));
}
function showRecommend(){
  const d=lastPlan||{}; let h='';
  (d.recommend||[]).forEach((x,i,arr)=>{h+='<div class="row" style="padding:10px 4px;'+(i<arr.length-1?'border-bottom:1px solid var(--line);':'')+'"><span class="badge b-seg" style="min-width:24px;text-align:center">'+(i+1)+'</span><span style="font-size:15px;margin-left:10px">'+hlText(esc(x))+'</span></div>';});
  openSubPage('보완·추가 제안', h||'<div class="stage-note">내용이 없습니다.</div>');
}
function showPlanDetail(){
  const d=lastPlan||{};
  openSubPage('가입설계 상세 분석', linesBlock(d.planDetail));
}
function toggleDetail(){const e=document.getElementById('an-detail'); if(e) e.style.display=e.style.display==='none'?'block':'none';}
function ttsResult(){
  if(!lastAnalysis) return;
  if(!('speechSynthesis' in window)){alert('이 브라우저는 음성 읽기를 지원하지 않습니다.'); return;}
  let t=(lastAnalysis.summary||'')+' ';
  (lastAnalysis.priorities||[]).forEach((p,i)=>{t+='보강 '+(i+1)+', '+p+'. ';});
  speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.lang='ko-KR'; speechSynthesis.speak(u);
}
function ttsDemo(name){
  if(!('speechSynthesis' in window)){alert('이 브라우저는 음성 읽기를 지원하지 않습니다.'); return;}
  const text=name+' 고객님은 현재 보장 자료를 바탕으로 볼 때, 사망 보장은 확보되어 있으나 진단·입원 영역에 공백이 있습니다. '
    +'만기가 다가오는 상품에서 확보되는 여유 보험료를 새로운 보장으로 전환하는 방향을 제안드립니다. '
    +'이것은 예시 음원이며, 실제 분석 결과가 연결되면 이 자리에서 전체 내용을 읽어드립니다.';
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text); u.lang='ko-KR'; u.rate=1.0;
  speechSynthesis.speak(u);
}

/* ---------- 시트 ---------- */
function openSheet(id){document.getElementById(id).classList.add('show'); document.body.style.overflow='hidden';}
function closeSheet(id){document.getElementById(id).classList.remove('show'); document.body.style.overflow='';}
function fillSelect(id,items,val){const s=document.getElementById(id); if(items){s.innerHTML='<option value="">-</option>'; items.forEach(i=>{const o=document.createElement('option'); o.value=i; o.textContent=i; s.appendChild(o);});} s.value=val||'';}
function esc(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

/* 오버레이 배경 탭으로 닫기 */
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o) closeSheet(o.id);}));

/* ---------- 시작 ---------- */
(async function init(){
  await openDB();
  if(typeof fsInit==='function') await fsInit();
  { const oc=document.getElementById('s-custdetail'); if(oc) oc.addEventListener('input', scheduleCustAutosave); }
  { const op=document.getElementById('ov-pool'); if(op) op.addEventListener('input', schedulePoolAutosave); }
  customers=await idbAll('customers');
  pools=await idbAll('pools');
  pools.forEach(p=>{ p.pinned=false; });   // 선택(체크)은 세션/고객 단위 — 시작 시 초기화
  // 클라우드 로그인 — 1) 사이트 비밀번호, 2) 담당자 개인 비밀번호(2026-08-14 추가) 순서로 자동 로그인 시도
  let saved=''; try{ saved=localStorage.getItem('cloudPW')||''; }catch(e){}
  if(saved){
    const ok=await cloudLogin(saved, true);
    if(ok){
      const aok=await trySilentAdvisorLogin();
      if(aok){ goHome(); } else if(typeof showAdvisorPicker==='function'){ showAdvisorPicker(); } else { goHome(); }
    } else { showLogin(); }
  } else { showLogin(); }
  // 스플래시: 3초 노출 후 페이드아웃
  setTimeout(function(){
    const sp=document.getElementById('splash');
    if(sp){ sp.classList.add('hide'); setTimeout(function(){ if(sp&&sp.parentNode) sp.parentNode.removeChild(sp); }, 900); }
  }, 3000);
})();
