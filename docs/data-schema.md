# 고객상담관리 — 데이터 구조 표준화 문서

이 문서는 앱이 실제로 저장·사용하는 "고객(customer)"과 "참조풀(pool)" 레코드의 필드를 정리한 것이다.
지금까지는 코드 여기저기(customers.js, pools.js, analysis.js, ap.js, ocr.js)에 흩어진 채로만 존재했고,
정리된 스펙 문서가 없었다. 새 필드를 추가할 때는 이 문서도 함께 갱신한다.

저장 위치: 브라우저 IndexedDB(`cust-consult` DB, `customers`/`pools`/`images`/`meta` 스토어) → 로그인 시
Cloudflare D1(`customers`/`pools` 테이블)에 JSON 통짜로 동기화. 테이블 정의는 `db/schema.sql` 참고.

## 공통 상수 (public/js/core.js)

| 상수 | 값 | 쓰이는 필드 |
|---|---|---|
| `AGES` | 20대/30대/40대/50대/60대+ | `age` |
| `PRODUCTS` | 종신/정기/암/건강/실손/연금저축/어린이/CI | `product[]` |
| `SITUATIONS` | 신규/리모델링/갱신전환/해약방어/만기도래/증권점검 | `situation[]` |
| `SEGMENTS` | 방문예정/상담/계약 | `seg` |
| `SOURCES` | db(DB 고객) / acq(지인 고객) | `source` |
| `IMG_KINDS` | 보장급부/내보장자산/기타 | `docKind`, 이미지의 `kind` |

## 고객(customer) 레코드

`customers` IndexedDB/D1 테이블의 `data` JSON. id는 `core.js`의 `uid()`(타임스탬프+난수)로 생성.

### 기본 정보
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 고유 id |
| `name` | string | 이름 |
| `region` | string | 지역 |
| `birth6` | string(6자리) | 생년월일 YYMMDD |
| `ageNum` | number\|null | `birth6`에서 계산된 만 나이 |
| `age` | string | `AGES` 중 하나(연령대) — `ageNum` 계산 시 자동 채워짐 |
| `source` | 'db'\|'acq' | DB 고객 / 지인 고객 |
| `seg` | string | `SEGMENTS` 중 하나(현재 단계) |
| `grade` | string | 등급(자유 텍스트, `fillSelect`로 관리) |
| `product[]` | string[] | `PRODUCTS`에서 다중 선택 |
| `situation[]` | string[] | `SITUATIONS`에서 다중 선택 |
| `memo` | string | 메모 |
| `folder` | string | 내부 폴더 그룹(현재 `name`과 동일값으로 자동 설정됨) |
| `created` | string(YYYY-MM-DD) | 생성일 |
| `updated` | string(ISO8601) | 마지막 수정 시각 — 목록 정렬 기준 |

### 보장분석(coverage) — OCR·AI 정리 결과
| 필드 | 타입 | 설명 |
|---|---|---|
| `images[]` | string[] | 첨부 이미지/PDF변환본의 id 목록(IndexedDB `images` 스토어 참조) |
| `docKind` | string | 마지막으로 선택한 `IMG_KINDS` 값(새 이미지 추가 시 기본 분류) |
| `coverageText` | string(markdown) | AI가 OCR+정리한 "보장급부/내보장자산/종합분석" 텍스트(현재 버전) |
| `coverageHistory[]` | {at, text}[] | `coverageText`의 이전 버전들. `ocr.js`의 `tidyCoverage()`가 새 정리를 만들 때마다 앞에 추가 |

### AI 영역별 분석 (보장분석 결과)
| 필드 | 타입 | 설명 |
|---|---|---|
| `analyses[]` | {date, data}[] | 실행 이력. `data`가 아래 구조 |
| `analyses[].data.summary` | string | 한 줄 요약 |
| `analyses[].data.areas[]` | {name, level, reason, certainty?}[] | 영역별 판정. `level`은 충분/보통/취약. `certainty`는 2026-08-13 추가 — `확정`\|`추정`\|`자료부족` (텍스트 근거 유무 표시, 옛 기록엔 없을 수 있음) |
| `analyses[].data.priorities[]` | string[] | 우선 보완 순위 |
| `analyses[].data.detail[]` | string[] | 영역별 상세 설명 |
| `analysis` / `analysisDate` | object/string | 최신 분석 결과의 캐시(하위호환용, `analyses[0]`과 중복될 수 있음) |
| `focusAreas[]` / `excludeAreas[]` | string[] | 분석 시 강조/제외할 영역(사용자가 지정) |

### 가입설계(plan) 분석
| 필드 | 타입 | 설명 |
|---|---|---|
| `planImages[]` | string[] | 가입설계서 이미지 id 목록 |
| `planText` | string | 가입설계서에서 추출한 텍스트 |
| `planTextImgN` | number | `planText`를 추출한 시점의 이미지 장수(재추출 필요 여부 판단용) |
| `planAnalyses[]` | {at\|date, data}[] | 가입설계 분석 이력. `data.shortfallRate`(잔여부족율), `data.summary`, `data.planDetail[]` 등 |

