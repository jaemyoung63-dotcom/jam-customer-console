// 보장 분석 중계 함수 (Cloudflare Pages Functions)
// API 키는 Cloudflare 환경변수(ANTHROPIC_API_KEY)에서만 읽으며 코드에 넣지 않습니다.
//
// 2026-08-14 다중 담당자 확장: 사이트 비밀번호(pw) 확인 뒤 담당자 개인 비밀번호(advisorId/advisorPw)도
// 확인한다. AI 비용을 담당자별로 나눠 추적하고 싶으면, Cloudflare 환경변수에
// "ANTHROPIC_KEY_" + 담당자id 형식으로 그 담당자 전용 키(Anthropic Workspace API 키)를 추가하면
// 되고, 없으면 지금처럼 공통 ANTHROPIC_API_KEY를 그대로 쓴다(둘 다 안 만들어도 기존과 동일하게 작동).

import { checkSitePassword, checkAdvisor, checkAdminPassword } from '../_lib/advisors.js';
import {
  tidySystem as buildTidySystem,
  apSystem as buildApSystem,
  summarizeSystem as buildSummarizeSystem,
  organizePoolSystem as buildOrganizePoolSystem,
  planSystem as buildPlanSystem,
  analyzeSystem as buildAnalyzeSystem
} from '../_lib/prompts.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json' }, CORS)
  });
}

// ---- 모델 JSON 견고 파싱 ----
// 모델이 코드펜스·설명문·문자열 내부 raw 개행·trailing comma 등으로
// 살짝 깨진 JSON을 내보내도 최대한 복구해서 객체로 반환한다. 실패하면 null.
function _tryParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function _repairJson(s) {
  // 문자열 리터럴 내부의 raw 제어문자(개행·탭)를 이스케이프하고 trailing comma 제거
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch; continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}
// 잘린(truncation) JSON 복구: 미완성 문자열·괄호를 닫아 유효 JSON으로
function _closeJson(s) {
  let inStr = false, esc = false; const st = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) { esc = false; } else if (ch === '\\') { esc = true; } else if (ch === '"') { inStr = false; } continue; }
    if (ch === '"') { inStr = true; } else if (ch === '{' || ch === '[') { st.push(ch); } else if (ch === '}' || ch === ']') { st.pop(); }
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/[,:]\s*$/, '');
  for (let i = st.length - 1; i >= 0; i--) out += (st[i] === '{' ? '}' : ']');
  return out;
}
function parseModelJson(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let p = _tryParse(t);
  if (p) return p;
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const core = t.slice(first, last + 1);
    p = _tryParse(core) || _tryParse(_repairJson(core));
    if (p) return p;
  }
  // 잘림 복구: 여는 중괄호부터 끝까지 잡아 닫아준다
  if (first >= 0) {
    const tail = t.slice(first);
    p = _tryParse(_closeJson(_repairJson(tail)));
    if (p) return p;
  }
  return null;
}

