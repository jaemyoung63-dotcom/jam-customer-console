// functions/api/data.js
// Cloudflare Pages Function — 고객상담 매니저 클라우드 동기화 (D1)
// 바인딩: DB (D1 database: jam-console-db) / 환경변수: APP_PASSWORD
//
// 요청(JSON, POST):
//   { pw, action:'load' }                                  → 전체 고객·참조풀 반환
//   { pw, action:'saveCustomer', item:{...} }              → 고객 1건 저장(upsert)
//   { pw, action:'savePool', item:{...} }                  → 참조풀 1건 저장(upsert)
//   { pw, action:'deleteCustomer', id }                    → 고객 1건 삭제
//   { pw, action:'deletePool', id }                        → 참조풀 1건 삭제
//   { pw, action:'bulkSave', customers:[...], pools:[...] } → 여러 건 저장(초기 업로드용)
//   { pw, action:'check' }                                 → 비밀번호 확인만

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const FILE_STATUSES = new Set([
  'local_only', 'pending_upload', 'uploading', 'uploaded', 'upload_failed',
  'pending_delete', 'delete_failed', 'deleted', 'missing_source'
]);

function isoNow() { return new Date().toISOString(); }

function fileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    category: row.category,
    filename: row.filename,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    object_key: row.object_key,
    status: row.status,
    sync_version: row.sync_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    uploaded_at: row.uploaded_at,
    deleted_at: row.deleted_at,
    last_error: row.last_error
  };
}

