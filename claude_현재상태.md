# 고객상담관리 앱 — 작업 현황 메모 (2026-08-28 기준)

새 대화를 여셨다면 이 메모부터 참고하면 지금까지 상황을 빠르게 파악할 수 있어요.

## ⭐ 새 세션 Claude가 먼저 알아야 할 핵심 3가지
1. **카카오 설정 완료** — 앱 ID 1559026, JS키 `8e104d55c5268f324f7aa0319e3cddbb`(코드 하드코딩), 도메인(`jam-customer-console.pages.dev`) 등록, REST키는 Cloudflare 환경변수 `KAKAO_REST_KEY`(Secret)에 설정 완료. 지도·소요시간 정상 작동 확인됨.
2. **git 잠금 이슈** — 이 코워크 마운트는 파일 삭제(unlink)가 막혀 커밋 때 생기는 `.git/index.lock`이 자동으로 안 지워짐. → 커밋 전 lock을 `mv`(이름변경)로 치우고 커밋할 것. 자세한 방법은 아래 "git 잠금" 항목.
3. **같은 폴더 병행 작업 금지** — 다른 Claude 세션·툴이 같은 폴더를 동시에 만지면 커밋 충돌 위험. 한 곳에서만 작업할 것.

## 앱 개요
- 이름: jam-customer-console (보험영업용 고객상담관리 앱)
- 구조: Cloudflare Pages(정적 파일 + Functions) + Cloudflare D1(공용 DB) + Cloudflare R2(사진·음성 파일 저장) + 브라우저 IndexedDB(기기별 캐시, 클라우드와 동기화)
- 저장 위치(사용자 PC): `D:\푸본현대생명\jam앱\jam-customer-console\`
- 배포: GitHub 저장소에 푸시하면 Cloudflare Pages가 자동 배포. **코드를 고쳐도 GitHub Desktop에서 커밋·푸시해야 실제 사이트에 반영됨.**

## 폴더 구조 (2026-08-23 확인)
```
jam-customer-console/
├── .git/                    (GitHub 연동·버전 기록 — 절대 삭제 금지)
├── db/schema.sql            (DB 구조 정의)
├── docs/data-schema.md      (데이터 구조 설명)
├── functions/
│   ├── _lib/advisors.js     (담당자 인증)
│   ├── _lib/prompts.js      (AI 프롬프트 모음)
│   └── api/
│       ├── analyze.js       (AI 정리·분석 — Whisper 음성인식도 여기 있음)
│       ├── data.js          (텍스트 데이터 저장, D1)
│       └── files.js         (사진·음성 파일 저장, R2)
├── public/
│   ├── css/style.css
│   ├── js/ (advisor, analysis, ap, core, customers, filesync, ocr, pools, voice)
│   └── index.html           (메인 화면)
└── README.md
```

## AI가 실제로 어떻게 쓰이는지 (중요 — 자주 헷갈림)
- **D1 = 텍스트 저장 창고, R2 = 파일 저장 창고. 둘 다 AI가 아님.**
- **"AI로 정리"(상담사례풀 등) → Claude Haiku 모델(Anthropic, 유료).** Claude 중 제일 저렴한 급.
- **"보장 분석"·"가입설계 분석" → Claude Sonnet 모델(Anthropic, 유료).**
- **음성인식(Whisper)만 예외 → Cloudflare Workers AI(무료 토큰).**
- 처음엔 정리·분석도 Cloudflare 무료 AI로 하려 했으나, 한국어·보험 용어 품질이 떨어져서 **Claude(유료)로 결정. 이 방침 유지(A안 확정, 2026-08-23).**
- 비용 절감 장치: 개조식 핵심내용(`keyContent`)을 미리 압축해두고, 프롬프트 캐싱을 사용. 정리를 한 번 잘 해두면 이후 분석마다 드는 토큰이 줄어듦.

## voice.js 는 Whisper 와 무관 (헷갈리지 말 것)
- `public/js/voice.js` = 브라우저 자체 음성기능(TTS 읽어주기 + STT 실시간 받아쓰기).
- 용도: 고객 이름 불러서 검색, 고객 정보를 말로 입력. **녹음 파일을 글로 바꾸는 Whisper와는 다른 것.**
- Whisper 음성인식은 `functions/api/analyze.js`의 `organize_pool` 모드에 있음.

## 앱8 세션에서 완료한 작업
1. 고객 검색창 한글(IME) 입력 깨짐 버그 해결.
2. AI 버튼 4개(정리·분석, 상담사례 매칭, 가입설계 분석, 상담 멘트 생성)를 보라색 3D 버튼(`.btn-ai`)으로 구분.
3. "참조풀" 화면 전면 개편 — 관리자 화면(⚙ 관리자 화면 → 참조풀 관리)에서만 자료 관리:
   - 텍스트(.txt)·음원 파일 드래그&드롭(여러 개 동시)
   - "AI로 정리" → 제목·요약(목차식)·핵심내용(개조식·4000자)·태그 자동 생성
   - PDF·이미지는 별도 칸에서 보여주기 전용(AI 미분석)
   - "AI로 정리"는 관리자 비밀번호로 바로 인증
   - 담당자 화면에서는 참조풀 항목을 읽기 전용으로 조회
4. AI 정리 시 분석에 쓰이는 값은 `keyContent`(핵심내용) — 미리 압축해 비용 절감.
5. "AI로 정리" 실패 시 영문 오류를 한국어 메시지로 개선. 음원 4MB↑ 미리 경고.
6. "AI로 정리·분석"과 "가입설계 분석"은 사진·PDF를 실제로 AI가 보고 분석. 참조풀 ④번 칸은 의도적 미분석.

## 앱9 세션에서 확인·결정·작업한 것 (2026-08-23)

### 확인·결정
1. **files.js 두 개 정리** — 정상 버전은 `functions/api/files.js`(첫 줄 `// functions/api/files.js`, 경로 `../_lib/`, R2 저장). 루트에 있던 `files.js`는 "System initialization" 대화에서 나온 우회 패치 버전(경로 `../lib/` 틀림, 설명글 섞임)으로 **앱에서 안 쓰는 파일 → 지워도 됨.** (500 에러는 정상 버전으로 이미 해결 완료.)
2. **음성인식(Whisper) 큰 파일 한계 확인** — Cloudflare Whisper는 1~2MB만 넘어도 실패하거나 결과가 깨짐. 40분 음원이 되는 것처럼 보였던 건 착각(음원+텍스트를 같이 넣었을 때 텍스트만 처리된 것). **긴 상담 녹음은 앱 내장 Whisper로 불가능.**
3. **긴 상담 녹음 최종 방법 = 삼성 갤럭시 "음성 녹음" 앱 사용.** (다글로·클로바노트 다 불필요)
   - 삼성 음성녹음이 녹음 후 자동으로 텍스트 변환 + 음원/텍스트 파일 다운로드 제공.
   - 최종 흐름: **삼성 음성녹음으로 텍스트 뽑기 → 관리자 창 상담사례풀에 붙여넣기 → "AI로 정리"(Claude Haiku) → D1 저장 → 이후 다른 고객 분석에 참고자료로 활용(A안: 공용 상담사례풀에 축적).**