// ---- 비용 절감: 프롬프트 캐싱 ----
// 매번 똑같이 반복해서 보내는 긴 글(시스템 지침, 상품 카달로그·설득 에피소드·참고 상담사례 같은
// 담당자 공용 참고자료)에 "여기까지는 캐시해도 된다"는 표시(cache_control)를 붙이면,
// 같은 내용이 짧은 시간(TTL) 안에 다시 오면 Anthropic이 그 부분을 다시 읽지 않고 캐시에서
// 가져와 입력 비용을 정가의 1/10로 깎아준다. 캐시로 표시해도 실제로 짧아서(모델별 최소 토큰
// 기준 미달) 캐시가 안 걸리면 그냥 평소처럼 처리될 뿐, 손해나 오류는 없다.
// 참고: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
function sysCached(text) {
  return [{ type: 'text', text: text, cache_control: { type: 'ephemeral' } }];
}
function cachedBlock(label, text) {
  return { type: 'text', text: '# ' + label + '\n' + text, cache_control: { type: 'ephemeral' } };
}

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const model = context.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  let payload;
  try { payload = await context.request.json(); }
  catch (e) { return json({ error: '요청 형식이 잘못되었습니다.' }, 400); }

  // 1단계: 사이트 공통 비밀번호 확인 (data.js와 동일한 APP_PASSWORD) — 인증 없는 외부 호출로 인한 AI 비용 남용을 막는다.
  const siteCheck = checkSitePassword(context.env, payload, json);
  if (!siteCheck.ok) return siteCheck.res;

  // 2단계: 누구의 AI 사용인지 확인.
  // 'organize_pool'(관리자 "참조풀 관리" 화면의 AI 정리)은 특정 담당자 개인 자료가 아니라 전체
  // 담당자가 공용으로 쓰는 자료를 관리자가 정리하는 작업이다. 그래서 담당자 로그인 대신 관리자
  // 비밀번호(ADMIN_PASSWORD)로 확인한다 — 이미 "⚙ 관리자 화면"에 들어와 있으면(관리자 비밀번호를
  // 한 번 입력했으면) 담당자를 따로 고르거나 개인 비밀번호를 또 입력하지 않아도 자동으로 진행된다.
  let advisorId = '';
  if (payload.mode === 'organize_pool') {
    const adminCheck = checkAdminPassword(context.env, payload, json);
    if (!adminCheck.ok) return adminCheck.res;
  } else {
    const advisorCheck = await checkAdvisor(context.env, payload, json);
    if (!advisorCheck.ok) return advisorCheck.res;
    advisorId = advisorCheck.advisor.id;
  }

  // 담당자 전용 키(ANTHROPIC_KEY_<advisorId>)가 Cloudflare 환경변수에 있으면 그걸 쓰고,
  // 없거나(또는 담당자 구분이 없는 organize_pool 같은 경우) 공통 ANTHROPIC_API_KEY를 쓴다.
  const key = (advisorId && context.env['ANTHROPIC_KEY_' + advisorId]) || context.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: '서버에 API 키가 없습니다. Cloudflare 환경변수 ANTHROPIC_API_KEY를 설정하세요.' }, 500);

  const customer = payload.customer || {};
  const coverageText = (payload.coverageText || '').trim();
  const cases = payload.cases || [];
  const planText = (payload.planText || '').trim();
  // 2026-08-17: 참조풀 텍스트를 "관리자가 전역 고정한 부분"(Fixed·고객 무관·캐시 재사용 대상)과
  // "이 고객에게 맞춰 고른 부분"(Dynamic·고객마다 다름·캐시 대상 아님)으로 나눠서 받는다.
  // 프런트(public/js/analysis.js)가 이미 나눠서 보내준다.
  const catalogTextFixed = (payload.catalogTextFixed || '').trim();
  const catalogTextDynamic = (payload.catalogTextDynamic || '').trim();
  const episodesTextFixed = (payload.episodesTextFixed || '').trim();
  const episodesTextDynamic = (payload.episodesTextDynamic || '').trim();
  const casesTextFixed = (payload.casesTextFixed || '').trim();
  const casesTextDynamic = (payload.casesTextDynamic || '').trim();
  const focusAreas = Array.isArray(payload.focusAreas) ? payload.focusAreas : [];
  const excludeAreas = Array.isArray(payload.excludeAreas) ? payload.excludeAreas : [];

  // 정리(tidy) 모드: OCR 원문을 보장급부·내보장자산으로 구분해 깔끔하게 정돈
  if (payload.mode === 'tidy') {
    const raw = (payload.rawText || '').trim();
    const images = Array.isArray(payload.images) ? payload.images : [];
    if (!raw && images.length === 0) return json({ error: '정리할 자료(이미지 또는 텍스트)가 없습니다.' }, 400);
    const custName = (payload.custName || '').trim();
    const custAge = (payload.custAge || '').trim();
    const confirmations = (payload.confirmations || '').trim();
    const tidyModel = context.env.VISION_MODEL || model;
    const tidySystem = buildTidySystem({ custName, custAge });
    const content = [];
    if (raw) content.push({ type: 'text', text: '참고 텍스트(보조):\n' + raw });
    if (confirmations) content.push({ type: 'text', text: '사용자가 확인해준 확정 정보(반드시 이 값으로 사용하고, 이 항목은 다시 묻지 마세요):\n' + confirmations });
    images.forEach(function (im, i) {
      content.push({ type: 'text', text: '[' + (im.kind || '보장급부') + '] 자료 사진 ' + (i + 1) + ':' });
      content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } });
    });
    content.push({ type: 'text', text: '위 사진들을 직접 읽고, 형식과 규칙에 맞춰 정리·분석해 주세요. 없는 정보는 지어내지 마세요.' });
    try {
      const rr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: tidyModel, max_tokens: 8000, system: sysCached(tidySystem), messages: [{ role: 'user', content: content }] })
      });
      const dd = await rr.json();
      if (!rr.ok) {
        const msg = (dd && dd.error && dd.error.message) ? dd.error.message : ('API 오류 (' + rr.status + ')');
        return json({ error: msg }, rr.status);
      }
      const full = (dd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      let tidied = full, questions = [];
      const mk = full.indexOf('===확인필요===');
      if (mk >= 0) {
        tidied = full.slice(0, mk).trim();
        questions = full.slice(mk + '===확인필요==='.length).split('\n')
          .map(l => l.replace(/^[-•\s]+/, '').trim())
          .filter(l => l && l !== '없음');
      }
      return json({
        text: tidied, questions: questions,
        _debug: {
          stop_reason: dd.stop_reason || null,
          blocks: (dd.content || []).length,
          types: (dd.content || []).map(b => b.type),
          out_tokens: (dd.usage && dd.usage.output_tokens) || 0,
          in_tokens: (dd.usage && dd.usage.input_tokens) || 0,
          img_count: images.length,
          full_len: full.length
        },
        _usage: { input_tokens: (dd.usage && dd.usage.input_tokens) || 0, output_tokens: (dd.usage && dd.usage.output_tokens) || 0, model: dd.model || tidyModel }
      });
    } catch (err) {
      return json({ error: '정리 요청 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  // 요약 모드: 긴 원문을 약 500자로 요약 (풀 본문 표시용)
  if (payload.mode === 'ap') {
    const stage = (payload.stage || '상담').toString().slice(0, 60);
    const material = (payload.material || '').toString().slice(0, 12000);
    const cust = payload.customer || {};
    const apModel = context.env.TIDY_MODEL || 'claude-haiku-4-5-20251001';
    const apSys = buildApSystem({ stage, customer: cust });
    const apUser = '[참고 자료]\n' + (material || '(등록된 자료가 적습니다. 이 단계의 일반적인 모범 멘트를 만들어 주세요.)');
    try {
      const rr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: apModel, max_tokens: 1500, system: sysCached(apSys), messages: [{ role: 'user', content: apUser }] })
      });
      const rd = await rr.json();
      if (!rr.ok) { const msg = (rd && rd.error && rd.error.message) ? rd.error.message : ('API 오류 (' + rr.status + ')'); return json({ error: msg }, rr.status); }
      const atext = (rd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return json({ text: atext, _usage: { input_tokens: (rd.usage && rd.usage.input_tokens) || 0, output_tokens: (rd.usage && rd.usage.output_tokens) || 0, model: rd.model || apModel } });
    } catch (err) {
      return json({ error: 'AP 멘트 생성 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  if (payload.mode === 'summarize') {
    const src = (payload.text || '').trim();
    if (!src) return json({ error: '요약할 내용이 없습니다.' }, 400);
    const sModel = context.env.TIDY_MODEL || 'claude-haiku-4-5-20251001';
    const ssys = buildSummarizeSystem();
    try {
      const rr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: sModel, max_tokens: 2600, system: sysCached(ssys), messages: [{ role: 'user', content: src.slice(0, 16000) }] })
      });
      const rd = await rr.json();
      if (!rr.ok) { const msg = (rd && rd.error && rd.error.message) ? rd.error.message : ('API 오류 (' + rr.status + ')'); return json({ error: msg }, rr.status); }
      const stext = (rd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return json({ summary: stext, _usage: { input_tokens: (rd.usage && rd.usage.input_tokens) || 0, output_tokens: (rd.usage && rd.usage.output_tokens) || 0, model: rd.model || sModel } });
    } catch (err) {
      return json({ error: '요약 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  // 참조풀 자료 정리 모드: 관리자가 넣은 원문을 "제목 키워드 / 목차식 요약 / 개조식 핵심내용"으로 정리.
  // keyContent가 실제로 상담사례 매칭 보장분석 때 AI에게 전달되는 값이므로, 여기서 미리 압축해두면
  // 그만큼 매 분석마다 드는 토큰(비용)이 줄어든다.
  if (payload.mode === 'organize_pool') {
    let src = (payload.text || '').trim();
    const poolTypeLabel = (payload.poolTypeLabel || '참조 자료').toString().slice(0, 20);

    // 음원이 함께 왔으면 먼저 Cloudflare Workers AI(Whisper)로 글로 옮긴 뒤, 원문 뒤에 이어붙인다.
    // 이 기능을 쓰려면 이 Pages 프로젝트에 "Workers AI" 바인딩(변수명 AI)이 추가되어 있어야 한다
    // (Cloudflare 대시보드 → 프로젝트 → Settings → Functions → Bindings → Add → Workers AI → 이름 "AI").
    const audioBase64 = (payload.audioBase64 || '').toString();
    let transcript = '';
    if (audioBase64) {
      if (!context.env.AI) {
        return json({ error: '음성인식을 쓰려면 Cloudflare Pages 프로젝트에 "Workers AI" 바인딩(변수명 AI)을 추가하고 다시 배포해야 합니다. (Settings → Functions → Bindings → Add → Workers AI)' }, 400);
      }
      // 서버 쪽 크기 안전장치: 너무 큰 음원은 Cloudflare 함수의 메모리·시간 한계에 걸려
      // 실패하므로, 모델을 부르기 전에 미리 막고 안내한다. (base64 길이로 원본 크기 대략 추정)
      const approxBytes = Math.floor(audioBase64.length * 3 / 4);
      if (approxBytes > 20 * 1024 * 1024) {
        return json({ error: '음원이 너무 큽니다(약 ' + Math.round(approxBytes / (1024 * 1024)) + 'MB). 앱 내장 받아쓰기는 짧은 음원용이에요. 긴 상담 녹음은 휴대폰 음성녹음 앱으로 글로 바꾼 뒤 ①번 칸에 붙여넣어 주세요.' }, 400);
      }
      try {
        // 신형 모델(whisper-large-v3-turbo)은 base64 문자열을 그대로 받는다 —
        // 예전처럼 바이트 배열로 바꾸지 않아 메모리 부담도 줄고, 더 긴 음원도 다룬다.
        const whisperRes = await context.env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: audioBase64 });
        transcript = (whisperRes && whisperRes.text) ? String(whisperRes.text).trim() : '';
        if (!transcript) return json({ error: '음성에서 글자를 읽어내지 못했습니다. 음원이 너무 길어 중간에 끊겼거나, 인식이 어려운 음질일 수 있어요. 더 짧게 나눠보거나 휴대폰 음성녹음 앱으로 글로 바꿔 넣어주세요.' }, 400);
      } catch (err) {
        return json({ error: '음성인식 실패: ' + (err && err.message ? err.message : String(err)) + ' — 음원이 크면 실패할 수 있어요. 더 짧게 나눠보거나 휴대폰 음성녹음 앱을 이용해 주세요.' }, 500);
      }
    }
    if (transcript) src = src ? (src + '\n\n[음원 인식 내용]\n' + transcript) : transcript;
    if (!src) return json({ error: '정리할 내용이 없습니다.' }, 400);

    const oModel = context.env.TIDY_MODEL || 'claude-haiku-4-5-20251001';
    const osys = buildOrganizePoolSystem({ poolTypeLabel });
    try {
      const rr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: oModel, max_tokens: 3200, system: sysCached(osys), messages: [{ role: 'user', content: src.slice(0, 20000) }] })
      });
      const rd = await rr.json();
      if (!rr.ok) { const msg = (rd && rd.error && rd.error.message) ? rd.error.message : ('API 오류 (' + rr.status + ')'); return json({ error: msg }, rr.status); }
      const raw = (rd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      const parsed = parseModelJson(raw) || {};
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.map(t => String(t || '').trim()).filter(Boolean).slice(0, 8)
        : [];
      return json({
        titleKeyword: (parsed.titleKeyword || '').toString().slice(0, 40),
        summary: (parsed.summary || '').toString().slice(0, 1200),
        keyContent: (parsed.keyContent || '').toString().slice(0, 4000),
        tags: tags,
        transcript: transcript || undefined,
        _usage: { input_tokens: (rd.usage && rd.usage.input_tokens) || 0, output_tokens: (rd.usage && rd.usage.output_tokens) || 0, model: rd.model || oModel }
      });
    } catch (err) {
      return json({ error: '정리 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  // 가입설계 분석 모드: 보장 분석 결과 + 가입설계서(사진 직접 판독)로 부족 보장·추가 제안 분석
  if (payload.mode === 'plan') {
    const cov = (payload.coverageText || '').trim();
    const cov_an = payload.coverageAnalysis || {};
    const planImages = Array.isArray(payload.planImages) ? payload.planImages : [];
    const pConfirm = (payload.confirmations || '').trim();
    const preScreen = (payload.preScreen || '').trim();
    if (!planText && planImages.length === 0) return json({ error: '가입설계서 자료가 없습니다. 설계서 사진을 등록한 뒤 실행하세요.' }, 400);
    const pModel = context.env.VISION_MODEL || model;
    const psys = buildPlanSystem({ focusAreas, excludeAreas, episodesTextFixed, episodesTextDynamic, catalogTextFixed, catalogTextDynamic });
    const puser = [
      '# 고객 정보',
      '이름: ' + (customer.name || '-') + ' / 연령: ' + (customer.age || '-') + ' / 지역: ' + (customer.region || '-'),
      '',
      '# 보장 텍스트 (현재 가입 내용)',
      cov || '(없음)',
      '',
      '# 이미 수행한 보장 분석',
      ((cov_an.summary || '') + '\n' + (cov_an.detail || '')).trim() || '(없음)',
      '',
      ...(preScreen ? ['# 사전심사 (가입설계 중 파악된 고객의 질병 이력·부담보 등 인수 조건 — 반드시 반영)', preScreen, ''] : []),
      (planImages.length ? '# 가입설계서 (첨부된 사진을 직접 읽으세요)' : '# 가입설계서 (새로 제안)'),
      (planImages.length ? '' : planText)
    ].join('\n');
    // 관리자가 "전역 고정"해둔 공용 참고자료는 고객이 바뀌어도 항상 똑같은 내용이므로 맨 앞에
    // 캐시 블록으로 떼어 비용을 아낀다. 이 고객에게 맞춰 자동으로 고른(또는 담당자가 이 고객만을
    // 위해 선택한) 자료는 고객마다 달라지는 게 정상이라 캐시 블록으로 묶지 않는다.
    const pcontent = [];
    if (casesTextFixed) pcontent.push(cachedBlock('참고할 과거 상담사례 (공통)', casesTextFixed));
    if (episodesTextFixed) pcontent.push(cachedBlock('설득 에피소드 (참고 · 공통)', episodesTextFixed));
    if (catalogTextFixed) pcontent.push(cachedBlock('상품 카달로그 (참고 · 공통)', catalogTextFixed));
    if (casesTextDynamic) pcontent.push({ type: 'text', text: '# 참고할 과거 상담사례 (이 고객 맞춤)\n' + casesTextDynamic });
    if (episodesTextDynamic) pcontent.push({ type: 'text', text: '# 설득 에피소드 (참고 · 이 고객 맞춤)\n' + episodesTextDynamic });
    if (catalogTextDynamic) pcontent.push({ type: 'text', text: '# 상품 카달로그 (참고 · 이 고객 맞춤)\n' + catalogTextDynamic });
    pcontent.push({ type: 'text', text: puser });
    planImages.forEach(function (im, i) { pcontent.push({ type: 'text', text: '가입설계서 사진 ' + (i + 1) + ':' }); pcontent.push({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } }); });
    if (pConfirm) pcontent.push({ type: 'text', text: '사용자가 확인해준 확정 정보(반드시 이 값으로 사용하고 다시 묻지 마세요):\n' + pConfirm });
    try {
      const pr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: pModel, max_tokens: 8000, system: sysCached(psys), messages: [{ role: 'user', content: pcontent }] })
      });
      const pd = await pr.json();
      if (!pr.ok) { const msg = (pd && pd.error && pd.error.message) ? pd.error.message : ('API 오류 (' + pr.status + ')'); return json({ error: msg }, pr.status); }
      let ptext = (pd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      ptext = ptext.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
      let pparsed = parseModelJson(ptext);
      if (!pparsed) {
        pparsed = { shortfallRate: 0, summary: '설계 분석 결과를 형식대로 읽지 못했습니다. "원문 보기"로 확인하거나 다시 분석해 주세요.', planDetail: [], questions: [], _raw: ptext };
      }
      if (!Array.isArray(pparsed.planDetail)) pparsed.planDetail = [];
      if (!Array.isArray(pparsed.questions)) pparsed.questions = [];
      pparsed._usage = { input_tokens: (pd.usage && pd.usage.input_tokens) || 0, output_tokens: (pd.usage && pd.usage.output_tokens) || 0, model: pd.model || pModel };
      return json(pparsed);
    } catch (err) {
      return json({ error: '가입설계 분석 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  if (!coverageText) return json({ error: '보장 텍스트가 비어 있습니다. OCR 또는 직접 입력으로 채운 뒤 분석하세요.' }, 400);

  // 2026-08-17 2차 정정: 과거 상담사례도 다른 참조풀처럼 전역 고정(캐시) 블록 + 활용 지시(제목만) 구조로
  // 통일한다. 예전에는 cases 배열(본문 그대로, 캐시 대상 아님)을 매번 새로 보냈지만, 참조풀관리에
  // 올라간 자료는 전부 항상 전역 고정이므로 상담사례 본문도 캐시 블록에 넣어 비용을 아낀다.
  const legacyCaseText = (!casesTextFixed && cases.length)
    ? cases.map((c, i) => '[사례 ' + (i + 1) + '] ' + (c.title || '') + ' (' + (c.result || '-') + ')\n' + (c.body || '').slice(0, 800)).join('\n\n')
    : '';

  const system = buildAnalyzeSystem({ focusAreas, excludeAreas, catalogTextFixed, catalogTextDynamic });

  const user = [
    '# 고객 정보',
    '이름: ' + (customer.name || '-') + ' / 연령: ' + (customer.age || '-') + ' / 지역: ' + (customer.region || '-'),
    '상품 관심: ' + ((customer.products || []).join(', ') || '-'),
    '상담 상황: ' + ((customer.situations || []).join(', ') || '-'),
    '',
    '# 보장 텍스트 (현재 가입 내용)',
    coverageText,
    ...(legacyCaseText ? ['', '# 참고할 과거 상담사례', legacyCaseText] : []),
    ...(((payload.confirmations || '').trim()) ? ['', '# 사용자가 확인해준 확정 정보 (반드시 이 값으로 사용하고 이 항목은 questions에 다시 넣지 마세요)', (payload.confirmations || '').trim()] : [])
  ].join('\n');
  // 참조풀관리(관리자 화면)에 올라가는 자료(상담사례·설득 에피소드·상품 카달로그)는 전부 항상
  // "전역 고정"이라 고객이 바뀌어도 항상 같은 내용 그대로 맨 앞 캐시 블록으로 나가 비용을 아낀다.
  // 그중 실제로 이 고객 분석에 쓸 것은 담당자가 참조 풀 화면에서 체크(선택)한 것 — 그 표시는
  // 제목만 담은 짧은 지시문(Dynamic, 고객마다 다름·캐시 대상 아님)으로 뒤에 얹는다.
  const refBlocksFixed = [];
  if (casesTextFixed) refBlocksFixed.push(cachedBlock('참고할 과거 상담사례 (공통)', casesTextFixed));
  if (episodesTextFixed) refBlocksFixed.push(cachedBlock('설득 에피소드 (참고 · 공통)', episodesTextFixed));
  if (catalogTextFixed) refBlocksFixed.push(cachedBlock('상품 카달로그 (참고 자료 · 공통)', catalogTextFixed));
  const refBlocksDynamic = [];
  if (casesTextDynamic) refBlocksDynamic.push({ type: 'text', text: '# 참고할 과거 상담사례 (이 고객 맞춤 — 위 공통 목록 중 이 고객 분석에 쓸 것)\n' + casesTextDynamic });
  if (episodesTextDynamic) refBlocksDynamic.push({ type: 'text', text: '# 설득 에피소드 (참고 · 이 고객 맞춤)\n' + episodesTextDynamic });
  if (catalogTextDynamic) refBlocksDynamic.push({ type: 'text', text: '# 상품 카달로그 (참고 자료 · 이 고객 맞춤)\n' + catalogTextDynamic });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model, max_tokens: 8000, system: sysCached(system), messages: [{ role: 'user', content: [...refBlocksFixed, ...refBlocksDynamic, { type: 'text', text: user }] }] })
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : ('API 오류 (' + r.status + ')');
      return json({ error: msg }, r.status);
    }
    let text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    text = text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    let parsed = parseModelJson(text);
    if (!parsed) {
      // 최종 실패: 원문을 _raw로만 보관(프런트에서 2차 복구 시도). detail에 원문 덤프하지 않음.
      parsed = { summary: '분석 결과를 형식대로 읽지 못했습니다. "원문 보기"로 확인하거나 다시 분석해 주세요.', areas: [], priorities: [], detail: [], _raw: text };
    }
    if (!Array.isArray(parsed.areas)) parsed.areas = [];
    if (!Array.isArray(parsed.priorities)) parsed.priorities = [];
    if (!Array.isArray(parsed.questions)) parsed.questions = [];
    parsed._usage = {
      input_tokens: (data.usage && data.usage.input_tokens) || 0,
      output_tokens: (data.usage && data.usage.output_tokens) || 0,
      model: data.model || model
    };
    return json(parsed);
  } catch (err) {
    return json({ error: '분석 요청 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
  }
}
