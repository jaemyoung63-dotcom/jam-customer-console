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
   참조풀(상담사례·에피소드·카달로그·아이스브레이크)은 이제 담당자 개인 소유가 아니라 공용(owner='shared')
   자료다. "공개"(published) 표시된 것만 담당자들의 참조 풀 화면에 뜬다.
   2026-08-17(2차 정정): 여기 올라가는 자료는 전부 항상 "전역 고정"(globalPinned=true, 캐시 재사용
   대상)이다 — 항목별로 켜고 끄는 선택지가 아니라, AI 비용을 아끼기 위한 이 화면 전체의 고정된
   방침이다. 그래서 이 화면엔 전역 고정 체크박스가 없다. 대신 "어떤 자료를 이 고객 분석에 실제로
   쓸지"는 담당자가 각자의 "참조 풀" 화면(js/pools.js)에서 항목별로 체크하는 것으로 결정한다 —
   체크된 자료가 "상담사례 매칭"·보장분석 버튼을 눌렀을 때 분석에 활용된다(체크가 없으면 태그가
   비슷한 자료를 자동으로 골라 쓴다). 즉 "공개"는 노출 여부, 담당자의 체크는 활용 여부, 전역 고정은
   비용 절감을 위해 늘 켜져 있는 값 — 이렇게 세 가지가 서로 다른 역할이다.
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
  h+='<div class="su-hero"><h3>참조풀 관리</h3><p>여기서 관리하는 자료는 전부 항상 "전역 고정"(고객이 바뀌어도 같은 내용 그대로 재사용)으로 저장되어 AI 비용을 아낍니다. "공개"된 것만 전체 담당자의 참조 풀 화면에 뜨고, 실제로 어떤 자료를 이 고객 분석에 쓸지는 각 담당자가 참조 풀 화면에서 항목별로 체크해서 정합니다.</p></div>';

  if(_adminPoolEditing){
    h+=renderAdminPoolEditorHtml(_adminPoolEditing);
    b.innerHTML=h;
    renderAdminPoolAudio();
    renderAdminPoolThumbs();
    renderAdminPoolFileList();
    const textDrop=document.getElementById('ap-textdrop');
    if(textDrop) enableDrop(textDrop, handleAdminPoolDropFile, f=>(f.type&&(f.type.indexOf('text')===0||f.type.indexOf('audio')===0))||/\.txt$/i.test(f.name||'')||/\.(mp3|m4a|wav|aac|ogg|webm|caf|amr)$/i.test(f.name||''));
    const imgDrop=document.getElementById('ap-imgdrop');
    if(imgDrop) enableDrop(imgDrop, addAdminPoolImageDirect, f=>isPdfFile(f)||(f.type&&f.type.indexOf('image')===0));
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
    const pub=!!p.published;
    const tags=[...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].slice(0,6).map(t=>'<span class="pt">'+esc(t)+'</span>').join('');
    const preview=(p.keyContent||p.tocSummary||p.body||'').slice(0,140);
    h+='<div class="card" style="margin-bottom:10px">'
      +'<div class="row" style="align-items:center"><div style="font-weight:700;font-size:15px">'+esc(p.title||'(제목 없음)')+'</div><span class="spacer"></span></div>'
      +'<div class="pill-tags" style="margin-top:4px">'+tags+'</div>'
      +'<div class="meta" style="margin-top:6px;white-space:pre-wrap;max-height:60px;overflow:hidden">'+esc(preview)+'</div>'
      +'<div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">'
      +'<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" '+(pub?'checked':'')+' onchange="toggleAdminPoolFlag(\''+p.id+'\',\'published\',this.checked)">공개(전체 담당자)</label>'
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
  if(found){
    const f=JSON.parse(JSON.stringify(found));
    // 예전 형식(이번 개편 전에 저장된 항목)에는 rawText/tocSummary/keyContent/images가 없을 수 있다.
    // 그럴 때만 본문(bodyFull/body)·요약(summaryFull)에서 옮겨와 기본값으로 채운다.
    _adminPoolEditing = Object.assign({
      rawText: f.bodyFull || f.body || '',
      tocSummary: f.tocSummary || f.summaryFull || '',
      keyContent: f.keyContent || '',
      images: f.images || []
    }, f);
  } else {
    _adminPoolEditing = {id:null,poolType:type,title:'',rawText:'',tocSummary:'',keyContent:'',images:[],audio:null,free:[],product:[],situation:[],age:[],result:'',published:true,globalPinned:true};
  }
  _adminPoolEditing._isNew=!found;
  renderAdminPools();
}
function closeAdminPoolEditor(){ _adminPoolEditing=null; renderAdminPools(); }

