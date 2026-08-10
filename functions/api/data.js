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