### 대면(AP) 스크립트
| 필드 | 타입 | 설명 |
|---|---|---|
| `ap` | {scripts:{ice,cov,epi,plan}, savedAt} | 단계별 AI 생성 멘트. 키는 아이스브레이크/보장분석설명/공감에피소드/가입설계제안 |
| `apSaved` | boolean | AP를 저장했는지 여부 — 고객 목록에 "AP" 배지 표시 조건 |

### 기타 기록
| 필드 | 타입 | 설명 |
|---|---|---|
| `profileLogs[]` | {date, place, content}[] | 고객 프로필/상담 기록 |
| `pinnedPools[]` | string[] | 이 고객 작업 시 선택(pinned)해둔 참조풀 id 목록 — `ensurePinsForCustomer()`가 복원 |

## 참조풀(pool) 레코드

`pools` IndexedDB/D1 테이블의 `data` JSON.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 고유 id |
| `poolType` | string | 풀 종류(예: `case`, `episode` 등 — 화면별 필터에 사용) |
| `title` | string | 제목 |
| `body` | string | 본문(요약/편집본) |
| `bodyFull` | string | 본문 전체(긴 원문) |
| `hasFull` | boolean | `bodyFull`이 별도로 존재하는지 |
| `summaryFull` | string | AI 요약 전체본 |
| `brief` | string | 짧은 요약 |
| `free[]` | string[] | 자유 태그(쉼표 구분 입력) |
| `product[]` | string[] | `PRODUCTS`에서 다중 선택 |
| `situation[]` | string[] | `SITUATIONS`에서 다중 선택 |
| `age[]` | string[] | 해당 연령대 태그 |
| `images[]` | string[] | 첨부 이미지 id 목록 |
| `audio` | string\|null | 음성메모 파일 id(IndexedDB `images` 스토어에 오디오 blob으로 저장됨 — 이름은 images지만 이미지 전용이 아니라 범용 파일 스토어) |
| `created` | string(YYYY-MM-DD) | 생성일 |
| `pinned` | boolean | 세션/고객 단위 임시 선택 상태(저장 안 함, 화면 표시용) |

## 동기화용 내부 필드 (2026-08-14 추가)

고객/참조풀 레코드가 D1에 저장될 때만 서버가 붙이는 필드. 로컬 IndexedDB나 화면에는 별 의미 없이 같이
따라다니는 값이고, 사용자가 직접 채우는 필드는 아니다. `functions/api/data.js`의 `saveCustomer`/`savePool`
액션이 담당한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `_updatedBy` | string\|null | 마지막으로 이 레코드를 저장한 브라우저(기기)의 id(`core.js`의 `getDeviceId()`, `localStorage`에 저장되어 그 브라우저에서 계속 재사용됨). 저장 시 버전 충돌 감지에 씀 — 새 저장 요청의 `updated`가 서버에 있는 값과 다를 때, `_updatedBy`가 이번 요청과 같은 기기면 "그냥 이 기기 자신이 놓친 것"으로 보고 통과시키고, 다르면 진짜 충돌로 보고 저장을 막는다(자세한 내용은 `고객상담관리_구조개선.md` 참고). |

D1의 `customers`/`pools` 테이블에는 위 JSON(`data` 컬럼)과 별도로 `owner` 컬럼이 있다(2026-08-14 다중
담당자 구조 추가). 어느 담당자(`advisors.id`) 소유인지 표시하며, JSON 안에는 들어가지 않고 순수 서버
컬럼으로만 존재한다. 신규 레코드는 저장한 사람이 자동으로 owner가 되고, 이미 다른 담당자 소유로
확정된 레코드는 다른 담당자가 저장·삭제할 수 없다(`functions/api/data.js`, `functions/_lib/advisors.js`
참고). 담당자 계정(`advisors` 테이블: id/name/password_hash)은 고객·참조풀과는 별개 테이블이다.

## 파일(첨부 이미지·음성) — 로컬 저장 vs 클라우드

- 브라우저 IndexedDB `images` 스토어: `{id, kind, blob, created}` — 사진, PDF 변환본, 가입설계서, 음성메모가
  모두 이 스토어를 공유한다(`kind` 값으로 구분: 보장급부/내보장자산/기타/설계서/음원 등).
- 2026-08-13 이전: 이 blob들은 **기기 로컬에만** 존재하고 클라우드에는 올라가지 않았음(텍스트만 D1에 동기화).
- 2026-08-13부터: `functions/api/files.js` + D1 `files` 테이블 + R2(`FILES_BUCKET`)로 실제 업로드/다운로드 지원.
  상태값(`status`)은 `db/schema.sql`의 `files` 테이블 CHECK 제약 참고. 클라이언트 동기화 로직은
  `public/js/filesync.js` (`fsQueueForOwner`, `fsDownloadMissing`).

## 참고

- 실제 데이터 예시: `고객전체_2026-08-09.json` (백업 파일, 위 필드들이 실사용 중인 것을 확인함).
- `저장소 진단`(pools.js `runStorageDiagnostic`)이 고객/참조풀이 참조하는 파일 id와 실제 IndexedDB에 있는
  blob을 대조해 누락/고아/중복을 찾아주므로, 마이그레이션이나 정합성 점검 시 먼저 실행해볼 것.
