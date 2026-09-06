/* ===================== 고객관리 (히스토리) =====================
   2026-09-06 6탭 개편 3단계.
   이 고객과의 통화·상담 히스토리를 모아보는 화면. 음원(드래그&드롭·폴더에서 선택·
   구글드라이브)이나 직접 적은 메모를 "AI로 정리" 버튼으로 정리해 히스토리 타임라인에 쌓는다.
   - 구글드라이브 연동은 아직 준비중(OAuth 설정 필요) — 안내만 뜨고 실제 가져오기는 안 됨.
   - Q&A 코너(4단계)는 아직 없음. docs/6탭구조_설계메모.md 참고.
   - AP 상담결과 저장(ap.js saveConsultResult)도 자동으로 이 히스토리에 한 줄 추가된다.
   자료 구조: 고객(c).history = [{id, at, title, summary, rawText, source:'call'|'ap'}] */
let cmCustId=null;
let _cmPending=null; // 지금 화면에 올려둔, 아직 정리 전인 음원/텍스트 {rawText, audio(idb ref)}

function fillCmSelect(){
  header('고객관리', '통화·상담 히스토리 모아보기');
  const sel=document.getElementById('cm-custsel'); if(sel){
    sel.innerHTML='<option value="">— 고객 선택 —</option>';
    customers.forEach(c=>{const o=document.createElement('option'); o.value=c.id; o.textContent=c.name+(c.region?' · '+c.region:''); sel.appendChild(o);});
  }
  const pk=document.getElementById('cm-picker'); if(pk) pk.style.display=currentCustId?'none':'';
  if(currentCustId && customers.some(c=>c.id===currentCustId)){
    if(sel) sel.value=currentCustId;
    if(cmCustId!==currentCustId){ cmCustId=currentCustId; _cmPending=null; }
    renderCmBody();
  } else {
    cmCustId=null;
    const body=document.getElementById('cm-body'); if(body) body.innerHTML='<div class="empty">고객관리할 고객을 선택하세요.</div>';
  }
}
function onCmCustSel(){
  currentCustId=document.getElementById('cm-custsel').value||null;
  const pk=document.getElementById('cm-picker'); if(pk) pk.style.display=currentCustId?'none':'';
  if(currentCustId){ cmCustId=currentCustId; _cmPending=null; renderCmBody(); }
  else { cmCustId=null; const body=document.getElementById('cm-body'); if(body) body.innerHTML='<div class="empty">고객관리할 고객을 선택하세요.</div>'; }
}