function renderAdminPoolEditorHtml(p){
  const label=(ADMIN_POOL_TYPES.find(t=>t[0]===p.poolType)||['case','상담사례'])[1];
  const kcLen=(p.keyContent||'').length;
  return '<div class="su-hero"><h3>'+(p._isNew?'새 '+label:label+' 편집')+'</h3></div>'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin-bottom:4px">① 텍스트 자료 <span style="font-weight:400">· 텍스트(.txt)·음원 파일을 여러 개 한꺼번에 끌어다 놓을 수 있어요</span></div>'
    +'<div id="ap-textdrop" style="border:1.5px dashed var(--line-strong);border-radius:10px;padding:2px">'
    +'<textarea class="t" id="ap-rawtext" rows="6" placeholder="내용을 직접 적거나, 텍스트·음원 파일을 여기로 끌어다 놓으세요.">'+esc(p.rawText||'')+'</textarea>'
    +'</div>'
    +'<div class="pill-tags" id="ap-filelist" style="margin-top:6px"></div>'
    +'<div class="row" style="gap:8px;margin-top:8px">'
    +'<button class="btn ghost sm" onclick="pickAdminPoolText()">📎 파일에서 불러오기</button>'
    +'<button class="btn btn-ai sm" onclick="organizeAdminPool()">🤖 AI로 정리</button>'
    +'</div>'
    +'<div class="meta" style="margin-top:4px">"AI로 정리"를 누르면 위 텍스트(+음원)를 읽고 제목·요약·핵심내용·태그를 자동으로 만들어줘요.</div>'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:16px 0 4px">제목 <span style="font-weight:400">· AI 정리 후 자동으로 채워지며, 직접 고쳐도 돼요</span></div>'
    +'<input class="t" id="ap-title" value="'+esc(p.title||'')+'" placeholder="제목 (날짜 · 분류 · 핵심내용 형식으로 자동 생성)">'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:16px 0 4px">② 요약(목차식)</div>'
    +'<textarea class="t" id="ap-toc" rows="4" placeholder="이 자료의 구성을 목차처럼 정리 (AI 정리를 누르면 자동으로 채워져요)">'+esc(p.tocSummary||'')+'</textarea>'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:16px 0 4px">③ 핵심내용(개조식 · 4000자 이내) <span id="ap-kc-count" style="font-weight:400">'+kcLen+'/4000자</span></div>'
    +'<textarea class="t" id="ap-keycontent" rows="8" maxlength="4000" oninput="document.getElementById(\'ap-kc-count\').textContent=this.value.length+\'/4000자\'" placeholder="실제 분석에 쓰일 핵심 내용 (AI 정리를 누르면 자동으로 채워져요, 직접 고쳐도 돼요)">'+esc(p.keyContent||'')+'</textarea>'
    +'<div class="meta" style="margin-top:4px">이 내용이 "상담사례 매칭 보장분석"을 돌릴 때 실제로 AI에게 전달됩니다.</div>'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:16px 0 4px">④ PDF·이미지 자료 <span style="font-weight:400">· AI가 읽지는 않고, 담당자 화면에서 그대로 보여주기만 해요</span></div>'
    +'<div id="ap-imgdrop" style="border:1.5px dashed var(--line-strong);border-radius:10px;padding:6px;min-height:70px">'
    +'<div class="thumbs" id="ap-thumbs"></div>'
    +'</div>'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:16px 0 4px">음원(선택) <span style="font-weight:400">· 여러 개 넣어도 가장 최근 파일 1개만 쓰여요</span></div>'
    +'<div id="ap-audio"></div>'
    +'<div class="meta" style="margin-top:4px">"AI로 정리"를 누르면 이 음원도 먼저 글로 옮긴 뒤 요약·핵심내용에 합쳐져요 (Cloudflare에 Workers AI 바인딩을 추가해야 작동해요 — 아직이라면 안내를 확인하세요).</div>'

    +'<div style="font-size:12.5px;color:var(--ink-mute);margin:16px 0 4px">태그(상품·상황·나이 등, 쉼표로 구분 — 자동 매칭에 쓰입니다) <span style="font-weight:400">· AI 정리 후 자동으로 채워지며, 직접 고쳐도 돼요</span></div>'
    +'<input class="t" id="ap-tags" value="'+esc([...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].join(', '))+'" placeholder="예: 종신보험, 은퇴설계, 40대 (AI로 정리를 누르면 자동으로 채워져요)">'
    +'<div class="row" style="gap:14px;margin-top:12px">'
    +'<label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer"><input type="checkbox" id="ap-published" '+(p.published?'checked':'')+'>공개(전체 담당자)</label>'
    +'</div>'
    +'<div class="meta" style="margin-top:6px">이 자료는 저장하면 자동으로 전역 고정(캐시 재사용)됩니다 — 항목별로 끌 수는 없어요.</div>'
    +'<div class="row" style="gap:8px;margin-top:16px">'
    +'<button class="btn ghost grow" onclick="closeAdminPoolEditor()">취소</button>'
    +'<button class="btn primary grow" onclick="saveAdminPool()">저장</button>'
    +'</div>';
}

