// functions/api/files.js
// Cloudflare Pages Function — 고객상담 매니저 파일(이미지·음성) 클라우드 저장 (R2)
// 바인딩: FILES_BUCKET (R2 bucket) / DB (D1, functions/api/data.js와 공유) / 환경변수: APP_PASSWORD

import { checkSitePassword, checkAdvisor, ownerBelongsToAdvisor } from '../_lib/advisors.js';

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function isoNow() { return new Date().toISOString(); }

function objectKey(ownerType, ownerId, id) {
  return ownerType + '/' + encodeURIComponent(String(ownerId)) + '/' + encodeURIComponent(String(id));
}

// [버그 수정] 대용량 파일(음성/고화질 증권) 변환 시 콜스택 터짐 방지 처리 (청크 분할 문자열 조립)
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x4000; // 안전한 청크 사이즈 보장 (16KB 단위 분할 처리)
  for (let i = 0; i < bytes.length; i += chunk) {
    const subArray = bytes.subarray(i, i + chunk);
    // Call Stack 오버플로우를 완벽하게 예방하는 루프 조립 방식 전환
    binary += String.fromCharCode(...subArray);
  }
  return btoa(binary);
}

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) return json({ error: 'D1 데이터베이스(DB) 바인딩이 없습니다. Cloudflare Pages Settings → Bindings에서 Variable name "DB"로 연결하세요.' }, 500);
  if (!env.FILES_BUCKET) return json({ error: 'R2 버킷 바인딩이 없습니다. Cloudflare Pages Settings → Bindings에서 R2 버킷을 Variable name "FILES_BUCKET"으로 연결하세요.', bucketMissing: true }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '잘못된 요청 형식' }, 400); }

  const siteCheck = checkSitePassword(env, body, json);
  if (!siteCheck.ok) return siteCheck.res;

  const advisorCheck = await checkAdvisor(env, body, json);
  if (!advisorCheck.ok) return advisorCheck.res;
  const advisorId = advisorCheck.advisor.id;

  const action = body.action;

  try {
    if (action === 'upload') {
      const id = String(body.id || '').trim();
      const ownerType = body.owner_type;
      const ownerId = String(body.owner_id || '').trim();
      const category = String(body.category || '기타').trim();
      const contentType = String(body.content_type || 'application/octet-stream').trim();
      const filename = body.filename == null ? null : String(body.filename);
      const dataB64 = body.data;
      if (!id) return json({ error: 'id가 없습니다.' }, 400);
      if (!['customer', 'pool'].includes(ownerType)) return json({ error: 'owner_type은 customer 또는 pool이어야 합니다.' }, 400);
      if (!ownerId) return json({ error: 'owner_id가 없습니다.' }, 400);
      if (!dataB64) return json({ error: '업로드할 데이터(data)가 없습니다.' }, 400);

      const owns = await ownerBelongsToAdvisor(env, ownerType, ownerId, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀이 아니라 올릴 수 없습니다. (고객 정보가 아직 클라우드에 저장되지 않았다면 잠시 후 다시 시도됩니다)' }, 403);

      let bytes;
      try { bytes = base64ToBytes(dataB64); } catch (e) { return json({ error: 'data가 올바른 base64가 아닙니다.' }, 400); }

      const key = objectKey(ownerType, ownerId, id);
      const sha256 = await sha256Hex(bytes);
      
      // R2 버킷 업로드 진행
      await env.FILES_BUCKET.put(key, bytes, { httpMetadata: { contentType } });

      const now = isoNow();
      // D1 DB 메타데이터 트랜잭션 기록 및 UPSERT 쿼리
      await env.DB.prepare(
        `INSERT INTO files (id, owner_type, owner_id, category, filename, content_type, size_bytes, sha256, object_key, status, sync_version, created_at, updated_at, uploaded_at, deleted_at, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', 1, ?, ?, ?, NULL, NULL)
         ON CONFLICT(id) DO UPDATE SET
           owner_type=excluded.owner_type, owner_id=excluded.owner_id, category=excluded.category,
           filename=excluded.filename, content_type=excluded.content_type, size_bytes=excluded.size_bytes,
           sha256=excluded.sha256, object_key=excluded.object_key, status='uploaded',
           sync_version=files.sync_version+1, updated_at=excluded.updated_at, uploaded_at=excluded.uploaded_at, last_error=NULL`
      ).bind(id, ownerType, ownerId, category, filename, contentType, bytes.length, sha256, key, now, now, now).run();

      return json({ ok: true, id, sha256, size_bytes: bytes.length });
    }

    if (action === 'download') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: 'id가 없습니다.' }, 400);
      const row = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
      if (!row || row.status === 'deleted') return json({ error: '파일을 찾을 수 없습니다.' }, 404);
      
      const owns = await ownerBelongsToAdvisor(env, row.owner_type, row.owner_id, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀의 파일이 아닙니다.' }, 403);
      if (!row.object_key) return json({ error: '이 파일은 아직 업로드되지 않았습니다.' }, 404);

      const obj = await env.FILES_BUCKET.get(row.object_key);
      if (!obj) {
        await env.DB.prepare("UPDATE files SET status='missing_source', updated_at=?, sync_version=sync_version+1 WHERE id=?").bind(isoNow(), id).run();
        return json({ error: 'R2에 실제 파일이 없습니다(원본 유실). 로컬 기기의 원본으로 다시 업로드해야 합니다.' }, 404);
      }
      const buf = await obj.arrayBuffer();
      const data = bytesToBase64(new Uint8Array(buf));
      return json({ ok: true, id, category: row.category, filename: row.filename, content_type: row.content_type, data });
    }

    if (action === 'delete') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: 'id가 없습니다.' }, 400);
      const row = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
      if (!row) return json({ ok: true }); 
      
      const owns = await ownerBelongsToAdvisor(env, row.owner_type, row.owner_id, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀의 파일이 아닙니다.' }, 403);
      
      if (row.object_key) { try { await env.FILES_BUCKET.delete(row.object_key); } catch (e) {} }
      await env.DB.prepare("UPDATE files SET status='deleted', deleted_at=?, updated_at=?, sync_version=sync_version+1 WHERE id=?").bind(isoNow(), isoNow(), id).run();
      return json({ ok: true });
    }

    return json({ error: '알 수 없는 action: ' + action }, 400);
  } catch (err) {
    return json({ error: '파일 저장소 오류: ' + (err && err.message ? err.message : String(err)) }, 500);
  }
}
