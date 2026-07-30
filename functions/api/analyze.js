// 보장 분석 중계 함수 (Cloudflare Pages Functions)
// API 키는 Cloudflare 환경변수(ANTHROPIC_API_KEY)에서만 읽으며 코드에 넣지 않습니다.

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

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const key = context.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: '서버에 API 키가 없습니다. Cloudflare 환경변수 ANTHROPIC_API_KEY를 설정하세요.' }, 500);

  const model = context.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  let payload;
  try { payload = await context.request.json(); }
  catch (e) { return json({ error: '요청 형식이 잘못되었습니다.' }, 400); }

  const customer = payload.customer || {};
  const coverageText = (payload.coverageText || '').trim();
  const cases = payload.cases || [];

  // 정리(tidy) 모드: OCR 원문을 보장급부·내보장자산으로 구분해 깔끔하게 정돈
  if (payload.mode === 'tidy') {
    const raw = (payload.rawText || '').trim();
    if (!raw) return json({ error: '정리할 텍스트가 없습니다.' }, 400);
    const tidySystem = [
      '당신은 한국 보험 자료 정리 도우미입니다. OCR로 추출된 거친 텍스트를 깔끔하게 정돈합니다.',
      '규칙:',
      "- 텍스트에 [보장급부], [내보장자산] 같은 구분 표시가 있으면 그 구분을 유지하고, 각 항목을 '항목명 금액' 형태의 짧은 줄로 정리하세요.",
      '- 구분 표시가 없으면 내용으로 판단해 [보장급부]와 [내보장자산]으로 나누되, 애매하면 [기타]로 두세요.',
      '- OCR 오류로 보이는 깨진 글자·잡음은 제거하되, 숫자와 금액은 원문 그대로 두고 임의로 바꾸지 마세요.',
      '- 원문에 없는 항목이나 금액을 새로 지어내지 마세요.',
      '- 출력은 정리된 텍스트만. 설명이나 인사말 없이 결과 텍스트만 출력하세요.'
    ].join('\n');
    try {
      const rr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model, max_tokens: 1500, system: tidySystem, messages: [{ role: 'user', content: raw }] })
      });
      const dd = await rr.json();
      if (!rr.ok) {
        const msg = (dd && dd.error && dd.error.message) ? dd.error.message : ('API 오류 (' + rr.status + ')');
        return json({ error: msg }, rr.status);
      }
      const tidied = (dd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return json({
        text: tidied,
        _usage: { input_tokens: (dd.usage && dd.usage.input_tokens) || 0, output_tokens: (dd.usage && dd.usage.output_tokens) || 0, model: dd.model || model }
      });
    } catch (err) {
      return json({ error: '정리 요청 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  if (!coverageText) return json({ error: '보장 텍스트가 비어 있습니다. OCR 또는 직접 입력으로 채운 뒤 분석하세요.' }, 400);

  const caseText = cases.length
    ? cases.map((c, i) => '[사례 ' + (i + 1) + '] ' + (c.title || '') + ' (' + (c.result || '-') + ')\n' + (c.body || '').slice(0, 800)).join('\n\n')
    : '(없음)';

  const system = [
    '당신은 대한민국 보험 보장분석 전문가입니다. 재무설계사(FP)가 고객 상담을 준비하도록 돕습니다.',
    "주어진 '보장 텍스트'는 고객이 현재 가입한 보장 내용이며 OCR로 추출되어 숫자 오류가 있을 수 있습니다. 텍스트에 적힌 내용만 근거로 분석하세요.",
    '반드시 아래 JSON 형식 하나만 출력하세요. 마크다운, 코드블록, 설명 문장 없이 순수 JSON만 출력합니다.',
    '{',
    '  "summary": "종합 요약 2~3문장",',
    '  "areas": [{"name":"영역명","level":"충분|보통|취약","reason":"한 줄 근거"}],',
    '  "priorities": ["보강 제안 1","보강 제안 2","보강 제안 3"],',
    '  "detail": "상세 분석. 문단으로 구분하고 최대한 구체적으로."',
    '}',
    '규칙:',
    '- 영역은 사망보장, 암·3대진단(암/뇌혈관/허혈성심장), 입원·수술, 실손의료, 간병·치매, 상해·재해 중 텍스트에서 확인되는 것을 다룹니다.',
    "- 텍스트에 관련 담보가 전혀 없으면 그 영역을 '취약'으로 판정하고 reason에 '해당 담보 없음'을 명시합니다.",
    '- 보험료, 해약환급금 등 텍스트에 없는 구체적인 숫자는 지어내지 마세요.',
    '- 참고 사례는 제안 방향을 잡는 참고용입니다. 사례의 결과(성공/보류/실패)를 고려하세요.'
  ].join('\n');

  const user = [
    '# 고객 정보',
    '이름: ' + (customer.name || '-') + ' / 연령: ' + (customer.age || '-') + ' / 지역: ' + (customer.region || '-'),
    '상품 관심: ' + ((customer.products || []).join(', ') || '-'),
    '상담 상황: ' + ((customer.situations || []).join(', ') || '-'),
    '',
    '# 보장 텍스트 (현재 가입 내용)',
    coverageText,
    '',
    '# 참고할 과거 상담사례',
    caseText
  ].join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model, max_tokens: 4000, system: system, messages: [{ role: 'user', content: user }] })
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : ('API 오류 (' + r.status + ')');
      return json({ error: msg }, r.status);
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { summary: text, areas: [], priorities: [], detail: text };
    }
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
