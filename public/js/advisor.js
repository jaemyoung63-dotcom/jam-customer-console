/* =========================================================
   담당자(설계사) 선택 로그인 + 관리자 화면 — 2026-08-14 다중 담당자(최대 20명) 구조 추가
   core.js의 advisorLogin()/advisorSwitch() 등과 짝을 이룬다.
   2026-08-17: "담당자 관리" 화면을 "관리자 화면"으로 이름 바꾸고, 그 안에 탭을 둘로 나눔
   — ①담당자 관리(기존 그대로) ②참조풀 관리(신규: 공용 참조풀 공개·전역고정 관리).
   ========================================================= */

/* ---------- 담당자 선택(로그인) ---------- */
function advisorLoginMsg(m){ const el=document.getElementById('advisor-login-msg'); if(el){ el.textContent=m||''; el.style.display=m?'block':'none'; } }

async function showAdvisorPicker(){
  const ovLogin=document.getElementById('ov-login'); if(ovLogin) ovLogin.classList.remove('show');
  const sel=document.getElementById('advisor-select');
  if(sel){ sel.innerHTML='<option value="">불러오는 중…</option>'; }
  advisorLoginMsg('');
  const pwEl=document.getElementById('advisor-pw'); if(pwEl) pwEl.value='';
  const ov=document.getElementById('ov-advisor'); if(ov) ov.classList.add('show');
  try{
    const d=await cloudCall({pw:cloudPW, action:'listAdvisors'});
    if(!d || !d.ok){ advisorLoginMsg((d&&d.error)||'담당자 목록을 불러오지 못했습니다.'); if(sel) sel.innerHTML='<option value="">-</option>'; return; }
    const list=d.advisors||[];
    if(sel){
      if(!list.length){
        sel.innerHTML='<option value="">등록된 담당자가 없습니다</option>';
        advisorLoginMsg('아직 등록된 담당자가 없습니다. "⚙ 담당자 관리"에서 먼저 추가해주세요.');
      } else {
        sel.innerHTML=list.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
      }
    }
  }catch(e){ advisorLoginMsg('연결 실패: '+((e&&e.message)||e)); }
  if(pwEl) setTimeout(()=>pwEl.focus(), 100);
}

async function doAdvisorLogin(){
  const sel=document.getElementById('advisor-select');
  const id=sel&&sel.value;
  const pw=(document.getElementById('advisor-pw').value||'');
  if(!id){ advisorLoginMsg('담당자를 선택하세요.'); return; }
  if(!pw){ advisorLoginMsg('개인 비밀번호를 입력하세요.'); return; }
  advisorLoginMsg('확인 중…');
  const ok=await advisorLogin(id, pw, false);
  if(ok){
    const ov=document.getElementById('ov-advisor'); if(ov) ov.classList.remove('show');
    goHome();
  }
}

/* ---------- 관리자 화면 ---------- */
let _adminPw='';        // 관리자 비밀번호는 저장하지 않고 화면이 열려있는 동안만 메모리에 둔다.
let _adminTab='advisors'; // 'advisors' | 'pools' — 관리자 화면 안의 탭
let _adminPools=[];      // "참조풀 관리" 탭에서 불러온 공용 참조풀 전체 목록(비공개 포함)

function openAdminGate(){
  openSheet('ov-admin');
  _adminPw=''; _adminTab='advisors';
  renderAdminGate();
}

function renderAdminGate(){
  const b=document.getElementById('admin-body'); if(!b) return;
  b.innerHTML =
    '<div class="su-hero"><h3>관리자 비밀번호</h3><p>담당자를 추가·삭제하거나 비밀번호를 초기화하려면 관리자 비밀번호가 필요합니다. (앱 공통 비밀번호와는 다른 별도 비밀번호입니다 · Cloudflare 환경변수 <b>ADMIN_PASSWORD</b>)</p></div>'
    +'<div class="pw-wrap"><input class="t" type="password" id="admin-gate-pw" placeholder="관리자 비밀번호" onkeydown="if(event.key===\'Enter\')doAdminGateSubmit()">'
    +'<button type="button" class="pw-eye" onclick="togglePw(\'admin-gate-pw\',this)" aria-label="비밀번호 보기">👁</button></div>'
    +'<div id="admin-gate-msg" style="display:none;color:#C0392B;font-size:12.5px;margin-top:8px"></div>'
    +'<button class="btn primary wide" style="margin-top:12px" onclick="doAdminGateSubmit()">확인</button>';
  setTimeout(()=>{ const i=document.getElementById('admin-gate-pw'); if(i) i.focus(); }, 100);
}

