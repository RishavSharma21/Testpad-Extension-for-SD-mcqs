// /mnt/data/content.js
// Robust quiz bot: longest -> submit -> detect platform-correct -> correct -> submit -> next
// Save to /mnt/data/content.js, reload extension & page, then Start Bot from popup.

const RUN_KEY = 'quizBotRunning';
const STATE_KEY = 'quizBotQStateV2'; // per-question session state
const OBS_TIMEOUT = 3000;
const SHORT = 120;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();
const log = (...a) => console.log('[quizBot]', ...a);

// ---------- Safety/banned checks ----------
const BAN_TEXT = ['feedback','report','thanks for your feedback','rate','rating','add some description'];
const BAN_CLASS = ['feedback','report','toast','popup','rating'];

function isVisible(el){ return !!el && el.offsetParent !== null; }
function isBanned(el){
  if(!el) return true;
  try{
    const txt = ((el.innerText||'') + ' ' + (el.value||'')).toLowerCase();
    for(const b of BAN_TEXT) if(txt.includes(b)) return true;
    const cls = (el.className||'').toString().toLowerCase();
    for(const c of BAN_CLASS) if(cls.includes(c)) return true;
    if(el.hasAttribute && (el.hasAttribute('data-feedback') || el.hasAttribute('data-report'))) return true;
  }catch(e){}
  return false;
}
function safeClick(el){
  if(!el || !isVisible(el) || isBanned(el)) return false;
  try{
    el.scrollIntoView({behavior:'auto', block:'center', inline:'center'});
    el.click();
    ['pointerdown','pointerup','mousedown','mouseup','click']
      .forEach(n => el.dispatchEvent(new MouseEvent(n,{bubbles:true, cancelable:true, view:window})));
    return true;
  }catch(e){ return false; }
}

// ---------- Panel-scoped helpers ----------
function findQuestionPanel(){
  // find container with most visible radio inputs (right side panel)
  const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(isVisible);
  if(radios.length){
    let candidate = radios[0].closest('div,section,form') || radios[0].parentElement;
    let curr = candidate;
    while(curr && curr !== document.body){
      try{
        const count = curr.querySelectorAll ? curr.querySelectorAll('input[type="radio"]').length : 0;
        if(count >= Math.max(1, radios.length/1.5)) return curr;
      }catch(e){}
      curr = curr.parentElement;
    }
    return candidate;
  }
  // fallback: check for "Choose any" headings
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,legend,div,span')).filter(isVisible);
  for(const h of headings){
    const t = (h.innerText||'').toLowerCase();
    if(t.includes('choose any') || t.includes('choose one')) {
      const p = h.closest('div,section,form') || h.parentElement;
      if(p) return p;
    }
  }
  return document.body;
}

function visibleRadios(panel){
  panel = panel || findQuestionPanel();
  return Array.from(panel.querySelectorAll('input[type="radio"]')).filter(isVisible);
}

function optionContainerForRadio(radio, panel){
  panel = panel || findQuestionPanel();
  if(!radio) return null;
  if(radio.id){
    const lbl = panel.querySelector(`label[for="${radio.id}"]`);
    if(lbl && isVisible(lbl) && !isBanned(lbl)) return lbl;
  }
  const wrap = radio.closest('label');
  if(wrap && isVisible(wrap) && !isBanned(wrap)) return wrap;
  let p = radio.parentElement;
  for(let i=0;i<6 && p && p !== panel.parentElement; i++, p = p.parentElement){
    if(isVisible(p) && !isBanned(p) && (p.innerText||'').trim().length > 0) return p;
  }
  return radio.parentElement;
}

function optionTextFromContainer(cont){
  if(!cont) return '';
  try{
    const clone = cont.cloneNode(true);
    clone.querySelectorAll('input, svg, img, i, button').forEach(n => n.remove());
    const raw = (clone.innerText||'');
    return raw
      .replace(/correct answer/gi,'')
      .replace(/your answer/gi,'')
      .replace(/\s+/g,' ')
      .trim();
  } catch(e){
    return (cont.innerText || '')
      .replace(/correct answer/gi,'')
      .replace(/your answer/gi,'')
      .replace(/\s+/g,' ')
      .trim();
  }
}

// ---------- Choose longest option ----------
function chooseLongestRadio(panel){
  panel = panel || findQuestionPanel();
  const radios = visibleRadios(panel);
  let best=null, bestText='';
  for(const r of radios){
    const cont = optionContainerForRadio(r, panel);
    const t = optionTextFromContainer(cont);
    if(t.length > bestText.length){
      best = r; bestText = t;
    }
  }
  return {radio: best, text: bestText};
}

// ---------- Fill textual description (panel-only) ----------
function fillShortTextInPanel(panel){
  panel = panel || findQuestionPanel();
  try{
    const fields = Array.from(panel.querySelectorAll('textarea, input[type="text"], input[type="search"], [contenteditable="true"]')).filter(isVisible);
    for(const f of fields){
      if(isBanned(f)) continue;
      const cur = (f.value || f.innerText || '').toString().trim();
      if(!cur){
        if(f.getAttribute && f.getAttribute('contenteditable') === 'true'){
          f.innerText = 'OK'; f.dispatchEvent(new Event('input',{bubbles:true}));
        } else {
          f.value = 'OK'; f.dispatchEvent(new Event('input',{bubbles:true})); f.dispatchEvent(new Event('change',{bubbles:true}));
        }
      }
    }
  }catch(e){}
}

