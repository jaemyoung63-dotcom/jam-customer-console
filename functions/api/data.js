// functions/api/data.js
// Cloudflare Pages Function — 고객상담 매니저 클라우드 동기화 (D1)
// 바인딩: DB (D1 database: jam-console-db) / 환경변수: APP_PASSWORD, ADMIN_PASSWORD
//
// 2026-08-14 다중 담당자(최대 20명) 구조로 확장:
//   - 사이트 공통 비밀번호(APP_PASSWORD)는 그대로 유지 — 누구나 앱에 들어올 때 입력.
//   - 그 아래에 "담당자 개인 비밀번호"(advisors 테이블) 층을 하나 더 둬서, 로그인한 담당자
//     자신의 고객·참조풀만 보이고 저장되게 한다(customers/pools의 owner 컬럼으로 구분).
//   - "관리자 비밀번호"(ADMIN_PASSWORD, APP_PASSWORD와는 다른 값)는 담당자 계정을 추가·삭제·
//     비밀번호초기화하는 관리 화면 전용. 담당자 20명이 사이트 비밀번호를 알아도 서로의 계정을
//     건드릴 수 없다.
//
// 요청(JSON, POST):
//   { pw, action:'check' }                                        → 사이트 비밀번호 확인만
//   { pw, action:'listAdvisors' }                                  → 담당자 이름 목록(로그인 화면용)
//   { pw, advisorId, advisorPw, action:'advisorLogin' }            → 담당자 로그인 + 그 담당자의 전체 자료 반환
//   { pw, advisorId, advisorPw, action:'load' }                    → 로그인한 담당자의 고객·참조풀 반환
//   { pw, advisorId, advisorPw, action:'saveCustomer', item:{...} }        → 고객 1건 저장(upsert)
//   { pw, advisorId, advisorPw, action:'savePool', item:{...} }            → 참조풀 1건 저장(upsert)
//   { pw, advisorId, advisorPw, action:'deleteCustomer', id }              → 고객 1건 삭제
//   { pw, advisorId, advisorPw, action:'deletePool', id }                  → 참조풀 1건 삭제
//   { pw, advisorId, advisorPw, action:'bulkSave', customers:[...], pools:[...] } → 여러 건 저장(복원용)
//   { pw, advisorId, advisorPw, action:'createFileMetadata'|'getFileMetadata'|'listFileMetadata'|'updateFileStatus', ... }
//   { pw, adminPw, action:'adminSetupSchema' }                     → advisors 테이블·owner 컬럼 자동 생성
//   { pw, adminPw, action:'adminListAdvisors' }                    → 담당자 전체 목록(소유 자료 수 포함)
//   { pw, adminPw, action:'adminAddAdvisor', name, password }      → 담당자 추가
//   { pw, adminPw, action:'adminRenameAdvisor', id, name }         → 담당자 이름 수정
//   { pw, adminPw, action:'adminResetAdvisorPassword', id, password } → 담당자 비밀번호 초기화
//   { pw, adminPw, action:'adminDeleteAdvisor', id }               → 담당자 삭제(소유 자료 없을 때만)
//   { pw, adminPw, action:'adminAssignUnowned', id }               → 소유자 없는 기존 자료를 이 담당자에게 배정
//   { pw, adminPw, action:'adminReassignAll', fromId, toId }       → 한 담당자의 자료를 통째로 다른 담당자에게 이전