function renderCmBody(){
  const c=customers.find(x=>x.id===cmCustId);
  const body=document.getElementById('cm-body'); if(!body) return;
  if(!c){ body.innerHTML='<div class="empty">고객관리할 고객을 선택하세요.</div>'; return; }
  const p=_cmPending||{rawText:'',audio:null};

  let h='<div class="card" style="margin-bottom:14px"><div class="row" style="align-items:center"><span class="name">'+esc(c.name)+'</span><span class="spacer"></span>'
    +(c.source==='db'?'<span class="badge b-db">DB</span>':'<span class="badge b-acq">지인</span>')+'</div></div>';

  h+='<div style="font-size:12.5px;color:var(--ink-mute);margin-bottom:4px">새 기록 추가 <span style="font-weight:400">· 통화·상담 메모를 적거나, 음원을 넣고 "AI로 정리"를 누르세요</span></div>';
  h+='<div id="cm-textdrop" style="border:1.5px dashed var(--line-strong);border-radius:10px;padding:2px">'
    +'<textarea class="t" id="cm-rawtext" rows="4" placeholder="오늘 통화·상담 내용을 적거나, 텍스트(.txt) 파일을 여기로 끌어다 놓으세요.">'+esc(p.rawText||'')+'</textarea>'
    +'</div>';
  // 2026-09-06: 음원 칸처럼 텍스트도 드래그&드롭 말고 "폴더에서 선택"·"구글드라이브에서 가져오기"로 넣을 수 있게.
  h+='<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">'
    +'<button class="btn ghost sm" onclick="pickCmText()">📁 폴더에서 선택</button>'
    +'<button class="btn ghost sm" onclick="pickCmTextDrive()">☁️ 구글드라이브에서 가져오기</button>'
    +'</div>';

  h+='<div style="font-size:12.5px;color:var(--ink-mute);margin:14px 0 4px">음원(선택)</div>';
  h+='<div id="cm-audiodrop" style="border:1.5px dashed var(--line-strong);border-radius:10px;padding:6px;min-height:40px">'
    +'<div id="cm-audio"></div>'
    +'</div>';
  h+='<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">'
    +'<button class="btn ghost sm" onclick="pickCmAudio()">📁 폴더에서 선택</button>'
    +'<button class="btn ghost sm" onclick="pickCmAudioDrive()">☁️ 구글드라이브에서 가져오기</button>'
    +'</div>';

  h+='<button class="btn btn-ai wide" style="margin-top:12px" onclick="organizeCmEntry()">🤖 AI로 정리해서 히스토리에 추가</button>';
  h+='<div class="meta" style="margin-top:4px">음원을 올리면 받아쓰기해서 함께 정리해요(짧은 음원용). 텍스트만 적어도 정리할 수 있어요.</div>';

  h+='<div class="divider"></div>';
  // 2026-09-06: 예전엔 Q&A 버튼이 히스토리 목록보다 위에 있었음 — jam님 요청으로 목록 아래로 이동.
  const hist=(c.history||[]).slice().sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  h+='<label class="f">히스토리 ('+hist.length+')</label>';
  if(!hist.length){ h+='<div class="stage-note">아직 기록이 없습니다.</div>'; }
  hist.forEach(item=>{ h+=cmHistoryCard(item); });

  h+='<div class="divider"></div>';
  h+='<button class="btn btn-ai wide" onclick="openCmQna()">🤖 이 고객 히스토리로 Q&A 물어보기</button>';
  h+='<div class="meta" style="margin:4px 0 2px">저장된 기록만 근거로 답해요. 예) "지난달에 통화했을 때 반응 어땠어?" · "다음에 만나면 뭘 챙겨가면 좋을까?"</div>';

  body.innerHTML=h;
  renderCmAudio();
  const textDrop=document.getElementById('cm-textdrop');
  if(textDrop) enableDrop(textDrop, handleCmDropFile, f=>(f.type&&f.type.indexOf('text')===0)||/\.txt$/i.test(f.name||''));
  const audioDrop=document.getElementById('cm-audiodrop');
  if(audioDrop) enableDrop(audioDrop, attachCmAudioFile, f=>(f.type&&f.type.indexOf('audio')===0)||/\.(mp3|m4a|wav|aac|ogg|webm|caf|amr)$/i.test(f.name||''));
}