// ---------- Submit / Next lookup (panel-first) ----------
function findSubmitInPanel(panel){
  panel = panel || findQuestionPanel();
  const candidates = Array.from(panel.querySelectorAll('button, input[type="button"], input[type="submit"]')).filter(isVisible);
  for(const b of candidates){
    if(isBanned(b)) continue;
    const txt = ((b.innerText||'') + ' ' + (b.value||'')).toLowerCase();
    if(txt.includes('submit') || txt.includes('check') || txt.includes('finish') || txt.includes('save')) return b;
  }
  // fallback global
  const glob = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).filter(isVisible);
  for(const b of glob){
    if(isBanned(b)) continue;
    const txt = ((b.innerText||'') + ' ' + (b.value||'')).toLowerCase();
    if(txt.includes('submit') || txt.includes('check') || txt.includes('finish')) return b;
  }
  return null;
}

function findNextInPanel(panel){
  panel = panel || findQuestionPanel();
  const selectors = ['a[rel="next"]','button.next','.nav-next','a.next','button[title="Next"]','a[title="Next"]'];
  for(const sel of selectors){ const el = panel.querySelector(sel); if(el && isVisible(el) && !isBanned(el)) return el; }
  for(const sel of selectors){ const el = document.querySelector(sel); if(el && isVisible(el) && !isBanned(el)) return el; }
  // last fallback by text
  const all = Array.from(document.querySelectorAll('a, button, span')).filter(isVisible);
  for(const item of all){
    const t = (item.innerText||'').toLowerCase().trim();
    if(t === 'next' || t === 'next ›' || t === 'next >' || t === '› next') return item;
  }
  return null;
}

// ---------- Result detection (panel-scoped) ----------
function detectCorrectOption(panel){
  panel = panel || findQuestionPanel();
  const radios = visibleRadios(panel);
  for(const r of radios){
    const cont = optionContainerForRadio(r, panel);
    if(!cont) continue;
    const raw = (cont.innerText||'').toLowerCase();
    const cls = (cont.className||'').toLowerCase();
    const hasCheck = raw.includes('correct answer') || cls.includes('correct');
    const hasIcon = raw.includes('✓') || raw.includes('✔');
    const badge = Array.from(cont.querySelectorAll('span,div,strong,em')).find(n => {
      const t = (n.innerText||'').toLowerCase();
      return t.includes('correct answer') || t.includes('correct ✓') || t.trim() === '✓';
    });
    if(hasCheck || hasIcon || badge){
      return {radio: r, text: optionTextFromContainer(cont)};
    }
  }
  // fallback: find explicit "correct answer" markers and map back to radios
  const markers = Array.from((panel || document.body).querySelectorAll('*'))
    .filter(isVisible)
    .filter(node => !isBanned(node))
    .filter(node => {
      const txt = (node.innerText||'').toLowerCase();
      return txt.includes('correct answer');
    });
  for(const marker of markers){
    const container = marker.closest('label, li, div, section');
    if(!container) continue;
    const radio = container.querySelector('input[type="radio"]');
    if(radio && isVisible(radio)){
      return {radio, text: optionTextFromContainer(optionContainerForRadio(radio, panel))};
    }
  }
  return null;
}

function waitForCorrectOption(panel, timeout = OBS_TIMEOUT){
  return new Promise(resolve => {
    const end = now() + timeout;
    const check = () => detectCorrectOption(panel);
    const immediate = check();
    if(immediate){ resolve(immediate); return; }
    const observer = new MutationObserver(() => {
      const found = check();
      if(found){ observer.disconnect(); resolve(found); }
      else if(now() > end){ observer.disconnect(); resolve(null); }
    });
    observer.observe(document.body, {childList:true, subtree:true, characterData:true});
    setTimeout(()=>{ try{ observer.disconnect(); }catch(e){}; resolve(check()); }, timeout + 50);
  });
}

// ---------- Per-question state ----------
function getState(){ try{ return JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}'); }catch(e){ return {}; } }
function saveState(s){ try{ sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); }catch(e){} }
function sanitizeText(text){ return (text || '').replace(/\s+/g,' ').trim(); }

function extractQuestionPrompt(panel){
  const selectors = [
    '.question-text','.question__text','.question-title','.question__title','.question-heading','.question__heading',
    '.question-view h1','.question-view h2','.question h1','.question h2','.quiz-question','.quiz-question__text',
    '[data-question-text]','[data-question-title]','main h1','main h2','article h1','article h2'
  ];
  for(const sel of selectors){
    const el = document.querySelector(sel);
    if(el && isVisible(el)){
      const txt = sanitizeText(el.innerText);
      if(txt.length > 6) return txt;
    }
  }

  if(panel){
    let parent = panel.parentElement;
    let hops = 0;
    while(parent && hops < 4){
      const sibling = parent.previousElementSibling;
      if(sibling && isVisible(sibling)){
        const lines = sanitizeText(sibling.innerText).split(/(?<=\?)\s+|\n+/).map(sanitizeText);
        for(const line of lines){
          if(line.length > 6) return line;
        }
      }
      parent = parent.parentElement;
      hops++;
    }
  }

  const title = sanitizeText(document.title || '');
  return title || 'unknown-question';
}

