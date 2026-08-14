-- db/schema.sql
-- 고객상담관리 D1 데이터베이스(jam-console-db) 스키마
--
-- 이 파일은 2026-08-13 기준 Cloudflare D1 콘솔에 이미 존재하는 테이블 구조를
-- functions/api/data.js / functions/api/files.js 의 쿼리를 근거로 "역추적"하여
-- 코드로 기록한 것이다(그 전까지는 대시보드에만 있고 저장소엔 없었음).
--
-- 앞으로 스키마를 바꿀 때는:
--   1) 이 파일에 먼저 반영(문서화)
--   2) Cloudflare 대시보드 → Workers & Pages → D1 → jam-console-db → Console 에서
--      아래 CREATE TABLE 문(또는 변경분만) 실행
-- 순서로 진행한다. IF NOT EXISTS를 쓰므로 이미 만들어진 운영 DB에 다시 실행해도 안전하다.
--
-- 2026-08-14 다중 사용자(담당자 구분) 추가: advisors 테이블 + customers/pools의 owner 컬럼은
-- 아래 SQL을 D1 콘솔에서 직접 실행해도 되지만, 더 쉬운 방법으로 앱 안의 "담당자 관리" 화면
-- (관리자 비밀번호 필요)에 있는 "초기 설정 실행" 버튼을 누르면 서버가 대신 실행해준다
-- (functions/api/data.js의 'adminSetupSchema' 액션). 둘 중 하나만 하면 된다.

-- ============================================================
-- customers : 고객 레코드 (JSON 통짜 저장 — 필드 상세는 docs/data-schema.md 참고)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id      TEXT PRIMARY KEY,   -- 클라이언트에서 생성한 id (core.js uid())
  data    TEXT NOT NULL,      -- 고객 레코드 전체를 JSON.stringify 한 값
  updated TEXT NOT NULL,      -- ISO8601, 마지막 저장 시각
  owner   TEXT                -- 담당자(advisors.id). 2026-08-14 추가 — 이 고객이 어느 담당자 소유인지
);

-- ============================================================
-- pools : 참조풀(케이스·문구 등) 레코드 (JSON 통짜 저장)
-- ============================================================
CREATE TABLE IF NOT EXISTS pools (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  updated TEXT NOT NULL,
  owner   TEXT                -- 담당자(advisors.id). 2026-08-14 추가
);

-- 기존에 이미 만들어진 운영 DB라면(2026-08-14 이전) 위 CREATE TABLE 문은 이미 있는 테이블이라
-- 그냥 넘어가고, owner 컬럼만 아래처럼 별도로 추가해야 한다. SQLite는 ADD COLUMN에
-- IF NOT EXISTS를 지원하지 않으므로, 이미 실행한 적이 있다면 "duplicate column name" 오류가
-- 뜨는데 그건 이미 반영됐다는 뜻이니 무시해도 된다.
ALTER TABLE customers ADD COLUMN owner TEXT;
ALTER TABLE pools ADD COLUMN owner TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers (owner);
CREATE INDEX IF NOT EXISTS idx_pools_owner ON pools (owner);

-- ============================================================
-- advisors : 담당자(설계사) 계정. 로그인 화면에서 "이름 선택 + 개인 비밀번호"로 사용.
-- id는 서버가 자동으로 만드는 내부 코드라 사용자가 외울 필요 없음(이름만 알면 됨).
-- 앱 전체 공통 비밀번호(APP_PASSWORD)와는 별개로, 이 테이블에 있는 담당자만
-- 로그인 후 "자기 것"인 고객·참조풀만 보고 저장할 수 있다.
-- ============================================================
CREATE TABLE IF NOT EXISTS advisors (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,   -- 개인 비밀번호를 SHA-256으로 해시한 값(평문 저장 안 함)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ============================================================
-- files : 고객/참조풀에 첨부된 파일(이미지·PDF변환본·음성메모)의 메타데이터.
-- 실제 바이트는 R2(FILES_BUCKET)에 있고, 이 테이블은 위치(object_key)와
-- 동기화 상태만 추적한다. (functions/api/files.js 가 R2 업로드/다운로드 시 갱신)
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,          -- IndexedDB 'images' 스토어의 파일 id와 동일
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('customer', 'pool')),
  owner_id      TEXT NOT NULL,             -- customers.id 또는 pools.id
  category      TEXT NOT NULL,             -- 예: 보장급부/내보장자산/기타/설계서/음원 (core.js IMG_KINDS 등)
  filename      TEXT,
  content_type  TEXT NOT NULL,             -- 예: image/jpeg, audio/webm
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT,                      -- 무결성 확인 · 중복 탐지용
  object_key    TEXT,                      -- R2 오브젝트 키: "{owner_type}/{owner_id}/{id}"
  status        TEXT NOT NULL CHECK (status IN (
                  'local_only', 'pending_upload', 'uploading', 'uploaded', 'upload_failed',
                  'pending_delete', 'delete_failed', 'deleted', 'missing_source'
                )),
  sync_version  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  uploaded_at   TEXT,
  deleted_at    TEXT,
  last_error    TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_owner ON files (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files (status);
