/* 저장 없이 참조풀로 이동 (앱에만 조용히 반영해 선택 기억이 되게 함) */
async function goToPoolFromCust(){
  readCustFields();
  if(!editingCust.name){alert('이름을 입력하세요.'); return;}
  if(!editingCust.id){editingCust.id=uid(); editingCust.created=today();}
  editingCust.updated=new Date().toISOString();
  await idbPut('customers',editingCust);
  customers=await idbAll('customers');
  currentCustId=editingCust.id;
  go('pools');
}
/* 보장결과 팝업: 저장 후 팝업 유지 + 버튼 '저장완료' 표시 (닫기로 고객상세 복귀) */
async function saveCoverageResult(btn){
  const id=await saveCustomerCore(); if(!id) return;
  renderCustomers();
  if(btn){ btn.textContent='저장완료 ✓ · 아래 닫기로 돌아가세요'; btn.disabled=true; btn.style.opacity='0.7'; }
}
function resetCovSave(){ const b=document.getElementById('cov-save-btn'); if(b){ b.textContent='저장'; b.disabled=false; b.style.opacity=''; } }
/* 고객상세 → 저장 후 분석 화면으로 연결 (그 고객 자동 선택 + 위저드 시작) */
async function saveCustomerThenAnalyze(){
  const id=await saveCustomerCore(); if(!id) return;
  currentCustId=id;
  go('analysis');
  const sel=document.getElementById('an-cust'); if(sel) sel.value=id;
  anStep=1; renderAnalysis();
}
/* 고객상세 → 저장 후 참조풀로 (그 고객을 물고 자료 선택) */
async function saveCustomerThenPool(){
  const id=await saveCustomerCore(); if(!id) return;
  currentCustId=id;
  go('pools');
}
/* ===== 고객 신상정보(참조용) — 날짜·장소·내용 누적 ===== */
function openProfileSheet(){
  editingCust.profileLogs=editingCust.profileLogs||[];
  document.getElementById('pf-date').value=today();
  document.getElementById('pf-place').value='';
  document.getElementById('pf-content').value='';
  renderProfileLogs();
  openSheet('ov-profile');
}
async function addProfileLog(){
  const date=document.getElementById('pf-date').value||'';
  const place=document.getElementById('pf-place').value.trim();
  const content=document.getElementById('pf-content').value.trim();
  if(!content){ alert('내용을 입력하세요.'); return; }
  editingCust.profileLogs=editingCust.profileLogs||[];
  editingCust.profileLogs.unshift({date,place,content,at:now()});
  if(editingCust.id){ try{ await idbPut('customers',editingCust); customers=await idbAll('customers'); }catch(e){} }
  document.getElementById('pf-place').value='';
  document.getElementById('pf-content').value='';
  renderProfileLogs();
  toast('기록 추가됨'); setTimeout(toastHide,1000);
}
async function delProfileLog(i){
  if(!editingCust.profileLogs||!editingCust.profileLogs[i]) return;
  if(!confirm('이 기록을 삭제할까요?')) return;
  editingCust.profileLogs.splice(i,1);
  if(editingCust.id){ try{ await idbPut('customers',editingCust); customers=await idbAll('customers'); }catch(e){} }
  renderProfileLogs();
}
function renderProfileLogs(){
  const wrap=document.getElementById('pf-list'); if(!wrap) return;
  const list=editingCust&&editingCust.profileLogs||[];
  if(!list.length){ wrap.innerHTML='<div class="stage-note">아직 기록이 없습니다. 위에서 추가하세요.</div>'; return; }
  let h='<label class="f">기록 ('+list.length+')</label>';
  h+=list.map((e,i)=>'<div class="card" style="padding:10px 12px"><div class="row" style="align-items:center;margin-bottom:4px">'
    +'<span style="font-size:13px;font-weight:700">'+esc(e.date||'')+(e.place?' · '+esc(e.place):'')+'</span><span class="spacer"></span>'
    +'<button class="btn danger sm" onclick="delProfileLog('+i+')">삭제</button></div>'
    +'<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.6;color:var(--ink-soft)">'+esc(e.content||'')+'</div></div>').join('');
  wrap.innerHTML=h;
}
async function deleteCustomer(){
  if(!editingCust.id||!confirm('이 고객을 삭제할까요? 첨부 이미지도 함께 삭제됩니다.')) return;
  const delId=editingCust.id;
  for(const ref of (editingCust.images||[])) await idbDel('images',ref);
  await idbDel('customers',delId);
  customers=await idbAll('customers');
  /* 상담·분석(연결 진행) 화면이 이 고객을 "작업 고객"으로 물고 있었다면 그 상태도 같이 정리한다.
     안 지우면 분석 화면으로 돌아갔을 때 이미 삭제된 고객의 이전 분석 결과가 남아있는 채로 보일 수 있음. */
  if(currentCustId===delId){
    currentCustId=null;
    lastAnalysis=null;
    const sel=document.getElementById('an-cust'); if(sel) sel.value='';
    const anBody=document.getElementById('an-body'); if(anBody) anBody.innerHTML='<div class="empty">분석할 고객을 선택하세요.</div>';
  }
  go('customers');
}
function blobToDataURL(blob){return new Promise(res=>{const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob);});}