/* 편집 중인 폼의 지금 화면 값을 _adminPoolEditing에 옮겨 담는다.
   파일 처리·AI 정리는 시간이 걸리는 비동기 작업이라, 그 사이에 화면을 다시 그려도
   사용자가 이미 입력해둔 값이 사라지지 않게 먼저 저장해두는 용도. */
function syncAdminPoolEditorFields(){
  const p=_adminPoolEditing; if(!p) return;
  const t=document.getElementById('ap-title'); if(t) p.title=t.value;
  const tg=document.getElementById('ap-tags'); if(tg) p._tagsRaw=tg.value;
  const r=document.getElementById('ap-result'); if(r) p.result=r.value;
  const pub=document.getElementById('ap-published'); if(pub) p.published=pub.checked;
  const rt=document.getElementById('ap-rawtext'); if(rt) p.rawText=rt.value;
  const toc=document.getElementById('ap-toc'); if(toc) p.tocSummary=toc.value;
  const kc=document.getElementById('ap-keycontent'); if(kc) p.keyContent=kc.value;
}

/* ① 텍스트 자료: 파일에서 글자만 그대로 읽어 rawText에 이어붙인다(AI 호출 없음 — "AI로 정리"를
   눌러야 실제 AI가 돈다. 여러 파일을 한꺼번에 끌어다 놓아도 각 파일 내용이 순서대로 이어진다).
   .txt(텍스트) 파일과 음원 파일을 한꺼번에 여러 개 골라도, 종류를 자동으로 구분해서 처리한다. */
function pickAdminPoolText(){
  const inp=document.getElementById('txt-input'); inp.value='';
  inp.onchange=async e=>{
    const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await handleAdminPoolDropFile(f); }
  };
  inp.click();
}
/* ①번 칸(드래그&드롭 포함)에 들어온 파일 한 개를 종류에 맞춰 처리하고, 처리한 파일 이름을
   화면에 목록으로 보여준다(#ap-filelist). 텍스트 파일은 내용을 이어붙이고, 음원 파일은
   음원 칸(#ap-audio)에 첨부한다 — 음원은 한 번에 한 개만 유지되므로, 여러 개를 넣으면
   가장 최근 파일로 바뀐다(목록에는 넣은 파일이 전부 남아 무엇을 넣었는지 확인할 수 있다). */
async function handleAdminPoolDropFile(file){
  const p=_adminPoolEditing; if(!p||!file) return;
  const isAudio=(file.type&&file.type.indexOf('audio')===0) || /\.(mp3|m4a|wav|aac|ogg|webm|caf|amr)$/i.test(file.name||'');
  if(isAudio) await attachAdminPoolAudioFile(file);
  else await appendAdminPoolText(file);
  p._droppedFiles=p._droppedFiles||[];
  p._droppedFiles.push({name:file.name||(isAudio?'음원':'텍스트'), kind:isAudio?'audio':'text'});
  renderAdminPoolFileList();
}
async function appendAdminPoolText(file){
  const p=_adminPoolEditing; if(!p) return;
  syncAdminPoolEditorFields();
  try{
    const full=(await file.text()||'').trim();
    if(!full){ alert('파일에서 읽을 텍스트가 없습니다. (텍스트(.txt) 파일·음원 파일만 여기서 지원해요 — PDF·이미지는 아래 ④번 칸에 넣어주세요)'); return; }
    p.rawText = p.rawText ? (p.rawText+'\n\n'+full) : full;
    const ta=document.getElementById('ap-rawtext'); if(ta) ta.value=p.rawText;
  }catch(err){ alert('파일 처리 실패: '+(err&&err.message?err.message:err)); }
}
/* ①번 칸에 지금까지 넣은 파일 이름 목록을 칩(chip) 형태로 보여준다. 편집을 새로 열면 비워진다
   (실제 데이터는 rawText·audio에 이미 반영돼 있으므로, 이 목록은 "방금 무엇을 넣었는지"
   확인용 표시일 뿐이다). */
