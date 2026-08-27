/* =========================================================
   고객 (1·2단계)
========================================================= */
function renderCustomers(){
  header('고객', customers.length+'명 · 방문예정·상담·계약 관리', null);
  ensureCustToolbar();
  renderCustFilterChips();
  renderCustResults();
}
/* 검색창(input)은 화면에 처음 들어올 때 딱 한 번만 만든다. 한글 등은 자모를 조합해서
   완성되는데(예: ㄱ+ㅏ+ㅁ→감), 글자를 치는 도중에 이 input을 통째로 다시 만들어(지웠다 새로
   그려서) 바꿔치기하면 브라우저가 "지금 조합 중이던 칸"을 잃어버려서 글자가 깨져 보인다
   (예: "감"이 "ㄱㅏㅁ"으로 따로 남음). 그래서 검색어가 바뀌어도 이 input 자체는 절대
   다시 만들지 않고(ensureCustToolbar에서 이미 있으면 건너뜀), 그 아래 결과 목록만 새로 그린다. */
function ensureCustToolbar(){
  if(document.getElementById('cust-search')) return;
  const micOn=(typeof voiceSupported==='function' && voiceSupported());
  let bar='<div class="row" style="margin-bottom:12px;align-items:center;gap:8px">'
    +'<div style="position:relative;flex:1;min-width:0"><input class="t" id="cust-search" placeholder="고객 이름으로 찾기" value="'+esc(custSearch)+'" oninput="onCustSearch(this.value)" oncompositionstart="onCustSearchCompositionStart()" oncompositionend="onCustSearchCompositionEnd(this.value)" style="padding-right:32px;width:100%">'
    +'<span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.55;font-size:14px">🔍</span></div>'
    +(micOn?'<button class="btn ghost sm" id="hdr-mic-btn" style="flex-shrink:0" onclick="startListVoiceCommand()">🎤</button>':'')
    +'</div>';
  bar+='<div class="chips" id="cust-seg-chips" style="margin-bottom:8px;"></div>';
  bar+='<div class="chips" id="cust-src-chips" style="margin-bottom:14px;"></div>';
  const box=document.getElementById('cust-toolbar'); if(box) box.innerHTML=bar;
}
function renderCustFilterChips(){
  let segHtml='';
  ['전체',...SEGMENTS].forEach(s=>{ segHtml+='<div class="chip'+(custFilter.seg===s?' on':'')+'" onclick="setCF(\'seg\',\''+s+'\')">'+s+'</div>'; });
  const segEl=document.getElementById('cust-seg-chips'); if(segEl) segEl.innerHTML=segHtml;
  let srcHtml='<div class="chip'+(custFilter.src==='전체'?' on':'')+'" onclick="setCF(\'src\',\'전체\')">전체</div>';
  SOURCES.forEach(([v,l])=>{ srcHtml+='<div class="chip'+(custFilter.src===v?' on':'')+'" onclick="setCF(\'src\',\''+v+'\')">'+l+'</div>'; });
  const srcEl=document.getElementById('cust-src-chips'); if(srcEl) srcEl.innerHTML=srcHtml;
}
function renderCustResults(){
  let list = customers.slice().sort((a,b)=>b.updated.localeCompare(a.updated));
  if(custFilter.seg!=='전체') list=list.filter(c=>c.seg===custFilter.seg);
  if(custFilter.src!=='전체') list=list.filter(c=>c.source===custFilter.src);
  if((custSearch||'').trim()) list=list.filter(c=>(c.name||'').includes(custSearch.trim()));

  let html='';
  if(list.length===0){
    html += (custSearch||'').trim()
      ? '<div class="empty"><div class="big">\''+esc(custSearch.trim())+'\' 이름의 고객이 없어요</div>검색어를 확인하거나 지워보세요.</div>'
      : '<div class="empty"><div class="big">아직 등록된 고객이 없어요</div>오른쪽 아래 + 버튼으로 첫 고객을 등록하세요.</div>';
  } else {
    list.forEach(c=>{
      const src = c.source==='db'?'<span class="badge b-db">DB</span>':'<span class="badge b-acq">지인</span>';
      const seg = c.seg?'<span class="badge b-seg">'+c.seg+'</span>':'';
      const grade = c.grade?'<span class="badge b-grade">'+c.grade+'</span>':'';
      const imgN = (c.images||[]).length;
      const tags=[...(c.product||[]),...(c.situation||[])].slice(0,4).map(t=>'<span class="pt">'+t+'</span>').join('');
      const apBtn = c.apSaved ? '<button class="btn primary sm" style="margin-left:8px;flex-shrink:0" onclick="event.stopPropagation();openAP(\''+c.id+'\')">AP</button>' : '';
      html+='<div class="card tap" onclick="openCustomer(\''+c.id+'\')">'
        +'<div class="row" style="margin-bottom:6px;"><span class="name">'+esc(c.name||'(이름 없음)')+'</span><span class="spacer"></span>'+grade+' '+seg+' '+src+apBtn+'</div>'
        +'<div class="meta">'+(c.age?c.age+' · ':'')+(c.region?esc(c.region):'지역 미입력')
        +(c.phone?' · '+esc(c.phone):'')
        +(imgN?' · <span>◇ 이미지 '+imgN+'</span>':'')+'</div>'
        +(tags?'<div class="pill-tags">'+tags+'</div>':'')
        +'</div>';
    });
  }
  html+='<div class="divider"></div>';
  html+='<button class="btn primary wide add-btn" onclick="openCustomer(null)">＋ 고객 추가</button>';
  html+='<div class="row" style="margin-top:8px"><button class="btn ghost sm grow" onclick="document.getElementById(\'import-cust-input\').click()">불러오기(복원)</button></div>';
  const box=document.getElementById('cust-results'); if(box) box.innerHTML=html;
}
function setCF(k,v){custFilter[k]=v; renderCustFilterChips(); renderCustResults();}
let _imeComposing=false;
function onCustSearchCompositionStart(){ _imeComposing=true; }
function onCustSearchCompositionEnd(v){ _imeComposing=false; onCustSearch(v); }
function onCustSearch(v){
  custSearch=v;
  if(_imeComposing) return;
  renderCustResults(); // 검색창(input)은 절대 건드리지 않고, 결과 목록만 새로 그린다
}

