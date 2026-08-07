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
  const catalogText = (payload.catalogText || '').trim();
  const focusAreas = Array.isArray(payload.focusAreas) ? payload.focusAreas : [];
  const excludeAreas = Array.isArray(payload.excludeAreas) ? payload.excludeAreas : [];

  // 정리(tidy) 모드: OCR 원문을 보장급부·내보장자산으로 구분해 깔끔하게 정돈
  if (payload.mode === 'tidy') {
    const raw = (payload.rawText || '').trim();
    const images = Array.isArray(payload.images) ? payload.images : [];
    if (!raw && images.length === 0) return json({ error: '정리할 자료(이미지 또는 텍스트)가 없습니다.' }, 400);
    const custName = (payload.custName || '').trim();
    const custAge = (payload.custAge || '').trim();
    const tidyModel = context.env.TIDY_MODEL || 'claude-haiku-4-5-20251001';
    const tidySystem = [
      '당신은 한국 보험 보장분석 전문가입니다. 재무설계사(FP) 상담 준비를 돕도록, 주어진 OCR 텍스트를 정리·분석합니다.',
      '입력 텍스트는 자료 종류별로 [보장급부] / [내보장자산] / [기타] 꼬리표로 구분되어 있습니다. OCR이라 숫자 오류가 있을 수 있습니다.',
      '아래 형식과 규칙을 반드시 지키세요. 출력은 본문만(인사말·사족 없이).',
      '',
      '## [보장급부]',
      '- 반드시 [보장급부] 꼬리표가 붙은 텍스트만 근거로 작성합니다. 다른 꼬리표(내보장자산 등)의 내용을 절대 여기에 넣지 마세요.',
      '- [보장급부] 텍스트가 없으면 이 섹션에는 "등록된 보장급부 자료 없음"만 적습니다.',
      (custName || custAge)
        ? ('- 자료가 있으면 먼저 고객 정보를 한 줄로: 이름 ' + (custName || '(자료 참조)') + ', 나이 ' + (custAge || '(자료 참조)') + '.')
        : '- 자료에 이름·나이가 보이면 먼저 한 줄로 밝히세요.',
      '- 담보명·가입금액·납입기간·만기·갱신여부 등 읽히는 정보를 항목별로 빠짐없이, 영역(사망/암·3대진단/입원·수술/실손/간병 등)별로 묶어 정리하세요.',
      '',
      '## [내보장자산]',
      '- 반드시 [내보장자산] 꼬리표가 붙은 텍스트만 근거로 작성합니다. [보장급부] 내용을 여기에 복사하지 마세요.',
      '- [내보장자산] 텍스트가 없으면 이 섹션에는 "등록된 내보장자산 자료 없음"만 적습니다.',
      '- 이 고객이 여러 보험사에 가입한 전체 보장을, 보험사별로 구분해 어떤 담보를 얼마나 보장하는지 자세히 정리하세요.',
      '',
      '## [종합분석]',
      '- 위 [내보장자산](고객의 전체 보험)을 근거로 요점만 개조식으로 정리합니다. 각 줄을 하이픈(-)로 시작하세요.',
      '- 다음을 반드시 포함: 영역별 충분/취약 판정, 중복 가입된 영역, 비어 있는(부족한) 영역, 핵심 담보(가입금액 3000만원↑)의 갱신형 여부와 위험, 우선 보완 순위.',
      '',
      '## 규칙',
      '- 숫자·금액은 텍스트에 보이는 그대로. 없는 값·항목을 지어내지 말고, 흐릿해 불확실하면 그렇게 표시하세요.',
      '- 세 섹션([보장급부] / [내보장자산] / [종합분석])을 반드시 이 순서와 소제목 그대로 출력하세요.',
      '- 각 섹션은 해당 꼬리표의 텍스트만 사용하며, 절대 서로 섞지 마세요. 특히 전체 보험 내용을 [보장급부]에 중복해 넣지 마세요.'
    ].join('\n');
    const content = [];
    if (raw) content.push({ type: 'text', text: '정리할 자료 (종류별 꼬리표로 구분됨):\n' + raw });
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

  // 가입설계 분석 모드: 보장 분석 결과 + 가입설계서(OCR)로 부족 보장·추가 제안(연금 등) 2000자 분석
  if (payload.mode === 'plan') {
    const cov = (payload.coverageText || '').trim();
    const cov_an = payload.coverageAnalysis || {};
    const episodesText = (payload.episodesText || '').trim();
    if (!planText) return json({ error: '가입설계서 텍스트가 비어 있습니다. 설계서 이미지를 등록하고 OCR한 뒤 실행하세요.' }, 400);
    const psys = [
      '당신은 대한민국 보험 가입설계 분석 전문가입니다. 재무설계사(FP)를 돕습니다.',
      "'보장 텍스트'는 고객의 현재 가입 내용, '보장 분석'은 이미 수행한 분석 결과, '가입설계서'는 이 고객에게 새로 제안하는 설계입니다(모두 OCR이라 숫자 오류 가능). 적힌 내용만 근거로 판단하세요.",
      '반드시 아래 JSON 하나만 출력하세요. 마크다운·설명 없이 순수 JSON만.',
      '{',
      '  "shortfallRate": 40,',
      '  "recommend": ["부족 보장 보완 또는 추가 제안(예: 연금 가입 등)"],',
      '  "difference": ["보장분석만 했을 때 항목", "가입설계 반영 후 항목"],',
      '  "afterPlanGaps": ["가입설계 이후 보완 항목1", "항목2"],',
      '  "planDetail": ["[현재 보장 부족점]", "항목", "[설계서가 채운 부분]", "항목", "[여전히 부족한 부분]", "항목", "[연금 등 추가 제안]", "항목"]',
      '}',
      '규칙:',
      '- shortfallRate는 0~100 정수. 현재 필요한 전체 보장 대비, 가입설계서를 반영한 뒤에도 여전히 비어 있는 보장의 비율(잔여 부족율). 0이면 완전 충족, 값이 클수록 부족.',
      '- recommend, difference, afterPlanGaps, planDetail은 모두 문자열 배열입니다. 각 원소는 한 항목(한 줄)이며 하이픈·번호 접두어 없이 내용만 담고, 원소 문자열 안에 줄바꿈(엔터)을 절대 넣지 마세요. 큰따옴표가 필요하면 반드시 이스케이프하세요.',
      '- recommend에는 설계서가 못 채운 부족 보장과, 노후·연금 등 이 고객에게 추가로 필요한 준비를 구체적으로 적습니다. 근거 없는 항목은 넣지 마세요.',
      '- planDetail은 소제목을 대괄호 원소 "[현재 보장 부족점]", "[설계서가 채운 부분]", "[여전히 부족한 부분]", "[연금 등 추가 제안]"로 넣어 네 부분으로 구분하고, 각 소제목 뒤에 해당 항목들을 이어서 나열합니다.',
      '- difference는 보장분석만 했을 때와 가입설계 반영 후의 핵심 차이(어떤 보장이 얼마나 채워졌는지, 부족율/위험 변화)를 항목으로, afterPlanGaps는 설계 반영 이후에도 더 보완할 보장(노후·연금·간병 등)을 항목으로 나열합니다. 서로 중복을 피합니다.',
      (episodesText ? '- 제공된 "설득 에피소드"는 recommend와 제안 표현의 톤·근거를 잡는 참고용입니다. 억지로 끼워넣지 말고 자연스럽게 활용하세요.' : ''),
      (catalogText ? '- 제공된 "상품 카달로그"는 제안 상품의 담보·조건을 정확히 이해하는 참고용입니다. 카달로그에 없는 내용을 지어내지 마세요.' : ''),
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
      '# 가입설계서 (새로 제안 · OCR 추출)',
      planText,
      '',
      ...(episodesText ? ['# 설득 에피소드 (참고)', episodesText, ''] : []),
      ...(catalogText ? ['# 상품 카달로그 (참고 · 상품 정보)', catalogText] : [])
    ].join('\n');
    try {
      const pr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model, max_tokens: 3500, system: psys, messages: [{ role: 'user', content: puser }] })
      });
      const pd = await pr.json();
      if (!pr.ok) { const msg = (pd && pd.error && pd.error.message) ? pd.error.message : ('API 오류 (' + pr.status + ')'); return json({ error: msg }, pr.status); }
      let ptext = (pd.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      ptext = ptext.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
      let pparsed;
      try { pparsed = JSON.parse(ptext); }
      catch (e) {
        try { const m = ptext.match(/\{[\s\S]*\}/); pparsed = m ? JSON.parse(m[0]) : null; }
        catch (e2) { pparsed = null; }
        if (!pparsed) pparsed = { shortfallRate: 0, recommend: [], planDetail: ptext };
      }
      pparsed._usage = { input_tokens: (pd.usage && pd.usage.input_tokens) || 0, output_tokens: (pd.usage && pd.usage.output_tokens) || 0, model: pd.model || model };
      return json(pparsed);
    } catch (err) {
      return json({ error: '가입설계 분석 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }

  if (!coverageText) return json({ error: '보장 텍스트가 비어 있습니다. OCR 또는 직접 입력으로 채운 뒤 분석하세요.' }, 400);

  const caseText = cases.length
    ? cases.map((c, i) => '[사례 ' + (i + 1) + '] ' + (c.title || '') + ' (' + (c.result || '-') + ')\n' + (c.body || '').slice(0, 800)).join('\n\n')
    : '(없음)';

  const system = [
    '당신은 대한민국 보험 보장분석 전문가입니다. 재무설계사(FP)가 고객 상담을 준비하도록 돕습니다.',
    "주어진 '보장 텍스트'는 고객이 현재 가입한 보장 내용(보장급부·내보장자산·기타 자료)이며 OCR로 추출되어 숫자 오류가 있을 수 있습니다. 텍스트에 적힌 내용만 근거로 분석하세요.",
    '반드시 아래 JSON 형식 하나만 출력하세요. 마크다운, 코드블록, 설명 문장 없이 순수 JSON만 출력합니다.',
    '{',
    '  "summary": "종합 요약 2~3문장",',
    '  "areas": [{"name":"영역명","level":"충분|보통|취약","reason":"한 줄 근거"}],',
    '  "priorities": ["보강 제안 1","보강 제안 2","보강 제안 3"],',
    '  "detail": ["[영역별 상세]", "영역별 판정·근거 항목", "[핵심 담보(3000만원↑) 갱신형 여부]", "핵심 담보 갱신형 항목", "[종합 소견]", "종합 요점 항목"]',
    '}',
    '규칙:',
    '- 영역은 사망보장, 암·3대진단(암/뇌혈관/허혈성심장), 입원·수술, 실손의료, 간병·치매, 상해·재해 중 텍스트에서 확인되는 것을 다룹니다.',
    "- 텍스트에 관련 담보가 전혀 없으면 그 영역을 '취약'으로 판정하고 reason에 '해당 담보 없음'을 명시합니다.",
    '- 보험료, 해약환급금 등 텍스트에 없는 구체적인 숫자는 지어내지 마세요.',
    '- detail은 문자열 배열입니다. 각 원소는 한 항목(한 줄)이며 하이픈·번호 접두어 없이 내용만 담고, 원소 문자열 안에 줄바꿈을 넣지 마세요. 소제목은 대괄호 원소 "[영역별 상세]", "[핵심 담보(3000만원↑) 갱신형 여부]", "[종합 소견]"로 넣어 세 부분을 구분하고, 각 소제목 뒤에 항목들을 이어서 나열합니다. 큰따옴표가 필요하면 반드시 이스케이프하세요.',
    '- 보장금액이 큰 핵심 담보(가입금액 3000만원 이상)는 각각 갱신형인지 비갱신형인지 반드시 판별해, detail 안에 "[핵심 담보(3000만원↑) 갱신형 여부]" 소제목으로 개조식 정리합니다. 갱신형은 향후 보험료 인상·만기 위험이 있어 상담에서 매우 중요하므로 빠짐없이 표시하고, 텍스트에서 갱신 여부가 불명확하면 "확인 필요"로 표기합니다.',
    '- 참고 사례는 제안 방향을 잡는 참고용입니다. 사례의 결과(성공/보류/실패)를 고려하세요.',
    (focusAreas.length ? '- 다음 담보/영역을 특히 집중 분석하고 우선순위를 높입니다: ' + focusAreas.join(', ') : ''),
    (excludeAreas.length ? '- 다음 담보/영역은 이번 분석에서 제외합니다(요약·영역·상세에서 다루지 마세요): ' + excludeAreas.join(', ') : ''),
    (catalogText ? '- 제공된 "상품 카달로그"는 상품 담보·조건을 정확히 이해하는 참고용입니다. 없는 내용을 지어내지 마세요.' : '')
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
    '# 참고할 과거 상담사례',
    caseText,
    '',
    ...(catalogText ? ['# 상품 카달로그 (참고 자료 · 상품 정보 정확히 이해용)', catalogText] : [])
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
    let text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    text = text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) {
      try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
      catch (e2) { parsed = null; }
      if (!parsed) parsed = { summary: '분석 결과를 형식대로 읽지 못해 원문을 그대로 표시합니다.', areas: [], priorities: [], detail: text };
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
