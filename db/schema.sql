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

-- ============================================================
-- customers : 고객 레코드 (JSON 통짜 저장 — 필드 상세는 docs/data-schema.md 참고)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id      TEXT PRIMARY KEY,   -- 클라이언트에서 생성한 id (core.js uid())
  data    TEXT NOT NULL,      -- 고객 레코드 전체를 JSON.stringify 한 값
  updated TEXT NOT NULL       -- ISO8601, 마지막 저장 시각
);

-- ============================================================
-- pools : 참조풀(케이스·문구 등) 레코드 (JSON 통짜 저장)
-- ============================================================
CREATE TABLE IF NOT EXISTS pools (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  updated TEXT NOT NULL
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
