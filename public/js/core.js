/* ---------- 비밀번호 눈 표시(입력 내용 보기) ---------- */
function togglePw(id, btn){
  const el=document.getElementById(id); if(!el) return;
  const show = el.type==='password';
  el.type = show ? 'text' : 'password';
  if(btn){ btn.textContent = show ? '🙈' : '👁'; btn.setAttribute('aria-label', show?'비밀번호 숨기기':'비밀번호 보기'); }
}

/* ---------- AI 결과 텍스트: 개조식(불릿) 변환 + 핵심 단어 색상 강조 ---------- */
/* hlText: 이미 esc() 처리된 안전한 문자열에 색을 입힘 (부족/위험류=빨강, 충분/확보류·핵심수치=파랑) */
function hlText(s){
  s=String(s||'');
  s=s.replace(/(\d[\d,]*\s*(?:만원|억원|원|%|세|개월|년))/g, '<span style="color:#1a56db;font-weight:700">$1</span>');
  s=s.replace(/(부족|위험|미흡|취약|시급|불충분|확인\s*필요|공백|미가입|해지|만기\s*임박|갱신형)/g, '<span style="color:#c0392b;font-weight:700">$1</span>');
  s=s.replace(/(충분|확보|적정|우수|안정적|완료|비갱신형)/g, '<span style="color:#1a56db;font-weight:700">$1</span>');
  return s;
}
/* bulletize: 문장 단위 줄글(raw, 미이스케이프)을 개조식 불릿 목록 HTML로 변환 */
function bulletize(text){
  const raw=String(text||'').trim(); if(!raw) return '';
  const parts=raw.split(/\n+/)
    .flatMap(line=>line.split(/(?<=[.!?])\s+(?=[가-힣A-Za-z0-9"'])/))
    .map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return '';
  let h='';
  parts.forEach(p=>{ h+='<div style="padding:2px 0 2px 2px">· '+hlText(esc(p))+'</div>'; });
  return h;
}

/* ---------- 상수 ---------- */
const AGES=['20대','30대','40대','50대','60대+'];
const PRODUCTS=['종신','정기','암','건강','실손','연금저축','어린이','CI'];
const SITUATIONS=['신규','리모델링','갱신전환','해약방어','만기도래','증권점검'];
const SEGMENTS=['방문예정','상담','계약'];
const SOURCES=[['db','DB 고객'],['acq','지인 고객']];
const RESULTS=[['성공','ok'],['보류','hold'],['실패','no']];
const IMG_KINDS=['보장급부','내보장자산','기타'];

/* ---------- IndexedDB ---------- */
let db;
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('cust-consult',2);
    r.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('customers')) d.createObjectStore('customers',{keyPath:'id'});
      if(!d.objectStoreNames.contains('pools')) d.createObjectStore('pools',{keyPath:'id'});
      if(!d.objectStoreNames.contains('images')) d.createObjectStore('images',{keyPath:'id'});
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
    };
    r.onsuccess=e=>{db=e.target.result; res();};
    r.onerror=e=>rej(e);
  });
}
function tx(store,mode){return db.transaction(store,mode).objectStore(store);}
function idbAll(store){return new Promise(r=>{const q=tx(store,'readonly').getAll(); q.onsuccess=()=>r(q.result||[]);});}
function idbGet(store,id){return new Promise(r=>{const q=tx(store,'readonly').get(id); q.onsuccess=()=>r(q.result);});}
function _idbPut(store,v){return new Promise(r=>{const q=tx(store,'readwrite').put(v); q.onsuccess=()=>r();});}
/* 이 브라우저(기기)의 고유 id — 저장 충돌 감지 시 "이건 나 자신이 예전에 쓴 값과 어긋난 것뿐"인지
   "진짜 다른 기기가 썼는지" 구분하는 데 씀. */
function getDeviceId(){
  let id; try{ id=localStorage.getItem('deviceId'); }catch(e){}
  if(!id){ id='dev_'+Date.now().toString(36)+Math.random().toString(36).slice(2,10); try{ localStorage.setItem('deviceId', id); }catch(e){} }
  return id;
}
async function idbPut(store,v){
  if(cloudOn&&(store==='customers'||store==='pools')){
    // 덮어쓰기 전에 로컬에 있던 기존 값의 updated를 "내가 마지막으로 확인한 버전"으로 기억해둔다.
    let baseUpdated=null;
    try{ const prev=await idbGet(store, v.id); baseUpdated=(prev&&prev.updated)||null; }catch(e){}
    await _idbPut(store,v);
    cloudSync(store==='customers'?'saveCustomer':'savePool', v, baseUpdated);
    if(typeof fsQueueForOwner==='function') fsQueueForOwner(store==='customers'?'customer':'pool', v);
    return;
  }
  return _idbPut(store,v);
}