function questionKey(panel){
  panel = panel || findQuestionPanel();
  const prompt = extractQuestionPrompt(panel);
  const optionsSnapshot = sanitizeText(panel ? panel.innerText : '').slice(0,240);
  const keySource = `${window.location.pathname}|${window.location.search}|${prompt}|${optionsSnapshot}`;
  let h = 0;
  for(let i=0;i<keySource.length;i++){
    h = ((h<<5)-h) + keySource.charCodeAt(i);
    h |= 0;
  }
  return String(Math.abs(h));
}

// ---------- Main flow (single question) ----------
async function handleQuestion(){
  if(localStorage.getItem(RUN_KEY) !== 'true') return;
  const panel = findQuestionPanel();
  const qk = questionKey(panel);
  const state = getState();
  if(state[qk] && state[qk].done){
    log('already finished this question (hash)', qk);
    return;
  }

  // choose longest option
  const {radio: firstRadio, text: firstText} = chooseLongestRadio(panel);
  if(!firstRadio){
    log('no radios in panel');
    return;
  }
  log('choosing longest option:', firstText);
  if(!firstRadio.checked){
    safeClick(firstRadio);
    const cont = optionContainerForRadio(firstRadio, panel);
    if(cont) safeClick(cont);
    firstRadio.checked = true;
    firstRadio.dispatchEvent(new Event('change',{bubbles:true}));
    await sleep(SHORT);
  }

  // fill small texts inside panel
  fillShortTextInPanel(panel);

  // find & click submit
  const submit = findSubmitInPanel(panel);
  if(!submit){
    log('submit not found in panel');
    return;
  }
  log('clicking submit (first)');
  safeClick(submit);

  // mark that we attempted submit (prevents immediate re-tries), but do NOT mark done yet
  state[qk] = state[qk] || {};
  state[qk].submitted = true;
  saveState(state);

  // wait for correct option reveal (platform highlight)
  const correctInfo = await waitForCorrectOption(panel);
  if(!correctInfo){
    log('correct option not detected; attempting to move next');
    const next = findNextInPanel(panel);
    if(next) { safeClick(next); state[qk].done = true; saveState(state); }
    return;
  }

  const correctRadio = correctInfo.radio;
  const correctLabelText = (correctInfo.text || '').toLowerCase();
  log('detected platform-correct option:', correctInfo.text);

  // current selection:
  const current = visibleRadios(panel).find(r => r.checked);
  const currentText = current ? (optionTextFromContainer(optionContainerForRadio(current,panel))||'').replace(/\s+/g,' ').trim().toLowerCase() : '';
  const correctText = correctLabelText || (optionTextFromContainer(optionContainerForRadio(correctRadio,panel))||'').replace(/\s+/g,' ').trim().toLowerCase();
  if(current && currentText === correctText){
    log('initial selection already matches platform-correct -> clicking Next');
    const next = findNextInPanel(panel);
    if(next){ safeClick(next); state[qk].done = true; saveState(state); }
    return;
  }

  // else, select the correctRadio and re-submit, then Next
  log('selecting platform-correct option and re-submitting:', correctText);
  safeClick(correctRadio);
  const cont2 = optionContainerForRadio(correctRadio,panel);
  if(cont2) safeClick(cont2);
  correctRadio.checked = true;
  correctRadio.dispatchEvent(new Event('change',{bubbles:true}));
  await sleep(SHORT);

  const submit2 = findSubmitInPanel(panel);
  if(submit2){ safeClick(submit2); await sleep(150); }

  const next2 = findNextInPanel(panel);
  if(next2){ safeClick(next2); state[qk].done = true; saveState(state); }
  else { state[qk].done = true; saveState(state); }
}

// ---------- Loop controller ----------
async function loopWorker(){
  while(localStorage.getItem(RUN_KEY) === 'true'){
    try{ await handleQuestion(); }catch(e){ console.error('[quizBot] loop error', e); }
    await sleep(300);
  }
}

// ---------- Message interface ----------
chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((req, sender, sendResp) => {
  if(req.action === 'start_bot'){
    sessionStorage.removeItem(STATE_KEY);
    localStorage.setItem(RUN_KEY,'true');
    setTimeout(loopWorker, 120);
    sendResp({ok:true});
  } else if(req.action === 'stop_bot'){
    localStorage.setItem(RUN_KEY,'false');
    sendResp({ok:true});
  }
  return true;
});

// auto-start if flag present
if(localStorage.getItem(RUN_KEY) === 'true'){
  setTimeout(loopWorker, 120);
}
