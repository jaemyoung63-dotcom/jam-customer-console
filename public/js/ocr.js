/* ---------- OCR (앱 내장) ---------- */
let tessLoading=null;
function ensureTesseract(){
  if(window.Tesseract) return Promise.resolve();
  if(tessLoading) return tessLoading;
  tessLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload=()=>res();
    s.onerror=()=>{tessLoading=null; rej(new Error('OCR 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.'));};
    document.head.appendChild(s);
  });
  return tessLoading;
}
let pdfLoading=null;
function ensurePdfjs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(pdfLoading) return pdfLoading;
  pdfLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); }catch(e){ pdfLoading=null; rej(e); } };
    s.onerror=()=>{ pdfLoading=null; rej(new Error('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
    document.head.appendChild(s);
  });
  return pdfLoading;
}
function isPdfFile(f){ return !!f && (f.type==='application/pdf' || /\.pdf$/i.test(f.name||'')); }
async function pdfToImageBlobs(file, onProgress){
  const pdfjs=await ensurePdfjs();
  const buf=await file.arrayBuffer();
  const pdf=await pdfjs.getDocument({data:buf}).promise;
  const out=[]; const maxPages=Math.min(pdf.numPages, 15);
  for(let n=1;n<=maxPages;n++){
    if(onProgress) onProgress(n,maxPages);
    const page=await pdf.getPage(n);
    const vp0=page.getViewport({scale:1});
    const scale=Math.min(1568/vp0.width, 2.2);
    const vp=page.getViewport({scale});
    const cv=document.createElement('canvas'); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    await page.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise;
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9));
    if(blob) out.push(blob);
  }
  return out;
}
/* PDF 텍스트 레이어 추출 (디지털 텍스트 또는 스캔본의 OCR 레이어를 그대로 읽음) */
async function extractPdfText(file, maxPages){
  const pdfjs=await ensurePdfjs();
  const buf=await file.arrayBuffer();
  const pdf=await pdfjs.getDocument({data:buf}).promise;
  const N=Math.min(pdf.numPages, maxPages||15);
  const parts=[];
  for(let n=1;n<=N;n++){
    const page=await pdf.getPage(n);
    const tc=await page.getTextContent();
    const line=tc.items.map(it=>it.str).join(' ').replace(/[ \t]+/g,' ').trim();
    if(line) parts.push(line);
  }
  return parts.join('\n\n').trim();
}
/* PDF 종류 판별: 앞쪽 표본 페이지에서 텍스트 레이어 유무 + 전면 이미지(스캔) 여부 확인
   반환 {pages, textLen, perPage, hasText, hasImage} — hasText=요약에 쓸 텍스트 레이어 존재 */