/* ===================== 폴더 저장 시스템 =====================
   B: 앱 내부 폴더(그룹) — 각 레코드에 folder 필드, 현재 폴더 sticky
   A: PC 실제 폴더 자동 저장 — File System Access API (Chrome) */
function loadFolders(){ try{ return JSON.parse(localStorage.getItem('appFolders'))||['기본']; }catch(e){ return ['기본']; } }
function saveFolders(a){ try{ localStorage.setItem('appFolders', JSON.stringify(a)); }catch(e){} }
function currentFolder(){ const f=localStorage.getItem('currentFolder'); const list=loadFolders(); return (f&&list.includes(f))?f:(list[0]||'기본'); }
function setCurrentFolder(f){ f=(f||'').trim()||'기본'; localStorage.setItem('currentFolder', f); const a=loadFolders(); if(!a.includes(f)){ a.push(f); saveFolders(a); } }
function sanitizeName(s){ return String(s||'').replace(/[\/\\:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,80)||'무제'; }

/* 저장 버튼 옆 폴더 선택 드롭다운 */
function fillFolderSelect(selId, preferred){
  const sel=document.getElementById(selId); if(!sel) return;
  const list=loadFolders(); const cur=(preferred&&list.includes(preferred))?preferred:currentFolder();
  sel.innerHTML=list.map(f=>'<option'+(f===cur?' selected':'')+'>'+esc(f)+'</option>').join('')+'<option value="__new__">＋ 새 폴더…</option>';
}
function onFolderPick(sel){
  if(sel.value==='__new__'){ const n=prompt('새 폴더 이름'); if(n&&n.trim()){ setCurrentFolder(n.trim()); } refreshFolderSelects(); }
  else { setCurrentFolder(sel.value); refreshFolderSelects(); }
}
function refreshFolderSelects(){ document.querySelectorAll('select.folder-select').forEach(s=>fillFolderSelect(s.id, s.value==='__new__'?null:s.value)); }
function folderFrom(selId){ const sel=document.getElementById(selId); const v=sel&&sel.value&&sel.value!=='__new__'?sel.value:currentFolder(); setCurrentFolder(v); return v; }

/* ---- A: PC 폴더 자동 저장 ---- */
let _dirHandle=null;
/* 저장 시마다 폴더창을 띄운다(마지막 폴더에서 시작). subfolder가 있으면 그 하위폴더에 저장.
   반드시 저장 핸들러의 '첫 await'로 호출할 것 — 그래야 크롬 사용자 제스처가 유지되어 폴더창이 뜬다. */
async function pcSave(subfolder, filename, obj){
  if(!window.showDirectoryPicker){ toast('크롬/엣지에서만 PC 폴더 저장이 됩니다.'); setTimeout(toastHide,2200); return false; }
  let root;
  try{ root=await window.showDirectoryPicker({mode:'readwrite', startIn:(_dirHandle||undefined)}); }
  catch(e){
    if(e&&e.name==='AbortError'){ toast('저장 폴더 선택 취소 — 앱에는 저장됨'); setTimeout(toastHide,1800); return false; }
    try{ root=await window.showDirectoryPicker({mode:'readwrite'}); }   // startIn 문제 시 재시도
    catch(e2){ if(e2&&e2.name==='AbortError'){ toast('저장 폴더 선택 취소 — 앱에는 저장됨'); setTimeout(toastHide,1800); } return false; }
  }
  _dirHandle=root; try{ await idbPut('meta',{key:'dirHandle',handle:root}); }catch(e){}
  try{
    const dir = subfolder ? await root.getDirectoryHandle(sanitizeName(subfolder), {create:true}) : root;
    const fh=await dir.getFileHandle(sanitizeName(filename), {create:true});
    const w=await fh.createWritable(); await w.write(JSON.stringify(obj,null,2)); await w.close();
    toast('✓ 저장: '+(root.name||'')+'/'+(subfolder?sanitizeName(subfolder)+'/':'')+filename); setTimeout(toastHide,2600);
    return true;
  }catch(e){ toast('PC 저장 실패: '+((e&&e.message)||e)); setTimeout(toastHide,2200); return false; }
}
function _idbDel(store,id){return new Promise(r=>{const q=tx(store,'readwrite').delete(id); q.onsuccess=()=>r();});}
function idbDel(store,id){ const p=_idbDel(store,id); if(cloudOn&&(store==='customers'||store==='pools')){ cloudSync(store==='customers'?'deleteCustomer':'deletePool', {id}); } return p; }
function _idbClear(store){return new Promise(r=>{const q=tx(store,'readwrite').clear(); q.onsuccess=()=>r();});}

/* ===================== 클라우드 동기화 (Cloudflare D1) ===================== */
let cloudPW='', cloudOn=false, localHasUnsynced=false, cloudMaster=false;
/* 담당자(설계사) 구분 — 2026-08-14 추가. 사이트 비밀번호(cloudPW)와는 별개로, 로그인한
   담당자 개인 비밀번호. 서버가 이 값으로 "이 사람 자료만" 걸러서 보여준다. */
let advisorId='', advisorPw='', advisorName='';
async function cloudCall(payload){
  const res=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let d={}; try{ d=await res.json(); }catch(e){ d={error:'응답 형식 오류 (HTTP '+res.status+')'}; }
  d._status=res.status; return d;
}
function cloudSync(action, item, baseUpdated){
  if(!cloudOn) return;
  const isSave=(action==='saveCustomer'||action==='savePool');
  const body=isSave
    ?{pw:cloudPW,advisorId,advisorPw,action,item,baseUpdated:baseUpdated||null,deviceId:getDeviceId()}
    :{pw:cloudPW,advisorId,advisorPw,action,id:item.id};
  fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.json()).then(d=>{
      if(d&&d.conflict){
        cloudFlag(false);
        const label=item&&(item.name||item.title)||'이 항목';
        toast('⚠ '+label+' — 다른 기기에서 방금 수정되어 이번 저장은 반영 안 됨. 다시 열어서 확인해주세요');
        setTimeout(toastHide, 4500);
        return;
      }
      cloudFlag(!(d&&d.error));
    }).catch(()=>cloudFlag(false));
}
function cloudFlag(ok){ const el=document.getElementById('cloud-dot'); if(el){ el.style.background=ok?'#10A87F':'#E0A800'; el.title=ok?'클라우드 동기화됨':'동기화 대기/오류'; } }
/* 1단계: 사이트 공통 비밀번호만 확인(아직 담당자는 모름 — 데이터는 안 불러옴). */
async function cloudLogin(pw, silent){
  try{
    const d=await cloudCall({pw, action:'check'});
    if(d && d.ok){ cloudPW=pw; cloudOn=true; try{ localStorage.setItem('cloudPW',pw); }catch(e){} return true; }
    if(!silent) loginMsg((d&&d.error)||'로그인 실패'); return false;
  }catch(e){ if(!silent) loginMsg('연결 실패: '+(e.message||e)); return false; }
}
/* 2단계: 담당자 개인 비밀번호 확인 + 그 담당자 자료만 불러오기.
   같은 기기에서 이전에 다른 담당자로 로그인했던 흔적이 있으면(=로컬에 그 사람 자료가 남아있으면)
   화면에 섞여 보이지 않도록 로컬 자료를 먼저 비운다(장비를 여러 담당자가 같이 쓰는 경우 대비). */