async function openCustomer(id){
  const c = id ? customers.find(x=>x.id===id) : {id:null,source:'db',seg:'방문예정',product:[],situation:[],images:[]};
  editingCust = JSON.parse(JSON.stringify(c));
  /* 상담·분석(연결) 모드에서 고객을 선택하면 "작업 고객"으로 물고 간다 —
     이후 하단 탭(분석·상담·참조풀)으로 옮겨가도 이 고객 정보가 계속 뜨게 하기 위함(navGo()에서 유지). */
  if(appMode==='connected' && id) currentCustId=id;
  header(id?'고객 상세':'고객 등록', c.name?('◉ '+c.name+(c.region?' · '+c.region:'')):'');
  document.getElementById('cust-title').textContent = id?'고객 상세':'고객 등록';
  document.getElementById('c-delete').style.display = id?'flex':'none';
  document.getElementById('c-name').value=c.name||'';
  document.getElementById('c-phone').value=c.phone||'';
  document.getElementById('c-region').value=c.region||'';
  { const _g=document.getElementById('c-gender'); if(_g) _g.value=c.gender||''; }
  { const _j=document.getElementById('c-job'); if(_j) _j.value=c.job||''; }
  { const _a=document.getElementById('c-address'); if(_a) _a.value=c.address||''; }
  { const _ad=document.getElementById('c-address-detail'); if(_ad) _ad.value=c.addressDetail||''; }
  try{ initMasks(); refreshMasks(); }catch(e){}
  document.getElementById('c-memo').value=c.memo||'';
  document.getElementById('c-coverage').value=c.coverageText||'';
  { const _rrn=document.getElementById('c-rrn'); if(_rrn){ const _b=(c.birth6||''); const _bk=(c.rrnBack||''); _rrn.value=(_b+(_bk?('-'+_bk):'')); } }
  document.getElementById('c-agenum').value=c.ageNum?(c.ageNum+'세'):'';
  fillSelect('c-age',AGES,c.age); fillSelect('c-grade',null,c.grade);
  chipGroup(document.getElementById('cust-source'),SOURCES,editingCust.source,false,v=>{editingCust.source=v; toggleImageBlock();});
  chipGroup(document.getElementById('cust-seg'),SEGMENTS,editingCust.seg,false,v=>editingCust.seg=v);
  chipGroup(document.getElementById('cust-product'),PRODUCTS,editingCust.product,true);
  chipGroup(document.getElementById('cust-situation'),SITUATIONS,editingCust.situation,true);
  toggleImageBlock();
  editingCust.docKind='보장급부';
  chipGroup(document.getElementById('doc-kind'),IMG_KINDS,'보장급부',false,v=>editingCust.docKind=v);
  await renderThumbs();
  custStep(1);
  refreshCoverageUI();
  /* 고객상세는 "팝업 창"이 아니라 고객 화면 안의 하위 화면 — 다른 화면(.screen)들과 같은 방식으로 전환.
     단, 하단 탭은 계속 "고객"이 켜져 있게 둠(여전히 고객 섹션 안이라는 뜻). freeUrls()는 일부러 안 부름 —
     방금 renderThumbs()가 만든 이미지 미리보기 URL이 곧바로 지워지면 사진이 깨져 보이기 때문.
     header()는 위에서 이미 새로 그렸으므로 여기서 다시 지우지 않음. */
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById('s-custdetail').classList.add('active');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('on'));
  const tb=document.getElementById('tab-customers'); if(tb) tb.classList.add('on');
  window.scrollTo(0,0);
}
/* ===== 주소 찾기 (카카오/다음 우편번호 서비스) =====
   일부만 입력해도 도로명·지번으로 찾아준다. 스크립트는 처음 누를 때만 불러온다(지연 로딩). */
