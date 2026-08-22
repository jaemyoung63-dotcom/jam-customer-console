/* =========================================================================
   [완성형 개조] AP · 고객 대면 화면 컨텍스트 연동 및 안전 트랜잭션 모듈
   ========================================================================= */

let apCustId=null, apStage=1;
const AP_STAGES=[
  {n:2,key:'ice', icon:'🤝', t:'아이스<br>브레이크', frame:'먼저 편안하게. 웃으며 라포(친밀감)를 만드세요. 급할 필요 없습니다 — 오늘의 첫 3분이 오늘 전체를 좌우합니다.'},
  {n:3,key:'cov', icon:'🛡️', t:'보장<br>분석', frame:'고객의 현재 보장을 차분히 짚어드리세요. 팔지 말고, 사실만 보여주세요. 사실이 신뢰를 만듭니다.'},
  {n:4,key:'epi', icon:'💬', t:'에피소드<br>·정보', frame:'공감 이야기로 마음을 여세요. 설득이 아니라 공감입니다. 고객이 스스로 필요를 느끼게 하세요.'},
  {n:5,key:'plan',icon:'📝', t:'가입<br>설계', frame:'자연스럽게 제안으로. 당신은 파는 게 아니라, 고객에게 꼭 필요한 것을 권하는 것입니다. 당당하게.'}
];

/* 하단 탭 "상담"의 화면 진입점 - [상담·분석] 창 컨텍스트 무결성 유지 보완 */
function fillApSelect(){
  header('AP · 고객 대면', '멘트 만들기 → 아이스브레이크 → 보장분석 → 에피소드 → 가입설계, 순서대로');
  const sel=document.getElementById('ap-custsel'); 
  if(sel){
    sel.innerHTML='<option value="">— 고객 선택 —</option>';
    customers.forEach(c=>{
      const o=document.createElement('option'); 
      o.value=c.id; 
      o.textContent=c.name+(c.region?' · '+c.region:''); 
      sel.appendChild(o);
    });
  }
  
  // [컨텍스트 버그 수정] 외부(분석, 고객 관리 창)에서 currentCustId를 물고 들어왔을 때 드롭다운 자동 픽스 보호망
  if(currentCustId && customers.some(c=>c.id===currentCustId)){
    if(sel) sel.value=currentCustId;
    const pk=document.getElementById('ap-picker'); 
    if(pk) pk.style.display='none'; // 고객 선택기 숨김 (물고 들어온 고객 화면 집중 유도)
    
    ensurePinsForCustomer(currentCustId);
    apCustId=currentCustId; 
    // 기존 상담 스테이지가 유실되지 않도록 하되, 첫 진입 시에만 1단계로 가드 처리
    if(apCustId!==currentCustId) apStage=1; 
    renderAP();
  } else {
    // 물고 있는 고유 컨텍스트 ID가 없을 때에만 픽커를 열어줌
    const pk=document.getElementById('ap-picker'); 
    if(pk) pk.style.display='';
    apCustId=null;
    const body=document.getElementById('ap-body'); 
    if(body) body.innerHTML='<div class="empty">상담할 고객을 선택하세요.</div>';
  }
}

function onApCustSel(){
  currentCustId=document.getElementById('ap-custsel').value||null;
  const pk=document.getElementById('ap-picker'); 
  if(pk) pk.style.display=currentCustId?'none':'';
  if(currentCustId){ 
    ensurePinsForCustomer(currentCustId); 
    apCustId=currentCustId; 
    apStage=1; 
    renderAP(); 
  } else { 
    apCustId=null; 
    const body=document.getElementById('ap-body'); 
    if(body) body.innerHTML='<div class="empty">상담할 고객을 선택하세요.</div>'; 
  }
}

function openAP(id){
  const c=customers.find(x=>x.id===id); 
  if(!c){ alert('고객을 찾을 수 없습니다.'); return; }
  currentCustId=id; 
  ensurePinsForCustomer(id);
  apCustId=id; 
  apStage=1;
  go('ap');
}

function apGo(n){ apStage=n; renderAP(); window.scrollTo(0,0); }

function showApMaterial(key){
  const c=customers.find(x=>x.id===apCustId); 
  if(!c) return;
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
  d=rescueResult(d); 
  let h='';
  if(typeof d.shortfallRate!=='undefined' && d.shortfallRate!==null){ 
    const rate=Math.max(0,Math.min(100,Math.round(Number(d.shortfallRate)||0))); 
    h+='<div class="meta" style="margin:0 2px 8px">잔여 부족율 '+rate+'%</div>'; 
  }
  if(d.summary) h+='<div class="ap-sum">'+esc(d.summary)+'</div>';
  if(d.areas&&d.areas.length){ 
    h+='<div class="ap-h">영역별 판정</div>'; 
    d.areas.forEach(a=>{ h+='<div class="ap-li"><b>'+esc(a.name||'')+'</b> — '+esc(a.level||'')+(a.reason?(' · '+esc(a.reason)):'')+' '+certBadge(a.certainty)+'</div>'; }); 
  }
  if(d.priorities&&d.priorities.length){ h+='<div class="ap-h">보강 우선순위</div>'; d.priorities.forEach((p,i)=>{ h+='<div class="ap-li">'+(i+1)+'. '+esc(p)+'</div>'; }); }
  if(hasLines(d.detail)) h+='<div class="ap-h">상세</div>'+linesBlock(d.detail);
  if(hasLines(d.planDetail)) h+='<div class="ap-h">상세</div>'+linesBlock(d.planDetail);
  return h||'<div class="stage-note">내용이 없습니다.</div>';
}