4. **Claude는 음성 파일을 직접 못 들음(2026 기준)** — 텍스트·이미지만 처리. 그래서 "음원+텍스트를 같이 AI에" 방식은 우리 앱(Claude)에선 불가능. 반드시 텍스트로 바꾼 뒤 넣어야 함.
5. **정리·분석 AI = Claude 유지(A안 재확정)** — 무료 Cloudflare AI는 한국어·보험 용어 품질이 떨어져서 안 씀.

### 실제로 코드를 고친 것 (배포하려면 GitHub 푸시 필요)
6. **prompts.js — 상담사례풀 정리 오류 방지 규칙 추가**: 음성변환 텍스트의 오탈자·오인식(회사명·숫자·용어)을 추측하지 말고 "(확인 필요)"로 표시. (organizePoolSystem)
7. **advisor.js — 관리자 참조풀 "새 상담사례" 화면 개선**:
   - ①번 칸은 텍스트(.txt)만 드롭·업로드. 음원 드롭하면 안내 후 무시.
   - 음원은 아래 음원 칸에서 올려 "듣기 전용"(AI 정리에 안 보냄).
   - 텍스트 파일 넣으면 본문에 `━━━ 📄 파일이름 ━━━` 구분선과 함께 삽입.
   - 파일 목록 각 칩에 **× 삭제 버튼** — 누르면 그 파일 블록만 본문에서 제거(파일별 정확 삭제). 본문을 손으로 고쳐 구분선이 사라지면 안내만.