function adminGateMsg(m){ const el=document.getElementById('admin-gate-msg'); if(el){ el.textContent=m||''; el.style.display=m?'block':'none'; } }

async function doAdminGateSubmit(){
  const pw=(document.getElementById('admin-gate-pw').value||'');
  if(!pw){ adminGateMsg('관리자 비밀번호를 입력하세요.'); return; }
  adminGateMsg('확인 중…');
  _adminPw=pw;
  const ok=await reloadAdminScreen();
  if(!ok){ _adminPw=''; }
}

async function adminCall(action, extra){
  return await cloudCall(Object.assign({ pw:cloudPW, adminPw:_adminPw, action }, extra||{}));
}

/* 관리자 화면 탭 전환 + 진입 시 첫 로딩을 함께 처리 */
function switchAdminTab(tab){ _adminTab=tab; reloadAdminScreen(); }
async function reloadAdminScreen(){
  return _adminTab==='pools' ? await reloadAdminPools() : await reloadAdminList();
}
function adminTabsHtml(){
  return '<div class="row" style="gap:6px;margin-bottom:14px">'
    +'<button class="btn '+(_adminTab==='advisors'?'primary':'ghost')+' sm" onclick="switchAdminTab(\'advisors\')">담당자 관리</button>'
    +'<button class="btn '+(_adminTab==='pools'?'primary':'ghost')+' sm" onclick="switchAdminTab(\'pools\')">참조풀 관리</button>'
    +'</div>';
}

async function reloadAdminList(){
  const d=await adminCall('adminListAdvisors');
  if(!d || !d.ok){
    adminGateMsg((d&&d.error)||'불러오기 실패');
    return false;
  }
  renderAdminList(d);
  return true;
}

