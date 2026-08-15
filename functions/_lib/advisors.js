// functions/_lib/advisors.js
// 담당자(설계사) 인증 공용 함수 — data.js / files.js / analyze.js가 같이 씀.
// 파일/폴더 이름이 밑줄(_)로 시작하면 Cloudflare Pages Functions가 이 파일을
// 별도의 API 경로로 만들지 않고, 다른 functions 파일에서 import해서 쓰는 "공용 모듈"로 취급한다.
//
// 로그인 구조(2026-08-14 다중 담당자 확장):
//   1) 사이트 공통 비밀번호(APP_PASSWORD) — 기존과 동일. 누구나 앱에 들어올 때 입력.
//   2) 담당자 개인 비밀번호(advisors.password_hash) — 담당자별로 다름. 이걸로 "누구 자료인지" 구분.
// 두 개를 모두 통과해야 고객/참조풀/파일 데이터를 보거나 저장할 수 있다.

export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join('');
}

export function newAdvisorId() {
  return 'adv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export function isoNow() { return new Date().toISOString(); }

// 사이트 공통 비밀번호(APP_PASSWORD) 확인. 통과 못 하면 {ok:false, res} 반환(그대로 return하면 됨).
export function checkSitePassword(env, body, json) {
  const expected = env.APP_PASSWORD || '';
  if (!expected) return { ok: false, res: json({ error: '서버에 APP_PASSWORD가 설정되지 않았습니다. Cloudflare 환경변수에 추가하세요.' }, 500) };
  if (!body || body.pw !== expected) return { ok: false, res: json({ error: '비밀번호가 올바르지 않습니다.', auth: false }, 401) };
  return { ok: true };
}

// 관리자 비밀번호(ADMIN_PASSWORD) 확인 — 담당자 관리 화면 전용. APP_PASSWORD와는 다른 별도 비밀번호라
// 담당자 20명이 사이트 비밀번호를 알아도 서로의 계정을 추가·삭제·비밀번호초기화 할 수 없다.
export function checkAdminPassword(env, body, json) {
  const expected = env.ADMIN_PASSWORD || '';
  if (!expected) return { ok: false, res: json({ error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다. Cloudflare "Variables and secrets"에 새 환경변수로 추가한 뒤 다시 배포하세요.' }, 500) };
  if (!body || body.adminPw !== expected) return { ok: false, res: json({ error: '관리자 비밀번호가 올바르지 않습니다.' }, 401) };
  return { ok: true };
}

// 담당자 개인 비밀번호 확인. 성공하면 {ok:true, advisor:{id,name}}, 실패하면 {ok:false, res}.
export async function checkAdvisor(env, body, json) {
  if (!env.DB) return { ok: false, res: json({ error: 'D1 데이터베이스(DB) 바인딩이 없습니다.' }, 500) };
  const advisorId = String((body && body.advisorId) || '').trim();
  const advisorPw = (body && body.advisorPw) || '';
  if (!advisorId || !advisorPw) return { ok: false, res: json({ error: '담당자를 선택하고 개인 비밀번호를 입력하세요.' }, 401) };
  const row = await env.DB.prepare('SELECT id, name, password_hash FROM advisors WHERE id = ?').bind(advisorId).first();
  if (!row) return { ok: false, res: json({ error: '담당자 정보를 찾을 수 없습니다.' }, 401) };
  const hash = await sha256Hex(advisorPw);
  if (hash !== row.password_hash) return { ok: false, res: json({ error: '담당자 비밀번호가 올바르지 않습니다.' }, 401) };
  return { ok: true, advisor: { id: row.id, name: row.name } };
}

// D1에 advisors 테이블 + customers/pools.owner 컬럼이 있는지 확인하고 없으면 만든다.
// "이미 있음" 오류(테이블/컬럼 중복)는 정상 상황으로 보고 무시한다.
export async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS advisors (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       password_hash TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  const tryAlter = async (sql) => {
    try { await env.DB.prepare(sql).run(); }
    catch (e) {
      const msg = (e && e.message) || String(e);
      if (!/duplicate column/i.test(msg)) throw e; // 컬럼이 이미 있으면 정상 — 그 외 오류만 던짐
    }
  };
  await tryAlter('ALTER TABLE customers ADD COLUMN owner TEXT');
  await tryAlter('ALTER TABLE pools ADD COLUMN owner TEXT');
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers (owner)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pools_owner ON pools (owner)').run();
}

// 파일(사진·음성)이 딸린 고객(customer) 또는 참조풀(pool)이 실제로 이 담당자 소유인지 확인.
// files 테이블은 자체적으로 담당자를 저장하지 않고, owner_type/owner_id로 가리키는
// customers/pools 레코드의 owner를 그대로 따라간다(중복 저장을 피하기 위함).
export async function ownerBelongsToAdvisor(env, ownerType, ownerId, advisorId) {
  const table = ownerType === 'pool' ? 'pools' : 'customers';
  const row = await env.DB.prepare('SELECT owner FROM ' + table + ' WHERE id = ?').bind(String(ownerId)).first();
  if (!row) return false; // 존재하지 않는 고객/참조풀
  return row.owner === advisorId;
}