// 2026-09-06: 카드 한 장에 제목·날짜·요약이 따로따로 줄을 차지해서 목록이 길어 보였음 —
// jam님 요청대로 "날짜+제목" 한 줄, "요약 미리보기" 한 줄, 딱 두 줄로 간략하게 정리.
// 클릭하면 기존대로 viewCmHistory()가 상세 내용 창을 띄운다.
function cmDateShort(at){
  const m=String(at||'').match(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})/);
  return m ? (m[1]+'/'+m[2]+' '+m[3]) : (at||'');
}
function cmHistoryCard(item){
  const icon = item.source==='ap' ? '🗣️' : (item.hadAudio ? '🎤' : '📝');
  const preview=(item.summary||'(내용 없음)').replace(/\s*\n+\s*/g,' · ').trim();
  // .meta는 display:flex라 한 줄 말줄임(ellipsis)이랑 안 맞아서, 여기서는 색만 맞춰 직접 스타일 지정.
  // 2026-09-06: 상세보기에 가야만 삭제할 수 있던 걸, 목록 카드에서도 바로 지울 수 있게 우측에
  // ✕ 버튼 추가. event.stopPropagation()으로 카드 클릭(상세보기 열기)과 겹치지 않게 분리.
  return '<div class="card tap" style="margin-bottom:8px;padding:11px 13px;position:relative" onclick="viewCmHistory(\''+item.id+'\')">'
    +'<div style="display:flex;align-items:baseline;gap:6px;font-size:14px;font-weight:700;color:var(--ink);overflow:hidden;white-space:nowrap;padding-right:28px">'
      +'<span style="flex-shrink:0">'+icon+'</span>'
      +'<span style="flex-shrink:0;font-weight:600;font-size:12px;color:var(--ink-mute)">'+esc(cmDateShort(item.at))+'</span>'
      +'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(item.title||'(제목 없음)')+'</span>'
    +'</div>'
    +'<div style="margin-top:3px;font-size:12px;color:var(--ink-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:28px">'+esc(preview)+'</div>'
    +'<button onclick="event.stopPropagation();deleteCmHistory(\''+item.id+'\')" title="삭제" style="position:absolute;top:6px;right:6px;width:28px;height:28px;background:none;border:none;color:var(--ink-mute);font-size:16px;cursor:pointer;line-height:1;border-radius:50%">✕</button>'
  +'</div>';
}
function viewCmHistory(id){
  const c=customers.find(x=>x.id===cmCustId); if(!c) return;
  const item=(c.history||[]).find(x=>x.id===id); if(!item) return;
  let h='<div class="meta" style="margin-bottom:10px">'+esc(item.at||'')+'</div>';
  if(item.reaction) h+='<div style="font-size:13px;font-weight:700;color:#0B7A5C;background:#E6F8F0;border-radius:9px;padding:8px 11px;margin-bottom:12px">🎯 반응·관심도: '+esc(item.reaction)+'</div>';
  h+='<div style="white-space:pre-wrap;font-size:14px;line-height:1.75;color:var(--ink)">'+esc(item.summary||'(내용 없음)')+'</div>';
  if(item.rawText) h+='<div style="font-weight:700;margin:16px 0 4px">원문</div><div style="white-space:pre-wrap;font-size:13px;line-height:1.7;color:var(--ink-mute)">'+esc(item.rawText)+'</div>';
  h+='<div class="row" style="margin-top:16px"><button class="btn danger sm" onclick="deleteCmHistory(\''+id+'\')">이 기록 삭제</button></div>';
  openSubPage(item.title||'기록', h);
}
async function deleteCmHistory(id){
  if(!confirm('이 기록을 삭제할까요?')) return;
  const c=customers.find(x=>x.id===cmCustId); if(!c) return;
  c.history=(c.history||[]).filter(x=>x.id!==id);
  await idbPut('customers',c); customers=await idbAll('customers');
  closeSheet('ov-subpage');
  renderCmBody();
  toast('✓ 삭제했습니다'); setTimeout(toastHide,1200);
}