async function pdfTextInfo(file, sampleN){
  const pdfjs=await ensurePdfjs();
  const buf=await file.arrayBuffer();
  const pdf=await pdfjs.getDocument({data:buf}).promise;
  const sample=Math.min(pdf.numPages, sampleN||3);
  let textLen=0, imgHits=0;
  for(let n=1;n<=sample;n++){
    const page=await pdf.getPage(n);
    const tc=await page.getTextContent();
    textLen += tc.items.reduce((s,it)=>s+((it.str||'').length),0);
    try{
      const ops=await page.getOperatorList(), OPS=pdfjs.OPS;
      if(ops.fnArray.some(fn=>fn===OPS.paintImageXObject||fn===OPS.paintJpegXObject||fn===OPS.paintImageXObjectRepeat||fn===OPS.paintInlineImageXObject)) imgHits++;
    }catch(e){}
  }
  const perPage=textLen/sample;
  return {pages:pdf.numPages, textLen, perPage, hasText:perPage>=30, hasImage:imgHits>=1};
}
function toast(msg){ let t=document.getElementById('toast'); if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); } t.textContent=msg; t.classList.add('show'); }
function toastHide(){ const t=document.getElementById('toast'); if(t) t.classList.remove('show'); }
async function addPdfInto(file, arr, kind, renderFn, saveObj){
  try{
    toast('PDF 여는 중…');
    const blobs=await pdfToImageBlobs(file, (n,N)=>toast('PDF 페이지 변환 중… '+n+'/'+N));
    for(const b of blobs){ const rid=uid(); await idbPut('images',{id:rid,kind:kind||'기타',blob:b,created:today()}); arr.push(rid); }
    if(saveObj){ try{ await idbPut('customers',saveObj); }catch(e){} }
    toastHide();
    if(renderFn) await renderFn();
    if(!blobs.length) alert('PDF에서 페이지를 읽지 못했습니다.');
  }catch(err){ toastHide(); alert('PDF 처리 실패: '+(err&&err.message?err.message:err)); }
}
async function runOCR(){
  if(!editingCust.images||!editingCust.images.length){alert('먼저 보장 이미지를 추가하세요. 가린 이미지에서 개인정보를 뺀 문자만 추출됩니다.'); return;}
  const btn=document.getElementById('ocr-btn'), prog=document.getElementById('ocr-progress');
  btn.disabled=true; btn.style.opacity=.6; prog.style.display='block'; prog.textContent='OCR 엔진 준비 중… (처음 한 번은 다운로드로 시간이 걸립니다)';
  try{
    await ensureTesseract();
    const n=editingCust.images.length; const groups={'보장급부':[],'내보장자산':[],'기타':[]};
    for(let i=0;i<n;i++){
      const rec=await idbGet('images',editingCust.images[i]); if(!rec||!rec.blob) continue;
      const url=URL.createObjectURL(rec.blob);
      const res=await Tesseract.recognize(url,'kor+eng',{logger:m=>{
        if(m.status==='recognizing text') prog.textContent='이미지 '+(i+1)+'/'+n+' 인식 중 '+Math.round((m.progress||0)*100)+'%';
        else prog.textContent='이미지 '+(i+1)+'/'+n+' 준비 중…';
      }});
      URL.revokeObjectURL(url);
      const kind=(rec.kind && groups[rec.kind])?rec.kind:'기타';
      const txt=(res.data.text||'').trim(); if(txt) groups[kind].push(txt);
    }
    let blocks=[];
    ['보장급부','내보장자산','기타'].forEach(k=>{ if(groups[k].length) blocks.push('['+k+']\n'+groups[k].join('\n')); });
    const joined=blocks.join('\n\n');
    const ta=document.getElementById('c-coverage');
    ta.value = ta.value ? (ta.value+'\n\n'+joined) : joined;
    prog.textContent='추출 완료. 종류별로 묶었어요. "AI로 정리"를 누르면 깔끔하게 다듬습니다. 정리 후에도 숫자는 원본과 대조하세요.';
  }catch(err){ prog.textContent=(err&&err.message)?err.message:'OCR 중 오류가 발생했습니다.'; }
  btn.disabled=false; btn.style.opacity=1;
}
async function tidyCoverage(confirmations){
  const ta=document.getElementById('c-coverage');
  const imgs=editingCust.images||[];
  if(!imgs.length){alert('먼저 보장 자료 이미지를 추가하세요.'); return;}
  if(!cloudOn){alert('AI 정리 기능은 로그인 후 사용할 수 있습니다.'); return;}
  const tq=document.getElementById('tidy-questions'); if(tq) tq.innerHTML='';
  const btn=document.getElementById('tidy-btn'), prog=document.getElementById('tidy-progress');
  btn.disabled=true; btn.style.opacity=.6; prog.style.display='block';
  try{
    // 사진을 AI 비전이 직접 판독 (Tesseract 없이 정확도↑)
    const n=Math.min(imgs.length, 12);
    const items=[];
    for(let i=0;i<n;i++){
      prog.textContent='사진 준비 중… '+(i+1)+'/'+n;
      const rec=await idbGet('images',imgs[i]); if(!rec||!rec.blob) continue;
      let b64=''; try{ b64=await blobToScaledBase64(rec.blob, 1568, 0.92); }catch(e){}
      if(b64) items.push({kind:(rec.kind||'기타'), media_type:'image/jpeg', data:b64});
    }
    if(!items.length){ prog.textContent='사진을 읽지 못했습니다. 다시 등록해 주세요.'; btn.disabled=false; btn.style.opacity=1; return; }
    const _pg=startProgress(p=>{ prog.textContent='AI가 사진을 직접 판독·정리 중… '+p+'%'+(imgs.length>12?' (앞 12장)':''); });
    const res=await fetch(ANALYZE_URL,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pw:cloudPW, advisorId, advisorPw, mode:'tidy', images:items, confirmations:confirmations||'', custName:editingCust.name||'', custAge:(editingCust.ageNum?editingCust.ageNum+'세':'')})});
    const rawResp=await res.text(); _pg.done();
    let data;
    try{ data=JSON.parse(rawResp); }
    catch(e){
      prog.textContent='서버 응답 이상 (HTTP '+res.status+'). 본문: '+(rawResp?rawResp.slice(0,400):'(빈 응답)');
      btn.disabled=false; btn.style.opacity=1; return;
    }
    if(!res.ok){prog.textContent='정리 실패: '+(data.error||'오류')+' (HTTP '+res.status+')'; btn.disabled=false; btn.style.opacity=1; return;}
    const txt=(data.text||'').trim();
    const qn=(data.questions&&data.questions.length)||0;
    if(txt){ ta.value=data.text;
      editingCust.coverageHistory=editingCust.coverageHistory||[];
      editingCust.coverageHistory.unshift({at:now(), text:data.text});
      if(editingCust.coverageHistory.length>30) editingCust.coverageHistory=editingCust.coverageHistory.slice(0,30);
      editingCust.coverageText=data.text;
      if(editingCust.id){ try{ await idbPut('customers',editingCust); }catch(e){} }
    }
    // 부가 처리는 각각 격리 — 여기서 오류가 나도 결과 표시에 영향 없음
    try{ addUsage(data._usage,'보장 정리(비전)'); }catch(e){}
    try{ refreshCoverageUI(); }catch(e){}
    try{ renderTidyQuestions(data.questions||[]); }catch(e){}
    prog.textContent = txt
      ? ('정리·분석 완료 (본문 '+txt.length+'자'+(qn?(' · 확인질문 '+qn+'개'):'')+')'+((data._debug&&data._debug.stop_reason==='max_tokens')?' ⚠ 길어서 일부 잘렸을 수 있어요':'')+'. 아래 "AI 정리 기록"을 눌러 확인하세요. 숫자·회사명은 원본과 대조하세요.')
      : ('응답은 받았으나 정리 본문이 비어 있습니다 (HTTP '+res.status+' · 질문 '+qn+'개). '+(data._debug?('[진단: 중단='+data._debug.stop_reason+' · 블록='+data._debug.blocks+'('+(data._debug.types||[]).join(',')+') · 출력토큰='+data._debug.out_tokens+' · 입력토큰='+data._debug.in_tokens+' · 사진='+data._debug.img_count+']'):'')+' 다시 시도하거나 이 문구를 캡처해 주세요.');
  }catch(err){
    prog.textContent='정리 요청 실패: '+((err&&err.message)?err.message:String(err));
  }
  btn.disabled=false; btn.style.opacity=1;
}