async function advisorLogin(id, pw, silent){
  try{
    const d=await cloudCall({pw:cloudPW, advisorId:id, advisorPw:pw, action:'advisorLogin'});
    if(d && d.ok){
      let prevId=''; try{ prevId=localStorage.getItem('advisorId')||''; }catch(e){}
      if(prevId && prevId!==id){ await _idbClear('customers'); await _idbClear('pools'); await _idbClear('images'); }
      advisorId=id; advisorPw=pw; advisorName=(d.advisor&&d.advisor.name)||'';
      try{ localStorage.setItem('advisorId',id); localStorage.setItem('advisorPw',pw); localStorage.setItem('advisorName',advisorName); }catch(e){}
      await mergeCloud(d);
      return true;
    }
    if(!silent && typeof advisorLoginMsg==='function') advisorLoginMsg((d&&d.error)||'로그인 실패');
    return false;
  }catch(e){ if(!silent && typeof advisorLoginMsg==='function') advisorLoginMsg('연결 실패: '+(e.message||e)); return false; }
}
/* 기기에 저장된 담당자 정보로 자동 로그인 시도(앱 재실행 시). 실패하면 담당자 선택 화면을 띄워야 함. */
async function trySilentAdvisorLogin(){
  let id='', pw=''; try{ id=localStorage.getItem('advisorId')||''; pw=localStorage.getItem('advisorPw')||''; }catch(e){}
  if(!id || !pw) return false;
  return await advisorLogin(id, pw, true);
}
/* 비밀번호 변경은 앱에서 지원하지 않음 — 서버(APP_PASSWORD)는 Cloudflare 환경변수 고정값이라
   Cloudflare 대시보드(Settings → Variables and secrets)에서 직접 변경해야 함. 2026-08-13 관련 버튼 제거.
   담당자 개인 비밀번호는 "담당자 관리"(관리자 전용) 화면에서 초기화할 수 있다. */