/* ---- 새 기록 입력(텍스트·음원) ---- */
function syncCmFields(){
  const ta=document.getElementById('cm-rawtext');
  _cmPending=_cmPending||{rawText:'',audio:null};
  if(ta) _cmPending.rawText=ta.value;
}
function handleCmDropFile(file){
  if(!file) return;
  const isAudio=(file.type&&file.type.indexOf('audio')===0) || /\.(mp3|m4a|wav|aac|ogg|webm|caf|amr)$/i.test(file.name||'');
  if(isAudio){ attachCmAudioFile(file); return; }
  appendCmText(file);
}
async function appendCmText(file){
  try{
    const full=(await file.text()||'').trim();
    if(!full){ alert('파일에서 읽을 텍스트가 없습니다. (텍스트(.txt) 파일만 여기서 지원해요, 음원은 아래 음원 칸에)'); return; }
    syncCmFields();
    _cmPending.rawText = _cmPending.rawText ? (_cmPending.rawText+'\n\n'+full) : full;
    const ta=document.getElementById('cm-rawtext'); if(ta) ta.value=_cmPending.rawText;
  }catch(err){ alert('파일 처리 실패: '+(err&&err.message?err.message:err)); }
}
function pickCmAudio(){
  const inp=document.getElementById('audio-input'); inp.value='';
  inp.onchange=async e=>{const f=e.target.files&&e.target.files[0]; inp.onchange=null; if(!f) return; await attachCmAudioFile(f);};
  inp.click();
}
// 2026-09-06: pools.js pickPoolText()/advisor.js pickAdminPoolText()와 같은 방식 — 공용 숨김
// input(#txt-input)을 재사용해 폴더에서 텍스트 파일을 골라 넣는다.
function pickCmText(){
  const inp=document.getElementById('txt-input'); inp.value='';
  inp.onchange=async e=>{const f=e.target.files&&e.target.files[0]; inp.onchange=null; if(!f) return; await appendCmText(f);};
  inp.click();
}
/* ---- 구글 드라이브 연동 (2026-09-06) ----
   jam님이 Google Cloud Console에서 직접 발급받은 값. API 키·클라이언트 ID는 카카오 JS키처럼
   웹페이지 코드에 그대로 들어가도 되는 값(도메인 제한을 걸어뒀음) — 절대 비밀로 지켜야 하는
   "클라이언트 보안 비밀"은 이 방식(웹 애플리케이션)에서는 아예 안 쓴다.
   scope는 drive.file — 사용자가 Picker에서 직접 고른 파일에만 접근(드라이브 전체를 보는 권한 아님). */
const GOOGLE_API_KEY='AIzaSyAnDQTfDa0YpvcJnXgxGZR931qYbrDfKWg';
const GOOGLE_CLIENT_ID='161287319413-3qlg5ug6ltmch0ag8csb40rbhhoapgsl.apps.googleusercontent.com';
const GOOGLE_APP_ID='161287319413';
const GOOGLE_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
let _gpPickerInited=false, _gpGisInited=false, _gpTokenClient=null, _gpAccessToken=null;
// 2026-09-06: 처음엔 음원 전용이었는데, 텍스트(.txt) 파일도 구글드라이브에서 가져올 수 있게
// 확장하면서 "이번엔 뭘 가져오는 중인지"를 이 변수로 구분한다. 'audio' | 'text'.
let _gpDriveTarget='audio';

/* index.html의 <script onload="onGoogleApiLoad()">/<script onload="onGoogleGisLoad()"> 에서 호출됨. */
function onGoogleApiLoad(){ if(window.gapi) gapi.load('picker', ()=>{ _gpPickerInited=true; }); }
function onGoogleGisLoad(){
  if(!window.google || !google.accounts || !google.accounts.oauth2) return;
  _gpTokenClient=google.accounts.oauth2.initTokenClient({ client_id:GOOGLE_CLIENT_ID, scope:GOOGLE_DRIVE_SCOPE, callback:'' });
  _gpGisInited=true;
}

function pickCmAudioDrive(){ _gpDriveTarget='audio'; requestGoogleDrivePicker(); }
function pickCmTextDrive(){ _gpDriveTarget='text'; requestGoogleDrivePicker(); }
function requestGoogleDrivePicker(){
  if(!_gpPickerInited || !_gpGisInited){
    alert('구글 드라이브 연동을 불러오는 중이에요. 인터넷 연결을 확인하고 3~5초 뒤 다시 눌러주세요. 계속 안 되면 새로고침 해보세요.');
    return;
  }
  _gpTokenClient.callback=(resp)=>{
    if(resp.error){ toast('구글 로그인/권한 요청이 취소됐어요'); setTimeout(toastHide,1800); return; }
    _gpAccessToken=resp.access_token;
    showGoogleDrivePicker();
  };
  // 처음 연결할 땐 항상 동의 화면을 보여주고, 이미 허용한 세션이면 다시 안 물어본다.
  _gpTokenClient.requestAccessToken({prompt: _gpAccessToken===null ? 'consent' : ''});
}

function showGoogleDrivePicker(){
  const view=new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false);
  const picker=new google.picker.PickerBuilder()
    .setOAuthToken(_gpAccessToken)
    .setDeveloperKey(GOOGLE_API_KEY)
    .setAppId(GOOGLE_APP_ID)
    .addView(view)
    .setCallback(onGoogleDrivePicked)
    .build();
  picker.setVisible(true);
}

