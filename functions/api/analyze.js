// 보장 분석 중계 함수 (Cloudflare Pages Functions)
// API 키는 Cloudflare 환경변수(ANTHROPIC_API_KEY)에서만 읽으며 코드에 넣지 않습니다.
//
// 2026-08-14 다중 담당자 확장: 사이트 비밀번호(pw) 확인 뒤 담당자 개인 비밀번호(advisorId/advisorPw)도
// 확인한다. AI 비용을 담당자별로 나눠 추적하고 싶으면, Cloudflare 환경변수에
// "ANTHROPIC_KEY_" + 담당자id 형식으로 그 담당자 전용 키(Anthropic Workspace API 키)를 추가하면
// 되고, 없으면 지금처럼 공통 ANTHROPIC_API_KEY를 그대로 쓴다(둘 다 안 만들어도 기존과 동일하게 작동).

import { checkSitePassword, checkAdvisor } from '../_lib/advisors.js';

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

  // 2단계: 담당자 개인 비밀번호 확인 — 누구의 AI 사용인지 구분(비용 추적용 키 선택에도 씀).
  const advisorCheck = await checkAdvisor(context.env, payload, json);
  if (!advisorCheck.ok) return advisorCheck.res;
  const advisorId = advisorCheck.advisor.id;

  // 담당자 전용 키(ANTHROPIC_KEY_<advisorId>)가 Cloudflare 환경변수에 있으면 그걸 쓰고,
  // 없으면 기존처럼 공통 ANTHROPIC_API_KEY를 쓴다. 담당자별 키를 안 만들어도 그대로 작동한다.
  const key = context.env['ANTHROPIC_KEY_' + advisorId] || context.env.ANTHROPIC_API_KEY;
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
    const tidySystem = [
      '당신은 한국 보험 보장분석 전문가입니다. 재무설계사(FP) 상담 준비를 돕도록, 첨부된 보험 보장 자료 "사진을 직접 읽어" 정리·분석합니다.',
      '사진은 종류별로 [보장급부] / [내보장자산] / [기타]로 구분됩니다(각 사진 앞에 종류 표시).',
      '',
      '## 출력 분량 규칙 (매우 중요 · 반드시 지킬 것)',
      '- 전체를 간결하게, 핵심만 개조식(하이픈)으로. 서술형 문장·인사말·사족·같은 말 반복 금지.',
      '- 담보는 "영역: 담보명 가입금액 (납입/만기/갱신여부)" 형태로 한 줄씩 압축. 불필요한 수식어 빼기.',
      '- 목표: 전체 출력이 3500자 이내가 되도록 압축. 길어지면 덜 중요한 세부는 생략하고 핵심 담보 위주로.',
      '',
      '## [보장급부]',
      '- [보장급부] 사진만 근거. 없으면 "등록된 보장급부 자료 없음"만.',
      (custName || custAge)
        ? ('- 맨 앞 한 줄: 이름 ' + (custName || '(자료 참조)') + ', 나이 ' + (custAge || '(자료 참조)') + '.')
        : '- 이름·나이가 보이면 맨 앞 한 줄로.',
      '- 담보명·가입금액·납입기간·만기·갱신여부를 영역(사망/암·3대진단/입원·수술/실손/간병 등)별로 묶어 한 줄씩.',
      '',
      '## [내보장자산]',
      '- [내보장자산] 사진만 근거. 없으면 "등록된 내보장자산 자료 없음"만.',
      '- 보험사별로 어떤 담보를 얼마나 보장하는지 한 줄씩 압축.',
      '',
      '## [종합분석]',
      '- [내보장자산] 기준으로 개조식 5~8줄: 영역별 충분/취약, 중복 영역, 부족(빈) 영역, 3000만원↑ 핵심담보의 갱신형 위험, 우선 보완순위.',
      '',
      '## 정확성 규칙',
      '- 사진에 실제로 보이는 회사명·담보명·숫자만 사용. 흐릿/안보이면 지어내지 말고 "확인 필요".',
      '- 회사명·보유계약 건수 추측 금지. 안 보이면 "확인 필요".',
      '- 세 섹션([보장급부]/[내보장자산]/[종합분석]) 이 순서·소제목 그대로, 서로 섞지 말 것.',
      '',
      '## 확인 필요 항목',
      '- 본문 맨 끝에 "===확인필요===" 한 줄 후, 불확실한 값을 하이픈 질문으로 3개 이내만 나열(예: "- 타보험사 회사명은?"). 없으면 "- 없음".',
      '- 사용자가 확인해준 정보가 있으면 그 값을 확정 사용하고 다시 묻지 말 것.'
    ].join('\n');
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
    const apSys = [
      '당신은 한국 생명보험 재무설계사(FP)의 대면 상담 코치입니다.',
      '설계사가 고객을 직접 만나 이야기할 때 "그대로 말하면 되는" 자연스러운 한국어 멘트를 만들어 주세요.',
      '지금 단계: ' + stage + '.',
      '고객: 이름 ' + (cust.name || '(미상)') + ', 나이 ' + (cust.age || '(미상)') + ', 지역 ' + (cust.region || '(미상)') + '.',
      '',
      '## 작성 규칙',
      '- 설계사가 읽고 그대로 말할 수 있는 실제 대화체 멘트 위주로. 존댓말, 따뜻하고 자신감 있는 어조.',
      '- 팔려고 밀어붙이지 말고, 공감과 사실 중심으로. 고객이 스스로 필요를 느끼게.',
      '- 아래 [참고 자료]의 내용을 근거로 하되, 없는 사실을 지어내지 마세요.',
      '- 분량은 간결하게(600자 이내). 인사말·사족·메타설명 없이 멘트 본문만.',
      '- 필요하면 "이렇게 열어보세요 / 이렇게 이어가세요" 같은 짧은 안내 한 줄은 가능하나 최소화.',
      '- 설계사에게 용기를 주되, 멘트 자체는 고객에게 하는 말로 작성.'
    ].join('\n');
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
    const ssys = '당신은 보험 상담 자료를 정리하는 조수입니다. 주어진 자료의 핵심을 한국어로 약 2000자 이내로 개조식(요점 나열)으로 정리하세요. 관련 소제목을 대괄호 "[소제목]" 형태로 나누고, 각 항목은 하이픈(-)으로 시작하는 줄로 작성합니다. 상품명·핵심 담보·가입금액·조건·수치 등 중요한 정보를 빠짐없이 담고, 인사말·사족 없이 정리 본문만 출력합니다.';
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

  // 가입설계 분석 모드: 보장 분석 결과 + 가입설계서(사진 직접 판독)로 부족 보장·추가 제안 분석
  if (payload.mode === 'plan') {
    const cov = (payload.coverageText || '').trim();
    const cov_an = payload.coverageAnalysis || {};
    const planImages = Array.isArray(payload.planImages) ? payload.planImages : [];
    const pConfirm = (payload.confirmations || '').trim();
    if (!planText && planImages.length === 0) return json({ error: '가입설계서 자료가 없습니다. 설계서 사진을 등록한 뒤 실행하세요.' }, 400);
    const pModel = context.env.VISION_MODEL || model;
    const psys = [
      '당신은 대한민국 보험 가입설계 분석 전문가입니다. 재무설계사(FP)를 돕습니다.',
      "'보장 텍스트'는 고객의 현재 가입 내용, '보장 분석'은 이미 수행한 분석 결과, '가입설계서'는 이 고객에게 새로 제안하는 설계입니다. 가입설계서는 첨부된 사진을 직접 읽으세요.",
      '반드시 아래 JSON 하나만 출력하세요. 마크다운·설명 없이 순수 JSON만.',
      '{',
      '  "shortfallRate": 40,',
      '  "summary": "이 가입설계가 무엇을 채우고 무엇이 남는지 2~3문장 한눈 요약",',
      '  "planDetail": ["[현재 보장 부족점]", "항목", "[이 설계가 채운 부분]", "항목", "[남아있는 부족·추가 보완]", "항목", "[추가 제안(연금 등)]", "항목"],',
      '  "questions": ["사진만으로 확실하지 않아 사용자에게 확인할 짧은 질문"]',
      '}',
      '규칙:',
      '- shortfallRate는 0~100 정수. 현재 필요한 전체 보장 대비, 가입설계서를 반영한 뒤에도 여전히 비어 있는 보장의 비율(잔여 부족율).',
      '- summary는 부족율의 의미와, 이 설계로 채워진 부분·남은 부분을 2~3문장으로 압축한 한눈 요약입니다.',
      '- planDetail은 문자열 배열입니다. 각 원소는 한 항목이며 하이픈·번호 접두어 없이 내용만, 원소 문자열 안에 줄바꿈을 넣지 마세요. 큰따옴표는 이스케이프하세요.',
      '- planDetail은 소제목을 대괄호 원소 "[현재 보장 부족점]" → "[이 설계가 채운 부분]" → "[남아있는 부족·추가 보완]" → "[추가 제안(연금 등)]" 순서로 넣어 하나의 흐름으로 구성하고, 네 부분이 중복되지 않게 구분하세요.',
      '- [추가 제안(연금 등)]에는 설계서가 못 채운 부족 보장과 노후·연금 등 추가로 필요한 준비를 구체적으로 적습니다. 근거 없는 항목은 넣지 마세요.',
      '- 사진에서 확실하지 않은 값(가입금액·담보명·회사 등)은 절대 추측하지 말고, questions 배열에 사용자에게 물어볼 짧고 구체적인 질문으로 담으세요. 확실하지 않은 게 없으면 questions는 빈 배열 [].',
      '- 사용자가 확인해준 정보가 제공되면 그 값을 확정으로 사용하고 다시 묻지 마세요.',
      ((episodesTextFixed || episodesTextDynamic) ? '- 제공된 "설득 에피소드"는 제안 표현의 톤·근거를 잡는 참고용입니다. 자연스럽게 활용하세요.' : ''),
      ((catalogTextFixed || catalogTextDynamic) ? '- 제공된 "상품 카달로그"는 제안 상품의 담보·조건을 정확히 이해하는 참고용입니다. 없는 내용을 지어내지 마세요.' : ''),
      (focusAreas.length ? '- 다음 담보/영역을 특히 집중해 제안·분석합니다: ' + focusAreas.join(', ') : ''),
      (excludeAreas.length ? '- 다음 담보/영역은 제외합니다(제안·분석에서 다루지 마세요): ' + excludeAreas.join(', ') : '')
    ].filter(Boolean).join('\n');
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

  const system = [
    '당신은 대한민국 보험 보장분석 전문가입니다. 재무설계사(FP)가 고객 상담을 준비하도록 돕습니다.',
    "주어진 '보장 텍스트'는 고객이 현재 가입한 보장 내용(보장급부·내보장자산·기타 자료)이며 OCR로 추출되어 숫자 오류가 있을 수 있습니다. 텍스트에 적힌 내용만 근거로 분석하세요.",
    '반드시 아래 JSON 형식 하나만 출력하세요. 마크다운, 코드블록, 설명 문장 없이 순수 JSON만 출력합니다.',
    '{',
    '  "summary": "종합 요약 2~3문장",',
    '  "areas": [{"name":"영역명","level":"충분|보통|취약","reason":"한 줄 근거","certainty":"확정|추정|자료부족"}],',
    '  "priorities": ["보강 제안 1","보강 제안 2","보강 제안 3"],',
    '  "detail": ["[영역별 상세]", "영역별 판정·근거 항목", "[핵심 담보(3000만원↑) 갱신형 여부]", "핵심 담보 갱신형 항목", "[종합 소견]", "종합 요점 항목"],',
    '  "questions": ["보장 텍스트만으로 확실하지 않아 사용자에게 확인할 짧고 구체적인 질문"]',
    '}',
    '규칙:',
    '- 영역은 사망보장, 암·3대진단(암/뇌혈관/허혈성심장), 입원·수술, 실손의료, 간병·치매, 상해·재해 중 텍스트에서 확인되는 것을 다룹니다.',
    "- 텍스트에 관련 담보가 전혀 없으면 그 영역을 '취약'으로 판정하고 reason에 '해당 담보 없음'을 명시합니다.",
    '- certainty는 그 영역 판정의 근거가 얼마나 확실한지 표시합니다. 텍스트에 해당 영역의 담보명·가입금액 등 구체적인 근거가 명확히 있으면 "확정", 일부 정보만 있어 일반적인 패턴으로 유추했으면 "추정", 관련 자료가 거의·전혀 없어 판정 근거 자체가 부족하면 "자료부족"으로 표기합니다. "취약"으로 판정하더라도 실제로 보장이 없어서인지("확정" 또는 "추정") 자료가 부족해 알 수 없어서인지("자료부족")는 서로 다르니 절대 혼동하지 말고 정확히 구분하세요.',
    '- 보험료, 해약환급금 등 텍스트에 없는 구체적인 숫자는 지어내지 마세요.',
    '- 가입금액·담보명·회사·갱신여부 등 텍스트(OCR)만으로 확실하지 않은 값은 절대 추측하지 말고, questions 배열에 사용자에게 물어볼 짧고 구체적인 질문으로 담으세요. 확실하지 않은 게 없으면 questions는 빈 배열 [].',
    '- detail은 문자열 배열입니다. 각 원소는 한 항목(한 줄)이며 하이픈·번호 접두어 없이 내용만 담고, 원소 문자열 안에 줄바꿈을 넣지 마세요. 소제목은 대괄호 원소 "[영역별 상세]", "[핵심 담보(3000만원↑) 갱신형 여부]", "[종합 소견]"로 넣어 세 부분을 구분하고, 각 소제목 뒤에 항목들을 이어서 나열합니다. 큰따옴표가 필요하면 반드시 이스케이프하세요.',
    '- 보장금액이 큰 핵심 담보(가입금액 3000만원 이상)는 각각 갱신형인지 비갱신형인지 반드시 판별해, detail 안에 "[핵심 담보(3000만원↑) 갱신형 여부]" 소제목으로 개조식 정리합니다. 갱신형은 향후 보험료 인상·만기 위험이 있어 상담에서 매우 중요하므로 빠짐없이 표시하고, 텍스트에서 갱신 여부가 불명확하면 "확인 필요"로 표기합니다.',
    '- 참고 사례는 제안 방향을 잡는 참고용입니다. 사례의 결과(성공/보류/실패)를 고려하세요.',
    (focusAreas.length ? '- 다음 담보/영역을 특히 집중 분석하고 우선순위를 높입니다: ' + focusAreas.join(', ') : ''),
    (excludeAreas.length ? '- 다음 담보/영역은 이번 분석에서 제외합니다(요약·영역·상세에서 다루지 마세요): ' + excludeAreas.join(', ') : ''),
    ((catalogTextFixed || catalogTextDynamic) ? '- 제공된 "상품 카달로그"는 상품 담보·조건을 정확히 이해하는 참고용입니다. 없는 내용을 지어내지 마세요.' : '')
  ].filter(Boolean).join('\n');

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