/* 클라우드 자료와 로컬 자료를 레코드 단위로 합친다.
   예전엔 클라우드에 자료가 있으면 로컬을 통째로 지우고 덮어썼는데(_idbClear), 그러면
   오프라인 중에 로컬에서만 수정하고 아직 클라우드에 못 올린 내용이 조용히 사라지는 문제가 있었다.
   그래서 이제는 id별로 updated를 비교해서, 로컬이 더 최신이거나 클라우드에 아예 없는 것은
   지우지 않고 그대로 두고, 대신 다시 클라우드로 올리도록 큐에 담는다. */
async function mergeRecords(store, cloudList){
  const localList=await idbAll(store);
  const localMap=new Map(localList.map(r=>[r.id,r]));
  const rePush=[]; // [record, baseUpdated]
  for(const cRec of cloudList){
    const loc=localMap.get(cRec.id);
    if(!loc || !loc.updated || (cRec.updated && cRec.updated>=loc.updated)){
      // 클라우드가 같거나 더 최신 — 로컬을 클라우드 값으로 맞춘다
      await _idbPut(store, cRec);
    } else {
      // 로컬이 더 최신(아직 안 올라간 수정) — 로컬을 유지하고 다시 올린다
      rePush.push([loc, cRec.updated||null]);
    }
    localMap.delete(cRec.id);
  }
  // 로컬에만 있고 클라우드엔 아예 없는 것(오프라인에서 새로 만든 레코드 등) — 그대로 두고 업로드 큐에
  for(const loc of localMap.values()) rePush.push([loc, null]);
  return rePush;
}
async function mergeCloud(d){
  const cc=d.customers||[], cp=d.pools||[];
  const rePushCust=await mergeRecords('customers', cc);
  const rePushPool=await mergeRecords('pools', cp);
  customers=await idbAll('customers'); pools=await idbAll('pools'); pools.forEach(p=>p.pinned=false);
  localHasUnsynced = (rePushCust.length>0 || rePushPool.length>0);
  for(const [rec, baseUpdated] of rePushCust) cloudSync('saveCustomer', rec, baseUpdated);
  for(const [rec, baseUpdated] of rePushPool) cloudSync('savePool', rec, baseUpdated);
  if(typeof fsDownloadMissing==='function') fsDownloadMissing();   // 백그라운드, 저장/화면전환을 막지 않음
}
async function cloudUpload(){
  if(!cloudOn){ alert('먼저 클라우드에 로그인하세요.'); return; }
  if(!customers.length && !pools.length){ alert('올릴 자료가 없습니다.'); return; }
  const d=await cloudCall({pw:cloudPW, advisorId, advisorPw, action:'bulkSave', customers, pools});
  if(d&&d.ok){ localHasUnsynced=false; alert('✓ 클라우드에 올렸습니다.\n고객 '+((d.saved&&d.saved.customers)||customers.length)+'명, 참조 '+((d.saved&&d.saved.pools)||pools.length)+'건'); goHome(); }
  else alert('업로드 실패: '+((d&&d.error)||'알 수 없음'));
}
function cloudLogout(){
  cloudOn=false; cloudPW=''; advisorId=''; advisorPw=''; advisorName='';
  try{ localStorage.removeItem('cloudPW'); localStorage.removeItem('advisorId'); localStorage.removeItem('advisorPw'); localStorage.removeItem('advisorName'); }catch(e){}
  showLogin();
}
/* 담당자만 바꾸기(사이트 로그인은 유지) — 같은 기기를 다른 담당자가 이어서 쓸 때.
   화면·로컬에 남아있던 이전 담당자 자료를 바로 비워서 잠깐이라도 섞여 보이지 않게 한다. */
