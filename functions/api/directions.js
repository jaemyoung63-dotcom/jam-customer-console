// functions/api/directions.js
// 카카오모빌리티 자동차 길찾기(여러 경유지) — 출발/도착/경유지 좌표로 소요시간·거리·경로선 계산.
// 환경변수: KAKAO_REST_KEY (카카오 개발자 콘솔 앱의 "REST API 키").
//   ⚠️ REST 키는 비밀이므로 코드에 넣지 말고 Cloudflare Pages 환경변수에만 넣는다.
// 요청(JSON POST):
//   { origin:{x,y}, destination:{x,y}, waypoints:[{x,y}, ...] }   (waypoints 선택, 최대 30개)
// 응답:
//   { duration: 초, distance: 미터, path: [{x,y}, ...] }   (path = 지도에 그릴 도로 경로 좌표)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
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
  let payload = {};
  try { payload = await context.request.json(); } catch (e) { return json({ error: '요청 형식이 올바르지 않습니다.' }, 400); }

  const key = context.env.KAKAO_REST_KEY;
  if (!key) return json({ error: '서버에 카카오 REST 키가 설정되지 않았습니다. Cloudflare Pages → Settings → 환경변수에 KAKAO_REST_KEY를 추가하고 다시 배포해 주세요.' }, 400);

  const o = payload.origin || {};
  const d = payload.destination || {};
  if (o.x == null || o.y == null || d.x == null || d.y == null) return json({ error: '출발/도착 좌표가 없습니다.' }, 400);

  const waypoints = Array.isArray(payload.waypoints)
    ? payload.waypoints.filter(w => w && w.x != null && w.y != null).slice(0, 30).map(w => ({ x: w.x, y: w.y }))
    : [];

  const body = {
    origin: { x: o.x, y: o.y },
    destination: { x: d.x, y: d.y },
    priority: 'RECOMMEND'
  };
  if (waypoints.length) body.waypoints = waypoints;

  try {
    const r = await fetch('https://apis-navi.kakaomobility.com/v1/waypoints/directions', {
      method: 'POST',
      headers: { 'Authorization': 'KakaoAK ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && (data.msg || data.message)) ? (data.msg || data.message) : ('카카오 길찾기 오류 (' + r.status + ')');
      return json({ error: msg }, r.status);
    }
    const route = (data.routes && data.routes[0]) || null;
    if (!route) return json({ error: '경로 결과가 비어 있습니다.' }, 400);
    if (route.result_code !== 0) return json({ error: route.result_msg || '경로를 찾지 못했습니다. (출발·도착이 너무 가깝거나 도로가 없을 수 있어요)' }, 400);

    // 도로 경로 좌표(vertexes: [x,y,x,y,...])를 이어붙여 지도에 그릴 path로 만든다.
    const path = [];
    (route.sections || []).forEach(function (sec) {
      (sec.roads || []).forEach(function (rd) {
        const v = rd.vertexes || [];
        for (let i = 0; i + 1 < v.length; i += 2) path.push({ x: v[i], y: v[i + 1] });
      });
    });

    return json({ duration: route.summary.duration, distance: route.summary.distance, path: path });
  } catch (err) {
    return json({ error: '길찾기 요청 실패: ' + (err && err.message ? err.message : String(err)) }, 500);
  }
}