/* 사용자가 Picker에서 파일을 고르면, Drive API로 그 파일의 실제 내용을 내려받는다.
   _gpDriveTarget에 따라 음원은 attachCmAudioFile()로, 텍스트는 appendCmText()로 넘긴다
   (드래그&드롭·폴더선택과 이후 흐름이 동일). */
async function onGoogleDrivePicked(data){
  if(data[google.picker.Response.ACTION]!==google.picker.Action.PICKED) return;
  const doc=data[google.picker.Response.DOCUMENTS][0]; if(!doc) return;
  const fileId=doc[google.picker.Document.ID];
  const name=doc[google.picker.Document.NAME]||'파일';
  const mime=doc[google.picker.Document.MIME_TYPE]||'';
  const target=_gpDriveTarget;

  if(target==='text'){
    const isTextLike=(mime.indexOf('text')===0) || /\.(txt|md|csv)$/i.test(name);
    if(!isTextLike && !confirm('선택한 파일("'+name+'")이 텍스트 파일이 아닌 것 같아요. 그래도 가져올까요?')) return;
  } else {
    const isAudio=(mime.indexOf('audio')===0) || /\.(mp3|m4a|wav|aac|ogg|webm|caf|amr)$/i.test(name);
    if(!isAudio && !confirm('선택한 파일("'+name+'")이 음원 파일이 아닌 것 같아요. 그래도 가져올까요?')) return;
  }

  toast('구글 드라이브에서 가져오는 중…');
  try{
    const res=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media', {
      headers:{ 'Authorization':'Bearer '+_gpAccessToken }
    });
    if(!res.ok) throw new Error('다운로드 실패(상태 '+res.status+')');
    const blob=await res.blob();
    toastHide();
    if(target==='text') await appendCmText(blob);
    else await attachCmAudioFile(blob);
    toast('✓ 구글 드라이브에서 "'+name+'" 가져왔어요'); setTimeout(toastHide,2000);
  }catch(err){
    toastHide();
    alert('구글 드라이브에서 파일을 가져오지 못했어요: '+(err&&err.message?err.message:err));
  }
}
async function attachCmAudioFile(file){
  syncCmFields();
  const rid=uid();
  await idbPut('images',{id:rid,kind:'음원',blob:file,created:today()});
  if(_cmPending.audio) await idbDel('images',_cmPending.audio);
  _cmPending.audio=rid;
  renderCmAudio();
}
function renderCmAudio(){
  const wrap=document.getElementById('cm-audio'); if(!wrap) return;
  const p=_cmPending;
  if(p&&p.audio){
    idbGet('images',p.audio).then(rec=>{
      wrap.innerHTML='';
      if(rec&&rec.blob){
        const a=document.createElement('audio'); a.controls=true; a.style.width='100%'; a.src=blobUrl(rec.blob);
        wrap.appendChild(a);
        const del=document.createElement('button'); del.className='btn ghost sm'; del.style.marginTop='6px';
        del.textContent='음원 지우기'; del.onclick=removeCmAudio; wrap.appendChild(del);
      } else { wrap.innerHTML='<div class="meta">아직 올린 음원이 없습니다.</div>'; }
    });
  } else { wrap.innerHTML='<div class="meta">아직 올린 음원이 없습니다.</div>'; }
}
async function removeCmAudio(){
  if(_cmPending&&_cmPending.audio){ await idbDel('images',_cmPending.audio); _cmPending.audio=null; }
  renderCmAudio();
}