function ensureDaumPostcode(cb){
  if((window.daum&&window.daum.Postcode)||(window.kakao&&window.kakao.Postcode)){ cb(); return; }
  const s=document.createElement('script');
  s.src='https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  s.onload=function(){ cb(); };
  s.onerror=function(){ alert('주소 검색 서비스를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); };
  document.head.appendChild(s);
}
function openAddrSearch(){
  ensureDaumPostcode(function(){
    const P=(window.daum&&window.daum.Postcode)?window.daum.Postcode:(window.kakao&&window.kakao.Postcode);
    if(!P){ alert('주소 검색을 초기화하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    new P({ oncomplete:function(data){
      const addr=data.roadAddress||data.address||'';
      const aEl=document.getElementById('c-address'); if(aEl) aEl.value=addr;
      // 지역 칸이 비어 있으면 시/도 + 시군구로 자동으로 채워준다.
      const rEl=document.getElementById('c-region');
      if(rEl && !(rEl.value||'').trim()){ rEl.value=((data.sido||'')+' '+(data.sigungu||'')).trim(); }
      const dEl=document.getElementById('c-address-detail'); if(dEl) dEl.focus();
    } }).open();
  });
}
/* 특정 입력칸(지도 시트의 출발/도착 등)에 카카오 우편번호로 주소를 찾아 넣는다. */
function openAddrSearchInto(inputId){
  ensureDaumPostcode(function(){
    var P=(window.daum&&window.daum.Postcode)?window.daum.Postcode:(window.kakao&&window.kakao.Postcode);
    if(!P){ alert('주소 검색을 초기화하지 못했어요.'); return; }
    new P({ oncomplete:function(data){
      var el=document.getElementById(inputId); if(el) el.value=(data.roadAddress||data.address||'');
    } }).open();
  });
}

/* ===== 민감정보 마스킹 (전화·주소·주민번호 뒷자리) =====
   입력값(input.value)은 절대 건드리지 않고, 위에 덮는 오버레이 글자만 가린다 → 저장은 항상 원본.
   마우스를 올리거나(hover) 칸을 누르면(focus) 원본이 보인다. */
function maskPhone(v){ v=(v||'').trim(); if(!v) return '';
  var p=v.split('-');
  if(p.length===3) return p[0]+'-****-'+p[2];
  var d=v.replace(/\D/g,''); if(d.length<7) return v;
  return d.slice(0,3)+'-****-'+d.slice(-4);
}
function maskAddr(v){ v=(v||'').trim(); if(!v) return ''; if(v.length<=6) return v; return v.slice(0,6)+' ****'; }
function maskRrn(v){ var raw=(v||'').replace(/\D/g,''); if(!raw) return ''; var b6=raw.slice(0,6), back=raw.slice(6); return back ? (b6+'-'+back.slice(0,1)+'******') : b6; }
var MASK_FIELDS=[['c-phone',maskPhone],['c-address',maskAddr],['c-rrn',maskRrn]];
function refreshMasks(){ MASK_FIELDS.forEach(function(f){
  var inp=document.getElementById(f[0]); var ov=document.getElementById('mask-'+f[0]);
  if(!inp||!ov||ov.classList.contains('reveal')) return;
  ov.textContent = inp.value ? f[1](inp.value) : '';
}); }
function initMasks(){ MASK_FIELDS.forEach(function(f){
  var inp=document.getElementById(f[0]); var ov=document.getElementById('mask-'+f[0]);
  if(!inp||!ov||ov._wired) return; ov._wired=true;
  ov.addEventListener('mouseenter', function(){ ov.classList.add('reveal'); });
  ov.addEventListener('mouseleave', function(){ if(document.activeElement!==inp){ ov.classList.remove('reveal'); refreshMasks(); } });
  ov.addEventListener('click', function(){ ov.classList.add('reveal'); inp.focus(); });
  inp.addEventListener('focus', function(){ ov.classList.add('reveal'); });
  inp.addEventListener('blur', function(){ ov.classList.remove('reveal'); refreshMasks(); });
  ov.textContent = inp.value ? f[1](inp.value) : '';
}); }
try{ initMasks(); }catch(e){}

/* ===== 지도 · 자동차 소요시간 (카카오맵) =====
   지도 표시·주소→좌표(지오코딩)는 JavaScript 키로 브라우저에서, 자동차 소요시간은
   REST 키가 필요해 서버(/api/directions)로 보낸다. SDK는 처음 열 때만 불러온다(지연 로딩). */
var KAKAO_JS_KEY='8e104d55c5268f324f7aa0319e3cddbb';
function ensureKakaoMaps(cb){
  if(window.kakao && window.kakao.maps && window.kakao.maps.services){ cb(); return; }
  if(window._kakaoLoading){ var t=setInterval(function(){ if(window.kakao&&window.kakao.maps&&window.kakao.maps.services){ clearInterval(t); cb(); } },120); return; }
  window._kakaoLoading=true;
  var s=document.createElement('script');
  s.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+KAKAO_JS_KEY+'&libraries=services&autoload=false';
  s.onload=function(){ kakao.maps.load(function(){ cb(); }); };
  s.onerror=function(){ alert('지도를 불러오지 못했어요.\n\n카카오 개발자 콘솔에서 이 앱의 [플랫폼 → Web]에 https://jam-customer-console.pages.dev 를 등록했는지, 그리고 인터넷 연결을 확인해 주세요.'); };
  document.head.appendChild(s);
}
var _kmap=null, _kmarkers=[], _kpolylines=[], _wpSeq=0, _lastRoute=null;
var ROUTE_COLORS=['#1E86F0','#E0533D','#10A87F','#8B5CF6','#F59E0B','#EC4899','#0EA5E9','#84CC16'];
function fmtMin(secval){ var min=Math.round((secval||0)/60), hh=Math.floor(min/60), mm=min%60; return hh>0?(hh+'시간 '+mm+'분'):(mm+'분'); }
function _short(s){ s=(s||'').trim(); return s.length>14 ? s.slice(0,14)+'…' : s; }
function openMapSheet(){
  var addr=(document.getElementById('c-address')&&document.getElementById('c-address').value.trim())||'';
  var detail=(document.getElementById('c-address-detail')&&document.getElementById('c-address-detail').value.trim())||'';
  var d=document.getElementById('map-dest'); if(d) d.value=(addr+(detail?(' '+detail):'')).trim();
  var ov=document.getElementById('ov-map'); if(ov) ov.style.display='flex';
  document.body.style.overflow='hidden';
  ensureKakaoMaps(function(){
    var mapDiv=document.getElementById('map');
    if(!_kmap){ _kmap=new kakao.maps.Map(mapDiv,{center:new kakao.maps.LatLng(37.5665,126.9780),level:6}); }
    setTimeout(function(){ if(_kmap) _kmap.relayout(); },250);
  });
}
function closeMapFull(){
  var ov=document.getElementById('ov-map'); if(ov) ov.style.display='none';
  document.body.style.overflow='';
}
function addWaypointRow(){
  var wrap=document.getElementById('map-waypoints'); if(!wrap) return;
  var id='map-wp-'+(++_wpSeq);
  var row=document.createElement('div');
  row.className='row'; row.style.cssText='gap:6px;align-items:center;margin-top:8px';
  row.innerHTML='<span class="meta" style="flex:0 0 auto">경유</span>'
    +'<input class="t grow" id="'+id+'" placeholder="경유지 주소·장소" style="margin:0">'
    +'<button class="btn ghost sm" style="flex:0 0 auto" onclick="openAddrSearchInto(\''+id+'\')">🔍</button>'
    +'<button class="btn danger sm" style="flex:0 0 auto" onclick="this.parentNode.remove()">×</button>';
  wrap.appendChild(row);
}
function _geocode(addr){
  return new Promise(function(res){
    var g=new kakao.maps.services.Geocoder();
    g.addressSearch(addr, function(result, status){
      if(status===kakao.maps.services.Status.OK && result[0]){ res({x:parseFloat(result[0].x), y:parseFloat(result[0].y)}); return; }
      // 주소로 안 잡히면(역·건물명·상호 등) 키워드 장소검색으로 재시도한다.
      var ps=new kakao.maps.services.Places();
      ps.keywordSearch(addr, function(data, st2){
        if(st2===kakao.maps.services.Status.OK && data[0]){ res({x:parseFloat(data[0].x), y:parseFloat(data[0].y)}); }
        else res(null);
      });
    });
  });
}
function calcRoute(){
  var oAddr=(document.getElementById('map-origin').value||'').trim();
  var dAddr=(document.getElementById('map-dest').value||'').trim();
  var out=document.getElementById('map-result');
  if(!oAddr||!dAddr){ out.textContent='출발지와 도착지를 모두 입력하세요.'; return; }
  var wpAddrs=[];
  var wpEls=document.querySelectorAll('#map-waypoints input');
  Array.prototype.forEach.call(wpEls, function(el){ var v=(el.value||'').trim(); if(v) wpAddrs.push(v); });
  out.textContent='주소를 좌표로 변환 중…';
  ensureKakaoMaps(function(){
    var tasks=[_geocode(oAddr)].concat(wpAddrs.map(_geocode)).concat([_geocode(dAddr)]);
    Promise.all(tasks).then(function(pts){
      if(pts.some(function(p){ return !p; })){ out.textContent='주소 일부를 찾지 못했어요. [찾기]로 정확히 골라주세요.'; return; }
      var o=pts[0], d=pts[pts.length-1], wps=pts.slice(1, pts.length-1);
      _kmarkers.forEach(function(m){ m.setMap(null); }); _kmarkers=[];
      var bounds=new kakao.maps.LatLngBounds();
      pts.forEach(function(p){ var ll=new kakao.maps.LatLng(p.y,p.x); _kmarkers.push(new kakao.maps.Marker({map:_kmap,position:ll})); bounds.extend(ll); });
      _kmap.setBounds(bounds);
      out.textContent='자동차 경로 계산 중…';
      fetch('/api/directions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({origin:{x:o.x,y:o.y},destination:{x:d.x,y:d.y},waypoints:wps.map(function(p){ return {x:p.x,y:p.y}; })})})
        .then(function(res){ return res.json(); })
        .then(function(data){
          if(data.error){ out.textContent='소요시간: '+data.error; return; }
          // 이전 경로선 제거
          _kpolylines.forEach(function(pl){ pl.setMap(null); }); _kpolylines=[];
          var secs=data.sections||[];
          var names=[oAddr].concat(wpAddrs).concat([dAddr]);
          var html='🚗 <b>총 '+fmtMin(data.duration)+' · '+(((data.distance||0)/1000).toFixed(1))+'km</b>';
          secs.forEach(function(sec,i){
            var color=ROUTE_COLORS[i%ROUTE_COLORS.length];
            if(sec.path&&sec.path.length){
              var line=sec.path.map(function(p){ return new kakao.maps.LatLng(p.y,p.x); });
              var pl=new kakao.maps.Polyline({path:line, strokeWeight:6, strokeColor:color, strokeOpacity:0.9, strokeStyle:'solid'});
              pl.setMap(_kmap); _kpolylines.push(pl);
            }
            html+='<div style="margin-top:4px;font-size:12.5px;display:flex;align-items:center">'
              +'<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:'+color+';margin-right:6px;flex:0 0 auto"></span>'
              +'<span>'+esc(_short(names[i]||''))+' → '+esc(_short(names[i+1]||''))+' : '+fmtMin(sec.duration)+' · '+(((sec.distance||0)/1000).toFixed(1))+'km</span></div>';
          });
          out.innerHTML=html;
          // 카카오내비용 목적지·경유지 저장
          _lastRoute={ dest:{x:d.x,y:d.y}, destName:dAddr, vias: wps.map(function(p,i){ return {x:p.x,y:p.y,name:wpAddrs[i]}; }) };
        }).catch(function(){ out.textContent='소요시간 계산 중 오류가 났어요. 잠시 후 다시 시도해 주세요.'; });
    });
  });
}
/* 카카오내비 앱으로 안내 시작 (휴대폰에 카카오내비 설치 필요). 카카오 JS SDK를 지연 로딩한다. */
function ensureKakaoSdk(cb){
  if(window.Kakao && window.Kakao.Navi){ try{ if(!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY); }catch(e){} cb(); return; }
  if(window._kakaoSdkLoading){ var t=setInterval(function(){ if(window.Kakao&&window.Kakao.Navi){ clearInterval(t); try{ if(!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY); }catch(e){} cb(); } },120); return; }
  window._kakaoSdkLoading=true;
  var s=document.createElement('script');
  s.src='https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
  s.onload=function(){ try{ if(!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY); }catch(e){} cb(); };
  s.onerror=function(){ alert('카카오내비 연결 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); };
  document.head.appendChild(s);
}
function openNavi(){
  if(!_lastRoute){ alert('먼저 "경로·소요시간 계산"을 눌러 경로를 만든 뒤 이용하세요.'); return; }
  ensureKakaoSdk(function(){
    try{
      // 카카오내비 웹(JS) 연동은 도착지 1곳만 지원한다(경유지는 앱 SDK에만 있음).
      if(_lastRoute.vias && _lastRoute.vias.length && typeof toast==='function'){
        toast('카카오내비는 도착지까지 안내돼요. 경유지는 위 지도의 경로·구간시간으로 확인하세요.');
        if(typeof toastHide==='function') setTimeout(toastHide,2800);
      }
      window.Kakao.Navi.start({ name:(_lastRoute.destName||'도착지'), x:_lastRoute.dest.x, y:_lastRoute.dest.y, coordType:'wgs84' });
    }catch(e){ alert('카카오내비 실행에 실패했어요. 휴대폰에 카카오내비 앱이 설치돼 있는지 확인해 주세요. (PC에서는 실행되지 않습니다)'); }
  });
}
/* ===== 고객 다단계 이동 (2단계) ===== */
function custStep(n){
  for(let i=1;i<=2;i++){ const el=document.getElementById('cstep-'+i); if(el) el.style.display=(i===n)?'block':'none'; }
  const sb=document.getElementById('cust-stepbar');
  if(sb) sb.innerHTML=[1,2].map(i=>'<span class="stepdot'+(i===n?' on':(i<n?' done':''))+'">'+i+'</span>').join('<span class="stepline"></span>');
  if(n===2){
    const nm=(document.getElementById('c-name').value||'').trim();
    const rg=(document.getElementById('c-region').value||'').trim();
    const cx=document.getElementById('cust-ctx2');
    if(cx) cx.innerHTML = nm ? ('<div style="background:var(--accent);color:#fff;border-radius:12px;padding:9px 13px;margin-bottom:12px;font-size:15px;font-weight:700">◉ '+esc(nm)+' 고객'+(rg?' <span style="font-weight:400;opacity:.85;font-size:13px">· '+esc(rg)+'</span>':'')+'</div>') : '';
    refreshCoverageUI();
  }
  window.scrollTo(0,0);
}
function refreshCoverageUI(){
  renderTidyHistory();
}
function showCoverageResult(){
  const ta=document.getElementById('c-coverage'); const mm=document.getElementById('c-memo');
  if(ta && editingCust && editingCust.coverageText && !(ta.value||'').trim()) ta.value=editingCust.coverageText;
  if(mm && editingCust && editingCust.memo!=null && !(mm.value||'').trim()) mm.value=editingCust.memo;
  resetCovSave();
  openSheet('ov-coverage');
}
/* 기록 목록: 최대 3개만 표시, 나머지는 '이전기록' 버튼으로 펼침 */
function histBlock(cards, idPrefix){
  if(cards.length<=3) return cards.join('');
  return cards.slice(0,3).join('')
    +'<div id="'+idPrefix+'-more" style="display:none">'+cards.slice(3).join('')+'</div>'
    +'<button class="btn ghost sm wide" style="margin-top:6px" onclick="var m=document.getElementById(\''+idPrefix+'-more\');m.style.display=\'block\';this.style.display=\'none\'">이전기록 '+(cards.length-3)+'개 더 보기</button>';
}
function renderTidyHistory(){
  const wrap=document.getElementById('tidy-history'); if(!wrap) return;
  const list=(editingCust&&editingCust.coverageHistory)?editingCust.coverageHistory:[];
  if(!list.length){ wrap.innerHTML=''; return; }
  let h='<label class="f">AI 정리 기록 ('+list.length+')</label>';
  const cards=list.map((e,i)=>
    '<div class="card" style="padding:9px 11px"><div class="row" style="align-items:center">'
      +'<div style="flex:1;min-width:0" onclick="openTidyEntry('+i+')"><div style="font-size:12.5px;font-weight:600">'+esc(e.at||e.date||'')+'</div>'
      +'<div class="meta" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(oneLine(e.text))+'</div></div>'
      +'<button class="btn ghost sm" style="margin-left:8px" onclick="openTidyEntry('+i+')">보기</button>'
      +'<button class="btn danger sm" style="margin-left:6px" onclick="delTidyEntry('+i+')">삭제</button></div></div>');
  wrap.innerHTML=h+histBlock(cards,'tidyhist');
}
function openTidyEntry(i){
  const list=(editingCust&&editingCust.coverageHistory)||[]; const e=list[i]; if(!e) return;
  document.getElementById('c-coverage').value=e.text||'';
  openSheet('ov-coverage');
}
async function delTidyEntry(i){
  if(!editingCust||!editingCust.coverageHistory) return;
  if(!confirm('이 정리 기록을 삭제할까요?')) return;
  editingCust.coverageHistory.splice(i,1);
  if(editingCust.coverageHistory[0]){ editingCust.coverageText=editingCust.coverageHistory[0].text; document.getElementById('c-coverage').value=editingCust.coverageText; }
  if(editingCust.id) await idbPut('customers',editingCust);
  refreshCoverageUI();
}
function computeAge6(d){
  if(!/^\d{6}$/.test(d)) return null;
  let yy=+d.slice(0,2), mm=+d.slice(2,4), dd=+d.slice(4,6);
  if(mm<1||mm>12||dd<1||dd>31) return null;
  const now=new Date(), cy2=now.getFullYear()%100;
  const year=(yy<=cy2)?2000+yy:1900+yy;
  let age=now.getFullYear()-year;
  const bd=new Date(year,mm-1,dd);
  const passed=(now.getMonth()>bd.getMonth())||(now.getMonth()===bd.getMonth()&&now.getDate()>=bd.getDate());
  if(!passed) age--;
  return (age>=0&&age<=120)?age:null;
}
/* 주민번호 한 칸 입력: 숫자만 남기고 6자리 뒤 하이픈 자동, 앞 6자리로 나이 자동계산. */
function onRrn(){
  var el=document.getElementById('c-rrn'); if(!el) return;
  var raw=el.value.replace(/\D/g,'').slice(0,13);
  el.value = raw.length>6 ? (raw.slice(0,6)+'-'+raw.slice(6)) : raw;
  var b6=raw.slice(0,6);
  editingCust.birth6=b6; editingCust.rrnBack=raw.slice(6,13);
  var age=computeAge6(b6);
  if(age!=null){
    editingCust.ageNum=age;
    document.getElementById('c-agenum').value=age+'세';
    var band=age<30?'20대':age<40?'30대':age<50?'40대':age<60?'50대':'60대+';
    if(!editingCust.age){ editingCust.age=band; var ae=document.getElementById('c-age'); if(ae) ae.value=band; }
  } else {
    editingCust.ageNum=null; document.getElementById('c-agenum').value='';
  }
}
function onBirth6(){
  const d=document.getElementById('c-birth6').value.replace(/\D/g,'').slice(0,6);
  document.getElementById('c-birth6').value=d;
  const age=computeAge6(d);
  editingCust.birth6=d;
  if(age!=null){
    editingCust.ageNum=age;
    document.getElementById('c-agenum').value=age+'세';
    const band=age<30?'20대':age<40?'30대':age<50?'40대':age<60?'50대':'60대+';
    if(!editingCust.age){ editingCust.age=band; document.getElementById('c-age').value=band; }
  } else {
    editingCust.ageNum=null; document.getElementById('c-agenum').value='';
  }
}
function toggleImageBlock(){ /* DB·지인 동일 포맷 — 이미지/보장 단계 항상 표시 */ }
function openLightbox(src){ const lb=document.getElementById('lightbox'); const im=document.getElementById('lightbox-img'); if(im) im.src=src; if(lb) lb.classList.add('show'); }
function startProgress(cb){
  let p=0; try{ cb(0); }catch(e){}
  const id=setInterval(()=>{ p += Math.max(1, Math.round((92-p)*0.07)); if(p>92) p=92; try{ cb(p); }catch(e){} }, 350);
  return { done:(final)=>{ clearInterval(id); try{ cb(final==null?100:final); }catch(e){} } };
}
/* ===== 불명확 확인 질문 UI ===== */
function qPanel(title, questions, onSubmitAttr){
  return '';   // '확인이 필요한 항목' 패널 사용 안 함 (요청으로 삭제)
}
function collectAnswers(box){
  const lines=[]; box.querySelectorAll('.q-answer').forEach(inp=>{ const a=inp.value.trim(); if(a) lines.push('- '+inp.getAttribute('data-q')+' → '+a); });
  return lines;
}
function renderTidyQuestions(questions){
  const box=document.getElementById('tidy-questions'); if(!box) return;
  if(!questions||!questions.length){ box.innerHTML=''; return; }
  box.innerHTML=qPanel('확인', questions, 'resubmitTidy()');
}
function resubmitTidy(){
  const box=document.getElementById('tidy-questions'); const lines=collectAnswers(box);
  if(!lines.length){ alert('확인할 답변을 하나 이상 입력하세요.'); return; }
  tidyCoverage(lines.join('\n'));
}
let planQCust=null;
function renderPlanQuestions(custId, questions){
  const box=document.getElementById('plan-questions'); if(!box) return; planQCust=custId;
  if(!questions||!questions.length){ box.innerHTML=''; return; }
  box.innerHTML=qPanel('확인', questions, 'resubmitPlan()');
}
function resubmitPlan(){
  const box=document.getElementById('plan-questions'); const lines=collectAnswers(box);
  if(!lines.length){ alert('확인할 답변을 하나 이상 입력하세요.'); return; }
  if(planQCust) runPlanAnalysis(planQCust, lines.join('\n'));
}
function enableDrop(el, onFile, filterFn){
  if(!el||el._dropReady) return; el._dropReady=true;
  const ok = filterFn || (f => (f.type&&f.type.indexOf('image')===0)||isPdfFile(f));
  el.addEventListener('dragover',e=>{e.preventDefault(); el.classList.add('drag-over');});
  el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
  el.addEventListener('drop',async e=>{
    e.preventDefault(); el.classList.remove('drag-over');
    const files=(e.dataTransfer&&e.dataTransfer.files)?Array.from(e.dataTransfer.files):[];
    for(const f of files){ if(ok(f)) await onFile(f); }
  });
}
async function renderThumbs(){
  const wrap=document.getElementById('c-thumbs'); if(!wrap) return; wrap.innerHTML='';
  for(const ref of (editingCust.images||[])){
    const rec=await idbGet('images',ref);
    const d=document.createElement('div'); d.className='thumb';
    if(rec&&rec.blob){ d.innerHTML='<img src="'+blobUrl(rec.blob)+'" onclick="event.stopPropagation();openLightbox(this.src)"><span class="k">'+(rec.kind||'')+'</span><button class="del" onclick="removeImage(event,\''+ref+'\')">×</button>'; }
    else d.innerHTML='<span class="k">없음</span><button class="del" onclick="removeImage(event,\''+ref+'\')">×</button>';
    wrap.appendChild(d);
  }
  const add=document.createElement('div'); add.className='add-thumb';
  add.innerHTML='<span style="font-size:22px">＋</span>파일 추가';
  add.onclick=pickImage;
  wrap.appendChild(add);
  const cam=document.createElement('div'); cam.className='add-thumb';
  cam.innerHTML='<span style="font-size:22px">📷</span>카메라 촬영';
  cam.onclick=pickCamera;
  wrap.appendChild(cam);
  enableDrop(wrap, addImageDirect);
}
function removeImage(e,ref){e.stopPropagation(); editingCust.images=editingCust.images.filter(x=>x!==ref); idbDel('images',ref); renderThumbs();}