8. **이미지 분석 정확도 개선 (핵심 원인 2가지 해결)**:
   - **원인 A: 이미지 이중 압축** — 저장할 때(1500px/0.72)와 AI 전송할 때(1500px/0.72) 두 번 JPEG 압축돼 글자·숫자가 뭉개짐. → **1568px(Anthropic 권장 최적값), 저장 품질 0.9 / 전송 품질 0.92로 상향.** (`ocr.js` 보장분석 3곳, `analysis.js` 가입설계 2곳)
   - **원인 B: 프롬프트가 바로 압축만 시킴** — AI가 사진을 충분히 보기 전에 값부터 채움. → tidySystem·planSystem에 **"결과 쓰기 전에 사진을 한 장씩 정독, 숫자 자릿수·쉼표 주의" 단계 추가.** (`prompts.js`)
   - (참고) 버튼별 모델 연결은 점검 결과 모두 적절 — 이미지 분석(tidy/plan/analyze)은 Sonnet, 텍스트 정리(organize_pool/ap/summarize)는 Haiku. JSON 형식 자체는 이미 사용 중이라 정확도와 무관.

### 이번에 수정된 파일 (덮어쓸 위치)
- `functions/_lib/prompts.js` ← 상담사례풀 규칙 + 보장분석/가입설계 정독 단계 (셋 다 합쳐진 최신본)
- `public/js/advisor.js` ← 상담사례 화면 텍스트만/음원 듣기전용/파일 X 삭제
- `public/js/ocr.js` ← 보장분석 이미지 해상도·품질 상향
- `public/js/analysis.js` ← 가입설계 이미지 해상도·품질 상향

## 앱10 세션에서 한 것 (2026-08-28) — 기능 대거 추가

### 음성인식(Whisper)
- 음원 → AI 받아쓰기 "다시 켬": 관리자 참조풀 "AI로 정리" 때 첨부 음원을 Whisper로 받아쓰기해 함께 정리(앱9에서 듣기전용으로 껐던 걸 되돌림). `advisor.js organizeAdminPool`.
- 모델 신형 교체: `@cf/openai/whisper` → `@cf/openai/whisper-large-v3-turbo`(base64 직접 전달, 더 긴 음원 가능). 20MB↑ 서버 차단. `analyze.js organize_pool`.
- 크기 경고(5MB soft/20MB block)·실패 경고·성공 토스트 추가. 긴 상담녹음은 여전히 휴대폰 음성녹음 권장(짧은 음원용).
- 전제: Cloudflare Pages에 Workers AI 바인딩(변수명 `AI`) — 설정 완료 확인함.

### 가입설계 — 사전심사 칸
- 가입설계 이미지 위에 "사전심사(질병·부담보)" textarea(`c.planPreScreen`). "가입설계 분석" 시 설계서 이미지 + 사전심사 내용 함께 분석. `analysis.js`, `analyze.js plan`, `prompts.js planSystem`.

### 고객 필드 추가 + 프롬프트 반영
- 전화번호(phone, eb4c9d7). 이름 우측 성별(`c-gender`), 전화 우측 직업(`c-job`), 지역 아래 주소(`c-address`)+상세주소(`c-address-detail`).
- 주소 찾기 = 카카오 우편번호 서비스(무료·키불필요). `openAddrSearch`/`openAddrSearchInto`.
- **성별·직업을 보장분석·가입설계·상담멘트(analyze/plan/ap) 프롬프트에 반영. 성별 미상 시 남성 가정 금지 규칙 추가.** (전엔 성별이 없어 AI가 남성으로 가정하던 문제 해결)
- 마스킹: 전화·주소·주민번호를 평소 가리고 hover/터치로 보기(오버레이 방식, 저장은 항상 원본). `mask-wrap`/`mask-ov`.
- 주민번호는 한 칸(`c-rrn`)으로 통합, **`000000-0******`** 표시(앞6+성별1자리만 보임). 앞6으로 만나이 자동계산. 저장 시 birth6/rrnBack로 분리 보관. `onRrn`.
- ⚠️ 주민번호 뒷자리(`rrnBack`) 평문 저장 — 민감정보 취급 주의. `docs/data-schema.md`에 문서화.