function renderAdminPoolFileList(){
  const p=_adminPoolEditing; if(!p) return;
  const wrap=document.getElementById('ap-filelist'); if(!wrap) return;
  const files=p._droppedFiles||[];
  wrap.innerHTML=files.map(f=>'<span class="pt">'+(f.kind==='audio'?'🎤 ':'📄 ')+esc(f.name)+'</span>').join('');
}
/* 서버(functions/api/analyze.js, mode:'organize_pool')에 텍스트를 보내
   {titleKeyword, summary(목차식), keyContent(개조식·4000자 이내), tags}를 받아온다.
   이건 특정 담당자 개인 자료가 아니라 관리자가 공용 자료를 정리하는 작업이라, 담당자
   개인 비밀번호가 아니라 이미 입력해둔 관리자 비밀번호(_adminPw)로 인증한다 — 그래서
   담당자를 따로 고르라는 창이 뜨지 않고 바로 진행된다. */
async function aiOrganizePool(text, poolTypeLabel, audioBase64){
  if(!cloudOn) throw new Error('AI 정리 기능은 로그인 후 사용할 수 있습니다.');
  const body={pw:cloudPW, adminPw:_adminPw, mode:'organize_pool', text, poolTypeLabel};
  if(audioBase64) body.audioBase64=audioBase64;
  const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  // 서버(Cloudflare)가 시간 초과·과부하 등으로 죽으면 우리 코드가 아니라 Cloudflare가 자체
  // 오류 페이지(HTML, "<!DOCTYPE..."로 시작)를 대신 돌려줄 때가 있다 — 이걸 그냥 res.json()으로
  // 파싱하면 "Unexpected token '<'"처럼 알아보기 힘든 오류가 뜨므로, 먼저 글자로 받아서
  // JSON인지 확인하고 아니면 사람이 이해할 수 있는 메시지로 바꿔준다.
  const raw=await res.text();
  let data;
  try{ data=JSON.parse(raw); }
  catch(e){
    throw new Error('서버 응답이 올바르지 않습니다(정상적인 결과가 아니라 오류 페이지가 돌아왔어요). '
      +'음원 파일이 너무 크거나 길어서 처리 시간이 오래 걸려 서버 쪽에서 중간에 끊겼을 가능성이 높습니다. '
      +'음원을 더 짧게 나누거나, 음원 없이 텍스트만 넣고 다시 시도해보세요. (상태 코드 '+res.status+')');
  }
  if(!res.ok) throw new Error(data.error||'정리 실패');
  if(typeof addUsage==='function') addUsage(data._usage,'참조풀 정리');
  return data;
}
/* 음원이 첨부돼 있으면 base64로 읽어서 같이 보낸다 — 서버가 Cloudflare Workers AI(Whisper)로
   먼저 글로 옮긴 뒤, 그 내용을 텍스트 자료와 합쳐서 정리한다. */
