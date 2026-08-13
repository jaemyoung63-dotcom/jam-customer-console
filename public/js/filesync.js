/* =========================================================
   파일(이미지·음성) 클라우드 동기화 — R2 (functions/api/files.js)
   텍스트(고객·참조풀)는 core.js의 cloudSync()가 D1으로 이미 올림.
   이 파일은 IndexedDB 'images' 스토어의 blob(사진/PDF변환본/설계서/음원)을
   같은 방식으로 R2에 올리고, 다른 기기에서는 다시 받아온다.
   ========================================================= */

const FILES_URL = '/api/files';

/* 업로드 완료/실패 목록은 IndexedDB 'meta' 스토어에 캐시해서
   앱을 새로 열 때마다 전부 다시 올리지 않게 한다. (진짜 상태는 서버 D1 files 테이블) */
let fsUploadedIds = new Set();
let fsUploadFailed = new Map();   // id -> error message
let fsDownloadFailed = new Map(); // id -> error message
let fsBucketMissing = false;      // 서버에 FILES_BUCKET 바인딩이 없다고 확인된 경우(반복 실패 방지)
let fsBusy = false;

async function fsInit() {
  try {
    const rec = await idbGet('meta', 'fsUploaded');
    fsUploadedIds = new Set((rec && rec.ids) || []);
  } catch (e) { fsUploadedIds = new Set(); }
}
async function fsSaveUploadedCache() {
  try { await _idbPut('meta', { key: 'fsUploaded', ids: Array.from(fsUploadedIds) }); } catch (e) {}
}

function fsCall(payload) {
  return fetch(FILES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(async r => { let d = {}; try { d = await r.json(); } catch (e) { d = { error: '응답 형식 오류 (HTTP ' + r.status + ')' }; } d._status = r.status; return d; });
}

/* ---------- 업로드 ---------- */
async function fsUploadOne(id, ownerType, ownerId, category) {
  if (!cloudOn || !cloudPW || fsBucketMissing) return false;
  if (fsUploadedIds.has(id)) return true;
  const rec = await idbGet('images', id);
  if (!rec || !rec.blob) return false; // 로컬에 실물이 없으면 올릴 게 없음
  try {
    const dataUrl = await blobToDataURL(rec.blob);
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
    if (!b64) return false;
    const contentType = rec.blob.type || 'application/octet-stream';
    const d = await fsCall({
      pw: cloudPW, action: 'upload', id, owner_type: ownerType, owner_id: ownerId,
      category: rec.kind || category || '기타', filename: null, content_type: contentType, data: b64
    });
    if (d && d.ok) {
      fsUploadedIds.add(id); fsUploadFailed.delete(id); await fsSaveUploadedCache();
      return true;
    }
    if (d && d.bucketMissing) fsBucketMissing = true;
    fsUploadFailed.set(id, (d && d.error) || '업로드 실패');
    return false;
  } catch (e) {
    fsUploadFailed.set(id, (e && e.message) || String(e));
    return false;
  }
}

/* 고객/참조풀 레코드 하나가 참조하는 파일들을 훑어서 아직 안 올라간 것만 업로드 큐에 넣는다.
   core.js의 idbPut() 훅에서 저장 직후 호출됨(비동기, 저장 자체를 막지 않음). */
async function fsQueueForOwner(ownerType, record) {
  if (!cloudOn || !record || !record.id) return;
  const items = [];
  (record.images || []).forEach(id => items.push({ id, category: record.docKind || '기타' }));
  if (ownerType === 'customer') (record.planImages || []).forEach(id => items.push({ id, category: '설계서' }));
  if (ownerType === 'pool' && record.audio) items.push({ id: record.audio, category: '음원' });
  const pending = items.filter(x => x.id && !fsUploadedIds.has(x.id));
  for (const item of pending) { await fsUploadOne(item.id, ownerType, record.id, item.category); }
}

/* ---------- 다운로드 (기기 전환 시 누락 파일 채우기) ---------- */
async function fsDownloadOne(id) {
  if (fsBucketMissing) return false;
  try {
    const d = await fsCall({ pw: cloudPW, action: 'download', id });
    if (d && d.ok && d.data) {
      const binary = atob(d.data);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: d.content_type || 'application/octet-stream' });
      await _idbPut('images', { id, kind: d.category || '', blob, created: today() });
      fsUploadedIds.add(id); fsDownloadFailed.delete(id); await fsSaveUploadedCache();
      return true;
    }
    if (d && d.bucketMissing) fsBucketMissing = true;
    fsDownloadFailed.set(id, (d && d.error) || '다운로드 실패');
    return false;
  } catch (e) {
    fsDownloadFailed.set(id, (e && e.message) || String(e));
    return false;
  }
}

/* 지금 메모리에 있는 customers/pools가 참조하는 파일 중 로컬(IndexedDB)에 실물이 없는 것을
   백그라운드로 내려받는다. mergeCloud() 끝에서 호출(로그인/기기전환 시). */
async function fsDownloadMissing() {
  if (!cloudOn || fsBucketMissing) return;
  const need = new Set();
  (customers || []).forEach(c => { (c.images || []).forEach(id => need.add(id)); (c.planImages || []).forEach(id => need.add(id)); });
  (pools || []).forEach(p => { (p.images || []).forEach(id => need.add(id)); if (p.audio) need.add(p.audio); });
  for (const id of need) {
    const existing = await idbGet('images', id);
    if (existing && existing.blob) { fsUploadedIds.add(id); continue; } // 로컬에 이미 있음 = 업로드도 필요없음 처리
    await fsDownloadOne(id);
  }
  await fsSaveUploadedCache();
}

/* "지금 동기화" 수동 버튼 — 저장소 진단 화면에서 호출 */
async function fsSyncNow() {
  if (fsBusy) return;
  if (!cloudOn) { toast('먼저 클라우드에 로그인하세요.'); setTimeout(toastHide, 1800); return; }
  fsBusy = true;
  try {
    for (const c of (customers || [])) { await fsQueueForOwner('customer', c); }
    for (const p of (pools || [])) { await fsQueueForOwner('pool', p); }
    await fsDownloadMissing();
    toast('✓ 파일 동기화 완료'); setTimeout(toastHide, 2000);
  } finally { fsBusy = false; }
  const box = document.getElementById('storage-diagnostic-result');
  if (box && lastStorageDiagnostic) box.innerHTML = renderStorageDiagnostic(lastStorageDiagnostic);
}

/* 저장소 진단 화면에 넣을 요약(동기화 상태) — 동기적으로 현재 메모리 상태만 계산 */
function fsSyncSummary() {
  const need = new Map(); // id -> {ownerType, ownerId}
  (customers || []).forEach(c => { (c.images || []).forEach(id => need.set(id, { ownerType: 'customer', ownerId: c.id })); (c.planImages || []).forEach(id => need.set(id, { ownerType: 'customer', ownerId: c.id })); });
  (pools || []).forEach(p => { (p.images || []).forEach(id => need.set(id, { ownerType: 'pool', ownerId: p.id })); if (p.audio) need.set(p.audio, { ownerType: 'pool', ownerId: p.id }); });
  let uploaded = 0, pendingUpload = 0;
  need.forEach((v, id) => { if (fsUploadedIds.has(id)) uploaded++; else pendingUpload++; });
  return {
    totalRefs: need.size, uploaded, pendingUpload,
    uploadFailed: fsUploadFailed.size, downloadFailed: fsDownloadFailed.size,
    bucketMissing: fsBucketMissing, cloudOn: !!cloudOn
  };
}