async function advisorSwitch(){
  advisorId=''; advisorPw=''; advisorName='';
  try{ localStorage.removeItem('advisorId'); localStorage.removeItem('advisorPw'); localStorage.removeItem('advisorName'); }catch(e){}
  await _idbClear('customers'); await _idbClear('pools'); await _idbClear('images');
  customers=[]; pools=[];
  if(typeof showAdvisorPicker==='function') showAdvisorPicker();
}
function loginMsg(m){ const el=document.getElementById('login-msg'); if(el){ el.textContent=m||''; el.style.display=m?'block':'none'; } }
function showLogin(){ const ov=document.getElementById('ov-login'); if(ov){ ov.classList.add('show'); } const i=document.getElementById('login-pw'); if(i){ i.value=''; setTimeout(()=>i.focus(),100); } }
function hideLogin(){ const ov=document.getElementById('ov-login'); if(ov){ ov.classList.remove('show'); } }
async function doLogin(){
  const pw=(document.getElementById('login-pw').value||'').trim();
  if(!pw){ loginMsg('비밀번호를 입력하세요.'); return; }
  loginMsg('연결 중…');
  const ok=await cloudLogin(pw,false);
  if(!ok) return;
  hideLogin();
  const aok=await trySilentAdvisorLogin();
  if(aok) goHome();
  else if(typeof showAdvisorPicker==='function') showAdvisorPicker();
  else goHome();
}
function loginOffline(){ cloudOn=false; hideLogin(); goHome(); }

/* ===================== 자동 저장 (모든 화면) ===================== */
let _custAST=null, _poolAST=null;
function autosaveFlash(){
  let el=document.getElementById('autosave-pill');
  if(!el){ el=document.createElement('div'); el.id='autosave-pill'; document.body.appendChild(el); }
  el.textContent='✓ 자동 저장됨'+(cloudOn?' · 클라우드':''); el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>{ el.classList.remove('show'); }, 1600);
}
function scheduleCustAutosave(){
  if(!editingCust) return;
  clearTimeout(_custAST);
  _custAST=setTimeout(async ()=>{
    if(!editingCust) return;
    readCustFields();
    if(!editingCust.name) return;                    // 이름 없으면 아직 저장 안 함
    if(!editingCust.id){ editingCust.id=uid(); editingCust.created=today(); }
    editingCust.updated=new Date().toISOString();
    editingCust.folder=editingCust.name;
    try{ await idbPut('customers',editingCust); customers=await idbAll('customers'); autosaveFlash(); }catch(e){}
  }, 2500);
}
function schedulePoolAutosave(){
  if(!editingPool) return;
  clearTimeout(_poolAST);
  _poolAST=setTimeout(async ()=>{
    if(!editingPool) return;
    const t=document.getElementById('p-title'); if(t) editingPool.title=(t.value||'').trim();
    const ta=document.getElementById('p-body'); if(ta && ta.style.display!=='none'){ editingPool.body=(ta.value||'').trim(); editingPool.bodyFull=editingPool.hasFull?(editingPool.bodyFull||editingPool.body):editingPool.body; }
    const fr=document.getElementById('p-freetags'); if(fr) editingPool.free=(fr.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!editingPool.title) return;                   // 제목 없으면 아직 저장 안 함
    if(!editingPool.id){ editingPool.id=uid(); editingPool.created=today(); }
    try{ await idbPut('pools',editingPool); pools=await idbAll('pools'); autosaveFlash(); }catch(e){}
  }, 2500);
}
/* PC로 전체 백업 (폴더 한 번 선택 → 고객+참조 파일 저장) */
async function pcBackupAll(){
  if(!customers.length && !pools.length){ alert('백업할 자료가 없습니다.'); return; }
  if(!window.showDirectoryPicker){ alert('크롬/엣지에서만 PC 폴더 백업이 됩니다.'); return; }
  let root;
  try{ root=await window.showDirectoryPicker({mode:'readwrite', startIn:(_dirHandle||undefined)}); }
  catch(e){ if(e&&e.name==='AbortError'){ toast('백업 취소 — 자료는 앱/클라우드에 있습니다'); setTimeout(toastHide,1800); } return; }
  _dirHandle=root;
  try{
    const dir=await root.getDirectoryHandle('_전체백업',{create:true});
    // 고객(이미지 포함 완전 백업)
    const ids=new Set(); customers.forEach(c=>{(c.images||[]).forEach(i=>ids.add(i)); (c.planImages||[]).forEach(i=>ids.add(i));});
    const images=[]; for(const id of ids){ const rec=await idbGet('images',id); if(rec&&rec.blob){ images.push({id:rec.id,kind:rec.kind,created:rec.created,dataURL:await blobToDataURL(rec.blob)}); } }
    await _writeJson(dir,'고객전체백업_'+today()+'.json',{type:'customers-backup',exported:today(),customers,images});
    // 참조풀(첨부 사진·음원까지 포함한 완전 백업)
    const poolIds=new Set(); pools.forEach(p=>{(p.images||[]).forEach(i=>poolIds.add(i)); if(p.audio) poolIds.add(p.audio);});
    const poolImages=[]; for(const id of poolIds){ const rec=await idbGet('images',id); if(rec&&rec.blob){ poolImages.push({id:rec.id,kind:rec.kind,created:rec.created,dataURL:await blobToDataURL(rec.blob)}); } }
    await _writeJson(dir,'참조풀전체_'+today()+'.json',{type:'pools-backup',exported:today(),pools,images:poolImages});
    toast('✓ PC 백업 완료: '+(root.name||'')+'/_전체백업/'); setTimeout(toastHide,2600);
  }catch(e){ toast('백업 실패: '+((e&&e.message)||e)); setTimeout(toastHide,2200); }
}
async function _writeJson(dir,name,obj){ const fh=await dir.getFileHandle(sanitizeName(name),{create:true}); const w=await fh.createWritable(); await w.write(JSON.stringify(obj,null,2)); await w.close(); }
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today=()=>new Date().toISOString().slice(0,10);
const now=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());};
const oneLine=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>(n||46)?s.slice(0,n||46)+'…':s;};