let redState=null;
function pickImage(){
  const inp=document.getElementById('img-input');
  inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addImageDirect(f); }
  };
  inp.click();
}
function pickCamera(){
  const inp=document.getElementById('cam-input');
  inp.value='';
  inp.onchange=async e=>{const fs=e.target.files?Array.from(e.target.files):[]; inp.onchange=null;
    for(const f of fs){ await addImageDirect(f); }
  };
  inp.click();
}
function addImageDirect(file){
  const kind=editingCust.docKind||'보장급부';
  if(isPdfFile(file)){ editingCust.images=editingCust.images||[]; return addPdfInto(file, editingCust.images, kind, renderThumbs, null); }
  return new Promise(res=>{
    const reader=new FileReader();
    reader.onerror=()=>{alert('사진을 읽지 못했습니다.'); res();};
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>{alert('이미지를 열 수 없습니다. HEIC 등은 JPG로 저장해 올려주세요.'); res();};
      img.onload=()=>{
        try{
          const MAX=1568; let w=img.width,h=img.height;
          if(Math.max(w,h)>MAX){const r=MAX/Math.max(w,h); w=Math.round(w*r); h=Math.round(h*r);}
          const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
          cv.getContext('2d').drawImage(img,0,0,w,h);
          cv.toBlob(async(blob)=>{
            const rid=uid();
            await idbPut('images',{id:rid,kind,blob,created:today()});
            editingCust.images=editingCust.images||[]; editingCust.images.push(rid);
            await renderThumbs(); res();
          },'image/jpeg',0.9);
        }catch(err){ alert('이미지 처리 중 오류: '+(err&&err.message?err.message:err)); res(); }
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function processNextRedact(){ if(!redQueue.length) return; const f=redQueue.shift(); startRedact(f); }
let redQueue=[];
function startRedact(file){
  const reader=new FileReader();
  reader.onerror=()=>alert('사진 파일을 읽지 못했습니다.');
  reader.onload=()=>{
    const img=new Image();
    img.onerror=()=>alert('이미지를 열 수 없습니다. HEIC 등 일부 형식은 지원되지 않을 수 있어요. JPG/PNG로 시도해 주세요.');
    img.onload=()=>{
      try{
        const MAX=1568; let w=img.width,h=img.height;
        if(!w||!h){alert('이미지 크기를 인식하지 못했습니다.'); return;}
        if(Math.max(w,h)>MAX){const r=MAX/Math.max(w,h); w=Math.round(w*r); h=Math.round(h*r);}
        const canvas=document.getElementById('redcanvas'); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
        redState={canvas,ctx,img,w,h,rects:[],drawing:null,start:null,kind:'보장급부'};
        chipGroup(document.getElementById('red-kind'),IMG_KINDS,'보장급부',false,v=>redState.kind=v);
        updateRedCount();
        openSheet('ov-redact');
        bindRedact();
      }catch(err){ alert('가리기 화면 준비 중 오류: '+(err&&err.message?err.message:err)); }
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
}
function redPos(e){
  const c=redState.canvas, r=c.getBoundingClientRect();
  const cx=(e.touches?e.touches[0].clientX:e.clientX)-r.left;
  const cy=(e.touches?e.touches[0].clientY:e.clientY)-r.top;
  const sx=c.width/r.width, sy=c.height/r.height;
  return {x:Math.max(0,Math.min(cx*sx,c.width)), y:Math.max(0,Math.min(cy*sy,c.height))};
}
function redDraw(){
  const {ctx,img,w,h,rects,drawing}=redState;
  ctx.drawImage(img,0,0,w,h);
  ctx.fillStyle='#141410';
  rects.forEach(r=>ctx.fillRect(r.x,r.y,r.w,r.h));
  if(drawing) ctx.fillRect(drawing.x,drawing.y,drawing.w,drawing.h);
}
let redBound=false;
function bindRedact(){
  if(redBound) return; redBound=true;
  const c=document.getElementById('redcanvas');
  c.addEventListener('pointerdown',e=>{const p=redPos(e); redState.start=p; redState.drawing={x:p.x,y:p.y,w:0,h:0}; c.setPointerCapture(e.pointerId);});
  c.addEventListener('pointermove',e=>{ if(!redState||!redState.drawing) return; const p=redPos(e),s=redState.start;
    redState.drawing={x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)}; redDraw();});
  c.addEventListener('pointerup',()=>{ if(!redState||!redState.drawing) return; const d=redState.drawing;
    if(d.w>6&&d.h>6) redState.rects.push(d); redState.drawing=null; redDraw(); updateRedCount();});
}
function updateRedCount(){document.getElementById('red-count').textContent='가린 곳 '+(redState?redState.rects.length:0);}
function redUndo(){if(redState){redState.rects.pop(); redDraw(); updateRedCount();}}
function redClear(){if(redState){redState.rects=[]; redDraw(); updateRedCount();}}
function redTop(){if(redState){redState.rects.push({x:0,y:0,w:redState.w,h:Math.round(redState.h*0.22)}); redDraw(); updateRedCount();}}
function redSave(){
  redState.drawing=null; redDraw();
  redState.canvas.toBlob(async(blob)=>{
    const rid=uid();
    await idbPut('images',{id:rid,kind:redState.kind,blob,created:today()});
    editingCust.images=editingCust.images||[]; editingCust.images.push(rid);
    closeSheet('ov-redact'); renderThumbs();
    if(redQueue.length) setTimeout(processNextRedact, 200);
  },'image/jpeg',0.9);
}

function pickDoc(){
  const inp=document.getElementById('doc-input'); inp.value='';
  inp.onchange=e=>{const f=e.target.files&&e.target.files[0]; inp.onchange=null; if(f) importDoc(f);};
  inp.click();
}
let mammothLoading=null;
function ensureMammoth(){
  if(window.mammoth) return Promise.resolve();
  if(mammothLoading) return mammothLoading;
  mammothLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
    s.onload=()=>res();
    s.onerror=()=>{mammothLoading=null; rej(new Error('문서 처리기를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));};
    document.head.appendChild(s);
  });
  return mammothLoading;
}
async function importDoc(file){
  const prog=document.getElementById('doc-progress'); prog.style.display='block';
  const name=(file.name||'').toLowerCase();
  const kind=editingCust.docKind||'보장급부';
  const append=(txt)=>{const ta=document.getElementById('c-coverage'); const t=(txt||'').trim(); if(!t){prog.textContent='문서에서 읽을 텍스트가 없습니다.'; return;} const block='['+kind+']\n'+t; ta.value = ta.value ? (ta.value+'\n\n'+block) : block; prog.textContent='['+kind+'] 불러오기 완료. 다른 종류도 이어서 불러올 수 있어요. 끝나면 "AI로 정리·분석"을 누르세요.';};
  try{
    if(name.endsWith('.txt')){
      const r=new FileReader(); r.onerror=()=>prog.textContent='파일을 읽지 못했습니다.'; r.onload=()=>append(r.result); r.readAsText(file); return;
    }
    if(name.endsWith('.docx')){
      prog.textContent='워드 문서를 읽는 중…';
      await ensureMammoth();
      const buf=await file.arrayBuffer();
      const result=await window.mammoth.extractRawText({arrayBuffer:buf});
      append(result && result.value ? result.value : '');
      return;
    }
    if(name.endsWith('.pdf')){
      prog.textContent='PDF 텍스트 추출 중…';
      const txt=(await extractPdfText(file)).trim();
      if(txt.length>=30){
        append(txt);
        prog.textContent='['+kind+'] PDF 텍스트 추출 완료. ※ 보장표는 숫자·칸 정렬이 흐트러질 수 있어요 — 정확도가 중요하면 위 "사진 추가"로 PDF를 이미지 첨부한 뒤 "AI 정리·분석"(비전)을 쓰세요.';
      } else {
        prog.textContent='이 PDF는 텍스트 레이어가 없는 스캔본입니다. 위 "사진 추가"로 PDF를 이미지 첨부한 뒤 "AI 정리·분석"(비전)을 이용하세요.';
      }
      return;
    }
    if(name.endsWith('.hwp')){ prog.textContent='한글(.hwp)은 직접 읽을 수 없어요. 워드(.docx)나 텍스트(.txt)로 저장해 올려주세요.'; return; }
    prog.textContent='지원하지 않는 형식입니다. .pdf, .docx 또는 .txt로 올려주세요.';
  }catch(err){ prog.textContent=(err&&err.message)?err.message:'문서를 읽는 중 오류가 발생했습니다.'; }
}

function readCustFields(){
  editingCust.name=document.getElementById('c-name').value.trim();
  editingCust.phone=document.getElementById('c-phone').value.trim();
  editingCust.region=document.getElementById('c-region').value.trim();
  var _g=document.getElementById('c-gender'); if(_g) editingCust.gender=_g.value;
  var _j=document.getElementById('c-job'); if(_j) editingCust.job=_j.value.trim();
  var _a=document.getElementById('c-address'); if(_a) editingCust.address=_a.value.trim();
  var _ad=document.getElementById('c-address-detail'); if(_ad) editingCust.addressDetail=_ad.value.trim();
  var _rb=document.getElementById('c-rrn-back'); if(_rb) editingCust.rrnBack=_rb.value.replace(/\D/g,'').slice(0,7);
  editingCust.memo=document.getElementById('c-memo').value.trim();
  editingCust.coverageText=document.getElementById('c-coverage').value.trim();
  editingCust.age=document.getElementById('c-age').value;
  editingCust.birth6=(document.getElementById('c-birth6').value||'').replace(/\D/g,'').slice(0,6);
  editingCust.ageNum=computeAge6(editingCust.birth6);
  editingCust.grade=document.getElementById('c-grade').value;
}
async function saveCustomerCore(){
  readCustFields();
  if(!editingCust.name){alert('이름을 입력하세요.'); return null;}
  if(!editingCust.id){editingCust.id=uid(); editingCust.created=today();}
  editingCust.updated=new Date().toISOString();
  editingCust.folder=editingCust.name;
  await idbPut('customers',editingCust);      // 앱+클라우드 저장 (폴더창 없음)
  customers=await idbAll('customers');
  return editingCust.id;
}
async function saveCustomer(){
  const id=await saveCustomerCore(); if(!id) return;
  toast('✓ 저장됨'+(cloudOn?' · 클라우드':'')); setTimeout(toastHide,1400);
  renderCustomers();   // 저장만 하고 고객상세 유지
}