function renderAdminList(d){
  const b=document.getElementById('admin-body'); if(!b) return;
  const advisors=d.advisors||[];
  const unowned=d.unowned||{customers:0,pools:0};
  let h=adminTabsHtml();
  h+='<div class="su-hero"><h3>담당자 관리</h3><p>담당자 계정을 추가·수정·삭제합니다. 이름만 알면 로그인할 수 있으니, 비밀번호는 본인에게 따로 알려주세요.</p></div>';

  if(d.needsSetup){
    h+='<div class="card" style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:6px">⚠ 아직 초기 설정 전입니다</div>'
      +'<div class="meta" style="margin-bottom:10px">담당자 기능을 쓰려면 데이터베이스에 필요한 테이블을 한 번 만들어야 합니다. 아래 버튼 한 번만 누르면 됩니다.</div>'
      +'<button class="btn primary wide" onclick="doAdminSetupSchema()">초기 설정 실행</button></div>';
  }

  h+='<div class="card" style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:8px">담당자 추가</div>'
    +'<input class="t" id="admin-add-name" placeholder="이름" style="margin-bottom:8px">'
    +'<div class="pw-wrap"><input class="t" type="password" id="admin-add-pw" placeholder="개인 비밀번호(4자 이상)">'
    +'<button type="button" class="pw-eye" onclick="togglePw(\'admin-add-pw\',this)" aria-label="비밀번호 보기">👁</button></div>'
    +'<button class="btn primary wide" style="margin-top:10px" onclick="doAdminAddAdvisor()">추가</button>'
    +'<div id="admin-add-msg" style="display:none;color:#C0392B;font-size:12.5px;margin-top:8px"></div></div>';

  if(unowned.customers || unowned.pools){
    h+='<div class="card" style="margin-bottom:14px;border-color:#E0A800">'
      +'<div style="font-weight:700;margin-bottom:6px">⚠ 아직 담당자가 안 정해진 기존 자료</div>'
      +'<div class="meta" style="margin-bottom:10px">고객 '+unowned.customers+'건 · 참조풀 '+unowned.pools+'건 — 이 화면 아래 담당자 목록에서 "기존자료 받기" 버튼으로 배정하세요.</div></div>';
  }

  if(!advisors.length){
    h+='<div class="stage-note">아직 등록된 담당자가 없습니다. 위에서 추가하세요.</div>';
  } else {
    h+='<div style="font-weight:700;margin:14px 0 8px">담당자 목록 ('+advisors.length+'명)</div>';
    advisors.forEach(a=>{
      h+='<div class="card" style="margin-bottom:10px">'
        +'<div class="row" style="align-items:center"><div style="font-weight:700;font-size:15px">'+esc(a.name)+'</div><span class="spacer"></span>'
        +'<div class="meta">고객 '+a.customerCount+' · 참조 '+a.poolCount+'</div></div>'
        +'<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">'
        +'<button class="btn ghost sm" onclick="doAdminRenameAdvisor(\''+a.id+'\',\''+esc(a.name).replace(/'/g,"\\'")+'\')">이름수정</button>'
        +'<button class="btn ghost sm" onclick="doAdminResetPw(\''+a.id+'\',\''+esc(a.name).replace(/'/g,"\\'")+'\')">비밀번호초기화</button>'
        +(((unowned.customers||unowned.pools))?'<button class="btn ghost sm" onclick="doAdminAssignUnowned(\''+a.id+'\')">기존자료 받기</button>':'')
        +'<button class="btn ghost sm" onclick="doAdminReassignPrompt(\''+a.id+'\',\''+esc(a.name).replace(/'/g,"\\'")+'\')">자료 이전</button>'
        +'<button class="btn ghost sm" onclick="doCopyAiKeyVarName(\''+a.id+'\',\''+esc(a.name).replace(/'/g,"\\'")+'\')">AI키 변수명 복사</button>'
        +'<button class="btn danger sm" onclick="doAdminDeleteAdvisor(\''+a.id+'\',\''+esc(a.name).replace(/'/g,"\\'")+'\')">삭제</button>'
        +'</div></div>';
    });
  }
  b.innerHTML=h;
}

async function doCopyAiKeyVarName(id, name){
  const varName = 'ANTHROPIC_KEY_' + id;
  try{
    await navigator.clipboard.writeText(varName);
    toast('✓ "'+name+'" 담당자의 AI키 변수명을 복사했습니다. Cloudflare "Variables and secrets"에서 이름 칸에 그대로 붙여넣으세요.');
    setTimeout(toastHide,4200);
  }catch(e){
    alert(name+' 담당자의 AI키 변수명(복사 실패, 직접 적어주세요):\n\n'+varName);
  }
}

async function doAdminSetupSchema(){
  const d=await adminCall('adminSetupSchema');
  if(d&&d.ok){ toast('✓ 초기 설정 완료'); setTimeout(toastHide,1800); await reloadAdminList(); }
  else alert('초기 설정 실패: '+((d&&d.error)||'알 수 없음'));
}

function adminAddMsg(m){ const el=document.getElementById('admin-add-msg'); if(el){ el.textContent=m||''; el.style.display=m?'block':'none'; } }

async function doAdminAddAdvisor(){
  const name=(document.getElementById('admin-add-name').value||'').trim();
  const password=(document.getElementById('admin-add-pw').value||'');
  if(!name){ adminAddMsg('이름을 입력하세요.'); return; }
  if(!password || password.length<4){ adminAddMsg('비밀번호는 4자 이상으로 정하세요.'); return; }
  adminAddMsg('추가하는 중…');
  const d=await adminCall('adminAddAdvisor', {name, password});
  if(d&&d.ok){ toast('✓ '+name+' 담당자를 추가했습니다'); setTimeout(toastHide,1800); await reloadAdminList(); }
  else adminAddMsg((d&&d.error)||'추가 실패');
}

async function doAdminRenameAdvisor(id, oldName){
  const name=prompt('새 이름', oldName||''); if(!name || !name.trim()) return;
  const d=await adminCall('adminRenameAdvisor', {id, name:name.trim()});
  if(d&&d.ok) await reloadAdminList(); else alert('이름 수정 실패: '+((d&&d.error)||'알 수 없음'));
}

async function doAdminResetPw(id, name){
  const pw=prompt((name||'담당자')+' 님의 새 비밀번호(4자 이상)'); if(!pw) return;
  if(pw.length<4){ alert('비밀번호는 4자 이상으로 정하세요.'); return; }
  const d=await adminCall('adminResetAdvisorPassword', {id, password:pw});
  if(d&&d.ok){ toast('✓ 비밀번호를 초기화했습니다'); setTimeout(toastHide,1800); }
  else alert('비밀번호 초기화 실패: '+((d&&d.error)||'알 수 없음'));
}

async function doAdminDeleteAdvisor(id, name){
  if(!confirm((name||'이 담당자')+' 계정을 삭제할까요? (배정된 자료가 없을 때만 삭제됩니다)')) return;
  const d=await adminCall('adminDeleteAdvisor', {id});
  if(d&&d.ok){ toast('✓ 삭제했습니다'); setTimeout(toastHide,1800); await reloadAdminList(); }
  else alert('삭제 실패: '+((d&&d.error)||'알 수 없음'));
}

async function doAdminAssignUnowned(id){
  if(!confirm('소유자가 없는 기존 자료를 전부 이 담당자에게 배정할까요?')) return;
  const d=await adminCall('adminAssignUnowned', {id});
  if(d&&d.ok){ toast('✓ 고객 '+((d.assigned&&d.assigned.customers)||0)+'건, 참조 '+((d.assigned&&d.assigned.pools)||0)+'건 배정했습니다'); setTimeout(toastHide,2400); await reloadAdminList(); }
  else alert('배정 실패: '+((d&&d.error)||'알 수 없음'));
}

async function doAdminReassignPrompt(fromId, fromName){
  const toName=prompt((fromName||'이 담당자')+' 님의 자료를 통째로 옮길 다른 담당자의 "이름"을 정확히 입력하세요'); if(!toName || !toName.trim()) return;
  const d0=await adminCall('adminListAdvisors');
  const list=(d0&&d0.advisors)||[];
  const target=list.find(a=>a.name===toName.trim());
  if(!target){ alert('그 이름의 담당자를 찾을 수 없습니다.'); return; }
  if(!confirm(fromName+' → '+target.name+' 으로 전체 자료를 이전할까요?')) return;
  const d=await adminCall('adminReassignAll', {fromId, toId:target.id});
  if(d&&d.ok){ toast('✓ 고객 '+((d.moved&&d.moved.customers)||0)+'건, 참조 '+((d.moved&&d.moved.pools)||0)+'건 이전했습니다'); setTimeout(toastHide,2400); await reloadAdminList(); }
  else alert('이전 실패: '+((d&&d.error)||'알 수 없음'));
}

/* ---------- 참조풀 관리 (2026-08-17 추가) ----------
   참조풀(상담사례·에피소드·카달로그·설계서)은 이제 담당자 개인 소유가 아니라 공용(owner='shared')
   자료다. 여기서 "공개"(published) 표시된 것만 담당자들의 실제 상담·분석에 쓰이고, "전역 고정"
   (globalPinned) 표시된 것은 고객이 바뀌어도 항상 같은 내용으로 나가 프롬프트 캐싱이 재사용된다.
   (참고: 이 화면의 자료 추가·수정은 담당자 화면의 "참조 풀"처럼 오프라인 저장 후 나중에 동기화하는
   방식이 아니라, 저장 버튼을 누르는 즉시 서버로 바로 저장된다 — 관리 빈도가 낮아 그게 더 단순하다.) */
/* 2026-08-17: 관리자 화면의 참조풀 관리를 담당자 화면의 "참조 풀"(js/pools.js)과 같은 구성으로 맞춤
   — 4종류(아이스브레이크·상담사례·에피소드·카달로그)를 가로 탭으로 두고, 탭을 눌러야 그 종류의
   세부 항목이 아래에 나온다. 예전 'plan'(설계서)은 실제로 어떤 화면에서도 만들지 않는 orphan
   데이터였고(개인정보 유출 사고로 이미 삭제함), 대신 담당자들이 실제로 쓰는 '아이스브레이크'가
   여기 없어서 관리가 안 됐던 걸 바로잡음. */
const ADMIN_POOL_TYPES=[['icebreak','아이스브레이크'],['case','상담사례'],['episode','에피소드'],['catalog','카달로그']];
let _adminPoolEditing=null;   // 지금 편집 중인 항목(없으면 null). {_type,_isNew,...필드}
let _adminPoolType='case';    // 지금 선택된 탭(종류)

async function reloadAdminPools(){
  const d=await adminCall('adminListPools');
  if(!d || !d.ok){ adminGateMsg((d&&d.error)||'불러오기 실패'); return false; }
  _adminPools=d.pools||[];
  _adminPoolEditing=null;
  renderAdminPools();
  return true;
}

function switchAdminPoolType(type){ _adminPoolType=type; renderAdminPools(); }

function renderAdminPools(){
  const b=document.getElementById('admin-body'); if(!b) return;
  let h=adminTabsHtml();
  h+='<div class="su-hero"><h3>참조풀 관리</h3><p>여기서 관리하는 자료 중 "공개"된 것만 전체 담당자에게 자동으로 뜨고 실제 상담·분석에 쓰입니다. "전역 고정"은 고객이 바뀌어도 항상 같은 내용으로 나가게 해서 AI 비용(프롬프트 캐싱)을 아낍니다.</p></div>';

  if(_adminPoolEditing){
    h+=renderAdminPoolEditorHtml(_adminPoolEditing);
    b.innerHTML=h;
    return;
  }

  // 담당자 화면의 참조 풀과 같은 가로 탭(seg-toggle) 구성 — 종류를 고르면 그 아래에만 세부 항목이 나온다.
  h+='<div class="seg-toggle" style="margin-bottom:12px">';
  ADMIN_POOL_TYPES.forEach(([type,label])=>{
    const n=_adminPools.filter(p=>p.poolType===type).length;
    h+='<button class="'+(_adminPoolType===type?'on':'')+'" onclick="switchAdminPoolType(\''+type+'\')">'+label+' ('+n+')</button>';
  });
  h+='</div>';

  const type=_adminPoolType, label=(ADMIN_POOL_TYPES.find(t=>t[0]===type)||['case','상담사례'])[1];
  const items=_adminPools.filter(p=>p.poolType===type);
  h+='<div class="row" style="align-items:center;margin-bottom:10px"><span class="spacer"></span>'
    +'<button class="btn ghost sm" onclick="openAdminPoolEditor(null,\''+type+'\')">＋ 새 '+label+'</button></div>';
  if(!items.length){ h+='<div class="stage-note">등록된 '+label+'이(가) 없습니다.</div>'; }
  items.forEach(p=>{
    const pub=!!p.published, glob=!!p.globalPinned;
    const tags=[...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].slice(0,6).map(t=>'<span class="pt">'+esc(t)+'</span>').join('');
    h+='<div class="card" style="margin-bottom:10px">'
      +'<div class="row" style="align-items:center"><div style="font-weight:700;font-size:15px">'+esc(p.title||'(제목 없음)')+'</div><span class="spacer"></span></div>'
      +'<div class="pill-tags" style="margin-top:4px">'+tags+'</div>'
      +'<div class="meta" style="margin-top:6px;white-space:pre-wrap;max-height:60px;overflow:hidden">'+esc((p.body||'').slice(0,140))+'</div>'
      +'<div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">'
      +'<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" '+(pub?'checked':'')+' onchange="toggleAdminPoolFlag(\''+p.id+'\',\'published\',this.checked)">공개(전체 담당자)</label>'
      +'<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" '+(glob?'checked':'')+' onchange="toggleAdminPoolFlag(\''+p.id+'\',\'globalPinned\',this.checked)">전역 고정(캐시)</label>'
      +'</div>'
      +'<div class="row" style="gap:6px;margin-top:8px">'
      +'<button class="btn ghost sm" onclick="openAdminPoolEditor(\''+p.id+'\',\''+type+'\')">편집</button>'
      +'<button class="btn danger sm" onclick="doAdminDeletePool(\''+p.id+'\',\''+esc(p.title||'').replace(/'/g,"\\'")+'\')">삭제</button>'
      +'</div></div>';
  });
  b.innerHTML=h;
}

function openAdminPoolEditor(id, type){
  const found=id?_adminPools.find(x=>x.id===id):null;
  _adminPoolEditing = found ? JSON.parse(JSON.stringify(found)) : {id:null,poolType:type,title:'',body:'',bodyFull:'',free:[],product:[],situation:[],age:[],result:'',published:true,globalPinned:false};
  _adminPoolEditing._isNew=!found;
  renderAdminPools();
}
function closeAdminPoolEditor(){ _adminPoolEditing=null; renderAdminPools(); }

function renderAdminPoolEditorHtml(p){
  const label=(ADMIN_POOL_TYPES.find(t=>t[0]===p.poolType)||['case','상담사례'])[1];
  let resultField='';
  if(p.poolType==='case'){
    resultField='<div style="font-size:12.5px;color:var(--ink-mute);margin:10px 0 4px">결과</div>'
      +'<select class="t" id="ap-result">'
      +['','성공','보류','실패'].map(r=>'<option value="'+r+'" '+(p.result===r?'selected':'')+'>'+(r||'(선택 안 함)')+'</option>').join('')
      +'</select>';
  }
  return '<div class="su-hero"><h3>'+(p._isNew?'새 '+label:label+' 편집')+'</h3></div>'
    +'<div style="font-size:12.5px;color:var(--ink-mute);margin-bottom:4px">제목</div>'
    +'<input class="t" id="ap-title" value="'+esc(p.title||'')+'" placeholder="제목">'
    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:10px 0 4px">본문</div>'
    +'<textarea class="t" id="ap-body" rows="6" placeholder="내용">'+esc(p.bodyFull||p.body||'')+'</textarea>'
    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:10px 0 4px">태그(상품·상황·나이 등, 쉼표로 구분 — 자동 매칭에 쓰입니다)</div>'
    +'<input class="t" id="ap-tags" value="'+esc([...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].join(', '))+'" placeholder="예: 종신보험, 은퇴설계, 40대">'
    +resultField
    +'<div class="row" style="gap:14px;margin-top:12px">'
    +'<label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer"><input type="checkbox" id="ap-published" '+(p.published?'checked':'')+'>공개(전체 담당자)</label>'
    +'<label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer"><input type="checkbox" id="ap-globalpinned" '+(p.globalPinned?'checked':'')+'>전역 고정(캐시)</label>'
    +'</div>'
    +'<div class="row" style="gap:8px;margin-top:16px">'
    +'<button class="btn ghost grow" onclick="closeAdminPoolEditor()">취소</button>'
    +'<button class="btn primary grow" onclick="saveAdminPool()">저장</button>'
    +'</div>';
}

async function saveAdminPool(){
  const p=_adminPoolEditing; if(!p) return;
  const title=(document.getElementById('ap-title').value||'').trim();
  if(!title){ alert('제목을 입력하세요.'); return; }
  const body=(document.getElementById('ap-body').value||'').trim();
  const tags=(document.getElementById('ap-tags').value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const resultEl=document.getElementById('ap-result');
  const item={
    id: p.id || ('pool_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)),
    poolType: p.poolType,
    title, body, bodyFull: body,
    free: tags, product:[], situation:[], age:[],
    result: resultEl ? resultEl.value : (p.result||''),
    published: document.getElementById('ap-published').checked,
    globalPinned: document.getElementById('ap-globalpinned').checked,
    created: p.created || today()
  };
  const d=await adminCall('adminSavePool', {item});
  if(d&&d.ok){ toast('✓ 저장했습니다'); setTimeout(toastHide,1500); await reloadAdminPools(); }
  else alert('저장 실패: '+((d&&d.error)||'알 수 없음'));
}

async function toggleAdminPoolFlag(id, field, value){
  const p=_adminPools.find(x=>x.id===id); if(!p) return;
  const item=Object.assign({}, p); item[field]=value;
  const d=await adminCall('adminSavePool', {item});
  if(d&&d.ok){ p[field]=value; toast('✓ 변경됨'); setTimeout(toastHide,1000); }
  else { alert('변경 실패: '+((d&&d.error)||'알 수 없음')); renderAdminPools(); }
}

async function doAdminDeletePool(id, title){
  if(!confirm((title||'이 자료')+'를 삭제할까요? 전체 담당자에게서 사라집니다.')) return;
  const d=await adminCall('adminDeletePool', {id});
  if(d&&d.ok){ toast('✓ 삭제했습니다'); setTimeout(toastHide,1500); await reloadAdminPools(); }
  else alert('삭제 실패: '+((d&&d.error)||'알 수 없음'));
}
