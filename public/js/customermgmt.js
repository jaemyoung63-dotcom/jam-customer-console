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
  const hist=(c.history||[]).slice().sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  h+='<label class="f">히스토리 ('+hist.length+')</label>';
  if(!hist.length){ h+='<div class="stage-note">아직 기록이 없습니다.</div>'; }
  hist.forEach(item=>{ h+=cmHistoryCard(item); });

  body.innerHTML=h;
  renderCmAudio();
  const textDrop=document.getElementById('cm-textdrop');
  if(textDrop) enableDrop(textDrop, handleCmDropFile, f=>(f.type&&f.type.indexOf('text')===0)||/\.txt$/i.test(f.name||''));
  const audioDrop=document.getElementById('cm-audiodrop');
  if(audioDrop) enableDrop(audioDrop, attachCmAudioFile, f=>(f.type&&f.type.indexOf('audio')===0)||/\.(mp3|m4a|wav|aac|ogg|webm|caf|amr)$/i.test(f.name||''));
}

function cmHistoryCard(item){
  const icon = item.source==='ap' ? '🗣️' : (item.hadAudio ? '🎤' : '📝');
  return '<div class="card tap" style="margin-bottom:10px" onclick="viewCmHistory(\''+item.id+'\')">'
    +'<div class="row" style="margin-bottom:4px;align-items:center"><span class="name" style="font-size:15px">'+icon+' '+esc(item.title||'(제목 없음)')+'</span></div>'
    +'<div class="meta" style="margin-top:2px;white-space:pre-wrap;max-height:44px;overflow:hidden">'+esc((item.summary||'').slice(0,120))+'</div>'
    +'<div class="meta" style="margin-top:6px">'+(item.at||'')+'</div></div>';
}
function viewCmHistory(id){
  const c=customers.find(x=>x.id===cmCustId); if(!c) return;
  const item=(c.history||[]).find(x=>x.id===id); if(!item) return;
  let h='<div class="meta" style="margin-bottom:10px">'+esc(item.at||'')+'</div>';
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
function pickCmAudioDrive(){
  alert('구글드라이브에서 바로 가져오기는 아직 준비 중이에요(구글 계정 연동 설정이 추가로 필요해요).\n\n지금은 구글드라이브 앱에서 음원 파일을 기기로 내려받은 뒤, "📁 폴더에서 선택"으로 올려주세요.');
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
        if(mb>20){ alert('음원이 너무 큽니다(약 '+mb.toFixed(1)+'MB). 20MB 이하 음원만 지원해요.'); return; }
        if(mb>5){ if(!confirm('이 음원은 좀 큰 편이에요(약 '+mb.toFixed(1)+'MB). 받아쓰기가 실패하거나 앞부분만 인식될 수 있어요.\n\n그래도 진행할까요?')) return; }
        const durl=await blobToDataURL(rec.blob);
        audioBase64=String(durl).split(',')[1]||'';
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
