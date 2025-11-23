const toggle = document.getElementById('botToggle');
const statusEl = document.getElementById('status');

async function getActiveTab(){
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(running){
  statusEl.textContent = 'Bot: ' + (running ? 'ON' : 'OFF');
  toggle.checked = !!running;
}

async function refreshStatus(){
  try{
    const tab = await getActiveTab();
    chrome.tabs.sendMessage(tab.id, { action: 'get_status' }, resp => {
      if(chrome.runtime.lastError){
        console.warn('get_status failed:', chrome.runtime.lastError.message);
        statusEl.textContent = 'Bot: OFF';
        return;
      }
      setStatus(resp && resp.running);
    });
  }catch(e){ statusEl.textContent = 'Bot: OFF'; }
}

// Initial load: prefer live status over stored value
refreshStatus();

// Fallback: if no response after short delay, use stored preference
setTimeout(() => {
  if(statusEl.textContent === 'Bot: OFF'){ // still OFF -> check storage preference
    chrome.storage.local.get(['botEnabled'], data => {
      if(data.botEnabled){ setStatus(true); }
    });
  }
}, 400);

async function ensureContentScript(tab){
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, resp => {
      if(chrome.runtime.lastError || !resp){
        // attempt injection fallback
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
          if(chrome.runtime.lastError){
            console.error('Injection failed:', chrome.runtime.lastError.message);
            statusEl.textContent = 'Failed: cannot inject';
            resolve(false);
          } else {
            // re-ping after injection
            setTimeout(()=>{
              chrome.tabs.sendMessage(tab.id, { action: 'ping' }, pingResp => {
                resolve(!!pingResp);
              });
            }, 150);
          }
        });
      } else {
        resolve(true);
      }
    });
  });
}

toggle.addEventListener('change', async () => {
  const tab = await getActiveTab();
  const ok = await ensureContentScript(tab);
  if(!ok){ return; }
  if(toggle.checked){
    chrome.tabs.sendMessage(tab.id, { action: 'start_bot' }, () => {
      if(!chrome.runtime.lastError){ setStatus(true); chrome.storage.local.set({ botEnabled: true }); }
      else { statusEl.textContent = 'Start failed'; }
    });
    setTimeout(()=>window.close(), 350);
  } else {
    chrome.tabs.sendMessage(tab.id, { action: 'stop_bot' }, () => {
      if(!chrome.runtime.lastError){ setStatus(false); chrome.storage.local.set({ botEnabled: false }); }
      else { statusEl.textContent = 'Stop failed'; }
    });
  }
});