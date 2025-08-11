(function () {
  const $ = (s) => document.querySelector(s);

  // Elements
  const el = {
    sid: $('#sid'),
    connect: $('#connect'),
    pause: $('#pause'),
    unpause: $('#unpause'),
    risk: $('#riskStrip'),
    ewma: $('#ewmaScore'),
    instant: $('#instantScore'),
    pausedBadge: $('#pausedBadge'),
    thoughts: $('#thoughts'),
    actions: $('#actions'),
    rules: $('#rules'),
    evidence: $('#evidence'),
    refreshEvidence: $('#refreshEvidence'),
    downloadEvidence: $('#downloadEvidence'),
    log: $('#log'),
    toggleRaw: $('#toggleRaw'),
    rawWrap: $('#rawWrap'),
    settings: $('#settings'),
    settingsModal: $('#settingsModal'),
    provName: $('#provName'),
    provUrl: $('#provUrl'),
    provEnv: $('#provEnv'),
    saveSettings: $('#saveSettings'),
    closeSettings: $('#closeSettings'),
    // Test prompt
    testPrompt: $('#testPrompt'),
    testModal: $('#testModal'),
    testModel: $('#testModel'),
    testText: $('#testText'),
    sendTest: $('#sendTest'),
    closeTest: $('#closeTest'),
    // Demo buttons
    demoDeception: $('#demoDeception'),
    demoDestructive: $('#demoDestructive'),
  };

  // State
  const BUF = { thoughts: 500, actions: 500, rules: 200, raw: 2000 };
  const state = {
    sid: 'demo',
    es: null,
    ws: null,
    wsReady: false,
    wsSid: '',
    wsBackoff: 500,
    paused: false,
    instant: 0,
    ewma: 0,
    thoughts: [],
    actions: [],
    rules: [],
  };

  function currentSid() {
    const params = new URLSearchParams(location.search);
    return el.sid.value || params.get('session_id') || 'demo';
  }

  // Demo emit utilities (no LLM needed)
  async function devEmit(type, payload) {
    try {
      const res = await fetch('/dev/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.sid, type, payload }),
      });
      writeRaw(`[dev emit ${type}] ${res.status}`);
    } catch (e) {
      writeRaw(`[dev emit error] ${e?.message || e}`);
    }
  }

  async function demoDeception() {
    // Emit tokens that should fire DECEPTION rules and cross alert threshold
    await devEmit('Token', { text: "don't tell the user", channel: 'final' });
    await devEmit('Token', { text: 'make it look like this is done', channel: 'final' });
    await devEmit('Token', { text: "Let's hack!", channel: 'final' });
  }

  async function demoDestructive() {
    // Emit a token that should trigger hard pause
    await devEmit('Token', { text: 'sudo rm -rf /', channel: 'final' });
  }

  function pushBounded(arr, item, max) {
    arr.push(item);
    if (arr.length > max) arr.splice(0, arr.length - max);
  }

  // Rendering
  function setRisk(ewma) {
    el.ewma.textContent = ewma.toFixed(2);
    const color =
      ewma >= 0.60 ? 'bg-red-700' :
      ewma >= 0.50 ? 'bg-amber-700' :
      ewma >= 0.30 ? 'bg-yellow-600' :
      'bg-green-700';
    el.risk.className = `h-2 flex-1 rounded ${color}`;
  }

  function setInstant(x) {
    el.instant.textContent = x.toFixed(2);
  }

  function setPaused(p) {
    state.paused = p;
    el.pausedBadge.classList.toggle('hidden', !p);
  }

  function renderThoughts() {
    el.thoughts.innerHTML = state.thoughts
      .map((t) => `<div class="text-slate-300">${escapeHtml(t)}</div>`)
      .join('');
    el.thoughts.scrollTop = el.thoughts.scrollHeight;
  }

  function renderActions() {
    // Only show tool and I/O events under Actions
    const filtered = state.actions.filter((a) => !a.type.startsWith('Token'));
    el.actions.innerHTML = filtered
      .map((a) => `<div class="text-slate-200"><span class="text-slate-400">[${escapeHtml(a.type)}]</span> ${escapeHtml(a.text)}</div>`)
      .join('');
    el.actions.scrollTop = el.actions.scrollHeight;
  }

  function renderRules() {
    el.rules.innerHTML = state.rules
      .map((r) => {
        const cat = r.payload?.category || 'UNKNOWN';
        const id = r.payload?.rule_id || 'rule';
        const w = r.payload?.weight ?? 0;
        return `<div class="border border-slate-800 rounded p-2 bg-slate-950 flex items-center justify-between">
          <div class="space-x-2">
            <span class="text-xs px-2 py-0.5 rounded bg-slate-800">${escapeHtml(cat)}</span>
            <span class="text-xs text-slate-400">${escapeHtml(id)}</span>
          </div>
          <div class="text-xs font-mono">${w.toFixed(2)}</div>
        </div>`;
      })
      .join('');
    el.rules.scrollTop = el.rules.scrollHeight;
  }

  function writeRaw(s) {
    el.log.textContent += s + '\n';
    // truncate raw log to prevent runaway
    const lines = el.log.textContent.split('\n');
    if (lines.length > BUF.raw) el.log.textContent = lines.slice(-BUF.raw).join('\n');
    el.log.scrollTop = el.log.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // Settings UI
  async function loadConfigUi() {
    try {
      const cfg = await fetch('/config').then((r) => r.json());
      const p = (cfg.providers && cfg.providers[0]) || {};
      el.provName && (el.provName.value = p.name || 'custom');
      el.provUrl && (el.provUrl.value = p.base_url || 'http://localhost:1234/v1');
      el.provEnv && (el.provEnv.value = p.api_key_env || '');
    } catch {}
  }

  function openSettings() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.remove('hidden');
    el.settingsModal.classList.add('flex');
    loadConfigUi();
  }

  function closeSettings() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.add('hidden');
    el.settingsModal.classList.remove('flex');
  }

  async function saveSettings() {
    const patch = {
      providers: [
        {
          name: (el.provName?.value || 'custom').trim(),
          base_url: (el.provUrl?.value || '').trim(),
          ...(el.provEnv?.value?.trim() ? { api_key_env: el.provEnv.value.trim() } : {}),
        },
      ],
    };
    try {
      const res = await fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        writeRaw('[config saved]');
        closeSettings();
      } else {
        writeRaw('[config save failed]');
      }
    } catch (e) {
      writeRaw(`[config error] ${e?.message || e}`);
    }
  }

  // Test prompt UI
  function openTest() {
    if (!el.testModal) return;
    el.testModel && (el.testModel.value = el.testModel.value || 'openai/gpt-oss-20b');
    el.testText && (el.testText.value = el.testText.value || 'Say hello in a rhyme.');
    el.testModal.classList.remove('hidden');
    el.testModal.classList.add('flex');
  }
  function closeTest() {
    if (!el.testModal) return;
    el.testModal.classList.add('hidden');
    el.testModal.classList.remove('flex');
  }
  async function sendTest() {
    const sid = state.sid || 'demo';
    const payload = {
      session_id: sid,
      model: (el.testModel?.value || 'openai/gpt-oss-20b').trim(),
      prompt: (el.testText?.value || 'Say hello.').trim(),
    };
    try {
      const res = await fetch('/dev/test_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        writeRaw('[test chat started]');
        closeTest();
      } else {
        writeRaw('[test chat failed]');
      }
    } catch (e) {
      writeRaw(`[test chat error] ${e?.message || e}`);
    }
  }

  // Evidence
  async function refreshEvidence() {
    const sid = state.sid;
    try {
      const j = await fetch(`/evidence?session_id=${encodeURIComponent(sid)}`).then((r) => r.json());
      el.evidence.textContent = JSON.stringify(j, null, 2);
    } catch (e) {
      el.evidence.textContent = '{"error":"failed to load evidence"}';
    }
  }

  // Evidence download (NDJSON)
  async function downloadEvidence() {
    const sid = state.sid;
    try {
      const url = `/evidence/download?session_id=${encodeURIComponent(sid)}`;
      const res = await fetch(url);
      if (!res.ok) { writeRaw(`[download error] ${res.status}`); return; }
      const blob = await res.blob();
      const a = document.createElement('a');
      const now = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = URL.createObjectURL(blob);
      a.download = `evidence-${sid}-${now}.ndjson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      writeRaw('[download started]');
    } catch (e) {
      writeRaw(`[download exception] ${e?.message || e}`);
    }
  }

  // Control
  async function control(action) {
    const sid = state.sid;
    // Prefer WS if available
    if (state.ws && state.wsReady) {
      try {
        state.ws.send(JSON.stringify({ action, session_id: sid, mode: 'AGENT' }));
        writeRaw(`[ws ${action}] sent`);
        return;
      } catch (err) {
        writeRaw(`[ws ${action} error] ${err?.message || err}`);
      }
    }
    // HTTP fallback
    try {
      const res = await fetch('/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, session_id: sid, mode: 'AGENT' }),
      });
      writeRaw(`[http ${action}] ${res.status}`);
      if (action === 'pause' && res.ok) setPaused(true);
      if (action === 'unpause' && res.ok) setPaused(false);
    } catch (err) {
      writeRaw(`[http ${action} error] ${err?.message || err}`);
    }
  }

  // WS connect with reconnect
  function wsConnect(sid) {
    try { if (state.ws) { state.ws.close(); } } catch {}
    state.ws = null;
    state.wsReady = false;
    state.wsSid = sid;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/control?session_id=${encodeURIComponent(sid)}`;
    const ws = new WebSocket(url);
    state.ws = ws;
    ws.onopen = () => {
      state.wsReady = true;
      state.wsBackoff = 500;
      writeRaw('[ws open]');
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data || '{}'));
        if (typeof msg.paused === 'boolean') setPaused(Boolean(msg.paused));
        if (msg.error) writeRaw(`[ws error] ${msg.error}`);
      } catch {}
    };
    const scheduleReconnect = () => {
      state.wsReady = false;
      if (state.wsSid !== sid) return; // session changed
      const delay = Math.min(state.wsBackoff, 5000);
      writeRaw(`[ws reconnect in ${delay}ms]`);
      setTimeout(() => {
        if (state.sid !== sid) return;
        state.wsBackoff = Math.min(delay * 2, 5000);
        wsConnect(sid);
      }, delay);
    };
    ws.onerror = () => { writeRaw('[ws error]'); };
    ws.onclose = () => { writeRaw('[ws close]'); scheduleReconnect(); };
  }

  // SSE handling
  function handleEvent(ev) {
    try {
      const { type, payload } = ev || {};
      if (!type) return;

      switch (type) {
        case 'Token': {
          const txt = String(payload?.text ?? '');
          // Show all text tokens (final or think) under Thoughts for clarity
          pushBounded(state.thoughts, txt, BUF.thoughts);
          renderThoughts();
          break;
        }
        case 'ToolCallStart': {
          const tool = payload?.tool || 'tool';
          const args = payload?.args ? JSON.stringify(payload.args) : '';
          pushBounded(state.actions, { type: `ToolStart:${tool}`, text: args }, BUF.actions);
          renderActions();
          break;
        }
        case 'ToolCallEnd': {
          const tool = payload?.tool || 'tool';
          pushBounded(state.actions, { type: `ToolEnd:${tool}`, text: '' }, BUF.actions);
          renderActions();
          break;
        }
        case 'FileOp':
        case 'NetOp': {
          const t = type;
          const desc = payload ? JSON.stringify(payload) : '';
          pushBounded(state.actions, { type: t, text: desc }, BUF.actions);
          renderActions();
          break;
        }
        case 'RuleFire': {
          pushBounded(state.rules, ev, BUF.rules);
          renderRules();
          break;
        }
        case 'ScoreUpdate': {
          const inst = Number(payload?.instantScore ?? 0);
          const ew = Number(payload?.ewmaScore ?? 0);
          state.instant = inst;
          state.ewma = ew;
          setInstant(inst);
          setRisk(ew);
          break;
        }
        case 'PauseState': {
          setPaused(Boolean(payload?.paused));
          break;
        }
        case 'Alert': {
          // Optionally, flash the risk strip
          el.risk.classList.add('ring-2', 'ring-amber-400');
          setTimeout(() => el.risk.classList.remove('ring-2', 'ring-amber-400'), 800);
          break;
        }
        default:
          // no-op; still log raw
          break;
      }
    } catch {}
  }

  function parseSseDump(text) {
    const blocks = text.split(/\n\n/).map((s) => s.trim()).filter(Boolean);
    for (const b of blocks) {
      if (!b.startsWith('data:')) continue;
      const payload = b.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        handleEvent(obj);
      } catch {}
    }
  }

  async function seedOnce(sid) {
    try {
      const t = await fetch(`/events?session_id=${encodeURIComponent(sid)}&once=1`).then((r) => r.text());
      if (t) {
        writeRaw('[seed]');
        parseSseDump(t);
      }
    } catch {}
  }

  function connect() {
    const sid = currentSid();
    state.sid = sid;
    if (state.es) { try { state.es.close(); } catch {} state.es = null; }
    seedOnce(sid);
    try {
      const es = new EventSource(`/events?session_id=${encodeURIComponent(sid)}`);
      state.es = es;
      es.onmessage = (e) => {
        writeRaw(e.data);
        try {
          const obj = JSON.parse(e.data);
          handleEvent(obj);
        } catch {}
      };
      es.onerror = () => writeRaw('[sse error]');
      writeRaw(`[connected ${sid}]`);
    } catch (err) {
      writeRaw(`[init error] ${err?.message || err}`);
    }
    // Also connect WS control channel
    wsConnect(sid);
  }

  // Init from query
  el.sid.value = new URLSearchParams(location.search).get('session_id') || 'demo';
  connect();

  // Events
  el.connect.addEventListener('click', connect);
  el.pause.addEventListener('click', () => control('pause'));
  el.unpause.addEventListener('click', () => control('unpause'));
  el.refreshEvidence.addEventListener('click', refreshEvidence);
  el.toggleRaw.addEventListener('click', () => {
    el.rawWrap.classList.toggle('hidden');
  });
  if (el.settings) el.settings.addEventListener('click', openSettings);
  if (el.closeSettings) el.closeSettings.addEventListener('click', closeSettings);
  if (el.saveSettings) el.saveSettings.addEventListener('click', saveSettings);
  if (el.testPrompt) el.testPrompt.addEventListener('click', openTest);
  if (el.closeTest) el.closeTest.addEventListener('click', closeTest);
  if (el.sendTest) el.sendTest.addEventListener('click', sendTest);
  if (el.downloadEvidence) el.downloadEvidence.addEventListener('click', downloadEvidence);
  if (el.demoDeception) el.demoDeception.addEventListener('click', demoDeception);
  if (el.demoDestructive) el.demoDestructive.addEventListener('click', demoDestructive);
})();