/* ---------- 상태 ---------- */
let customers=[], pools=[], curScreen='customers';
let lastAnalysis=null;
let currentCustId=null;   // 고객상세→참조풀→분석으로 이어지는 '작업 고객'
let appMode='';           // '' | 'connected'(연결 진행) | 'separate'(별도 진행)
let pinnedOwner=null;     // 현재 선택(pinned)이 어느 고객의 것인지
/* 작업 고객이 바뀌면 그 고객이 저장해둔 선택(pinnedPools)으로 복원. 새 고객이면 초기화 */
function ensurePinsForCustomer(custId){
  const owner=custId||null;
  if(owner===pinnedOwner) return;
  pinnedOwner=owner;
  const c=owner?customers.find(x=>x.id===owner):null;
  const set=new Set((c&&c.pinnedPools)||[]);
  pools.forEach(p=>{ p.pinned = c ? set.has(p.id) : false; });
}
const ANALYZE_URL='/api/analyze';
let editingCust=null, editingPool=null, poolType='case';
let custFilter={seg:'전체', src:'전체'};
let custSearch='';   // 고객 목록 상단 이름 검색어
let poolFilter=[];
let objectUrls=[];

function freeUrls(){objectUrls.forEach(u=>URL.revokeObjectURL(u)); objectUrls=[];}
function blobUrl(b){const u=URL.createObjectURL(b); objectUrls.push(u); return u;}

/* ---------- 헤더 ---------- */
/* micFn을 넘기면(=그 화면에서 음성 명령을 지원하면) 헤더에 🎤 버튼이 생기고, 누르면 micFn이 실행된다.
   지원 안 하는 기기(예: 아이폰 사파리)에서는 호출부에서 voiceSupported()로 걸러 아예 안 넘기면 버튼 자체가 안 생긴다. */
function header(title,sub,micFn){
  const old=document.querySelector('header.top'); if(old) old.remove();
  const h=document.createElement('header'); h.className='top';
  const ml = appMode==='connected' ? '상담·분석' : (appMode==='separate' ? '자료 준비' : '');
  const mb = ml ? '<span class="mode-badge mb-'+appMode+'">'+ml+'</span>' : '';
  const mic = micFn ? '<button class="mic-btn" id="hdr-mic-btn" aria-label="음성 명령" title="음성으로 고객 찾기·추가">🎤</button>' : '';
  h.innerHTML='<button class="home-btn" onclick="goHome()" aria-label="홈">⌂</button><div class="ht"><h1>'+title+'</h1><div class="sub">'+sub+'</div></div>'+mic+mb;
  document.getElementById('app').prepend(h);
  if(micFn){ const mb2=document.getElementById('hdr-mic-btn'); if(mb2) mb2.onclick=micFn; }
}

