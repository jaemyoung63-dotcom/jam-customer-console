/* =========================================================
   음성 입력 (듣고 받아쓰기) — 2026-08-14 추가
   - 고객 목록 화면: 헤더 🎤 → 고객 이름을 부르면 그 고객 상세로, "고객 추가"라고 하면 신규 등록 화면으로.
   - 고객 상세 화면: 헤더(등록/수정 시트) 🎤 음성입력 → 이름·생년월일 6자리·신상정보·등급·지역·
     진행단계·상품관심·상담상황을 순서대로 물어보고(TTS로 읽어줌) 대답을 들어서(STT) 채워 넣는다.
   - 주민번호 전체는 개인정보보호법상 민간 앱이 수집하면 안 되는 민감정보라, 이미 있는 "생년월일 6자리"
     (birth6) 필드에 음성으로 채우는 방식으로 만들었다. 신상정보는 별도로 이미 있는 신상정보 기록
     (날짜·장소·내용, pools.js의 addProfileLog)에 "내용"만 음성으로 추가하는 방식.
   - iOS 사파리는 음성 인식(듣기)을 지원하지 않는 경우가 많아, 지원하는 기기에서만 마이크 버튼이 보인다.
     (읽어주기(TTS)는 대부분의 브라우저에서 되지만, 듣기(STT)가 안 되면 이 기능 전체를 켜지 않는다.)
   ========================================================= */

const _SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
function voiceSupported(){ return !!_SpeechRec; }