### 지도 · 자동차 소요시간 (신규)
- 고객 주소칸 아래 "🗺️ 지도로 찾기" → **전체화면** 지도(시트 아님). `#ov-map`, `openMapSheet`/`closeMapFull`.
- 카카오맵 SDK(services)로 지도·주소→좌표(지오코딩)+역/건물명 키워드 폴백(`_geocode`).
- 출발/도착/경유지(＋경유지 추가) 각각 주소 찾기 버튼. 구간별 시간·거리 표시 + **구간마다 다른 색 경로선(polyline)**.
- 자동차 경로 = Cloudflare Function `functions/api/directions.js`(카카오모빌리티 여러경유지 API, env `KAKAO_REST_KEY` 필요).
- 카카오내비 버튼: JS SDK로 **도착지 안내**. 경유지는 웹 연동 불가(카카오 미지원) → 도착지만(사용자와 1번안 확정).

### 카카오 개발자 설정 (완료)
- 카카오 앱: **jam-customer-console (ID 1559026)**. JavaScript 키 `8e104d55c5268f324f7aa0319e3cddbb`(코드에 하드코딩, 공개용·도메인제한).
- **플랫폼 키 → JavaScript 키 → 수정 → "JavaScript SDK 도메인"**에 `https://jam-customer-console.pages.dev` 등록(← 지도 뜨는 핵심). 카카오맵 사용 ON.
- REST API 키는 Cloudflare 환경변수 **`KAKAO_REST_KEY`(Secret)**에 넣음(자동차 소요시간용) — 설정 완료.

### ⚠️ 알아둘 것 (git 잠금)
- 이 코워크 마운트는 파일 삭제(unlink)가 막혀 있어, 커밋 때 생기는 `.git/index.lock`·`HEAD.lock`이 자동으로 안 지워져 다음 커밋을 막음. → 커밋 전 lock을 이름변경(mv)으로 치우고 커밋하는 방식으로 처리해 왔음. `.git`에 `*.disabled`·`trash.*`·`.old` 찌꺼기 쌓여도 git엔 무해. GitHub Desktop이 "another process running" 뜨면 `.git\index.lock` 파일 삭제하면 됨.

## 앱11 세션에서 한 것 (2026-08-28) — 배포 사이트 실측

배포 사이트(`jam-customer-console.pages.dev`, v40)에서 앱10 기능을 직접 눌러 테스트. **버그 없음, 코드 수정·커밋 없음(메모만 갱신).**

실측으로 정상 확인:
- **마스킹** — 전화 `010-****-5678`, 주민번호 `900101-2******`(앞6+성별자리만). 입력폼·고객상세 둘 다 마스킹됨.
- **주민번호 통합칸 + 만나이** — `900101-2******` 한 칸, 만나이 36세·연령대 30대 자동계산.
- **지도** — 전체화면, 경유지 추가, 구간별 시간(서울역→강남역 22분·10.7km / 강남역→판교역 20분·15.8km), 구간별 색 경로선(파랑·빨강), 카카오내비 버튼(콘솔 에러 없음). 카카오모빌리티 경로 API·지도 SDK 정상.
- **사전심사 칸** — 가입설계(③단계)에 칸 존재. 코드상 `preScreen`이 plan 프롬프트에 "반드시 반영"·부담보 미보장 처리로 연결됨(analysis.js→analyze.js→prompts.js 확인).

코드로 연결만 확인(유료/파일 필요해 라이브 미실행):
- **성별 여성 반영** — 보장분석(analysis.js:292)·가입설계(:337)·상담멘트(ap.js:137) 3곳 모두 `gender` 전송, 서버 프롬프트에 "성별: 여" 주입, 미상 시 중립 규칙(prompts.js). ⚠️ 실제 여성 기준 분석문은 실보장 이미지로 유료 실행해야 최종 확인.
- **음원 받아쓰기** — advisor.js 음원 칸→organizeAdminPool→base64, analyze.js `@cf/openai/whisper-large-v3-turbo`(base64 직접), 20MB 차단·실패 한국어 안내. ⚠️ 짧은 실음원으로 최종 확인 필요.

## 아직 남은 것 / 확인 필요
- **GitHub Desktop에서 Push 확인** — 안 올라간 커밋 있으면 Push origin. (배포는 Cloudflare Pages 자동)
- **유료 실측 2건**: ①음원 받아쓰기(짧은 실음원) ②성별 여성 보장분석(실보장 이미지로 여성 기준 서술 확인).
- (기존) 앱8 이미지·정독 개선 실측 — 실제 보장급부 사진으로 숫자·담보명 정확도 확인.
- 테스트로 만든 고객 **"테스트고객"**(id `mtbnuaiasw995`) — 앱11 세션에서 생성, 정리 시 삭제 가능.