/* ---------- 네비 ---------- */
function go(s){
  curScreen=s; freeUrls();
  const home=document.getElementById('s-home'); if(home) home.classList.remove('active');
  const oldHdr=document.querySelector('header.top'); if(oldHdr) oldHdr.remove();
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById('s-'+s).classList.add('active');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('on'));
  const tb=document.getElementById('tab-'+s); if(tb) tb.classList.add('on');
  const nav=document.querySelector('nav.tabs'); if(nav) nav.style.display='flex';
  const fab=document.getElementById('fab');
  if(fab) fab.style.display = (s==='analysis'||s==='ap')?'none':'flex';
  if(s==='customers') renderCustomers();
  if(s==='pools'){ renderPools(); renderPoolCtx(); }
  if(s==='analysis'){
    fillAnalysisSelect();
    if(currentCustId && customers.some(c=>c.id===currentCustId)){
      ensurePinsForCustomer(currentCustId);
      const pk=document.getElementById('an-picker'); if(pk) pk.style.display='none';
      const sel=document.getElementById('an-cust'); if(sel){ sel.value=currentCustId; anStep=1; renderAnalysis(); }
    }
  }
  if(s==='ap') fillApSelect();
  window.scrollTo(0,0);
}
function goHome(){
  curScreen='home'; freeUrls();
  document.body.removeAttribute('data-mode'); appMode=''; currentCustId=null;
  const oldHdr=document.querySelector('header.top'); if(oldHdr) oldHdr.remove();
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const home=document.getElementById('s-home'); if(home) home.classList.add('active');
  const nav=document.querySelector('nav.tabs'); if(nav) nav.style.display='none';
  const fab=document.getElementById('fab'); if(fab) fab.style.display='none';
  updateCloudUI();
  window.scrollTo(0,0);
}
function updateCloudUI(){
  const st=document.getElementById('cloud-status'), dot=document.getElementById('cloud-dot');
  const up=document.getElementById('cloud-upload-row'), lo=document.getElementById('cloud-logout');
  const sw=document.getElementById('advisor-switch');
  const advisorLabel = advisorId ? ('☁ '+(advisorName||'담당자')+' 로 연결됨') : '오프라인 (이 기기 자료만)';
  if(st) st.textContent = cloudOn ? (advisorId ? advisorLabel : ('☁ 클라우드 연결됨'+(cloudMaster?' (초기 비밀번호 — 변경 권장)':''))) : '오프라인 (이 기기 자료만)';
  if(dot) dot.style.background = cloudOn ? (advisorId ? '#10A87F' : (cloudMaster?'#E0A800':'#EAFff6')) : '#cfd8dc';
  if(up) up.style.display = (cloudOn && localHasUnsynced) ? 'block' : 'none';
  if(lo) lo.style.display = cloudOn ? 'inline' : 'none';
  if(sw) sw.style.display = (cloudOn && advisorId) ? 'inline' : 'none';
}
/* 첫 화면 두 창 */
function enterConnected(){ appMode='connected'; document.body.setAttribute('data-mode','connected'); currentCustId=null; go('customers'); }
function enterSeparate(){ appMode='separate'; document.body.setAttribute('data-mode','separate'); currentCustId=null; go('customers'); }
function onFab(){ if(curScreen==='customers') openCustomer(null); else if(curScreen==='pools') openPool(null); }

/* ---------- chip helpers ---------- */
function chipGroup(el, items, selected, multi, onchange){
  el.innerHTML='';
  items.forEach(it=>{
    const val=Array.isArray(it)?it[0]:it, label=Array.isArray(it)?it[1]:it;
    const c=document.createElement('div'); c.className='chip'+(el.classList.contains('tags')?' tag':'');
    c.textContent=label;
    const isOn = multi ? selected.includes(val) : selected===val;
    if(isOn) c.classList.add('on');
    c.onclick=()=>{
      if(multi){ const i=selected.indexOf(val); if(i>=0) selected.splice(i,1); else selected.push(val); }
      else { selected=val; }
      chipGroup(el,items,selected,multi,onchange);
      if(onchange) onchange(selected);
    };
    el.appendChild(c);
  });
}

