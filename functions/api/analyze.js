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
  const planText = (payload.planText || '').trim();

  // 정리(tidy) 모드: OCR 원문을 보장급부·내보장자산으로 구분해 깔끔하게 정돈
  if (payload.mode === 'tidy') {
    const raw = (payload.rawText || '').trim();
    const images = Array.isArray(payload.images) ? payload.images : [];
    if (!raw && images.length === 0) return json({ error: '정리할 자료(이미지 또는 텍스트)가 없습니다.' }, 400);
    const custName = (payload.custName || '').trim();
    const custAge = (payload.custAge || '').trim();
    const tidyModel = context.env.TIDY_MODEL || 'claude-haiku-4-5-20251001';
    const tidySystem = [
      '당신은 한국 보험 보장분석 전문가입니다. 재무설계사(FP)가 상담을 준비하도록, 첨부된 보장 자료 사진을 직접 읽어 상세히 정리하고 분석합니다.',
      '사진은 vFlat 등으로 찍은 보험 증권·보장분석표이며, 개인정보(주민번호 등)는 별표로 가려져 있을 수 있습니다.',
      '아래 형식과 규칙을 반드시 지키세요.',
      '',
      '## [보장급부]',
      '- 이 고객이 현재 가입한 보장 내역을 정리합니다.',
      (custName || custAge)
        ? ('- 먼저 고객 정보를 한 줄로 밝히세요: 이름 ' + (custName || '(자료 참조)') + ', 나이 ' + (custAge || '(자료 참조)') + '.')
        : '- 자료에 고객 이름·나이가 보이면 먼저 한 줄로 밝히세요.',
      '- 그다음 보장 항목을 하나도 빠짐없이 상세히 나열하세요: 담보명, 가입금액, 납입기간, 만기, 갱신여부 등 사진에서 읽히는 정보를 항목별로.',
      '- 영역(사망/암·3대진단/입원·수술/실손/간병 등)별로 묶어 보기 좋게 정리하세요.',
      '',
      '## [내보장자산]',
      '- 고객이 여러 보험회사에 가입한 보장 자산을 분석합니다.',
      '- 회사(보험사)별로 구분해서, 각 회사가 어떤 담보를 얼마나 보장하는지 자세히 정리하세요.',
      '- 회사별 정리 후, 전체를 종합해 어느 영역이 중복되고 어느 영역이 비어 있는지(취약한지) 분석해 설명하세요.',
      '',
      '## 규칙',
      '- 숫자·금액은 사진에 보이는 그대로 쓰고, 없는 금액·항목을 지어내지 마세요. 흐릿해 확실치 않으면 그렇게 표시하세요.',
      '- 각 사진에 [보장급부] 또는 [내보장자산] 표시가 함께 주어집니다. 그 구분에 맞게 배치하세요.',
      '- 표현은 상담사가 바로 읽고 활용할 수 있도록 구체적이고 친절하게. 항목은 줄바꿈으로 구분.',
      '- 출력은 정리·분석 결과 본문만. 인사말·사족 없이.'
    ].join('\n');
    const content = [];
    if (raw) content.push({ type: 'text', text: '참고 텍스트:\n' + raw });
    images.forEach(function (im, i) {
      content.push({ type: 'text', text: '[' + (im.kind || '보장급부') + '] 자료 사진 ' + (i + 1) + ':' });
      content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } });
    });
    content.push({ type: 'text', text: '위 자료를 형식과 규칙에 맞춰 정리·분석해 주세요.' });
    try {
      const rr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: tidyModel, max_tokens: 3500, system: tidySystem, messages: [{ role: 'user', content: content }] })
      });
      const dd = await rr.json();
      if (!rr.ok) {
        const msg = (dd && dd.error && dd.error.message) ? dd.error.message : ('API 오류 (' + rr.status + ')');
        return json({ error: msg }, rr.status);
      }
      const tidied = (dd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return json({
        text: tidied,
        _usage: { input_tokens: (dd.usage && dd.usage.input_tokens) || 0, output_tokens: (dd.usage && dd.usage.output_tokens) || 0, model: dd.model || tidyModel }
      });
    } catch (err) {
      return json({ error: '정리 요청 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  if (!coverageText) return json({ error: '보장 텍스트가 비어 있습니다. OCR 또는 직접 입력으로 채운 뒤 분석하세요.' }, 400);

  const caseText = cases.length
    ? cases.map((c, i) => '[사례 ' + (i + 1) + '] ' + (c.title || '') + ' (' + (c.result || '-') + ')\n' + (c.body || '').slice(0, 800)).join('\n\n')
    : '(없음)';

  const hasPlan = planText.length > 0;
  const system = [
    '당신은 대한민국 보험 보장분석 전문가입니다. 재무설계사(FP)가 고객 상담을 준비하도록 돕습니다.',
    "주어진 '보장 텍스트'는 고객이 현재 가입한 보장 내용이며 OCR로 추출되어 숫자 오류가 있을 수 있습니다. 텍스트에 적힌 내용만 근거로 분석하세요.",
    hasPlan ? "'가입설계서'는 이 고객에게 새로 제안하는 설계 내용입니다(OCR 추출). 현재 보장의 부족분을 이 설계서가 얼마나 채우는지 판단하세요." : '',
    '반드시 아래 JSON 형식 하나만 출력하세요. 마크다운, 코드블록, 설명 문장 없이 순수 JSON만 출력합니다.',
    '{',
    '  "summary": "종합 요약 2~3문장",',
    '  "areas": [{"name":"영역명","level":"충분|보통|취약","reason":"한 줄 근거"}],',
    '  "priorities": ["보강 제안 1","보강 제안 2","보강 제안 3"],',
    '  "detail": "상세 분석. 문단으로 구분하고 최대한 구체적으로."' + (hasPlan ? ',' : ''),
    ...(hasPlan ? [
    '  "gapFill": {',
    '    "shortfallRate": 40,',
    '    "filled": ["가입설계서가 채운 부족 보장 항목"],',
    '    "stillMissing": ["설계서로도 채워지지 않아 추가로 더 보장해야 할 항목"],',
    '    "comment": "가입설계서가 현재 부족 보장을 얼마나 채웠는지 종합 설명 2~3문장"',
    '  }'
    ] : []),
    '}',
    '규칙:',
    '- 영역은 사망보장, 암·3대진단(암/뇌혈관/허혈성심장), 입원·수술, 실손의료, 간병·치매, 상해·재해 중 텍스트에서 확인되는 것을 다룹니다.',
    "- 텍스트에 관련 담보가 전혀 없으면 그 영역을 '취약'으로 판정하고 reason에 '해당 담보 없음'을 명시합니다.",
    '- 보험료, 해약환급금 등 텍스트에 없는 구체적인 숫자는 지어내지 마세요.',
    '- 참고 사례는 제안 방향을 잡는 참고용입니다. 사례의 결과(성공/보류/실패)를 고려하세요.',
    hasPlan ? '- gapFill.shortfallRate는 0~100 사이 정수입니다. 현재 이 고객에게 필요한 전체 보장을 기준으로, 가입설계서를 반영한 뒤에도 여전히 비어 있는 보장의 비율(잔여 부족율)을 뜻합니다. 0이면 완전 충족, 값이 클수록 부족합니다.' : '',
    hasPlan ? '- filled에는 설계서가 새로 채운 보장을, stillMissing에는 설계서를 반영해도 여전히 부족해 더 보완해야 할 보장을 구체적으로 적으세요. 근거 없는 항목은 넣지 마세요.' : ''
  ].filter(Boolean).join('\n');

  const user = [
    '# 고객 정보',
    '이름: ' + (customer.name || '-') + ' / 연령: ' + (customer.age || '-') + ' / 지역: ' + (customer.region || '-'),
    '상품 관심: ' + ((customer.products || []).join(', ') || '-'),
    '상담 상황: ' + ((customer.situations || []).join(', ') || '-'),
    '',
    '# 보장 텍스트 (현재 가입 내용)',
    coverageText,
    '',
    ...(hasPlan ? ['# 가입설계서 (새로 제안하는 설계 · OCR 추출)', planText, ''] : []),
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