/* ===================== 저장소 관리 ===================== */
function fmtBytes(b){ b=b||0; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(0)+' KB'; return (b/1048576).toFixed(1)+' MB'; }
let lastStorageDiagnostic=null;
function _diagBlob(rec){ return !!(rec&&rec.blob&&typeof rec.blob.size==='number'); }
function _diagKindStats(records){
  const out={};
  records.forEach(r=>{ const k=(r.kind||'미지정').trim()||'미지정'; if(!out[k]) out[k]={count:0,bytes:0}; out[k].count++; out[k].bytes+=_diagBlob(r)?r.blob.size:0; });
  return out;
}
async function _diagSha256(blob){
  if(!(window.crypto&&crypto.subtle&&blob&&blob.arrayBuffer)) return null;
  const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function runStorageDiagnostic(){
  const [diagCustomers,diagPools,diagImages]=await Promise.all([idbAll('customers'),idbAll('pools'),idbAll('images')]);
  const imageById=new Map(diagImages.map(r=>[r.id,r]));
  const refs=new Map();
  const addRef=(id,ref)=>{ if(!id) return; const list=refs.get(id)||[]; list.push(ref); refs.set(id,list); };
  diagCustomers.forEach(c=>{ (c.images||[]).forEach(id=>addRef(id,{ownerType:'customer',ownerId:c.id,ownerName:c.name||'(이름 없음)',slot:'images'})); (c.planImages||[]).forEach(id=>addRef(id,{ownerType:'customer',ownerId:c.id,ownerName:c.name||'(이름 없음)',slot:'planImages'})); });
  diagPools.forEach(p=>{ (p.images||[]).forEach(id=>addRef(id,{ownerType:'pool',ownerId:p.id,ownerName:p.title||'(제목 없음)',slot:'images'})); if(p.audio) addRef(p.audio,{ownerType:'pool',ownerId:p.id,ownerName:p.title||'(제목 없음)',slot:'audio'}); });
  const allRefs=Array.from(refs.entries()).flatMap(([id,list])=>list.map(ref=>Object.assign({fileId:id},ref)));
  const missingReferences=allRefs.filter(ref=>!imageById.has(ref.fileId)||!_diagBlob(imageById.get(ref.fileId)));
  const duplicateReferences=Array.from(refs.entries()).filter(([,list])=>list.length>1).map(([fileId,list])=>({fileId,references:list}));
  const orphanBlobs=diagImages.filter(r=>!refs.has(r.id));
  const validReferences=allRefs.filter(ref=>imageById.has(ref.fileId)&&_diagBlob(imageById.get(ref.fileId)));
  const customerStats=diagCustomers.map(c=>{
    const ids=[...(c.images||[]),...(c.planImages||[])]; const unique=[...new Set(ids)]; const files=unique.map(id=>imageById.get(id)).filter(_diagBlob);
    return {id:c.id,name:c.name||'(이름 없음)',imagesCount:(c.images||[]).length,planImagesCount:(c.planImages||[]).length,referencedFileCount:ids.length,uniqueFileCount:unique.length,foundFileCount:files.length,missingFileCount:unique.length-files.length,totalBytes:files.reduce((n,r)=>n+r.blob.size,0)};
  });
  const poolStats=diagPools.map(p=>{
    const ids=[...(p.images||[]),...(p.audio?[p.audio]:[])]; const unique=[...new Set(ids)]; const files=unique.map(id=>imageById.get(id)).filter(_diagBlob);
    return {id:p.id,title:p.title||'(제목 없음)',imagesCount:(p.images||[]).length,audioCount:p.audio?1:0,referencedFileCount:ids.length,uniqueFileCount:unique.length,foundFileCount:files.length,missingFileCount:unique.length-files.length,totalBytes:files.reduce((n,r)=>n+r.blob.size,0)};
  });
  const hashGroups=new Map(); let hashErrors=0;
  for(const rec of diagImages){
    if(!_diagBlob(rec)) continue;
    try{ const hash=await _diagSha256(rec.blob); if(!hash) continue; const list=hashGroups.get(hash)||[]; list.push({id:rec.id,kind:rec.kind||'미지정',sizeBytes:rec.blob.size,created:rec.created||null}); hashGroups.set(hash,list); }
    catch(e){ hashErrors++; }
  }
  const duplicateBlobs=Array.from(hashGroups.entries()).filter(([,files])=>files.length>1).map(([sha256,files])=>({sha256,files,totalBytes:files.reduce((n,f)=>n+f.sizeBytes,0)}));
  const customerRefIds=new Set(); diagCustomers.forEach(c=>{(c.images||[]).forEach(id=>customerRefIds.add(id));(c.planImages||[]).forEach(id=>customerRefIds.add(id));});
  const poolRefIds=new Set(); diagPools.forEach(p=>{(p.images||[]).forEach(id=>poolRefIds.add(id));if(p.audio)poolRefIds.add(p.audio);});
  const customerFiles=diagImages.filter(r=>customerRefIds.has(r.id)&&_diagBlob(r));
  const poolFiles=diagImages.filter(r=>poolRefIds.has(r.id)&&_diagBlob(r));
  const customerUnreferencedBlobs=diagImages.filter(r=>!customerRefIds.has(r.id)&&_diagBlob(r));
  const poolUnreferencedBlobs=diagImages.filter(r=>!poolRefIds.has(r.id)&&_diagBlob(r));
  const totalBlobBytes=diagImages.reduce((n,r)=>n+(_diagBlob(r)?r.blob.size:0),0);
  const blobMetadata=r=>({id:r.id,kind:r.kind||'미지정',created:r.created||null,sizeBytes:_diagBlob(r)?r.blob.size:0});
  const report={
    reportType:'storage-diagnostic',version:1,generatedAt:new Date().toISOString(),
    summary:{customers:diagCustomers.length,pools:diagPools.length,customerFiles:customerFiles.length,customerFileBytes:customerFiles.reduce((n,r)=>n+r.blob.size,0),poolFiles:poolFiles.length,poolFileBytes:poolFiles.reduce((n,r)=>n+r.blob.size,0),indexedDbImageRecords:diagImages.length,indexedDbBlobCount:diagImages.filter(_diagBlob).length,indexedDbTotalBytes:totalBlobBytes,validReferences:validReferences.length,missingReferences:missingReferences.length,orphanBlobs:orphanBlobs.length,orphanBlobBytes:orphanBlobs.reduce((n,r)=>n+(_diagBlob(r)?r.blob.size:0),0),duplicateReferenceGroups:duplicateReferences.length,duplicateBlobs:duplicateBlobs.length,hashErrors},
    customers:customerStats,pools:poolStats,
    fileKindStats:_diagKindStats(diagImages),
    customerIntegrity:{validReferences:validReferences.filter(x=>x.ownerType==='customer'),missingReferences:missingReferences.filter(x=>x.ownerType==='customer'),duplicateReferences:duplicateReferences.filter(x=>x.references.some(r=>r.ownerType==='customer')),unreferencedBlobs:customerUnreferencedBlobs.map(blobMetadata)},
    poolIntegrity:{validReferences:validReferences.filter(x=>x.ownerType==='pool'),missingReferences:missingReferences.filter(x=>x.ownerType==='pool'),duplicateReferences:duplicateReferences.filter(x=>x.references.some(r=>r.ownerType==='pool')),unreferencedBlobs:poolUnreferencedBlobs.map(blobMetadata)},
    missingReferences,duplicateReferences,
    orphanBlobs:orphanBlobs.map(blobMetadata),
    duplicateBlobs,
    migrationEstimate:{originalFileCount:diagImages.filter(_diagBlob).length,totalBytes:totalBlobBytes,missingFileCount:missingReferences.length,orphanFileCount:orphanBlobs.length,duplicateFileGroupCount:duplicateBlobs.length}
  };
  lastStorageDiagnostic=report;
  console.log('=== STORAGE DIAGNOSTIC REPORT ===');
  console.log('Customers:',report.summary.customers,'Pools:',report.summary.pools);
  console.log('Customer files:',report.summary.customerFiles,'Customer file size:',fmtBytes(report.summary.customerFileBytes));
  console.log('Pool files:',report.summary.poolFiles,'Pool file size:',fmtBytes(report.summary.poolFileBytes));
  console.log('IndexedDB images:',report.summary.indexedDbBlobCount,'IndexedDB total size:',fmtBytes(report.summary.indexedDbTotalBytes));
  console.log('Valid references:',report.summary.validReferences,'Missing references:',report.summary.missingReferences,'Orphan blobs:',report.summary.orphanBlobs,'Duplicate blobs:',report.summary.duplicateBlobs);
  console.log('Storage diagnostic details:',report);
  return report;
}
function _diagRows(items,render,empty){ return items.length?items.map(render).join(''):'<div class="meta">'+esc(empty||'없음')+'</div>'; }
function renderCloudFileSyncSection(){
  if(typeof fsSyncSummary!=='function') return '';
  const s=fsSyncSummary();
  if(!s.cloudOn){
    return '<div class="card" style="margin-top:12px"><div style="font-size:14px;font-weight:700">☁ 클라우드 파일 동기화</div>'
      +'<div class="meta" style="margin-top:6px">오프라인 상태입니다. 로그인하면 사진·음성 파일도 클라우드에 백업됩니다.</div></div>';
  }
  if(s.bucketMissing){
    return '<div class="card" style="margin-top:12px"><div style="font-size:14px;font-weight:700">☁ 클라우드 파일 동기화</div>'
      +'<div class="meta" style="margin-top:6px">⚠ 서버에 파일 저장소(R2)가 아직 설정되지 않았습니다. 관리자가 Cloudflare 대시보드에서 R2 버킷을 연결하면 사용할 수 있습니다.</div></div>';
  }
  return '<div class="card" style="margin-top:12px"><div style="font-size:14px;font-weight:700">☁ 클라우드 파일 동기화</div>'
    +'<div class="meta" style="margin-top:6px">참조된 파일 '+s.totalRefs+'개 · 업로드됨 '+s.uploaded+' · 대기 '+s.pendingUpload
    +(s.uploadFailed?' · ⚠ 업로드 실패 '+s.uploadFailed:'')+(s.downloadFailed?' · ⚠ 다운로드 실패 '+s.downloadFailed:'')+'</div>'
    +'<button class="btn ghost sm wide" style="margin-top:10px" onclick="fsSyncNow()">지금 동기화</button></div>';
}
function renderStorageDiagnostic(report){
  const s=report.summary;
  let h='<div class="card" style="margin-top:12px"><div style="font-size:14px;font-weight:700">=== STORAGE DIAGNOSTIC REPORT ===</div>'
    +'<div class="meta" style="margin-top:6px">Customers: '+s.customers+' · Pools: '+s.pools+'</div>'
    +'<div class="meta">Customer files: '+s.customerFiles+' · '+fmtBytes(s.customerFileBytes)+'</div>'
    +'<div class="meta">Pool files: '+s.poolFiles+' · '+fmtBytes(s.poolFileBytes)+'</div>'
    +'<div class="meta">IndexedDB images: '+s.indexedDbBlobCount+' · '+fmtBytes(s.indexedDbTotalBytes)+'</div>'
    +'<div class="meta">Valid references: '+s.validReferences+' · Missing: '+s.missingReferences+' · Orphans: '+s.orphanBlobs+' · Duplicate blobs: '+s.duplicateBlobs+'</div>'
    +'<button class="btn ghost sm wide" style="margin-top:10px" onclick="exportStorageDiagnostic()">JSON 내보내기 (Blob 제외)</button></div>';
  h+=renderCloudFileSyncSection();
  h+='<details style="margin-top:10px"><summary>고객별 파일 통계 ('+report.customers.length+')</summary>'+_diagRows(report.customers,x=>'<div class="meta" style="margin:6px 2px">'+esc(x.name)+' · 보장 '+x.imagesCount+' · 설계 '+x.planImagesCount+' · 확인 '+x.foundFileCount+'/'+x.uniqueFileCount+' · '+fmtBytes(x.totalBytes)+(x.missingFileCount?' · ⚠ 누락 '+x.missingFileCount:'')+'</div>','고객 없음')+'</details>';
  h+='<details style="margin-top:10px"><summary>참조풀별 파일 통계 ('+report.pools.length+')</summary>'+_diagRows(report.pools,x=>'<div class="meta" style="margin:6px 2px">'+esc(x.title)+' · 첨부 '+x.imagesCount+' · 음성 '+x.audioCount+' · 확인 '+x.foundFileCount+'/'+x.uniqueFileCount+' · '+fmtBytes(x.totalBytes)+(x.missingFileCount?' · ⚠ 누락 '+x.missingFileCount:'')+'</div>','참조풀 없음')+'</details>';
  h+='<details style="margin-top:10px"><summary>누락 파일 ('+report.missingReferences.length+')</summary>'+_diagRows(report.missingReferences,x=>'<div class="meta" style="margin:6px 2px">'+esc(x.ownerType)+' · '+esc(x.ownerName)+' · '+esc(x.slot)+' · '+esc(x.fileId)+'</div>','누락 참조 없음')+'</details>';
  h+='<details style="margin-top:10px"><summary>고아 파일 ('+report.orphanBlobs.length+')</summary>'+_diagRows(report.orphanBlobs,x=>'<div class="meta" style="margin:6px 2px">'+esc(x.kind)+' · '+fmtBytes(x.sizeBytes)+' · '+esc(x.id)+'</div>','고아 Blob 없음')+'</details>';
  h+='<details style="margin-top:10px"><summary>중복 Blob ('+report.duplicateBlobs.length+')</summary>'+_diagRows(report.duplicateBlobs,x=>'<div class="meta" style="margin:6px 2px">SHA-256 '+esc(x.sha256.slice(0,16))+'… · '+x.files.length+'개 · '+fmtBytes(x.totalBytes)+'<br>'+esc(x.files.map(f=>f.id).join(', '))+'</div>','중복 Blob 없음')+'</details>';
  h+='<details style="margin-top:10px"><summary>파일 종류별 통계</summary>'+_diagRows(Object.entries(report.fileKindStats),([k,v])=>'<div class="meta" style="margin:6px 2px">'+esc(k)+' · '+v.count+'개 · '+fmtBytes(v.bytes)+'</div>','파일 없음')+'</details>';
  return h;
}
async function showStorageDiagnostic(){
  const box=document.getElementById('storage-diagnostic-result'); if(box) box.innerHTML='<div class="stage-note">읽기 전용 진단 및 SHA-256 계산 중…</div>';
  try{ const report=await runStorageDiagnostic(); if(box) box.innerHTML=renderStorageDiagnostic(report); }
  catch(e){ if(box) box.innerHTML='<div class="stage-note">진단 실패: '+esc(e&&e.message?e.message:String(e))+'</div>'; }
}
function exportStorageDiagnostic(){
  if(!lastStorageDiagnostic){ toast('먼저 저장소 진단을 실행하세요'); setTimeout(toastHide,1500); return; }
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const blob=new Blob([JSON.stringify(lastStorageDiagnostic,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='storage-diagnostic-'+stamp+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
}
async function computeStorage(){
  let quota=0, usage=0;
  try{ if(navigator.storage&&navigator.storage.estimate){ const e=await navigator.storage.estimate(); quota=e.quota||0; usage=e.usage||0; } }catch(e){}
  const imgs=await idbAll('images');
  let totalBytes=0; imgs.forEach(r=>{ totalBytes+=(r.blob&&r.blob.size)||0; });
  const ref=new Set();
  customers.forEach(c=>{ (c.images||[]).forEach(id=>ref.add(id)); (c.planImages||[]).forEach(id=>ref.add(id)); });
  pools.forEach(p=>{ (p.images||[]).forEach(id=>ref.add(id)); if(p.audio) ref.add(p.audio); });
  const orphans=imgs.filter(r=>!ref.has(r.id));
  let orphanBytes=0; orphans.forEach(r=>orphanBytes+=(r.blob&&r.blob.size)||0);
  return {quota,usage,imgs,totalBytes,orphans,orphanBytes,ref};
}
let _qrLoading=null;
function loadQR(){
  if(window.QRCode) return Promise.resolve(window.QRCode);
  if(_qrLoading) return _qrLoading;
  _qrLoading=new Promise((res,rej)=>{ const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload=()=>res(window.QRCode); s.onerror=()=>{ _qrLoading=null; rej(new Error('QR 로드 실패')); };
    document.head.appendChild(s); });
  return _qrLoading;
}
function openShare(){
  openSheet('ov-share');
  const b=document.getElementById('share-body'); if(!b) return;
  const url=location.origin||('https://'+(location.host||'jam-customer-console.pages.dev'));
  b.innerHTML=
    '<div class="su-hero"><h3>📤 이 앱을 동료에게</h3><p>아래 <b>QR</b>을 찍거나 <b>링크</b>를 보내면, 그분은 열어서 <b>비밀번호만</b> 넣으면 바로 씁니다. (앱을 새로 만들 필요 없음)</p></div>'
    +'<div id="qr-box" style="display:flex;justify-content:center;padding:16px;background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:12px"><div class="meta">QR 만드는 중…</div></div>'
    +'<div class="su-key" style="display:block;text-align:center;padding:10px;word-break:break-all;margin-bottom:10px">'+esc(url)+'</div>'
    +'<button class="btn primary wide" id="share-native" style="display:none" onclick="shareNative()">📲 공유하기 (카톡·문자 등)</button>'
    +'<button class="btn ghost sm wide" style="margin-top:8px" onclick="copyShareLink()">🔗 링크 복사</button>'
    +'<div class="su-warn" style="margin-top:12px">⚠️ <b>비밀번호는 링크에 포함되지 않습니다.</b> 보안을 위해 비밀번호는 <b>따로</b> 알려주세요(카톡 등). 아무나 자료를 보면 안 되니까요.</div>'
    +'<div class="su-tip">💡 동료가 여는 방법은 <b>시스템 셋업 → 처음 쓰시는 분</b>에 그림으로 안내돼 있어요.</div>';
  // QR 생성
  loadQR().then(QR=>{ const box=document.getElementById('qr-box'); if(!box) return; box.innerHTML=''; new QR(box,{text:url,width:180,height:180,correctLevel:QR.CorrectLevel.M}); })
    .catch(()=>{ const box=document.getElementById('qr-box'); if(box) box.innerHTML='<div class="meta">QR을 못 만들었어요(인터넷 확인). 아래 링크를 복사해 보내세요.</div>'; });
  // 네이티브 공유 버튼(모바일)
  if(navigator.share){ const n=document.getElementById('share-native'); if(n) n.style.display='block'; }
}
function shareNative(){
  const url=location.origin||('https://'+location.host);
  if(navigator.share){ navigator.share({title:'고객상담 매니저', text:'고객상담 매니저 앱입니다. 열어서 비밀번호를 입력해 쓰세요.', url}).catch(()=>{}); }
}
async function copyShareLink(){
  const url=location.origin||('https://'+location.host);
  try{ await navigator.clipboard.writeText(url); toast('✓ 링크 복사됨 — 카톡 등에 붙여넣어 보내세요'); setTimeout(toastHide,2200); }
  catch(e){ prompt('아래 링크를 복사하세요:', url); }
}
function openSetup(){
  openSheet('ov-setup');
  const b=document.getElementById('setup-body'); if(!b) return;
  b.innerHTML =
    '<div class="su-hero"><h3>어떤 도움이 필요하세요?</h3><p>앱을 <b>처음 쓰시는 분</b>과, 앱을 <b>만들고 관리하는 분</b>의 안내가 다릅니다.</p></div>'
    +'<div class="home-card" style="margin-bottom:12px" onclick="renderUserGuide()"><div class="hc-ic" style="background:linear-gradient(150deg,#46C4F2,#0E8FCB)">📱</div><div><div class="hc-t">처음 쓰시는 분</div><div class="hc-d">앱 열기 · 로그인 · 홈화면 추가 (쉬움)</div></div><div class="hc-go">›</div></div>'
    +'<div class="home-card" style="margin-bottom:14px" onclick="renderAdminGuide()"><div class="hc-ic" style="background:linear-gradient(150deg,#34C79E,#0E9070)">⚙️</div><div><div class="hc-t">관리자 설정 (개발·배포)</div><div class="hc-d">API 키 · 클라우드 · D1 설정 (전문)</div></div><div class="hc-go">›</div></div>'
    +'<button class="btn primary wide" onclick="openShare()">📤 이 앱 공유하기 (QR·링크로 보내기)</button>'
    +'<div class="meta" style="text-align:center;margin-top:6px">동료에게 링크/QR로 보내면, 그분은 열어서 비밀번호만 넣으면 바로 씁니다.</div>';
}
function renderUserGuide(){
  const b=document.getElementById('setup-body'); if(!b) return;
  b.innerHTML =
  '<button class="btn ghost sm" onclick="openSetup()">‹ 뒤로</button>'
  +'<div class="su-hero" style="margin-top:10px"><h3>📱 앱 쓰는 법 (아주 쉬워요)</h3><p>어렵지 않아요. <b>3단계</b>만 하면 됩니다. 앱을 새로 만들 필요 없이, <b>열고 로그인</b>만 하면 끝!</p></div>'

  +'<div class="su-step blue"><span class="su-n">1</span><span class="su-t">앱 열기</span>'
    +'<div class="su-d"><b>받은 링크</b>를 누르세요(카톡 등으로 전달받음). 또는 인터넷 주소창에 아래를 입력합니다.</div>'
    +'<div class="su-key" style="display:block;margin-top:8px;padding:8px;text-align:center" id="ug-url">jam-customer-console.pages.dev</div>'
    +'<div class="su-tip">💡 <b>크롬</b>(안드로이드) 또는 <b>사파리</b>(아이폰)로 여세요.</div>'
  +'</div>'

  +'<div class="su-step blue"><span class="su-n">2</span><span class="su-t">비밀번호로 로그인</span>'
    +'<div class="su-d">앱을 처음 열면 <b>비밀번호</b>를 물어봅니다. <b>담당자에게 받은 비밀번호</b>를 넣고 <b>로그인</b>을 누르세요.</div>'
    +'<div class="su-tip">💡 한 번 로그인하면 그 기기는 <b>다음부터 자동으로</b> 열립니다. PC·폰·탭 <b>어디서든 같은 비밀번호</b>면 같은 자료가 보입니다.</div>'
  +'</div>'

  +'<div class="su-step green"><span class="su-n">3</span><span class="su-t">홈 화면에 아이콘으로 추가 (앱처럼)</span>'
    +'<div class="su-d">홈 화면에 아이콘을 만들어 두면, 다음부턴 <b>일반 앱처럼</b> 아이콘만 눌러 바로 열립니다.</div>'
    +'<div class="ug-os"><div class="ug-os-t">🤖 안드로이드 (크롬)</div>'
      +'<div class="su-d">① 오른쪽 위 <b>⋮ (점 세 개)</b> 누르기 → ② <b>"홈 화면에 추가"</b> 또는 <b>"앱 설치"</b> 누르기 → ③ <b>추가</b>.</div></div>'
    +'<div class="ug-os"><div class="ug-os-t">🍎 아이폰 (사파리)</div>'
      +'<div class="su-d">① 아래 가운데 <b>공유 버튼(□에 ↑ 화살표)</b> 누르기 → ② 목록을 내려 <b>"홈 화면에 추가"</b> 누르기 → ③ <b>추가</b>.</div></div>'
  +'</div>'

  +'<div class="su-step gray"><span class="su-n">✓</span><span class="su-t">이제 이렇게 쓰세요</span>'
    +'<ul>'
      +'<li>홈에서 <b>자료 준비</b>(고객·자료 넣기) 또는 <b>상담·분석</b>(정리·분석) 중 하나를 고릅니다.</li>'
      +'<li>입력하면 <b>자동으로 저장</b>됩니다("✓ 자동 저장됨" 표시). 저장 버튼을 깜빡해도 괜찮아요.</li>'
      +'<li><b>사진(보장표 사진)</b>은 <b>그 사진을 찍은 기기에만</b> 남습니다. 글자 자료(고객·분석)는 어디서든 보입니다.</li>'
    +'</ul>'
    +'<div class="su-warn">⚠️ <b>인터넷이 필요합니다.</b> 그리고 비밀번호를 잊지 않게 메모해 두세요. (분실 시 담당자에게 문의)</div>'
  +'</div>';
  const u=document.getElementById('ug-url'); if(u) u.textContent=location.host||'jam-customer-console.pages.dev';
}
function renderAdminGuide(){
  openSheet('ov-setup');
  const b=document.getElementById('setup-body'); if(!b) return;
  b.innerHTML =
  '<button class="btn ghost sm" onclick="openSetup()">‹ 뒤로</button>'
  +'<div class="su-hero" style="margin-top:10px"><h3>처음이라도 괜찮아요 👋</h3>'
  +'<p>이 앱은 <b>세 가지</b>가 연결돼 돌아갑니다. 아래 순서대로 따라 하면 됩니다. 중학생도 할 수 있어요.</p>'
  +'<div class="su-flow">'
    +'<div class="fb"><span class="fi">📁</span>GitHub<br>코드 보관</div>'
    +'<div class="fa">→</div>'
    +'<div class="fb"><span class="fi">☁️</span>Cloudflare<br>자동 배포</div>'
    +'<div class="fa">→</div>'
    +'<div class="fb"><span class="fi">🔑</span>API 키<br>AI 분석</div>'
  +'</div></div>'

  +'<div class="su-step green"><span class="su-n">1</span><span class="su-t">AI 분석용 열쇠(API 키) 만들기</span>'
    +'<div class="su-d">사진을 읽고 분석하는 건 <b>Anthropic(클로드)</b>의 AI가 합니다. 이걸 쓰려면 <b>API 키</b>(=프로그램 전용 열쇠)가 필요해요. <span class="su-key">platform.claude.com</span> 에서 발급합니다.</div>'
    +'<ol>'
      +'<li><b>platform.claude.com</b> 접속 → 회원가입 (구글 계정으로 바로 가입 가능). <b>이건 claude.ai 채팅과 다른, 개발자용 계정</b>이에요.</li>'
      +'<li>왼쪽 <b>Settings(설정) → API keys</b> 이동.</li>'
      +'<li><b>Create Key</b> 클릭 → 이름 입력(예: <span class="su-key">jam-console</span>) → 생성.</li>'
      +'<li>키가 <b>sk-ant-…</b> 로 나옵니다. <b>이 화면에서 딱 한 번만 보여줘요.</b> 바로 복사해서 안전한 곳(메모 앱 등)에 저장!</li>'
    +'</ol>'
    +'<div class="su-warn">⚠️ <b>API 키는 비밀번호와 같습니다.</b> 남에게 보여주거나, GitHub 같은 공개된 곳에 절대 올리지 마세요. 잃어버리면 다시 못 보니 새로 만들어야 합니다.</div>'
    +'<a class="su-link green" href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">🔑 API 키 발급 페이지 열기</a>'
  +'</div>'

  +'<div class="su-step green"><span class="su-n">2</span><span class="su-t">크레딧(사용 금액) 충전하기</span>'
    +'<div class="su-d">AI 분석은 <b>쓴 만큼 돈이 나가는 방식(선불 충전)</b>입니다. 무료로 무한정 쓸 수는 없고, <b>미리 크레딧을 충전</b>해 둬야 분석이 됩니다.</div>'
    +'<ol>'
      +'<li>같은 사이트에서 <b>Billing(결제)</b> 메뉴로 이동.</li>'
      +'<li><b>신용카드 등록</b> 후 크레딧 충전. 처음엔 <b>$5~$10</b>이면 충분히 테스트됩니다.</li>'
      +'<li><b>월 사용 한도(Spend limit)</b>를 꼭 설정하세요. 예상치 못한 과금을 막아줍니다. (예: 월 $20)</li>'
    +'</ol>'
    +'<div class="su-tip">💡 이 앱은 정리에 <b>저렴한 모델(Haiku)</b>, 깊은 분석에 <b>Sonnet</b>을 쓰도록 만들어 비용을 아낍니다. 보통 사진 한 세트 분석에 몇십 원~몇백 원 수준이에요. 홈 화면 분석에서 <b>잔액이 줄어드는 것</b>도 보입니다.</div>'
    +'<a class="su-link green" href="https://platform.claude.com/settings/billing" target="_blank" rel="noopener">💳 크레딧 충전 페이지 열기</a>'
  +'</div>'

  +'<div class="su-step blue"><span class="su-n">3</span><span class="su-t">Cloudflare에 API 키 넣기</span>'
    +'<div class="su-d">앱은 <b>Cloudflare</b>라는 곳에서 돌아갑니다. AI에 요청할 때 Cloudflare가 <b>대신</b> 열쇠(API 키)를 써서 안전하게 처리해요. 그래서 <b>키를 Cloudflare에 등록</b>해야 합니다.</div>'
    +'<ol>'
      +'<li>Cloudflare 대시보드 → <b>Workers & Pages</b> → 이 프로젝트(<span class="su-key">jam-customer-console</span>) 선택.</li>'
      +'<li><b>Settings → Variables and Secrets(환경 변수)</b> 이동.</li>'
      +'<li><b>변수 추가</b>: 이름 <span class="su-key">ANTHROPIC_API_KEY</span>, 값에는 1단계에서 복사한 <span class="su-key">sk-ant-…</span> 키를 붙여넣기. (Secret로 저장 권장)</li>'
      +'<li>저장 후 <b>다시 배포(Retry deployment)</b> 하면 적용됩니다.</li>'
    +'</ol>'
    +'<div class="su-warn">⚠️ 변수 이름은 <b>정확히 ANTHROPIC_API_KEY</b> 여야 합니다. 오타가 있으면 분석이 안 돼요.</div>'
    +'<a class="su-link blue" href="https://dash.cloudflare.com" target="_blank" rel="noopener">☁️ Cloudflare 대시보드 열기</a>'
  +'</div>'

  +'<div class="su-step gray"><span class="su-n">4</span><span class="su-t">(처음 만드는 경우) GitHub + Cloudflare 연결</span>'
    +'<div class="su-d">이미 배포돼 있다면 이 단계는 건너뛰어도 됩니다. <b>처음부터</b> 만든다면:</div>'
    +'<ul>'
      +'<li><b>GitHub</b>: 코드를 보관하는 창고. 계정 만들고 <b>저장소(Repository)</b>를 하나 만든 뒤 <span class="su-key">index.html</span>과 <span class="su-key">analyze.js</span>를 올립니다.</li>'
      +'<li><b>Cloudflare Pages</b>: 그 GitHub 저장소를 <b>연결</b>하면, 이후엔 코드를 커밋할 때마다 <b>몇 초 뒤 자동으로 배포</b>됩니다.</li>'
    +'</ul>'
    +'<div class="su-tip">💡 두 파일 <b>index.html</b>과 <b>analyze.js</b>는 <b>항상 같이 커밋</b>하세요. 하나만 올리면 화면과 분석 버전이 어긋나 오류가 납니다.</div>'
    +'<a class="su-link dark" href="https://github.com" target="_blank" rel="noopener">📁 GitHub 열기</a> &nbsp; '
    +'<a class="su-link blue" href="https://dash.cloudflare.com" target="_blank" rel="noopener">☁️ Cloudflare 열기</a>'
  +'</div>'

  +'<div class="su-step gray"><span class="su-n">5</span><span class="su-t">잘 됐는지 확인하는 법</span>'
    +'<ul>'
      +'<li><b>버전 확인</b>: 홈 화면 아래 <b>v숫자</b>가 올라갔으면 배포 성공.</li>'
      +'<li><b>분석 테스트</b>: 고객에 보장 사진을 넣고 "AI로 정리·분석"을 눌러 결과가 나오면 API 키·크레딧까지 정상.</li>'
      +'<li>분석이 안 되면 → ① 크레딧 잔액 확인 ② Cloudflare 변수 이름 확인 ③ 두 파일 같이 커밋했는지 확인.</li>'
    +'</ul>'
    +'<div class="su-warn">💰 <b>크레딧이 0이 되면 분석이 멈춥니다.</b> 가끔 잔액을 확인하고 충전하세요.</div>'
  +'</div>'

  +'<div class="su-hero" style="margin-top:6px"><h3>📂 자료는 어디에 저장되나요?</h3><p>이 앱은 <b>두 곳</b>에 자료를 저장합니다. 자동으로 처리되니 참고만 하세요.</p></div>'

  +'<div class="su-step blue"><span class="su-n">A</span><span class="su-t">이 기기 저장소 (브라우저 안)</span>'
    +'<div class="su-d">모든 자료는 먼저 <b>지금 쓰는 기기의 브라우저 안(저장소)</b>에 저장됩니다. 인터넷이 없어도 이 기기에서는 바로 열립니다.</div>'
    +'<ul>'
      +'<li><b>사진(보장표·설계서 이미지)</b>은 먼저 <b>이 기기에</b> 저장됩니다. 아래 클라우드 파일 저장소(R2)가 연결돼 있으면 자동으로 클라우드에도 올라가 다른 기기에서도 보입니다 — 연결 여부는 <b>저장소 관리 → 클라우드 파일 동기화</b> 카드에서 확인하세요.</li>'
      +'<li>홈 <b>저장소 관리</b>에서 사용량·이미지를 확인·정리할 수 있습니다.</li>'
    +'</ul>'
    +'<div class="su-warn">⚠️ 크롬에서 "인터넷 사용 기록 삭제 → 쿠키 및 사이트 데이터"를 지우면 <b>이 기기 저장분이 사라집니다.</b> 그래서 아래 클라우드(B)와 PC 백업을 함께 씁니다.</div>'
  +'</div>'

  +'<div class="su-step green"><span class="su-n">B</span><span class="su-t">클라우드 저장 (Cloudflare D1)</span>'
    +'<div class="su-d"><b>고객·참조·보장분석·가입설계 등 텍스트 자료</b>는 <b>클라우드(Cloudflare D1)</b>에도 <b>자동 저장</b>됩니다. 그래서 <b>PC·폰·탭 어디서든 같은 비밀번호로 로그인하면 같은 자료</b>가 보입니다.</div>'
    +'<ul>'
      +'<li>저장할 때마다(또는 입력 중 자동으로) 클라우드에 자동 반영됩니다. 홈에 <b>☁ 클라우드 연결됨</b> 표시.</li>'
      +'<li>새 기기에서 처음 쓸 때는 홈의 <b>⬆ 이 기기 자료를 클라우드로 올리기</b>로 한 번 올리면 됩니다.</li>'
      +'<li>여기(D1)에는 <b>텍스트만</b> 저장됩니다. <b>사진·음원 파일</b>은 별도의 클라우드 파일 저장소(Cloudflare R2)가 연결돼 있으면 자동으로 올라갑니다 — 아래 <b>저장소 관리 → 클라우드 파일 동기화</b> 카드의 "업로드됨 N개"로 확인하세요(이 계정은 이미 연결되어 정상 작동 중입니다).</li>'
    +'</ul>'
    +'<div class="su-tip">💡 D1 무료 범위는 <b>저장 5GB</b>로, 텍스트만 쓰는 이 앱에는 넘치게 충분합니다. 카드 등록을 안 했다면 한도를 넘어도 <b>결제가 아니라 잠깐 멈추기만</b> 합니다(다음 날 초기화).</div>'
    +'<div class="su-d" style="margin-top:8px"><b>설정 요약</b>(한 번만): ① D1 데이터베이스 <span class="su-key">jam-console-db</span> 생성 → ② Pages에 바인딩 <span class="su-key">DB</span> 연결 → ③ 환경변수 <span class="su-key">APP_PASSWORD</span>(로그인 비밀번호) 설정 → ④ 함수 파일 <span class="su-key">functions/api/data.js</span> 배포.</div>'
    +'<a class="su-link green" href="https://dash.cloudflare.com" target="_blank" rel="noopener">☁️ Cloudflare 대시보드 열기</a>'
  +'</div>'

  +'<div class="su-step gray"><span class="su-n">C</span><span class="su-t">PC로 전체 백업 (수동)</span>'
    +'<div class="su-d">가끔 <b>내 PC 폴더에 파일로도</b> 백업해 두면 가장 안전합니다. 홈의 <b>💾 PC로 전체 백업</b> 버튼을 누르고 폴더를 고르면, 고객·참조·분석 전체가 파일로 저장됩니다.</div>'
    +'<div class="su-tip">💡 PC 백업은 폴더 선택창 때문에 <b>버튼을 눌러야만</b> 됩니다(자동 불가). 데이터 자체는 클라우드에 자동 저장되니, PC 백업은 <b>가끔 한 번씩</b>이면 충분합니다.</div>'
  +'</div>'

  +'<div class="su-hero" style="margin-top:6px"><h3>👥 여러 담당자(설계사)가 같이 쓰기</h3><p>2026-08-14부터 최대 20명까지 담당자별로 자료를 분리해서 쓸 수 있습니다. 처음 한 번만 설정하면 됩니다.</p></div>'

  +'<div class="su-step blue"><span class="su-n">D</span><span class="su-t">관리자 비밀번호(ADMIN_PASSWORD) 만들기</span>'
    +'<div class="su-d">담당자를 추가·삭제하는 "담당자 관리" 화면은 <b>앱 공통 비밀번호와는 다른 별도의 관리자 비밀번호</b>로 보호됩니다. 담당자 20명이 공통 비밀번호를 알아도 이 화면은 못 엽니다.</div>'
    +'<ol>'
      +'<li>Cloudflare 대시보드 → 이 프로젝트 → <b>Settings → Variables and Secrets</b>.</li>'
      +'<li><b>변수 추가</b>: 이름 <span class="su-key">ADMIN_PASSWORD</span>, 값에는 원하는 관리자 전용 비밀번호(직원들에게 알려주지 않는 값). Secret로 저장 권장.</li>'
      +'<li>저장 후 <b>다시 배포(Retry deployment)</b>.</li>'
    +'</ol>'
    +'<a class="su-link blue" href="https://dash.cloudflare.com" target="_blank" rel="noopener">☁️ Cloudflare 대시보드 열기</a>'
  +'</div>'

  +'<div class="su-step green"><span class="su-n">E</span><span class="su-t">담당자 등록 & 기존 자료 배정</span>'
    +'<div class="su-d">배포가 끝나면, 앱의 로그인 화면 아래 <b>⚙ 담당자 관리</b>를 눌러 관리자 비밀번호로 들어갑니다.</div>'
    +'<ol>'
      +'<li>맨 위 <b>초기 설정 실행</b> 버튼을 한 번 누릅니다(처음 한 번만 필요 — D1에 필요한 테이블을 자동으로 만듭니다).</li>'
      +'<li><b>담당자 추가</b>로 설계사 이름과 개인 비밀번호를 한 명씩 등록합니다(최대 20명).</li>'
      +'<li>지금까지 있던 기존 고객·참조 자료는 아직 담당자가 안 정해진 상태입니다. 담당자 목록에서 대표님(또는 그 자료를 관리할 분) 옆의 <b>기존자료 받기</b> 버튼을 눌러 배정하세요.</li>'
      +'<li>이후 담당자가 바뀌면(퇴사 등) <b>자료 이전</b> 버튼으로 그 담당자의 자료를 통째로 다른 담당자에게 옮길 수 있습니다.</li>'
    +'</ol>'
    +'<div class="su-tip">💡 각 담당자는 이름을 고르고 본인 비밀번호만 입력하면 됩니다. 아이디를 따로 외울 필요가 없어요.</div>'
  +'</div>'

  +'<div style="text-align:center;color:var(--ink-mute);font-size:12px;margin:6px 0 4px">막히면 각 단계의 파란/초록 버튼을 눌러 해당 사이트로 바로 이동하세요.</div>';
}
async function openStorage(){
  openSheet('ov-storage');
  const body=document.getElementById('storage-body'); if(!body) return;
  body.innerHTML='<div class="stage-note">저장소 계산 중…</div>';
  const s=await computeStorage();
  const owner={};
  customers.forEach(c=>{ (c.images||[]).forEach(id=>owner[id]=(c.name||'고객')+' · 보장'); (c.planImages||[]).forEach(id=>owner[id]=(c.name||'고객')+' · 설계'); });
  pools.forEach(p=>{ (p.images||[]).forEach(id=>owner[id]=(p.title||'풀')); if(p.audio) owner[p.audio]=(p.title||'풀')+' · 음원'; });
  let h='';
  h+='<div class="card">';
  if(s.quota){ const pct=Math.min(100,Math.round(s.usage/s.quota*100));
    h+='<div style="font-size:14px;font-weight:700">브라우저 저장소 사용량</div>';
    h+='<div style="font-size:22px;font-weight:800;color:var(--accent);margin:4px 0">'+fmtBytes(s.usage)+' <span style="font-size:12.5px;color:var(--ink-mute);font-weight:500">/ 한도 약 '+fmtBytes(s.quota)+' ('+pct+'%)</span></div>';
    h+='<div style="height:8px;border-radius:5px;background:var(--line);overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(pct>=80?'var(--no)':'var(--accent)')+'"></div></div>';
  } else { h+='<div style="font-size:14px;font-weight:700">저장소 사용량</div><div class="meta">브라우저가 정확한 사용량을 제공하지 않습니다.</div>'; }
  h+='<div class="meta" style="margin-top:8px">이미지 '+s.imgs.length+'장 · 이미지 합계 '+fmtBytes(s.totalBytes)+'</div>';
  h+='<div class="meta">※ 저장 데이터는 이 PC 크롬(C 드라이브)에 보관됩니다. 사진이 용량 대부분을 차지합니다.</div>';
  h+='</div>';
   h+='<div class="card"><div style="font-size:14px;font-weight:700;margin-bottom:4px">안 쓰는 이미지 정리</div>';
  h+='<div class="meta" style="margin-bottom:8px">어떤 고객·자료에도 연결되지 않은 이미지 <b>'+s.orphans.length+'장</b> ('+fmtBytes(s.orphanBytes)+')</div>';
   h+='<button class="btn '+(s.orphans.length?'danger':'ghost')+' wide"'+(s.orphans.length?'':' disabled style="opacity:.5"')+' onclick="cleanOrphans()">안 쓰는 이미지 '+s.orphans.length+'장 삭제 · '+fmtBytes(s.orphanBytes)+' 확보</button></div>';
   h+='<div class="card"><div style="font-size:14px;font-weight:700;margin-bottom:4px">Phase 0.5 저장소 진단</div><div class="meta" style="margin-bottom:8px">고객·참조풀·IndexedDB Blob을 읽기 전용으로 대조합니다. 파일을 수정하거나 삭제하지 않습니다.</div><button class="btn ghost wide" onclick="showStorageDiagnostic()">저장소 진단 실행</button><div id="storage-diagnostic-result"></div></div>';
  const sorted=s.imgs.slice().sort((a,b)=>((b.blob&&b.blob.size)||0)-((a.blob&&a.blob.size)||0));
  h+='<label class="f">이미지 목록 (큰 것부터'+(sorted.length>80?' · 상위 80':'')+')</label>';
  if(!sorted.length) h+='<div class="stage-note">저장된 이미지가 없습니다.</div>';
  sorted.slice(0,80).forEach(r=>{
    const own=owner[r.id]||'⚠ 미연결(안 씀)';
    h+='<div class="card" style="padding:8px 11px"><div class="row" style="align-items:center">'
      +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(r.kind||'기타')+' · '+fmtBytes((r.blob&&r.blob.size)||0)+'</div>'
      +'<div class="meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(own)+' · '+esc(r.created||'')+'</div></div>'
      +'<button class="btn danger sm" style="margin-left:8px" onclick="deleteOneImage(\''+r.id+'\')">삭제</button></div></div>';
  });
  body.innerHTML=h;
}
async function cleanOrphans(){
  const s=await computeStorage();
  if(!s.orphans.length){ toast('정리할 이미지가 없습니다'); setTimeout(toastHide,1500); return; }
  if(!confirm('연결 안 된 이미지 '+s.orphans.length+'장 ('+fmtBytes(s.orphanBytes)+')을 삭제할까요?\n되돌릴 수 없습니다.')) return;
  for(const r of s.orphans){ try{ await idbDel('images', r.id); }catch(e){} }
  toast('✓ '+s.orphans.length+'장 삭제 · 약 '+fmtBytes(s.orphanBytes)+' 확보'); setTimeout(toastHide,2400);
  openStorage();
}
async function deleteOneImage(id){
  if(!confirm('이 이미지를 삭제할까요? 연결된 고객·자료가 있으면 거기서도 사라집니다. 되돌릴 수 없습니다.')) return;
  let changed=false;
  for(const c of customers){ const before=(c.images||[]).length+(c.planImages||[]).length;
    c.images=(c.images||[]).filter(x=>x!==id); c.planImages=(c.planImages||[]).filter(x=>x!==id);
    if(((c.images.length)+(c.planImages.length))!==before){ await idbPut('customers',c); changed=true; } }
  for(const p of pools){ let ch=false;
    if((p.images||[]).includes(id)){ p.images=p.images.filter(x=>x!==id); ch=true; }
    if(p.audio===id){ p.audio=null; ch=true; }
    if(ch){ await idbPut('pools',p); changed=true; } }
  try{ await idbDel('images', id); }catch(e){}
  if(changed){ customers=await idbAll('customers'); pools=await idbAll('pools'); }
  toast('삭제됨'); setTimeout(toastHide,1200);
  openStorage();
}
/* 전송 전 이미지 축소·재압축: 긴 변 maxDim, JPEG 품질 q. base64(헤더 제외) 반환 */
function blobToScaledBase64(blob, maxDim, q){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      try{
        let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
        const scale=Math.min(1, maxDim/Math.max(w,h));
        w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        const durl=cv.toDataURL('image/jpeg', q||0.72);
        URL.revokeObjectURL(img.src);
        resolve((durl.split(',')[1])||'');
      }catch(e){ reject(e); }
    };
    img.onerror=()=>{ URL.revokeObjectURL(img.src); reject(new Error('이미지를 열 수 없습니다(HEIC 등은 JPG/PNG로).')); };
    img.src=URL.createObjectURL(blob);
  });
}
async function exportCustomers(){
  if(!customers.length){alert('백업할 고객이 없습니다.'); return;}
  const ids=new Set(); customers.forEach(c=>(c.images||[]).forEach(id=>ids.add(id)));
  const images=[];
  for(const id of ids){ const rec=await idbGet('images',id); if(rec&&rec.blob){ images.push({id:rec.id,kind:rec.kind,created:rec.created,dataURL:await blobToDataURL(rec.blob)}); } }
  const payload={type:'customers-backup',exported:today(),customers,images};
  const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='고객백업_'+today()+'.json'; a.click();
}
async function importCustomers(e){
  const f=e.target.files&&e.target.files[0]; if(!f){return;}
  try{
    const data=JSON.parse(await f.text());
    const custs=data.customers||[], imgs=data.images||[];
    for(const im of imgs){ if(im&&im.id&&im.dataURL){ const blob=await (await fetch(im.dataURL)).blob(); await idbPut('images',{id:im.id,kind:im.kind,created:im.created,blob}); } }
    for(const c of custs){ if(c&&c.id){ await idbPut('customers',c); } }
    customers=await idbAll('customers'); renderCustomers();
    alert('불러오기 완료: 고객 '+custs.length+'명, 이미지 '+imgs.length+'장');
  }catch(err){ alert('파일을 읽을 수 없습니다. 고객 백업 파일이 맞는지 확인하세요.'); }
  e.target.value='';
}

/* =========================================================
   참조 풀 (3단계 기반)
========================================================= */
const POOL_LABEL={icebreak:['아이스브레이크','첫 만남 대화 소재를 쌓아 라포(친밀감) 형성','등록된 아이스브레이크가 없어요'],case:['상담사례','상담사례를 쌓아 분석에 활용','등록된 사례가 없어요'],episode:['에피소드','설득·공감 에피소드를 쌓아 제안에 활용','등록된 에피소드가 없어요'],catalog:['상품카달로그','상품 자료를 올려 보장·가입설계 분석에 참조','등록된 카달로그가 없어요']};
function setPoolType(t){
  poolType=(t==='episode'||t==='catalog'||t==='icebreak')?t:'case'; poolFilter=[];
  ['icebreak','case','episode','catalog'].forEach(k=>{const b=document.getElementById('pt-'+k); if(b) b.classList.toggle('on',k===poolType);});
  renderPools();
}
function renderPools(){
  ensurePinsForCustomer(currentCustId);
  renderPoolCtx();
  const L=POOL_LABEL[poolType]||POOL_LABEL.case;
  header('참조 풀', L[1]);
  const items=pools.filter(p=>p.poolType===poolType);
  // filter chips = union of product tags
  const allTags=[...new Set(items.flatMap(p=>p.product||[]))];
  const fEl=document.getElementById('pool-filter');
  fEl.innerHTML='';
  allTags.forEach(t=>{const c=document.createElement('div'); c.className='chip'+(poolFilter.includes(t)?' on':'');
    c.textContent=t; c.onclick=()=>{const i=poolFilter.indexOf(t); if(i>=0)poolFilter.splice(i,1); else poolFilter.push(t); renderPools();}; fEl.appendChild(c);});

  let list=items.slice().sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  if(poolFilter.length) list=list.filter(p=>poolFilter.every(t=>(p.product||[]).includes(t)));

  const wrap=document.getElementById('pool-list');
  if(list.length===0){ wrap.innerHTML='<div class="empty"><div class="big">'+L[2]+'</div>자료 등록·수정은 "⚙ 관리자 화면 → 참조풀 관리"에서 합니다.</div>'; return; }
  let html='<div class="meta" style="margin-bottom:10px">📌 참조풀 자료(내용)는 이제 "⚙ 관리자 화면 → 참조풀 관리"에서 전체 담당자 공용으로 관리합니다. 항목을 누르면 AI가 정리한 내용을 볼 수 있고, 아래에서 이 고객 <b>분석에 포함</b>할 자료를 체크하세요(체크가 없으면 자동으로 비슷한 걸 골라 씁니다).</div>';
  list.forEach(p=>{
    let rb=''; if(poolType==='case'&&p.result){const rc=RESULTS.find(r=>r[0]===p.result); rb='<span class="badge b-'+(rc?rc[1]:'hold')+'">'+p.result+'</span>';}
    const tags=[...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].slice(0,6).map(t=>'<span class="pt">'+esc(t)+'</span>').join('');
    const pin=!!p.pinned;
    const toggleLabel=pin?'☑ 분석에 포함됨':'☐ 분석에 포함';
    const pinBtn='<span onclick="togglePin(event,\''+p.id+'\')" style="cursor:pointer;font-size:13px;font-weight:700;padding:5px 12px;border-radius:14px;white-space:nowrap;border:1.5px solid '+(pin?'var(--accent);color:#fff;background:var(--accent)':'var(--accent);color:var(--accent);background:#fff')+'">'+toggleLabel+'</span>';
    html+='<div class="card tap" onclick="viewPoolItem(\''+p.id+'\')">'
      +'<div class="row" style="margin-bottom:4px;align-items:center"><span class="name" style="font-size:15px">'+esc(p.title||'(제목 없음)')+'</span><span class="spacer"></span>'+rb+' '+pinBtn+'</div>'
      +'<div class="pill-tags">'+tags+'</div>'
      +'<div class="meta" style="margin-top:6px;">'+(p.created||'')+(p.audio?' · ♪ 음원':'')+((p.images&&p.images.length)?' · ◇ 이미지 '+p.images.length:'')+'</div></div>';
  });
  wrap.innerHTML=html;
}
/* 항목을 누르면 관리자 화면에서 AI가 정리한 내용을 그대로 보여준다(읽기 전용 —
   수정·삭제는 "⚙ 관리자 화면 → 참조풀 관리"에서만 가능). */
async function viewPoolItem(id){
  const p=pools.find(x=>x.id===id); if(!p) return;
  const tags=[...(p.product||[]),...(p.situation||[]),...(p.age||[]),...(p.free||[])].map(t=>'<span class="pt">'+esc(t)+'</span>').join('');
  const toc=p.tocSummary||p.summaryFull||'';       // 새 형식(목차식 요약) 우선, 예전 형식(summaryFull)은 폴백
  const kc=p.keyContent||p.bodyFull||p.body||'';   // 새 형식(개조식 핵심내용) 우선, 예전 형식(원문)은 폴백
  let h='';
  if(p.result){ const rc=RESULTS.find(r=>r[0]===p.result); h+='<span class="badge b-'+(rc?rc[1]:'hold')+'" style="margin-bottom:8px;display:inline-block">'+esc(p.result)+'</span>'; }
  if(tags) h+='<div class="pill-tags" style="margin-bottom:12px">'+tags+'</div>';
  if(toc) h+='<div style="font-weight:700;margin-bottom:4px">요약</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--ink-soft);margin-bottom:14px">'+esc(toc)+'</div>';
  h+='<div style="font-weight:700;margin-bottom:4px">'+(toc?'핵심내용':'내용')+'</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.75;color:var(--ink)">'+esc(kc||'(내용 없음)')+'</div>';
  if(p.images&&p.images.length) h+='<div style="font-weight:700;margin:16px 0 4px">첨부 자료</div><div class="thumbs" id="poolview-thumbs"></div>';
  if(p.audio) h+='<div id="poolview-audio" style="margin-top:16px"></div>';
  h+='<div class="meta" style="margin-top:16px">✎ 내용 수정·삭제는 "⚙ 관리자 화면 → 참조풀 관리"에서만 할 수 있어요.</div>';
  openSubPage(p.title||'참조 자료', h);
  if(p.images&&p.images.length){
    const wrap=document.getElementById('poolview-thumbs');
    if(wrap){
      for(const ref of p.images){
        const rec=await idbGet('images',ref);
        const d=document.createElement('div'); d.className='thumb';
        if(rec&&rec.blob) d.innerHTML='<img src="'+blobUrl(rec.blob)+'" onclick="openLightbox(this.src)">';
        else d.innerHTML='<span class="k">아직 안 내려받아졌어요</span>';
        wrap.appendChild(d);
      }
    }
  }
  if(p.audio){
    const rec=await idbGet('images',p.audio);
    const box=document.getElementById('poolview-audio');
    if(box){
      if(rec&&rec.blob) box.innerHTML='<audio controls style="width:100%" src="'+blobUrl(rec.blob)+'"></audio>';
      else box.innerHTML='<div class="meta">♪ 음원(아직 이 기기로 안 내려받아졌어요 — 홈 화면에서 잠시 후 다시 열어보세요)</div>';
    }
  }
}
async function togglePin(ev,id){
  ev.stopPropagation();
  const p=pools.find(x=>x.id===id); if(!p) return;
  p.pinned=!p.pinned;
  if(currentCustId){ const c=customers.find(x=>x.id===currentCustId); if(c){ c.pinnedPools=pools.filter(x=>x.pinned).map(x=>x.id); try{ await idbPut('customers',c); customers=await idbAll('customers'); }catch(e){} } }
  renderPools(); renderPoolCtx();
  toast(p.pinned?'이 고객의 선택으로 저장됨':'선택 해제'); setTimeout(toastHide,1200);
}
function pinnedCount(){ return pools.filter(p=>p.pinned).length; }
/* 참조풀 상단: 지금 이어서 작업 중인 고객 배너 (선택→분석 연결) */
function renderPoolCtx(){
  const box=document.getElementById('pool-ctx'); if(!box) return;
  const acts=document.getElementById('pool-actions');
  const c=currentCustId?customers.find(x=>x.id===currentCustId):null;
  if(acts) acts.style.display = c ? 'none' : 'block';   // 물고가기 모드: 하단 버튼 숨김
  if(!c){ box.innerHTML=''; return; }
  const pn=pinnedCount();
  box.innerHTML='<div style="border:1px solid var(--accent);border-radius:12px;padding:11px 13px;margin-bottom:14px;background:rgba(46,125,50,0.06)">'
    +'<div class="row" style="align-items:center"><span style="font-size:14px;font-weight:700;color:var(--accent)">◉ '+esc(c.name)+' 고객 작업 중</span><span class="spacer"></span>'
    +'<button class="btn ghost sm" onclick="clearWorkingCust()">해제</button></div>'
    +'<div class="meta" style="margin-top:4px">아래에서 이 고객 <b>분석에 포함</b>할 자료를 체크하세요 — 지금 '+pn+'개 포함됨. 체크한 자료가 이 고객의 보장분석·가입설계에 반영됩니다(체크가 없으면 자동으로 비슷한 걸 골라줘요).</div>'
    +'<div class="row" style="margin-top:9px"><button class="btn ghost grow" onclick="openWorkingCust()">← 고객상세로</button><button class="btn primary grow" onclick="poolToAnalysisCarry()">이 고객으로 분석 →</button></div></div>';
}
function poolToAnalysis(){ currentCustId=null; go('analysis'); }        // 하단 버튼: 고객 안 물고 감
function poolToAnalysisCarry(){ go('analysis'); }                        // 배너 버튼: 작업고객 물고 감
/* 하단 탭 이동: 상담·분석(연결) 모드에서는 "작업 고객"을 그대로 물고 간다(이름물고가기).
   자료 준비(별도) 모드에서는 예전처럼 탭을 옮기면 작업 고객을 해제한다. */
function navGo(s){ go(s); }
function openWorkingCust(){
  if(currentCustId && customers.some(c=>c.id===currentCustId)){ openCustomer(currentCustId); }
  else { go('customers'); toast('작업 고객이 없어요. 고객을 먼저 선택하세요.'); setTimeout(toastHide,1400); }
}
function clearWorkingCust(){ currentCustId=null; renderPoolCtx(); toast('작업 고객 해제됨'); setTimeout(toastHide,1000); }
function openPool(id){
  const p = id ? pools.find(x=>x.id===id) : {id:null,poolType,free:[],product:[],situation:[],age:[],audio:null,body:'',bodyFull:'',hasFull:false};
  editingPool=JSON.parse(JSON.stringify(p));
  editingPool.product=editingPool.product||[]; editingPool.situation=editingPool.situation||[]; editingPool.age=editingPool.age||[];
  const L=POOL_LABEL[poolType]||POOL_LABEL.case;
  document.getElementById('pool-title').textContent = id?'항목 편집':(L[0]+' 등록');
  document.getElementById('p-delete').style.display=id?'flex':'none';
  document.getElementById('p-title').value=p.title||'';
  document.getElementById('p-body').value=p.body||'';
  document.getElementById('p-freetags').value=(p.free||[]).join(', ');
  chipGroup(document.getElementById('pool-product'),PRODUCTS,editingPool.product,true);
  chipGroup(document.getElementById('pool-situation'),SITUATIONS,editingPool.situation,true);
  chipGroup(document.getElementById('pool-age'),AGES,editingPool.age,true);
  renderPoolBrief();
  renderPoolAudio();
  const dropEl=document.getElementById('p-drop'); if(dropEl) enableDrop(dropEl, importFileToBody, f=>isPdfFile(f)||(f.type&&f.type.indexOf('text')===0)||/\.txt$/i.test(f.name||''));
  openSheet('ov-pool');
}
function renderPoolAudio(){
  const wrap=document.getElementById('p-audio'); wrap.innerHTML='';
  if(editingPool.audio){
    idbGet('images',editingPool.audio).then(rec=>{
      if(rec&&rec.blob){
        const a=document.createElement('audio'); a.controls=true; a.style.width='100%'; a.src=blobUrl(rec.blob);
        wrap.appendChild(a);
        const del=document.createElement('button'); del.className='btn danger sm wide'; del.style.marginTop='8px';
        del.textContent='음원 삭제'; del.onclick=removePoolAudio; wrap.appendChild(del);
      } else addAudioBtn(wrap);
    });
  } else addAudioBtn(wrap);
}
function addAudioBtn(wrap){
  const add=document.createElement('button'); add.className='btn ghost sm wide';
  add.textContent='＋ 음원 추가'; add.onclick=pickPoolAudio; wrap.appendChild(add);
}
/* ---------- 가입설계서 이미지 ---------- */
async function renderPoolThumbs(){
  const wrap=document.getElementById('p-thumbs'); if(!wrap) return; wrap.innerHTML='';
  for(const ref of (editingPool.images||[])){
    const rec=await idbGet('images',ref);
    const d=document.createElement('div'); d.className='thumb';
    if(rec&&rec.blob){ d.innerHTML='<img src="'+blobUrl(rec.blob)+'" onclick="event.stopPropagation();openLightbox(this.src)"><span class="k">'+(rec.kind||'설계서')+'</span><button class="del" onclick="removePoolImage(event,\''+ref+'\')">×</button>'; }
    else d.innerHTML='<span class="k">없음</span>';
    wrap.appendChild(d);
  }
  const add=document.createElement('div'); add.className='add-thumb';
  add.innerHTML='<span style="font-size:22px">＋</span>파일 추가';
  add.onclick=pickPoolImage;
  wrap.appendChild(add);
  const cam=document.createElement('div'); cam.className='add-thumb';
  cam.innerHTML='<span style="font-size:22px">📷</span>카메라 촬영';
  cam.onclick=pickPoolCamera;
  wrap.appendChild(cam);
  enableDrop(wrap, addPoolImageDirect);
}
function pickPoolCamera(){
  const inp=document.getElementById('cam-input'); inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addPoolImageDirect(f); }
  };
  inp.click();
}
function removePoolImage(e,ref){e.stopPropagation(); editingPool.images=(editingPool.images||[]).filter(x=>x!==ref); idbDel('images',ref); renderPoolThumbs();}
function pickPoolImage(){
  const inp=document.getElementById('img-input'); inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addPoolImageDirect(f); }
  };
  inp.click();
}
function addPoolImageDirect(file){
  if(isPdfFile(file)){ editingPool.images=editingPool.images||[]; return addPdfInto(file, editingPool.images, '자료', renderPoolThumbs, null); }
  return new Promise(res=>{
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
            editingPool.images=editingPool.images||[]; editingPool.images.push(rid);
            await renderPoolThumbs(); res();
          },'image/jpeg',0.72);
        }catch(err){ alert('이미지 처리 중 오류: '+(err&&err.message?err.message:err)); res(); }
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function pickPoolText(){
  const inp=document.getElementById('txt-input'); inp.value='';
  inp.onchange=async e=>{const f=e.target.files&&e.target.files[0]; inp.onchange=null; if(!f) return; await importFileToBody(f);};
  inp.click();
}
async function aiSummarize(text){
  if(!cloudOn) throw new Error('AI 요약 기능은 로그인 후 사용할 수 있습니다.');
  const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pw:cloudPW, advisorId, advisorPw, mode:'summarize',text})});
  const data=await res.json();
  if(!res.ok) throw new Error(data.error||'요약 실패');
  addUsage(data._usage,'요약');
  return (data.summary||'').trim();
}
async function importFileToBody(file){
  const ta=document.getElementById('p-body'); if(!ta) return;
  try{
    let full='';
    if(isPdfFile(file)){
      toast('PDF 여는 중…');
      // 1) 텍스트 레이어 우선 추출 (디지털 텍스트 또는 스캔본 OCR 레이어) — 빠르고 저렴
      full=(await extractPdfText(file)).trim();
      if(full.length>=30){
        toast('PDF 텍스트 추출 완료');
      } else {
        // 2) 텍스트 레이어 없는 순수 스캔 → 이미지 렌더 후 OCR 폴백
        toast('스캔 PDF — 이미지에서 글자 추출 중…');
        const blobs=await pdfToImageBlobs(file,(n,N)=>toast('PDF 페이지 변환 중… '+n+'/'+N));
        await ensureTesseract();
        const parts=[];
        for(let i=0;i<blobs.length;i++){
          toast('PDF 글자 추출 중… '+Math.round((i/blobs.length)*100)+'%');
          const url=URL.createObjectURL(blobs[i]);
          const r=await Tesseract.recognize(url,'kor+eng',{}); URL.revokeObjectURL(url);
          const x=(r.data.text||'').trim(); if(x) parts.push(x);
        }
        full=parts.join('\n\n').trim();
      }
    } else {
      full=(await file.text()||'').trim();
    }
    if(!full){ toastHide(); alert('파일에서 읽을 텍스트가 없습니다.'); return; }
    editingPool.bodyFull = editingPool.bodyFull ? (editingPool.bodyFull+'\n\n'+full) : full;
    editingPool.hasFull = true;
    const _pg=startProgress(p=>toast('AI 요약 중… '+p+'%'));
    let summary=''; try{ summary=await aiSummarize(editingPool.bodyFull); }catch(e){ summary=''; }
    _pg.done(); toastHide();
    editingPool.summaryFull = summary || full.slice(0,2000);
    editingPool.brief = oneLine(summary || full, 60);
    editingPool.body = editingPool.brief;   // 리스트·검색용 짧은 본문 (전체는 bodyFull)
    ta.value = '';                           // 큰 텍스트영역엔 덤프하지 않음 (요약창으로 대체)
    renderPoolBrief();
  }catch(err){ toastHide(); alert('파일 처리 실패: '+(err&&err.message?err.message:err)); }
}
/* 참조풀: 불러온 자료 요약창(5~6줄) — 누르면 전체화면. 요약이 있으면 텍스트영역은 숨김 */
function renderPoolBrief(){
  const box=document.getElementById('p-brief'); if(!box) return;
  const ta=document.getElementById('p-body');
  const sum=(editingPool&&(editingPool.summaryFull||editingPool.brief))||'';
  if(!sum){ box.innerHTML=''; if(ta) ta.style.display=''; return; }
  if(ta) ta.style.display='none';   // 요약이 있으면 큰 텍스트영역 숨김
  box.innerHTML='<div onclick="showPoolFull()" style="cursor:pointer;border:1px solid var(--accent);border-radius:10px;padding:11px 13px;background:rgba(46,125,50,0.05)">'
    +'<div class="meta" style="color:var(--accent);font-weight:600;margin-bottom:5px">📄 불러온 자료 요약 · 눌러서 전체 보기 ›</div>'
    +'<div style="font-size:13.5px;line-height:1.6;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden">'+esc(sum)+'</div></div>';
}
function showPoolFull(){
  const sumF=(editingPool&&editingPool.summaryFull)||''; const full=(editingPool&&(editingPool.bodyFull||editingPool.body))||'';
  let h='';
  if(sumF) h+='<div style="font-weight:700;margin-bottom:4px">간단 요약</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--ink-soft);margin-bottom:14px">'+esc(sumF)+'</div>';
  h+='<div style="font-weight:700;margin-bottom:4px">전체 내용</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.75;color:var(--ink)">'+esc(full||'(원문 없음)')+'</div>';
  openSubPage('불러온 자료', h);
}
function pickPoolAudio(){
  const inp=document.getElementById('audio-input'); inp.value='';
  inp.onchange=async e=>{const f=e.target.files&&e.target.files[0]; inp.onchange=null; if(!f) return;
    const rid=uid(); await idbPut('images',{id:rid,kind:'음원',blob:f,created:today()});
    if(editingPool.audio) await idbDel('images',editingPool.audio);
    editingPool.audio=rid; renderPoolAudio();};
  inp.click();
}
async function removePoolAudio(){
  if(editingPool.audio){await idbDel('images',editingPool.audio); editingPool.audio=null;}
  renderPoolAudio();
}
async function savePool(){
  editingPool.title=document.getElementById('p-title').value.trim();
  { const taEl=document.getElementById('p-body'); if(taEl && taEl.style.display!=='none'){ editingPool.body=taEl.value.trim(); } }
  editingPool.bodyFull = editingPool.hasFull ? (editingPool.bodyFull||editingPool.body) : editingPool.body;
  editingPool.free=document.getElementById('p-freetags').value.split(',').map(s=>s.trim()).filter(Boolean);
  editingPool.product=editingPool.product||[]; editingPool.situation=editingPool.situation||[]; editingPool.age=editingPool.age||[];
  if(!editingPool.title){alert('제목을 입력하세요.'); return;}
  if(!editingPool.id){editingPool.id=uid(); editingPool.created=today();}
  await idbPut('pools',editingPool);
  pools=await idbAll('pools');
  toast('앱에 저장됨 · PC 저장은 "참조 전체 저장" 사용'); setTimeout(toastHide,1800);
  closeSheet('ov-pool'); renderPools();
}
async function deletePool(){
  if(!editingPool.id||!confirm('삭제할까요?')) return;
  if(editingPool.audio) await idbDel('images',editingPool.audio);
  for(const ref of (editingPool.images||[])){ await idbDel('images',ref); }
  await idbDel('pools',editingPool.id); pools=await idbAll('pools');
  closeSheet('ov-pool'); renderPools();
}
/* 참조풀 "JSON 불러오기": "PC로 전체 백업"이 만든 참조풀전체_*.json을 불러온다.
   신규 형식({type:'pools-backup', pools, images})은 첨부 사진·음원까지 함께 복원하고,
   예전 형식(배열만)도 그대로 읽어(하위호환) 글자 정보만 복원한다. */
async function importPools(e){
  const f=e.target.files[0]; if(!f) return;
  try{
    const data=JSON.parse(await f.text());
    const arr = Array.isArray(data) ? data : (data.pools||[]);
    const imgs = Array.isArray(data) ? [] : (data.images||[]);
    for(const im of imgs){ if(im&&im.id&&im.dataURL){ const blob=await (await fetch(im.dataURL)).blob(); await idbPut('images',{id:im.id,kind:im.kind,created:im.created,blob}); } }
    for(const p of arr){ if(p&&p.id){ await idbPut('pools',p);} }
    pools=await idbAll('pools'); renderPools();
    alert('불러오기 완료: '+arr.length+'건'+(imgs.length?(' · 사진·음원 '+imgs.length+'개'):''));
  }catch(err){alert('파일을 읽을 수 없습니다.');}
  e.target.value='';
}