/* ---- AI로 정리 → 히스토리 항목 추가 ---- */
async function organizeCmEntry(){
  const c=customers.find(x=>x.id===cmCustId); if(!c) return;
  syncCmFields();
  const p=_cmPending||{rawText:'',audio:null};
  const src=(p.rawText||'').trim();

  let audioBase64='';
  if(p.audio){
    try{
      const rec=await idbGet('images',p.audio);
      if(rec&&rec.blob){
        const mb=rec.blob.size/(1024*1024);
        if(mb>20){
          // 2026-09-06: 예전엔 음원이 크면 텍스트가 같이 있어도 그냥 통째로 멈췄음 — jam님 요청으로
          // 텍스트가 있으면 "음원은 빼고 텍스트만이라도" 자동 진행할지 물어보게 바꿈.
          if(src && confirm('음원이 너무 큽니다(약 '+mb.toFixed(1)+'MB). 20MB 이하 음원만 지원해요.\n\n음원은 빼고 텍스트만 정리할까요?')){
            // audioBase64는 빈 채로 두고 아래 텍스트만으로 계속 진행.
          } else {
            if(!src) alert('음원이 너무 큽니다(약 '+mb.toFixed(1)+'MB). 20MB 이하 음원만 지원해요.');
            return;
          }
        } else {
          if(mb>5 && !confirm('이 음원은 좀 큰 편이에요(약 '+mb.toFixed(1)+'MB). 받아쓰기가 실패하거나 앞부분만 인식될 수 있어요.\n\n그래도 진행할까요?')) return;
          const durl=await blobToDataURL(rec.blob);
          audioBase64=String(durl).split(',')[1]||'';
        }
      }
    }catch(e){ /* 음원을 못 읽으면 텍스트만으로 진행 */ }
  }
  if(!src && !audioBase64){ alert('메모를 적거나 음원을 올려주세요.'); return; }

  const _pg=startProgress(pc=>toast((audioBase64?'음원 받아쓰기·정리 중… ':'AI로 정리 중… ')+pc+'%'));
  try{
    const d=await aiOrganizeHistory(src, audioBase64);
    _pg.done(); toastHide();
    const entry={
      id:'h_'+uid(),
      at: now(),
      title: (d.title||'').trim() || '기록',
      summary: d.summary||'',
      // 2026-09-06: 받아쓰기 글에 남아있는 어조 단서(망설임·반복질문·즉각 반응 등)로 AI가 읽은
      // 관심도·반응을 별도 필드로 저장 — Q&A에서 "반응이 어땠어?" 같은 질문에 답할 근거가 됨.
      reaction: (d.reaction||'').trim(),
      rawText: d.transcript ? ((src?src+'\n\n':'')+'[음원 인식 내용]\n'+d.transcript) : src,
      hadAudio: !!audioBase64,
      source:'call'
    };
    c.history=c.history||[];
    c.history.push(entry);
    if(p.audio) await idbDel('images',p.audio); // 정리 끝났으니 음원 원본은 지워 기기 용량 절약(요약·원문 텍스트는 남음)
    await idbPut('customers',c); customers=await idbAll('customers');
    _cmPending=null;
    renderCmBody();
    toast('✓ 히스토리에 추가했습니다'); setTimeout(toastHide,1800);
  }catch(err){ _pg.done(); toastHide(); alert('AI 정리 실패: '+(err&&err.message?err.message:err)); }
}

/* 서버(functions/api/analyze.js, mode:'organize_history')에 텍스트/음원을 보내
   {title, summary, transcript} 를 받아온다. organize_pool(관리자 전용)과 달리 이건
   담당자 개인 고객 자료라 일반 담당자 로그인(advisorId/advisorPw)으로 인증한다. */
async function aiOrganizeHistory(text, audioBase64){
  if(!cloudOn) throw new Error('AI 정리 기능은 로그인 후 사용할 수 있습니다.');
  const body={pw:cloudPW, advisorId, advisorPw, mode:'organize_history', text};
  if(audioBase64) body.audioBase64=audioBase64;
  const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const raw=await res.text();
  let data;
  try{ data=JSON.parse(raw); }
  catch(e){
    throw new Error('서버 응답이 올바르지 않습니다(정상적인 결과가 아니라 오류 페이지가 돌아왔어요). '
      +'음원 파일이 너무 크거나 길어서 처리 시간이 오래 걸려 서버 쪽에서 중간에 끊겼을 가능성이 높습니다. '
      +'음원을 더 짧게 나누거나, 음원 없이 텍스트만 넣고 다시 시도해보세요. (상태 코드 '+res.status+')');
  }
  if(!res.ok) throw new Error(data.error||'정리 실패');
  if(typeof addUsage==='function') addUsage(data._usage,'고객관리 정리');
  return data;
}

