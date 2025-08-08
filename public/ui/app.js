(function(){
  const $ = (s) => document.querySelector(s);
  const logEl = $('#log');
  const sidEl = $('#sid');
  const btnConnect = $('#connect');
  const btnPause = $('#pause');
  const btnUnpause = $('#unpause');

  function write(s){
    logEl.textContent += s + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function currentSid(){
    const params = new URLSearchParams(location.search);
    return sidEl.value || params.get('session_id') || 'demo';
  }

  let es = null;

  async function seed(sid){
    try {
      const t = await fetch(`/events?session_id=${encodeURIComponent(sid)}&once=1`).then(r=>r.text());
      if (t) write(t);
    } catch {}
  }

  function connect(){
    const sid = currentSid();
    if (es) { es.close(); es = null; }
    seed(sid);
    try {
      es = new EventSource(`/events?session_id=${encodeURIComponent(sid)}`);
      es.onmessage = (e) => write(e.data);
      es.onerror = () => write('[sse error]');
      write(`[connected ${sid}]`);
    } catch (err) {
      write(`[init error] ${err?.message || err}`);
    }
  }

  async function control(action){
    const sid = currentSid();
    try {
      const res = await fetch('/control', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action, session_id: sid, mode: 'AGENT' }) });
      write(`[${action}] ${res.status}`);
    } catch (err) { write(`[${action} error] ${err?.message || err}`); }
  }

  // Init from query
  sidEl.value = new URLSearchParams(location.search).get('session_id') || 'demo';
  connect();

  btnConnect.addEventListener('click', connect);
  btnPause.addEventListener('click', () => control('pause'));
  btnUnpause.addEventListener('click', () => control('unpause'));
})();