import { checkSitePassword, checkAdminPassword, checkAdvisor, ensureSchema, ownerBelongsToAdvisor, sha256Hex, newAdvisorId, isoNow } from '../_lib/advisors.js';

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

  // 1단계: 사이트 공통 비밀번호 확인 (모든 action 공통)
  const siteCheck = checkSitePassword(env, body, json);
  if (!siteCheck.ok) return siteCheck.res;

  const action = body.action;

  try {
    // ---------- 사이트 비밀번호만 필요한 action ----------
    if (action === 'check') {
      return json({ ok: true, auth: true });
    }

    if (action === 'listAdvisors') {
      try {
        const r = await env.DB.prepare('SELECT id, name FROM advisors ORDER BY name').all();
        return json({ ok: true, advisors: r.results || [] });
      } catch (e) {
        const msg = (e && e.message) || String(e);
        if (/no such table/i.test(msg)) return json({ ok: true, advisors: [], needsSetup: true });
        throw e;
      }
    }

    // ---------- 관리자 비밀번호가 필요한 action ----------
    if (action && action.indexOf('admin') === 0) {
      const adminCheck = checkAdminPassword(env, body, json);
      if (!adminCheck.ok) return adminCheck.res;
      return await handleAdmin(env, body, action);
    }

    // ---------- 여기서부터는 담당자(개인) 비밀번호도 필요 ----------
    const advisorCheck = await checkAdvisor(env, body, json);
    if (!advisorCheck.ok) return advisorCheck.res;
    const advisorId = advisorCheck.advisor.id;

    if (action === 'advisorLogin' || action === 'load') {
      const cust = await env.DB.prepare('SELECT data FROM customers WHERE owner = ?').bind(advisorId).all();
      const pool = await env.DB.prepare('SELECT data FROM pools WHERE owner = ?').bind(advisorId).all();
      const customers = (cust.results || []).map(r => safeParse(r.data)).filter(Boolean);
      const pools = (pool.results || []).map(r => safeParse(r.data)).filter(Boolean);
      return json({ ok: true, customers, pools, advisor: advisorCheck.advisor });
    }

    if (action === 'createFileMetadata') {
      const item = body.item;
      const invalid = validFileCreate(item);
      if (invalid) return json({ error: invalid }, 400);
      const owns = await ownerBelongsToAdvisor(env, item.owner_type, item.owner_id, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀이 아닙니다.' }, 403);
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
      const owns = await ownerBelongsToAdvisor(env, found.owner_type, found.owner_id, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀의 파일이 아닙니다.' }, 403);
      return json({ ok: true, file: fileRow(found) });
    }

    if (action === 'listFileMetadata') {
      const ownerType = body.owner_type;
      const ownerId = body.owner_id;
      if (!['customer', 'pool'].includes(ownerType) || !String(ownerId || '').trim()) {
        return json({ error: 'owner_type과 owner_id가 필요합니다.' }, 400);
      }
      const owns = await ownerBelongsToAdvisor(env, ownerType, ownerId, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀이 아닙니다.' }, 403);
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
      const owns = await ownerBelongsToAdvisor(env, existing.owner_type, existing.owner_id, advisorId);
      if (!owns) return json({ error: '본인 담당 고객·참조풀의 파일이 아닙니다.' }, 403);
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

      // 버전 충돌 감지(낙관적 동시성 제어). baseUpdated = 클라이언트가 이 저장을 시작할 때
      // 마지막으로 확인했던 updated 값. deviceId = 저장을 요청한 브라우저(기기) 식별자.
      // updated_by는 별도 컬럼을 만들지 않고 저장되는 JSON(data) 안에 _updatedBy로 같이 둔다.
      const baseUpdated = body.baseUpdated || null;
      const deviceId = body.deviceId ? String(body.deviceId) : null;
      const existing = await env.DB.prepare('SELECT data, updated, owner FROM ' + table + ' WHERE id = ?').bind(String(item.id)).first();

      // 담당자 소유권 확인: 이미 다른 담당자 소유로 확정된 자료는 절대 덮어쓸 수 없다.
      // owner가 아직 없는(과거 마이그레이션 전) 자료는 저장하는 사람에게 자동으로 배정된다.
      if (existing && existing.owner && existing.owner !== advisorId) {
        return json({ error: '다른 담당자의 자료라 저장할 수 없습니다.' }, 403);
      }

      if (existing && baseUpdated) {
        const existingParsed = safeParse(existing.data);
        const existingUpdatedBy = (existingParsed && existingParsed._updatedBy) || null;
        const isSelf = deviceId && existingUpdatedBy === deviceId;
        if (existing.updated !== baseUpdated && !isSelf) {
          // 진짜 다른 기기/사람이 그 사이에 먼저 저장했다 — 이번 저장은 취소하고 클라이언트에 알림
          return json({
            error: '다른 기기에서 방금 수정되어 저장이 취소되었습니다.',
            conflict: true,
            server: existingParsed,
            serverUpdated: existing.updated
          }, 409);
        }
      }

      // updated 컬럼은 서버 시각이 아니라 클라이언트가 보낸 item.updated를 그대로 저장한다.
      // (클라이언트는 baseUpdated를 로컬에 저장된 item.updated 값으로 계산하므로, 컬럼이
      //  서버 시각으로 따로 놀면 같은 기기의 정상적인 연속 저장도 계속 충돌로 오판하게 된다.)
      const updatedVal = item.updated || new Date().toISOString();
      const dataToStore = Object.assign({}, item, { _updatedBy: deviceId });
      await env.DB.prepare('INSERT INTO ' + table + ' (id, data, updated, owner) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated, owner=excluded.owner')
        .bind(String(item.id), JSON.stringify(dataToStore), updatedVal, advisorId).run();
      return json({ ok: true });
    }

    if (action === 'deleteCustomer' || action === 'deletePool') {
      const table = action === 'deleteCustomer' ? 'customers' : 'pools';
      if (!body.id) return json({ error: 'id 없음' }, 400);
      const existing = await env.DB.prepare('SELECT owner FROM ' + table + ' WHERE id = ?').bind(String(body.id)).first();
      if (existing && existing.owner && existing.owner !== advisorId) {
        return json({ error: '다른 담당자의 자료라 삭제할 수 없습니다.' }, 403);
      }
      await env.DB.prepare('DELETE FROM ' + table + ' WHERE id = ? AND (owner IS NULL OR owner = ?)').bind(String(body.id), advisorId).run();
      return json({ ok: true });
    }

    if (action === 'bulkSave') {
      const customers = Array.isArray(body.customers) ? body.customers : [];
      const pools = Array.isArray(body.pools) ? body.pools : [];
      const now = new Date().toISOString();
      const stmts = [];
      // updated 컬럼은 각 레코드 자신의 updated 필드를 그대로 쓴다(saveCustomer/savePool과 동일한 규칙 —
      // 그래야 이후 개별 저장에서 버전 충돌 비교가 어긋나지 않는다).
      // owner는 요청 본문에 뭐가 있든 무시하고 항상 지금 로그인한 담당자로 강제 지정한다.
      for (const c of customers) {
        if (!c || !c.id) continue;
        stmts.push(env.DB.prepare('INSERT INTO customers (id, data, updated, owner) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated, owner=excluded.owner').bind(String(c.id), JSON.stringify(c), c.updated || now, advisorId));
      }
      for (const p of pools) {
        if (!p || !p.id) continue;
        stmts.push(env.DB.prepare('INSERT INTO pools (id, data, updated, owner) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated, owner=excluded.owner').bind(String(p.id), JSON.stringify(p), p.updated || now, advisorId));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json({ ok: true, saved: { customers: customers.length, pools: pools.length } });
    }

    return json({ error: '알 수 없는 action: ' + action }, 400);
  } catch (err) {
    return json({ error: 'DB 오류: ' + (err && err.message ? err.message : String(err)) }, 500);
  }
}

async function handleAdmin(env, body, action) {
  if (action === 'adminSetupSchema') {
    await ensureSchema(env);
    return json({ ok: true });
  }

  if (action === 'adminListAdvisors') {
    let advisors;
    try {
      const r = await env.DB.prepare('SELECT id, name, created_at, updated_at FROM advisors ORDER BY name').all();
      advisors = r.results || [];
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/no such table/i.test(msg)) return json({ ok: true, advisors: [], needsSetup: true });
      throw e;
    }
    for (const a of advisors) {
      const cc = await env.DB.prepare('SELECT COUNT(*) AS n FROM customers WHERE owner = ?').bind(a.id).first();
      const pc = await env.DB.prepare('SELECT COUNT(*) AS n FROM pools WHERE owner = ?').bind(a.id).first();
      a.customerCount = (cc && cc.n) || 0;
      a.poolCount = (pc && pc.n) || 0;
    }
    const unownedC = await env.DB.prepare('SELECT COUNT(*) AS n FROM customers WHERE owner IS NULL').first();
    const unownedP = await env.DB.prepare('SELECT COUNT(*) AS n FROM pools WHERE owner IS NULL').first();
    return json({ ok: true, advisors, unowned: { customers: (unownedC && unownedC.n) || 0, pools: (unownedP && unownedP.n) || 0 } });
  }

  if (action === 'adminAddAdvisor') {
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!name) return json({ error: '이름을 입력하세요.' }, 400);
    if (!password || password.length < 4) return json({ error: '비밀번호는 4자 이상으로 정하세요.' }, 400);
    const id = newAdvisorId();
    const now = isoNow();
    const hash = await sha256Hex(password);
    await env.DB.prepare('INSERT INTO advisors (id, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, hash, now, now).run();
    return json({ ok: true, advisor: { id, name } }, 201);
  }

  if (action === 'adminRenameAdvisor') {
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    if (!id || !name) return json({ error: 'id와 name이 필요합니다.' }, 400);
    await env.DB.prepare('UPDATE advisors SET name = ?, updated_at = ? WHERE id = ?').bind(name, isoNow(), id).run();
    return json({ ok: true });
  }

  if (action === 'adminResetAdvisorPassword') {
    const id = String(body.id || '').trim();
    const password = String(body.password || '');
    if (!id) return json({ error: 'id가 필요합니다.' }, 400);
    if (!password || password.length < 4) return json({ error: '비밀번호는 4자 이상으로 정하세요.' }, 400);
    const hash = await sha256Hex(password);
    await env.DB.prepare('UPDATE advisors SET password_hash = ?, updated_at = ? WHERE id = ?').bind(hash, isoNow(), id).run();
    return json({ ok: true });
  }

  if (action === 'adminDeleteAdvisor') {
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'id가 필요합니다.' }, 400);
    const cc = await env.DB.prepare('SELECT COUNT(*) AS n FROM customers WHERE owner = ?').bind(id).first();
    const pc = await env.DB.prepare('SELECT COUNT(*) AS n FROM pools WHERE owner = ?').bind(id).first();
    if (((cc && cc.n) || 0) > 0 || ((pc && pc.n) || 0) > 0) {
      return json({ error: '이 담당자에게 배정된 자료가 있어 삭제할 수 없습니다. 먼저 "다른 담당자에게 자료 이전"으로 자료를 옮기세요.' }, 400);
    }
    await env.DB.prepare('DELETE FROM advisors WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  if (action === 'adminAssignUnowned') {
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'id가 필요합니다.' }, 400);
    const advisor = await env.DB.prepare('SELECT id FROM advisors WHERE id = ?').bind(id).first();
    if (!advisor) return json({ error: '담당자를 찾을 수 없습니다.' }, 404);
    const rc = await env.DB.prepare('UPDATE customers SET owner = ? WHERE owner IS NULL').bind(id).run();
    const rp = await env.DB.prepare('UPDATE pools SET owner = ? WHERE owner IS NULL').bind(id).run();
    return json({ ok: true, assigned: { customers: (rc.meta && rc.meta.changes) || 0, pools: (rp.meta && rp.meta.changes) || 0 } });
  }

  if (action === 'adminReassignAll') {
    const fromId = String(body.fromId || '').trim();
    const toId = String(body.toId || '').trim();
    if (!fromId || !toId) return json({ error: 'fromId와 toId가 필요합니다.' }, 400);
    if (fromId === toId) return json({ error: '같은 담당자로는 이전할 수 없습니다.' }, 400);
    const toAdvisor = await env.DB.prepare('SELECT id FROM advisors WHERE id = ?').bind(toId).first();
    if (!toAdvisor) return json({ error: '옮겨받을 담당자를 찾을 수 없습니다.' }, 404);
    const rc = await env.DB.prepare('UPDATE customers SET owner = ? WHERE owner = ?').bind(toId, fromId).run();
    const rp = await env.DB.prepare('UPDATE pools SET owner = ? WHERE owner = ?').bind(toId, fromId).run();
    return json({ ok: true, moved: { customers: (rc.meta && rc.meta.changes) || 0, pools: (rp.meta && rp.meta.changes) || 0 } });
  }

  return json({ error: '알 수 없는 관리자 action: ' + action }, 400);
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