/* ---------- 말하기(TTS) ---------- */
function voiceSpeak(text){
  return new Promise(resolve=>{
    if(!('speechSynthesis' in window)){ resolve(); return; }
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      u.lang='ko-KR'; u.rate=1.02;
      u.onend=()=>resolve();
      u.onerror=()=>resolve();
      speechSynthesis.speak(u);
    }catch(e){ resolve(); }
  });
}
/* ---------- 한 번 듣기(STT) ---------- 인식 안 되면 '', 마이크 권한이 막혀 있으면 '__DENIED__' */
function voiceListenOnce(timeoutMs){
  return new Promise(resolve=>{
    if(!_SpeechRec){ resolve(''); return; }
    let done=false;
    const rec=new _SpeechRec();
    try{ rec.lang='ko-KR'; }catch(e){}
    rec.interimResults=false;
    rec.maxAlternatives=1;
    const timer=setTimeout(()=>{ if(done) return; done=true; try{ rec.stop(); }catch(e){} resolve(''); }, timeoutMs||9000);
    rec.onresult=(e)=>{
      if(done) return; done=true; clearTimeout(timer);
      const txt=(e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
      resolve(txt.trim());
    };
    rec.onerror=(e)=>{
      if(done) return; done=true; clearTimeout(timer);
      resolve((e && e.error==='not-allowed') ? '__DENIED__' : '');
    };
    rec.onend=()=>{ if(done) return; done=true; clearTimeout(timer); resolve(''); };
    try{ rec.start(); }catch(e){ if(!done){ done=true; clearTimeout(timer); resolve(''); } }
  });
}
function voiceSleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function voiceDeniedMsg(){
  toast('🚫 마이크 권한이 꺼져 있어요 — 브라우저 주소창 옆 자물쇠 아이콘에서 마이크를 허용해주세요');
  setTimeout(toastHide,3200);
}

/* ===================== ① 고객 목록 화면 — 음성으로 찾기·추가 ===================== */
let _listVoiceBusy=false;
async function startListVoiceCommand(){
  if(!voiceSupported()){ alert('이 브라우저·기기에서는 음성 인식(듣기)이 지원되지 않아요. 안드로이드 폰의 크롬이나 PC 크롬에서 이용해주세요.'); return; }
  if(_listVoiceBusy) return;
  _listVoiceBusy=true;
  const btn=document.getElementById('hdr-mic-btn'); if(btn) btn.classList.add('listening');
  toast('🎤 고객 이름을 말씀하시거나 "고객 추가"라고 말씀하세요');
  const text=await voiceListenOnce(8000);
  if(btn) btn.classList.remove('listening');
  _listVoiceBusy=false;
  toastHide();
  if(text==='__DENIED__'){ voiceDeniedMsg(); return; }
  if(!text){ toast('음성을 인식하지 못했어요. 다시 시도해주세요.'); setTimeout(toastHide,2000); return; }
  if(/고객\s*추가|신규\s*고객|고객\s*등록/.test(text)){ openCustomer(null); return; }
  const norm=text.replace(/\s+/g,'');
  const matches=customers.filter(c=>{
    if(!c.name) return false;
    const cn=c.name.replace(/\s+/g,'');
    return norm.includes(cn) || cn.includes(norm);
  });
  if(matches.length===1){
    toast('✓ '+matches[0].name+' 고객 열었어요'); setTimeout(toastHide,1400);
    openCustomer(matches[0].id);
  } else if(matches.length>1){
    let h='<div class="meta" style="margin-bottom:10px">"'+esc(text)+'" 로 찾은 고객 '+matches.length+'명 · 눌러서 열기</div>';
    matches.forEach(c=>{ h+='<div class="card tap" style="cursor:pointer" onclick="closeSheet(\'ov-subpage\');openCustomer(\''+c.id+'\')"><div class="name">'+esc(c.name)+'</div><div class="meta">'+esc(c.region||'')+'</div></div>'; });
    openSubPage('음성 검색 결과', h);
  } else {
    toast('"'+text+'" 이름의 고객을 찾지 못했어요'); setTimeout(toastHide,2400);
  }
}

/* ===================== ② 고객 상세 화면 — 음성으로 순서대로 입력 ===================== */
const KOR_DIGIT_MAP={'공':'0','영':'0','일':'1','이':'2','삼':'3','사':'4','오':'5','육':'6','륙':'6','칠':'7','팔':'8','구':'9'};
function voiceExtractDigits(text){
  const direct=(text.match(/\d/g)||[]).join('');
  if(direct.length===6) return direct;
  const chars=text.replace(/[^가-힣0-9]/g,'').split('');
  let out=''; chars.forEach(ch=>{ if(/\d/.test(ch)) out+=ch; else if(KOR_DIGIT_MAP[ch]) out+=KOR_DIGIT_MAP[ch]; });
  if(out.length===6) return out;
  return direct.length?direct:out;
}
function voiceMatchMulti(text, list){
  const aliases={CI:['씨아이','시아이','씨 아이']};
  return list.filter(item=>{
    if(text.includes(item)) return true;
    const al=aliases[item]; return al ? al.some(a=>text.includes(a)) : false;
  });
}
function voiceSkip(text){ return /^(없|없어요|없습니다|패스|스킵|건너뛰|모르|괜찮)/.test(text.trim()); }

function vfHandleName(text){
  const v=text.replace(/\s+/g,' ').trim(); if(!v) return null;
  document.getElementById('c-name').value=v; editingCust.name=v;
  return '이름: '+v;
}
function vfHandleBirth6(text){
  if(voiceSkip(text)) return '생년월일은 건너뛸게요';
  const digits=voiceExtractDigits(text).slice(0,6);
  if(digits.length!==6) return null;
  document.getElementById('c-birth6').value=digits; onBirth6();
  return '생년월일 6자리: '+digits;
}
function vfHandleProfile(text){
  const v=text.trim();
  if(!v || voiceSkip(v)) return '신상정보는 건너뛸게요';
  document.getElementById('pf-content').value=v;
  document.getElementById('pf-place').value='';
  const dEl=document.getElementById('pf-date'); if(dEl) dEl.value=today();
  addProfileLog();
  return '신상정보 기록 추가: '+v;
}
function vfHandleGrade(text){
  const v=text.trim();
  if(voiceSkip(v)) return '등급은 건너뛸게요';
  let g='';
  if(v.includes('에이')||/^a/i.test(v)) g='A';
  else if(v.includes('비')||/^b/i.test(v)) g='B';
  else if(v.includes('씨')||v.includes('시')||/^c/i.test(v)) g='C';
  if(!g) return null;
  document.getElementById('c-grade').value=g; editingCust.grade=g;
  return '등급: '+g;
}
function vfHandleRegion(text){
  const v=text.replace(/\s+/g,' ').trim();
  if(!v || voiceSkip(v)) return '지역은 건너뛸게요';
  document.getElementById('c-region').value=v; editingCust.region=v;
  return '지역: '+v;
}
function vfHandleSeg(text){
  const hit=SEGMENTS.find(s=>text.includes(s));
  if(!hit) return null;
  editingCust.seg=hit;
  chipGroup(document.getElementById('cust-seg'),SEGMENTS,editingCust.seg,false,v=>editingCust.seg=v);
  return '진행단계: '+hit;
}
function vfHandleProduct(text){
  if(voiceSkip(text)) return '상품 관심은 건너뛸게요';
  const hits=voiceMatchMulti(text,PRODUCTS);
  if(!hits.length) return null;
  editingCust.product=hits;
  chipGroup(document.getElementById('cust-product'),PRODUCTS,editingCust.product,true);
  return '상품 관심: '+hits.join(', ');
}
function vfHandleSituation(text){
  if(voiceSkip(text)) return '상담 상황은 건너뛸게요';
  const hits=voiceMatchMulti(text,SITUATIONS);
  if(!hits.length) return null;
  editingCust.situation=hits;
  chipGroup(document.getElementById('cust-situation'),SITUATIONS,editingCust.situation,true);
  return '상담 상황: '+hits.join(', ');
}

const VOICE_FIELDS=[
  {prompt:'고객 이름을 말씀해주세요.', handle:vfHandleName},
  {prompt:'생년월일 6자리를 한 자리씩 또박또박 말씀해주세요. 예를 들어 팔, 오, 공, 삼, 일, 이. 없으면 없다고 말씀하세요.', handle:vfHandleBirth6},
  {prompt:'신상정보를 말씀해주세요. 없으면 없다고 말씀하세요.', handle:vfHandleProfile},
  {prompt:'등급을 말씀해주세요. 에이, 비, 씨 중 하나입니다. 없으면 없다고 말씀하세요.', handle:vfHandleGrade},
  {prompt:'지역을 말씀해주세요.', handle:vfHandleRegion},
  {prompt:'진행 단계를 말씀해주세요. 방문예정, 상담, 계약 중 하나입니다.', handle:vfHandleSeg},
  {prompt:'관심 있는 상품을 말씀해주세요. 여러 개를 한 번에 말씀하셔도 됩니다. 예를 들어 종신, 정기, 암, 건강, 실손, 연금저축, 어린이, 씨아이. 없으면 없다고 말씀하세요.', handle:vfHandleProduct},
  {prompt:'상담 상황을 말씀해주세요. 예를 들어 신규, 리모델링, 갱신전환, 해약방어, 만기도래, 증권점검. 없으면 없다고 말씀하세요.', handle:vfHandleSituation}
];

let voiceWizardActive=false;
async function runVoiceField(f){
  toast('🔊 '+f.prompt);
  await voiceSpeak(f.prompt);
  if(!voiceWizardActive) return;
  toast('🎤 듣고 있어요…');
  const text=await voiceListenOnce(9000);
  if(!voiceWizardActive) return;
  if(text==='__DENIED__'){ voiceDeniedMsg(); voiceWizardActive=false; return; }
  if(!text){ toast('못 들었어요 — 다음 항목으로 넘어갈게요'); await voiceSleep(1300); toastHide(); return; }
  let readback=null;
  try{ readback=f.handle(text); }catch(e){}
  const oc=document.getElementById('ov-cust'); if(oc) oc.dispatchEvent(new Event('input',{bubbles:true}));
  toast(readback ? ('✓ '+readback) : ('"'+text+'" — 이해하지 못했어요. 화면에서 직접 확인해주세요'));
  await voiceSleep(1500); toastHide();
}
async function startCustVoiceWizard(){
  if(!voiceSupported()){ alert('이 브라우저·기기에서는 음성 인식(듣기)이 지원되지 않아요. 안드로이드 폰의 크롬이나 PC 크롬에서 이용해주세요. (아이폰 사파리는 지원되지 않을 수 있어요)'); return; }
  if(!editingCust) return;
  const btn=document.getElementById('cust-mic-btn');
  if(voiceWizardActive){
    voiceWizardActive=false;
    try{ speechSynthesis.cancel(); }catch(e){}
    toast('음성 입력을 중단했어요'); setTimeout(toastHide,1400);
    if(btn){ btn.textContent='🎤 음성입력'; btn.classList.remove('listening'); }
    return;
  }
  voiceWizardActive=true;
  if(btn){ btn.textContent='⏹ 중단하기'; btn.classList.add('listening'); }
  for(const f of VOICE_FIELDS){
    if(!voiceWizardActive) break;
    await runVoiceField(f);
  }
  const finished=voiceWizardActive;
  voiceWizardActive=false;
  if(btn){ btn.textContent='🎤 음성입력'; btn.classList.remove('listening'); }
  if(finished){
    toast('✓ 음성 입력이 끝났습니다. 확인 후 저장해주세요'); setTimeout(toastHide,2800);
    voiceSpeak('입력이 끝났습니다. 확인하고 저장해주세요.');
  }
}

/* 이 기기·브라우저가 음성 인식을 지원하지 않으면 버튼 자체를 숨긴다(눌러도 안 되는 버튼을 보여주지 않기 위함) */
(function(){
  if(!voiceSupported()){
    const b=document.getElementById('cust-mic-btn'); if(b) b.style.display='none';
  }
})();