function apPoolBlock(c, type){
  const items=relevantPool(c,type);
  if(!items.length) return '<div class="stage-note">등록된 '+(type==='icebreak'?'아이스브레이크':'에피소드')+' 자료가 없어요. 참조풀에 추가하면 여기에 뜹니다.</div>';
  let h=''; 
  items.slice(0,6).forEach(m=>{ 
    const p=m.p; 
    const body=(p.bodyFull||p.body||''); 
    h+='<div class="ap-card"><div class="ap-card-t">'+(m.tag==='☑ 선택'?'☑ ':'')+esc(p.title||'')+'</div>'+(body?('<div class="ap-card-b">'+esc(body.length>500?body.slice(0,500)+'…':body)+'</div>'):'')+'</div>'; 
  });
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
  const c=customers.find(x=>x.id===apCustId); 
  const box=document.getElementById('ap-body'); 
  if(!c||!box) return;
  let h='';
  
  h+='<div class="ap-hero"><div class="ah-t">🌟 '+esc(c.name)+' 님과의 상담, 준비됐습니다</div><div class="ah-s">당신은 이 고객에게 필요한 사람입니다. 순서대로 편안하게 — ① 멘트 만들기 → ② 아이스브레이크 → ③ 보장분석 → ④ 에피소드 → ⑤ 가입설계.</div></div>';
  h+='<div class="ap-tabs">';
  h+='<div class="ap-tab'+(apStage===1?' on':'')+'" onclick="apGo(1)"><span class="at-i">🤖</span>①멘트<br>만들기</div>';
  AP_STAGES.forEach(s=>{ h+='<div class="ap-tab'+(s.n===apStage?' on':'')+'" onclick="apGo('+s.n+')"><span class="at-i">'+s.icon+'</span>'+(s.n)+'.'+s.t+'</div>'; });
  h+='</div>';

  if(apStage===1){
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
    h+='<div class="ap-frame"><span class="af-ic">'+st.icon+'</span><div><b>'+st.n+'단계 · '+st.t.replace('<br>','')+'</b><br>'+st.frame+'</div></div>';
    h+='<button class="btn ghost wide" onclick="showApMaterial(\''+st.key+'\')">📎 선택한 '+st.t.replace('<br>','')+' 자료 보기</button>';
    
    const script=(c.ap&&c.ap.scripts&&c.ap.scripts[st.key])||'';
    if(script){ h+='<div class="ap-h">🤖 AI 대면 멘트 (설계사 참조용)</div><div class="ap-script"><div class="ap-script-h">이렇게 말해보세요</div>'+esc(script)+'</div>'; }
    else { h+='<div class="stage-note" style="margin-top:10px">이 단계의 AI 멘트는 <b>① 멘트 만들기</b> 단계에서 만들 수 있어요.</div>'; }
    
    h+='<div class="divider"></div><div class="row">';
    h+='<button class="btn ghost grow" onclick="apGo('+(apStage-1)+')">‹ 이전</button>';
    if(apStage<5) h+='<button class="btn primary grow" onclick="apGo('+(apStage+1)+')">다음 ›</button>';
    else h+='<button class="btn primary grow" onclick="saveAP()">✓ AP 저장하고 닫기</button>';
    h+='</div>';
  }
  box.innerHTML=h;
}

/* [버그 수정 완료] AI 스크립트 중복 호출 가드(Lock) 장착 비동기 처리 함수 */
let _isApGenerating = false; // 글로벌 변수 락 가드 추가
async function genApScripts(){
  const c=customers.find(x=>x.id===apCustId); 
  if(!c) return;
  
  if(_isApGenerating) {
    alert('현재 AI 멘트 생성 작업이 진행 중입니다. 완료될 때까지 기다려 주세요.');
    return;
  }
  
  const cks=Array.from(document.querySelectorAll('.ap-genck:checked')).map(x=>x.value);
  if(!cks.length){ alert('멘트를 만들 단계를 하나 이상 체크하세요.'); return; }
  if(!cloudOn){ alert('AI 멘트 생성은 로그인 후 사용할 수 있습니다.'); return; }
  
  const prog=document.getElementById('ap-prog'); 
  const btn=document.getElementById('ap-genbtn');
  const stageName={ice:'아이스브레이크(첫 만남 라포 형성)',cov:'보장분석 설명',epi:'공감 에피소드 전달',plan:'가입설계 제안'};
  
  if(btn){ btn.disabled=true; btn.textContent='⏳ 멘트 생성하는 중…'; }
  c.ap=c.ap||{scripts:{}}; 
  c.ap.scripts=c.ap.scripts||{};
  
  let done=0, fail=0;
  _isApGenerating = true; // 트랜잭션 락 온
  
  for(let i=0;i<cks.length;i++){
    const k=cks[i];
    if(prog){ 
      prog.style.display='block'; 
      prog.textContent='AI 대면 멘트 생성 중… ('+(i+1)+'/'+cks.length+' · '+stageName[k]+')'; 
    }
    try{
      const res=await fetch('/api/analyze',{
        method:'POST',
