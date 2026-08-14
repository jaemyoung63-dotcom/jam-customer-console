/* =========================================================
   담당자(설계사) 선택 로그인 + 관리자 화면 — 2026-08-14 다중 담당자(최대 20명) 구조 추가
   core.js의 advisorLogin()/advisorSwitch() 등과 짝을 이룬다.
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

/* ---------- 관리자 화면(담당자 관리) ---------- */
let _adminPw='';   // 관리자 비밀번호는 저장하지 않고 화면이 열려있는 동안만 메모리에 둔다.

function openAdminGate(){
  openSheet('ov-admin');
  _adminPw='';
  renderAdminGate();
}

function renderAdminGate(){
  const b=document.getElementById('admin-body'); if(!b) return;
  b.innerHTML =
    '<div class="su-hero"><h3>관리자 비밀번호</h3><p>담당자를 추가·삭제하거나 비밀번호를 초기화하려면 관리자 비밀번호가 필요합니다. (앱 공통 비밀번호와는 다른 별도 비밀번호입니다 · Cloudflare 환경변수 <b>ADMIN_PASSWORD</b>)</p></div>'
    +'<input class="t" type="password" id="admin-gate-pw" placeholder="관리자 비밀번호" onkeydown="if(event.key===\'Enter\')doAdminGateSubmit()">'
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
  const ok=await reloadAdminList();
  if(!ok){ _adminPw=''; }
}

async function adminCall(action, extra){
  return await cloudCall(Object.assign({ pw:cloudPW, adminPw:_adminPw, action }, extra||{}));
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
  let h='';
  h+='<div class="su-hero"><h3>담당자 관리</h3><p>담당자 계정을 추가·수정·삭제합니다. 이름만 알면 로그인할 수 있으니, 비밀번호는 본인에게 따로 알려주세요.</p></div>';

  if(d.needsSetup){
    h+='<div class="card" style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:6px">⚠ 아직 초기 설정 전입니다</div>'
      +'<div class="meta" style="margin-bottom:10px">담당자 기능을 쓰려면 데이터베이스에 필요한 테이블을 한 번 만들어야 합니다. 아래 버튼 한 번만 누르면 됩니다.</div>'
      +'<button class="btn primary wide" onclick="doAdminSetupSchema()">초기 설정 실행</button></div>';
  }

  h+='<div class="card" style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:8px">담당자 추가</div>'
    +'<input class="t" id="admin-add-name" placeholder="이름" style="margin-bottom:8px">'
    +'<input class="t" type="password" id="admin-add-pw" placeholder="개인 비밀번호(4자 이상)">'
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
        +'<button class="btn danger sm" onclick="doAdminDeleteAdvisor(\''+a.id+'\',\''+esc(a.name).replace(/'/g,"\\'")+'\')">삭제</button>'
        +'</div></div>';
    });
  }
  b.innerHTML=h;
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