function validFileCreate(item) {
  if (!item || typeof item !== 'object') return 'file metadata가 없습니다.';
  if (!['customer', 'pool'].includes(item.owner_type)) return 'owner_type은 customer 또는 pool이어야 합니다.';
  if (!String(item.owner_id || '').trim()) return 'owner_id가 없습니다.';
  if (!String(item.category || '').trim()) return 'category가 없습니다.';
  if (!String(item.content_type || '').trim()) return 'content_type이 없습니다.';
  if (!Number.isInteger(item.size_bytes) || item.size_bytes < 0) return 'size_bytes는 0 이상의 정수여야 합니다.';
  if (item.status && !FILE_STATUSES.has(item.status)) return '허용되지 않는 파일 상태입니다.';
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // D1 바인딩 확인
  if (!env.DB) return json({ error: 'D1 데이터베이스(DB) 바인딩이 없습니다. Cloudflare Pages Settings → Bindings에서 Variable name "DB"로 연결하세요.' }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '잘못된 요청 형식' }, 400); }

  // 비밀번호 확인
  const expected = env.APP_PASSWORD || '';
  if (!expected) return json({ error: '서버에 APP_PASSWORD가 설정되지 않았습니다. Cloudflare 환경변수에 추가하세요.' }, 500);
  if (!body || body.pw !== expected) return json({ error: '비밀번호가 올바르지 않습니다.', auth: false }, 401);

  const action = body.action;

  try {
    if (action === 'check') {
      return json({ ok: true, auth: true });
    }

    if (action === 'load') {
      const cust = await env.DB.prepare('SELECT data FROM customers').all();
      const pool = await env.DB.prepare('SELECT data FROM pools').all();
      const customers = (cust.results || []).map(r => safeParse(r.data)).filter(Boolean);
      const pools = (pool.results || []).map(r => safeParse(r.data)).filter(Boolean);
      return json({ ok: true, customers, pools });
    }

    // Phase 1: D1 file metadata API only. File blobs are not stored in D1.
    if (action === 'createFileMetadata') {
      const item = body.item;
      const invalid = validFileCreate(item);
      if (invalid) return json({ error: invalid }, 400);
      const id = String(item.id || crypto.randomUUID());
      const now = isoNow();
      const status = item.status || 'pending_upload';
      await env.DB.prepare(
        'INSERT INTO files (id, owner_type, owner_id, category, filename, content_type, size_bytes, sha256, object_key, status, sync_version, created_at, updated_at, uploaded_at, deleted_at, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        item.owner_type,
        String(item.owner_id),
        String(item.category),
        item.filename == null ? null : String(item.filename),
        String(item.content_type),
        item.size_bytes,
        item.sha256 == null ? null : String(item.sha256),
        item.object_key == null ? null : String(item.object_key),
        status,
        now,
        now,
        item.uploaded_at || null,
        item.deleted_at || null,
        item.last_error || null
      ).run();
      const created = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
      return json({ ok: true, file: fileRow(created) }, 201);
    }

    if (action === 'getFileMetadata') {
      if (!body.id) return json({ error: 'id가 없습니다.' }, 400);
      const found = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(String(body.id)).first();
      if (!found) return json({ error: '파일 메타데이터를 찾을 수 없습니다.' }, 404);
      return json({ ok: true, file: fileRow(found) });
    }

    if (action === 'listFileMetadata') {
      const ownerType = body.owner_type;
      const ownerId = body.owner_id;
      if (!['customer', 'pool'].includes(ownerType) || !String(ownerId || '').trim()) {
        return json({ error: 'owner_type과 owner_id가 필요합니다.' }, 400);
      }
      const status = body.status;
      if (status && !FILE_STATUSES.has(status)) return json({ error: '허용되지 않는 파일 상태입니다.' }, 400);
      const query = status
        ? env.DB.prepare('SELECT * FROM files WHERE owner_type = ? AND owner_id = ? AND status = ? ORDER BY created_at DESC').bind(ownerType, String(ownerId), status)
        : env.DB.prepare('SELECT * FROM files WHERE owner_type = ? AND owner_id = ? ORDER BY created_at DESC').bind(ownerType, String(ownerId));
      const result = await query.all();
      return json({ ok: true, files: (result.results || []).map(fileRow) });
    }

    if (action === 'updateFileStatus') {
      if (!body.id) return json({ error: 'id가 없습니다.' }, 400);
      if (!FILE_STATUSES.has(body.status)) return json({ error: '허용되지 않는 파일 상태입니다.' }, 400);
      const existing = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(String(body.id)).first();
      if (!existing) return json({ error: '파일 메타데이터를 찾을 수 없습니다.' }, 404);
      const now = isoNow();
      const uploadedAt = body.status === 'uploaded' ? (existing.uploaded_at || now) : existing.uploaded_at;
      const deletedAt = body.status === 'deleted' ? (existing.deleted_at || now) : existing.deleted_at;
      const lastError = Object.prototype.hasOwnProperty.call(body, 'last_error') ? (body.last_error || null) : existing.last_error;
      const objectKey = Object.prototype.hasOwnProperty.call(body, 'object_key') ? (body.object_key || null) : existing.object_key;
      await env.DB.prepare(
        'UPDATE files SET status = ?, object_key = ?, uploaded_at = ?, deleted_at = ?, last_error = ?, sync_version = sync_version + 1, updated_at = ? WHERE id = ?'
      ).bind(body.status, objectKey, uploadedAt, deletedAt, lastError, now, String(body.id)).run();
      const updated = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(String(body.id)).first();
      return json({ ok: true, file: fileRow(updated) });
    }

    if (action === 'saveCustomer' || action === 'savePool') {
      const table = action === 'saveCustomer' ? 'customers' : 'pools';
      const item = body.item;
      if (!item || !item.id) return json({ error: 'id가 없는 항목' }, 400);
      await env.DB.prepare('INSERT INTO ' + table + ' (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated')
        .bind(String(item.id), JSON.stringify(item), new Date().toISOString()).run();
      return json({ ok: true });
    }

    if (action === 'deleteCustomer' || action === 'deletePool') {
      const table = action === 'deleteCustomer' ? 'customers' : 'pools';
      if (!body.id) return json({ error: 'id 없음' }, 400);
      await env.DB.prepare('DELETE FROM ' + table + ' WHERE id = ?').bind(String(body.id)).run();
      return json({ ok: true });
    }

    if (action === 'bulkSave') {
      const customers = Array.isArray(body.customers) ? body.customers : [];
      const pools = Array.isArray(body.pools) ? body.pools : [];
      const now = new Date().toISOString();
      const stmts = [];
      for (const c of customers) {
        if (!c || !c.id) continue;
        stmts.push(env.DB.prepare('INSERT INTO customers (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated').bind(String(c.id), JSON.stringify(c), now));
      }
      for (const p of pools) {
        if (!p || !p.id) continue;
        stmts.push(env.DB.prepare('INSERT INTO pools (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated').bind(String(p.id), JSON.stringify(p), now));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json({ ok: true, saved: { customers: customers.length, pools: pools.length } });
    }

    return json({ error: '알 수 없는 action: ' + action }, 400);
  } catch (err) {
    return json({ error: 'DB 오류: ' + (err && err.message ? err.message : String(err)) }, 500);
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