/* ---- Q&A 코너 (2026-09-06, 6탭 개편 4단계) ----
   저장된 히스토리 요약(summary)만 근거로 자유 질문에 답한다. 원문(rawText)은 안 보내고,
   최근 항목 위주로 글자 수를 제한해서(6000자) 히스토리가 쌓여도 비용이 크게 안 늘게 한다. */
function openCmQna(){
  const c=customers.find(x=>x.id===cmCustId); if(!c) return;
  const hist=(c.history||[]);
  if(!hist.length){ alert('아직 히스토리 기록이 없어서 물어볼 내용이 없어요. 먼저 위에서 통화·상담 기록을 몇 개 쌓아주세요.'); return; }
  let h='<div class="meta" style="margin-bottom:10px">'+esc(c.name)+' 고객의 히스토리 기록(총 '+hist.length+'건)만 근거로 답해요. 기록에 없는 내용은 "확인 안 됨"이라고 답해요.</div>';
  h+='<textarea class="t" id="cm-qna-q" rows="3" placeholder="예) 지난번에 통화했을 때 반응이 어땠어? / 다음에 만나면 뭘 챙겨가면 좋을까?"></textarea>';
  h+='<button class="btn btn-ai wide" style="margin-top:8px" onclick="askCmQna()">🤖 물어보기</button>';
  h+='<div id="cm-qna-answer" style="margin-top:16px"></div>';
  openSubPage('Q&A · '+c.name, h);
}
async function askCmQna(){
  const c=customers.find(x=>x.id===cmCustId); if(!c) return;
  const qEl=document.getElementById('cm-qna-q');
  const q=(qEl&&qEl.value||'').trim();
  if(!q){ alert('질문을 입력하세요.'); return; }
  const box=document.getElementById('cm-qna-answer');
  if(box) box.innerHTML='<div class="meta">답변 생각하는 중…</div>';
  try{
    const historyText=buildCmHistoryText(c);
    const d=await aiCmHistoryQna(historyText, q);
    if(box) box.innerHTML='<div style="white-space:pre-wrap;font-size:14px;line-height:1.75;color:var(--ink);padding:12px;background:var(--paper2,var(--paper));border:1px solid var(--line);border-radius:10px">'+esc(d.answer||'(답변 없음)')+'</div>';
  }catch(err){
    if(box) box.innerHTML='<div class="meta" style="color:#C0392B">답변 실패: '+esc(err&&err.message?err.message:String(err))+'</div>';
  }
}
/* 최신 항목부터 6000자 예산 안에서 채우고, 다시 오래된 순으로 정렬해 흐름대로 읽히게 한다. */
function buildCmHistoryText(c){
  const hist=(c.history||[]).slice().sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  const chosen=[]; let total=0;
  for(const item of hist){
    const block='['+(item.at||'')+'] '+(item.title||'')+'\n'+(item.summary||'')+(item.reaction?('\n반응: '+item.reaction):'')+'\n\n';
    if(total+block.length>6000) break;
    chosen.push(block); total+=block.length;
  }
  return chosen.reverse().join('').trim();
}
async function aiCmHistoryQna(historyText, question){
  if(!cloudOn) throw new Error('Q&A 기능은 로그인 후 사용할 수 있습니다.');
  const body={pw:cloudPW, advisorId, advisorPw, mode:'history_qna', historyText, question};
  const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const raw=await res.text();
  let data;
  try{ data=JSON.parse(raw); }
  catch(e){ throw new Error('서버 응답이 올바르지 않습니다(오류 페이지가 돌아왔어요). 상태 코드 '+res.status); }
  if(!res.ok) throw new Error(data.error||'답변 실패');
  if(typeof addUsage==='function') addUsage(data._usage,'고객관리 Q&A');
  return data;
}