async function organizeAdminPool(){
  const p=_adminPoolEditing; if(!p) return;
  syncAdminPoolEditorFields();
  const src=(p.rawText||'').trim();
  let audioBase64='';
  if(p.audio){
    try{
      const rec=await idbGet('images',p.audio);
      if(rec&&rec.blob){
        // 음성인식(Whisper)은 음원이 크면(대략 4~5MB, 몇 분 이상) 서버 쪽 처리 시간·용량 제한에
        // 걸려 실패하기 쉽다는 게 실제로 보고된 사례라, 미리 알려주고 계속할지 물어본다.
        if(rec.blob.size > 4*1024*1024){
          const mb=(rec.blob.size/1024/1024).toFixed(1);
          if(!confirm('음원 파일이 꽤 커요(약 '+mb+'MB). 이런 경우 음성인식이 시간 초과로 실패할 수 있어요.\n\n그래도 시도해볼까요? (실패하면 음원을 더 짧게 나눠서 다시 시도해주세요)')) return;
        }
        const dataUrl=await blobToDataURL(rec.blob);
        const comma=dataUrl.indexOf(','); audioBase64=comma>=0?dataUrl.slice(comma+1):'';
      }
    }catch(e){}
  }
  if(!src && !audioBase64){ alert('먼저 ①번 칸에 텍스트를 넣거나 음원을 추가해주세요.'); return; }
  const label=(ADMIN_POOL_TYPES.find(t=>t[0]===p.poolType)||['case','상담사례'])[1];
  const _pg=startProgress(pc=>toast((audioBase64?'음성 인식 · ':'')+'AI로 정리 중… '+pc+'%'));
  try{
    const r=await aiOrganizePool(src, label, audioBase64);
    _pg.done(); toastHide();
    const keyword=(r.titleKeyword||'').trim();
    p.title=(today()+' · '+label+(keyword?(' · '+keyword):'')).trim();
    p.tocSummary=r.summary||'';
    p.keyContent=(r.keyContent||'').slice(0,4000);
    if(Array.isArray(r.tags) && r.tags.length){ p.free=r.tags; p.product=[]; p.situation=[]; p.age=[]; delete p._tagsRaw; }
    if(r.transcript) p.rawText = p.rawText ? (p.rawText+'\n\n[음원 인식 내용]\n'+r.transcript) : ('[음원 인식 내용]\n'+r.transcript);
    renderAdminPools();
  }catch(err){ _pg.done(); toastHide(); alert('AI 정리 실패: '+(err&&err.message?err.message:err)); }
}

/* ④ PDF·이미지 자료: AI가 읽지 않고 그대로 저장해서 담당자 화면에서 보여주기만 하는 첨부물.
   PDF는 페이지를 이미지로 바꿔서(사진과 같은 방식으로) 저장한다(js/ocr.js의 addPdfInto 재사용). */
async function renderAdminPoolThumbs(){
  const p=_adminPoolEditing; if(!p) return;
  const wrap=document.getElementById('ap-thumbs'); if(!wrap) return;
  wrap.innerHTML='';
  for(const ref of (p.images||[])){
    const rec=await idbGet('images',ref);
    const d=document.createElement('div'); d.className='thumb';
    if(rec&&rec.blob){ d.innerHTML='<img src="'+blobUrl(rec.blob)+'" onclick="event.stopPropagation();openLightbox(this.src)"><button class="del" onclick="removeAdminPoolImage(event,\''+ref+'\')">×</button>'; }
    else d.innerHTML='<span class="k">없음</span>';
    wrap.appendChild(d);
  }
  const add=document.createElement('div'); add.className='add-thumb';
  add.innerHTML='<span style="font-size:22px">＋</span>파일 추가';
  add.onclick=pickAdminPoolImage;
  wrap.appendChild(add);
}
function removeAdminPoolImage(e,ref){
  e.stopPropagation();
  const p=_adminPoolEditing; if(!p) return;
  p.images=(p.images||[]).filter(x=>x!==ref);
  idbDel('images',ref);
  renderAdminPoolThumbs();
}
function pickAdminPoolImage(){
  const inp=document.getElementById('img-input'); inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addAdminPoolImageDirect(f); }
  };
  inp.click();
}
function addAdminPoolImageDirect(file){
  const p=_adminPoolEditing; if(!p) return Promise.resolve();
  if(isPdfFile(file)){ p.images=p.images||[]; return addPdfInto(file, p.images, '자료', renderAdminPoolThumbs, null); }
  return new Promise(res=>{
    const reader=new FileReader();
    reader.onerror=()=>{alert('파일을 읽지 못했습니다.'); res();};
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
            await idbPut('images',{id:rid,kind:'자료',blob,created:today()});
            p.images=p.images||[]; p.images.push(rid);
            await renderAdminPoolThumbs(); res();
          },'image/jpeg',0.82);
        }catch(err){ alert('이미지 처리 중 오류: '+(err&&err.message?err.message:err)); res(); }
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function renderAdminPoolAudio(){
  const p=_adminPoolEditing; if(!p) return;
  const wrap=document.getElementById('ap-audio'); if(!wrap) return;
  wrap.innerHTML='';
  if(p.audio){
    idbGet('images',p.audio).then(rec=>{
      if(rec&&rec.blob){
        const a=document.createElement('audio'); a.controls=true; a.style.width='100%'; a.src=blobUrl(rec.blob);
        wrap.appendChild(a);
        const del=document.createElement('button'); del.className='btn danger sm wide'; del.style.marginTop='8px';
        del.textContent='음원 삭제'; del.onclick=removeAdminPoolAudio; wrap.appendChild(del);
      } else addAdminAudioBtn(wrap);
    });
  } else addAdminAudioBtn(wrap);
}
function addAdminAudioBtn(wrap){
  const add=document.createElement('button'); add.className='btn ghost sm wide';
  add.textContent='＋ 음원 추가'; add.onclick=pickAdminPoolAudio; wrap.appendChild(add);
}
/* 음원 파일 하나를 실제로 첨부한다(기존 음원이 있으면 지우고 교체) — "＋ 음원 추가" 버튼과
   ①번 드래그&드롭 칸(handleAdminPoolDropFile) 양쪽에서 공용으로 쓴다. */
async function attachAdminPoolAudioFile(file){
  const p=_adminPoolEditing; if(!p) return;
  const rid=uid(); await idbPut('images',{id:rid,kind:'음원',blob:file,created:today()});
  if(p.audio) await idbDel('images',p.audio);
  p.audio=rid; renderAdminPoolAudio();
}
function pickAdminPoolAudio(){
  const inp=document.getElementById('audio-input'); inp.value='';
  inp.onchange=async e=>{const f=e.target.files&&e.target.files[0]; inp.onchange=null; if(!f) return;
    await attachAdminPoolAudioFile(f);
    const p=_adminPoolEditing; if(p){ p._droppedFiles=p._droppedFiles||[]; p._droppedFiles.push({name:f.name||'음원',kind:'audio'}); renderAdminPoolFileList(); }
  };
  inp.click();
}
async function removeAdminPoolAudio(){
  const p=_adminPoolEditing; if(!p) return;
  if(p.audio){ await idbDel('images',p.audio); p.audio=null; }
  renderAdminPoolAudio();
}

async function saveAdminPool(){
  const p=_adminPoolEditing; if(!p) return;
  syncAdminPoolEditorFields();
  const title=(p.title||'').trim();
  if(!title){ alert('제목을 입력하세요. (팁: ①번 칸에 텍스트를 넣고 "AI로 정리"를 누르면 제목도 자동으로 만들어져요)'); return; }
  const tags=(p._tagsRaw||'').split(',').map(s=>s.trim()).filter(Boolean);
  const keyContent=(p.keyContent||'').trim().slice(0,4000);
  const tocSummary=(p.tocSummary||'').trim();
  const item={
    id: p.id || ('pool_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)),
    poolType: p.poolType,
    title,
    body: (keyContent||tocSummary||'').slice(0,140),   // 목록 미리보기용 짧은 본문
    bodyFull: (p.rawText||'').trim(),                   // ①번 칸에 넣은 원문(요약 전)
    tocSummary,                                          // ②번 요약(목차식)
    keyContent,                                           // ③번 핵심내용(개조식·4000자) — 분석에 실제로 쓰임
    images: p.images||[],                                 // ④번 PDF·이미지(보여주기용, AI 미사용)
    audio: p.audio||null,
    free: tags, product:[], situation:[], age:[],
    result: p.result||'',
    published: !!p.published,
    globalPinned: true, // 참조풀관리에 올라가는 자료는 전부 항상 전역 고정(비용 절감을 위한 고정 방침)
    created: p.created || today()
  };
  const d=await adminCall('adminSavePool', {item});
  if(d&&d.ok){
    toast('✓ 저장했습니다'); setTimeout(toastHide,1500);
    // 음원·이미지 실물(blob)은 이 기기 로컬에만 있으므로, 다른 담당자 화면에서도 보이도록 클라우드(R2)에 올린다.
    if((item.audio || (item.images&&item.images.length)) && typeof fsQueueForOwner==='function') fsQueueForOwner('pool', item);
    await reloadAdminPools();
  }
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
