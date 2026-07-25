// src/frontend.ts
function setup(ctx) {
  let snap = null;
  let selectedId = null;
  const removeStyle = ctx.dom.addStyle(`
    .ps-wrap { display:flex; flex-direction:column; gap:10px; padding:12px; font-size:12.5px; color:var(--lumiverse-text); }
    .ps-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .ps-row.between { justify-content:space-between; }
    .ps-muted { color:var(--lumiverse-text-muted); font-size:11px; }
    .ps-h { font-size:12px; font-weight:600; color:var(--lumiverse-text-muted); margin:6px 0 2px; }
    .ps-chip { font-size:11px; padding:3px 9px; border-radius:999px; border:1px solid var(--lumiverse-border); cursor:pointer; background:var(--lumiverse-fill); }
    .ps-chip.sel { border-color:var(--lumiverse-accent,#6c8cff); color:var(--lumiverse-accent,#6c8cff); }
    .ps-chip.prim { font-weight:600; }
    .ps-btn { padding:5px 10px; font-size:12px; cursor:pointer; background:var(--lumiverse-fill); color:var(--lumiverse-text); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); }
    .ps-btn:hover { background:var(--lumiverse-fill-subtle); }
    .ps-btn.danger { color:#e5534b; }
    .ps-section { border-top:1px solid var(--lumiverse-border); padding-top:10px; display:flex; flex-direction:column; gap:8px; }
    .ps-input,.ps-ta { width:100%; padding:6px 8px; font-size:12px; background:var(--lumiverse-fill); color:var(--lumiverse-text); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); box-sizing:border-box; }
    .ps-ta { min-height:70px; resize:vertical; font-family:inherit; }
    .ps-emo { display:grid; grid-template-columns:84px 1fr 48px 60px; align-items:center; gap:6px; margin:2px 0; }
    .ps-emo .nm { font-size:11px; }
    .ps-eval { width:100%; padding:2px 3px; font-size:10.5px; text-align:right; background:var(--lumiverse-fill); color:var(--lumiverse-text); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); box-sizing:border-box; }
    .ps-eval:focus { border-color:var(--lumiverse-accent,#6c8cff); outline:none; }
    .ps-track { position:relative; height:8px; border-radius:6px; background:var(--lumiverse-fill-subtle,#2a2a33); overflow:hidden; }
    .ps-fill { position:absolute; top:0; bottom:0; background:var(--lumiverse-accent,#6c8cff); border-radius:6px; }
    .ps-fill.hot { background:#e0683c; }
    .ps-fill.neg { background:#d9a13b; }
    .ps-mid { position:absolute; top:0; bottom:0; left:50%; width:1px; background:var(--lumiverse-border); }
    .ps-val { font-size:10.5px; color:var(--lumiverse-text-muted); text-align:right; }
    .ps-sheet { display:flex; flex-direction:column; gap:4px; }
    .ps-sheet .sk { font-size:11px; font-weight:600; }
    .ps-demeanor { font-size:12px; font-style:italic; line-height:1.45; padding:8px 10px; border-left:2px solid var(--lumiverse-accent,#6c8cff); background:var(--lumiverse-fill-subtle); border-radius:var(--lumiverse-radius); }
    .ps-btn.sel { border-color:var(--lumiverse-accent,#6c8cff); color:var(--lumiverse-accent,#6c8cff); }
    .ps-pre { white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:10.5px; line-height:1.4; max-height:360px; overflow:auto; padding:8px; background:var(--lumiverse-fill-subtle); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); }
    .ps-engine { font-size:12px; font-weight:600; padding:6px 10px; border-radius:var(--lumiverse-radius); border:1px solid var(--lumiverse-border); text-align:center; }
    .ps-engine.run { color:#e0a23c; border-color:#e0a23c; background:rgba(224,162,60,0.10); }
    .ps-engine.idle { color:#4fbf67; border-color:#4fbf67; background:rgba(79,191,103,0.07); }
    .ps-edit-badge { display:inline-flex; align-items:center; gap:4px; margin-top:4px; font-size:10px; opacity:.65; color:var(--lumiverse-text-muted); cursor:pointer; user-select:none; }
    .ps-edit-badge:hover { opacity:1; }
  `);
  const tab = ctx.ui.registerDrawerTab({
    id: "psyche",
    title: "Psyche",
    shortName: "Psyche",
    headerTitle: "Psyche",
    description: "Inspect the run's characters, their feelings, and their sheets",
    keywords: ["psyche", "emotion", "mood", "feelings", "persona", "character sheet", "affect"],
    iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4.97 0-9-3.58-9-8 0-4.42 4.03-8 9-8s9 3.13 9 7c0 3.5-3 5-6 5-1.5 0-2 1-1.5 2.5"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/></svg>'
  });
  tab.root.innerHTML = `
    <div class="ps-wrap">
      <div class="ps-engine idle">● idle</div>
      <div class="ps-row between">
        <span class="ps-muted ps-status">Loading…</span>
        <button class="ps-btn ps-refresh">Refresh</button>
      </div>
      <div class="ps-row ps-chars"></div>

      <div class="ps-section ps-detail" style="display:none">
        <div class="ps-row between">
          <h4 class="ps-h ps-d-name" style="margin:0"></h4>
          <label class="ps-row ps-muted"><input type="checkbox" class="ps-present" /> present</label>
        </div>
        <div class="ps-muted ps-d-identity"></div>
        <div class="ps-demeanor" style="display:none"></div>

        <h4 class="ps-h">Goals &amp; desires (one per line)</h4>
        <textarea class="ps-ta ps-goals" placeholder="What this character is pursuing, in their own interest."></textarea>
        <div class="ps-row"><button class="ps-btn ps-save-goals">Save goals</button></div>

        <h4 class="ps-h">Canon — established facts (fixed)</h4>
        <textarea class="ps-ta ps-canon" style="min-height:120px" placeholder="The static character bible the engine builds and must not contradict."></textarea>
        <div class="ps-row"><button class="ps-btn ps-save-canon">Save canon</button></div>

        <h4 class="ps-h">Hidden persona</h4>
        <textarea class="ps-ta ps-persona" placeholder="The character's private driver."></textarea>
        <div class="ps-row"><button class="ps-btn ps-save-persona">Save persona</button></div>

        <h4 class="ps-h">Approval <span class="ps-muted">— their opinion of you (−10000…+10000, never decays)</span></h4>
        <div class="ps-emo">
          <span class="nm ps-appr-label"></span>
          <div class="ps-track"><div class="ps-mid"></div><div class="ps-fill ps-appr-fill"></div></div>
          <input class="ps-eval ps-appr-val" type="number" min="-10000" max="10000" step="1" />
          <span class="ps-val ps-appr-band"></span>
        </div>

        <h4 class="ps-h">Affect</h4>
        <div class="ps-emos"></div>

        <h4 class="ps-h">Sheet</h4>
        <div class="ps-sheet ps-sheetlist"></div>
        <div class="ps-row">
          <input class="ps-input ps-newsec" style="flex:1" placeholder="new section name (e.g. goal)" />
          <button class="ps-btn ps-addsec">Add</button>
        </div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Player — the human behind the player-character</h4>
        <div class="ps-muted">Shared by every chat with this character. Steers scenes toward what you're here for — characters never see or mention it, and never break who they are to serve it.</div>
        <textarea class="ps-ta ps-player" style="min-height:100px" placeholder="Your interests, goals, kinks, hard lines, the kind of scenes you're hoping for with this character…"></textarea>
        <div class="ps-row"><button class="ps-btn ps-save-player">Save player profile</button></div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Editor — final pass over each reply</h4>
        <div class="ps-muted">Rewrites the reply per the style directives after it streams in (you'll see the raw text replaced in place). What happens is preserved; how it reads is rewritten. One extra LLM call per reply.</div>
        <label class="ps-row"><input type="checkbox" class="ps-ed-en" /> Edit replies before display</label>
        <label class="ps-row"><input type="checkbox" class="ps-ed-badge" /> Show ✎ badge on edited replies (click badge to view the original)</label>
        <div><span class="ps-muted">Style directives</span><textarea class="ps-ta ps-ed-prompt" style="min-height:140px" placeholder="How the editor should reshape the prose."></textarea></div>
        <div><span class="ps-muted">Editor model</span><select class="ps-input ps-ed-conn"><option value="">Auto — last-used or default connection</option></select></div>
        <div class="ps-row">
          <button class="ps-btn ps-ed-save">Save editor</button>
          <button class="ps-btn ps-ed-reset">Reset prompt to default</button>
        </div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Run</h4>
        <div class="ps-muted ps-seed"></div>
        <div class="ps-row">
          <button class="ps-btn ps-reseed">Reroll seed</button>
          <button class="ps-btn danger ps-reset">Reset run</button>
        </div>
        <div class="ps-muted ps-activity">No activity yet.</div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Settings</h4>
        <label class="ps-row"><input type="checkbox" class="ps-en" /> Enabled</label>
        <label class="ps-row"><input type="checkbox" class="ps-texture" /> Human texture (energy-matched replies — flat moods read flat)</label>
        <div><span class="ps-muted">Engine rounds per turn</span><input type="number" class="ps-input ps-rounds" min="1" max="20" /></div>
        <div><span class="ps-muted">Decay rate (0–1, relax toward baseline)</span><input type="number" class="ps-input ps-decay" min="0" max="1" step="0.01" /></div>
        <div><span class="ps-muted">Engine directive (optional)</span><textarea class="ps-ta ps-dir" placeholder="e.g. Slow-burn; keep characters guarded until trust is earned."></textarea></div>
        <div><span class="ps-muted">Engine model (separate connection for Psyche's bookkeeping)</span><select class="ps-input ps-conn"><option value="">Auto — last-used or default connection</option></select></div>
        <div class="ps-row"><button class="ps-btn ps-save-cfg">Save settings</button></div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Debug — what each step sent</h4>
        <div class="ps-row">
          <button class="ps-btn ps-dbg" data-k="seed">1 · Seed</button>
          <button class="ps-btn ps-dbg" data-k="update">2 · Mind update</button>
          <button class="ps-btn ps-dbg" data-k="rumination">3 · Rumination</button>
          <button class="ps-btn ps-dbg" data-k="editor">✎ Editor</button>
          <button class="ps-btn ps-dbg" data-k="injection">→ Injected directive</button>
          <button class="ps-btn ps-dbg-refresh" title="Re-fetch latest">↻</button>
        </div>
        <div class="ps-muted ps-dbg-meta"></div>
        <pre class="ps-pre ps-dbg-out">Click a step to see the last request sent to the model and its response. Captured per turn.</pre>
      </div>
    </div>
  `;
  const q = (s) => tab.root.querySelector(s);
  const status = q(".ps-status");
  const charsEl = q(".ps-chars");
  const detail = q(".ps-detail");
  const dName = q(".ps-d-name");
  const dIdentity = q(".ps-d-identity");
  const demeanorEl = q(".ps-demeanor");
  const playerEl = q(".ps-player");
  const presentEl = q(".ps-present");
  const personaEl = q(".ps-persona");
  const goalsEl = q(".ps-goals");
  const canonEl = q(".ps-canon");
  const emosEl = q(".ps-emos");
  const apprLabelEl = q(".ps-appr-label");
  const apprFillEl = q(".ps-appr-fill");
  const apprValEl = q(".ps-appr-val");
  const apprBandEl = q(".ps-appr-band");
  const sheetEl = q(".ps-sheetlist");
  const newSecEl = q(".ps-newsec");
  const seedEl = q(".ps-seed");
  const activity = q(".ps-activity");
  const enEl = q(".ps-en");
  const textureEl = q(".ps-texture");
  const roundsEl = q(".ps-rounds");
  const decayEl = q(".ps-decay");
  const dirEl = q(".ps-dir");
  const connEl = q(".ps-conn");
  const edEnEl = q(".ps-ed-en");
  const edBadgeEl = q(".ps-ed-badge");
  const edPromptEl = q(".ps-ed-prompt");
  const edConnEl = q(".ps-ed-conn");
  let connOptions = [];
  let connError = "";
  let agentConnId = "";
  let editorConnId = "";
  let editorPromptDefault = "";
  const dbgOut = q(".ps-dbg-out");
  const dbgMeta = q(".ps-dbg-meta");
  let debugData = {};
  let dbgKey = "injection";
  const engineEl = q(".ps-engine");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let badgeEnabled = true;
  const badgeWrappers = new Map;
  const badgeInfo = new Map;
  function clearBadges() {
    for (const el of badgeWrappers.values()) {
      try {
        ctx.dom.uninject(el);
      } catch {}
    }
    badgeWrappers.clear();
    badgeInfo.clear();
  }
  function markEdited(messageId, chars, original) {
    badgeInfo.set(messageId, { chars, original });
    if (!badgeEnabled || badgeWrappers.has(messageId))
      return;
    const bubble = ctx.dom.findMessageElement(messageId);
    if (!bubble)
      return;
    const wrapper = ctx.dom.inject(bubble, `<span class="ps-edit-badge" title="Rewritten by Psyche's editor — click to view the original">✎ edited by Psyche${chars ? ` · ${esc(chars)}` : ""}</span>`, "beforeend");
    badgeWrappers.set(messageId, wrapper);
    wrapper.addEventListener("click", () => {
      const info = badgeInfo.get(messageId);
      if (!info?.original)
        return;
      ctx.ui.showConfirm({
        title: "Original reply (before Psyche edit)",
        message: info.original,
        confirmLabel: "Close"
      });
    });
  }
  const selected = () => snap?.characters.find((c) => c.id === selectedId) ?? snap?.characters[0] ?? null;
  function renderChips() {
    if (!snap || !snap.characters.length) {
      charsEl.innerHTML = "";
      return;
    }
    charsEl.innerHTML = snap.characters.map((c) => `<span class="ps-chip ${c.id === selected()?.id ? "sel" : ""} ${c.isPrimary ? "prim" : ""}" data-id="${c.id}">${esc(c.name)}${c.present ? "" : " ·"}</span>`).join("");
    charsEl.querySelectorAll(".ps-chip").forEach((el) => el.addEventListener("click", () => {
      selectedId = el.dataset.id;
      renderDetail();
    }));
  }
  function emotionRow(e) {
    let bar;
    if (e.kind === "bipolar") {
      const half = Math.min(50, Math.abs(e.value) * 50);
      const left = e.value < 0 ? 50 - half : 50;
      bar = `<div class="ps-track"><div class="ps-mid"></div><div class="ps-fill ${e.value < 0 ? "neg" : ""}" style="left:${left}%;width:${half}%"></div></div>`;
    } else {
      const w = Math.min(100, Math.max(0, e.value * 100));
      bar = `<div class="ps-track"><div class="ps-fill ${e.value >= 0.8 ? "hot" : ""}" style="left:0;width:${w}%"></div></div>`;
    }
    const min = e.kind === "bipolar" ? -1 : 0;
    return `<div class="ps-emo">` + `<span class="nm" title="${esc(e.label)}">${esc(e.label.split(" (")[0])}</span>` + bar + `<input class="ps-eval" type="number" data-key="${e.key}" value="${e.value.toFixed(2)}" ` + `min="${min}" max="1" step="0.01" title="${esc(e.label)} — type a new value (${min}…1)" />` + `<span class="ps-val" title="${esc(e.descriptor)}">${esc(e.descriptor)}</span>` + `</div>`;
  }
  function renderDetail() {
    const c = selected();
    renderChips();
    if (!c) {
      detail.style.display = "none";
      return;
    }
    selectedId = c.id;
    detail.style.display = "flex";
    dName.textContent = `${c.name}${c.isPrimary ? " (primary)" : ""}`;
    dIdentity.textContent = c.identity || "";
    if (c.demeanor && c.demeanor.trim()) {
      demeanorEl.textContent = c.demeanor;
      demeanorEl.style.display = "block";
    } else {
      demeanorEl.style.display = "none";
    }
    presentEl.checked = c.present;
    const appr = c.approval ?? 0;
    apprLabelEl.textContent = "approval";
    const half = Math.min(50, Math.abs(appr) / 1000 * 50);
    const left = appr < 0 ? 50 - half : 50;
    apprFillEl.className = `ps-fill ps-appr-fill ${appr < 0 ? "neg" : ""}`;
    apprFillEl.style.left = `${left}%`;
    apprFillEl.style.width = `${half}%`;
    apprValEl.value = String(Math.round(appr));
    apprValEl.title = `exact value ${Math.round(appr)}; bar saturates at ±1000, full scale ±10000`;
    apprBandEl.textContent = c.approvalLabel ?? "";
    apprBandEl.title = c.approvalLabel ?? "";
    personaEl.value = c.persona;
    goalsEl.value = (c.goals ?? []).join(`
`);
    canonEl.value = c.canon ?? "";
    const bip = c.emotions.filter((e) => e.kind === "bipolar");
    const uni = c.emotions.filter((e) => e.kind === "unipolar");
    emosEl.innerHTML = [...bip, ...uni].map(emotionRow).join("");
    emosEl.querySelectorAll(".ps-eval").forEach((el) => {
      const inp = el;
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        if (!Number.isFinite(v))
          return;
        ctx.sendToBackend({ type: "set_emotion", characterId: c.id, emotion: inp.dataset.key, value: v });
      });
    });
    const sections = Object.entries(c.sheet);
    sheetEl.innerHTML = sections.length ? sections.map(([k, v]) => `<div class="sk">${esc(k)}</div><textarea class="ps-ta ps-sec" data-sec="${esc(k)}">${esc(v)}</textarea>`).join("") : '<span class="ps-muted">No sheet sections yet — the engine writes these as the story develops.</span>';
    sheetEl.querySelectorAll(".ps-sec").forEach((el) => {
      el.addEventListener("blur", () => {
        const t = el;
        ctx.sendToBackend({ type: "save_sheet", characterId: c.id, section: t.dataset.sec, content: t.value });
      });
    });
  }
  function render() {
    if (!snap || !snap.characters.length) {
      status.textContent = snap ? "Run not seeded yet — send a message to begin." : "No active run";
      charsEl.innerHTML = "";
      detail.style.display = "none";
      seedEl.textContent = snap ? `seed ${snap.seed}` : "";
      return;
    }
    status.textContent = `${snap.characters.length} character${snap.characters.length > 1 ? "s" : ""}${snap.seeded ? "" : " · not seeded"}`;
    seedEl.textContent = `seed ${snap.seed}${snap.seeded ? "" : " (pending)"}`;
    renderDetail();
  }
  const requestState = () => {
    const { characterId } = ctx.getActiveChat();
    ctx.sendToBackend({ type: "get_state" });
    ctx.sendToBackend({ type: "get_player_profile" });
    ctx.sendToBackend({ type: "get_edited_messages" });
  };
  function fillConnectionSelect(el, savedId) {
    const opts = ['<option value="">Auto — last-used or default connection</option>'];
    for (const c of connOptions) {
      const label = `${c.name} — ${c.provider}/${c.model}`;
      opts.push(`<option value="${esc(c.id)}"${c.id === savedId ? " selected" : ""}>${esc(label)}</option>`);
    }
    if (savedId && !connOptions.some((c) => c.id === savedId)) {
      opts.push(`<option value="${esc(savedId)}" selected>(saved connection ${esc(savedId)})</option>`);
    }
    if (!connOptions.length) {
      const why = connError ? `couldn't load connections: ${connError}` : "no connections loaded yet — reopen this tab to retry";
      opts.push(`<option value="" disabled>(${esc(why)})</option>`);
    }
    el.innerHTML = opts.join("");
    el.value = savedId;
  }
  function renderConnections() {
    fillConnectionSelect(connEl, agentConnId);
    fillConnectionSelect(edConnEl, editorConnId);
  }
  function renderDebug() {
    tab.root.querySelectorAll(".ps-dbg").forEach((b) => b.classList.toggle("sel", b.dataset.k === dbgKey));
    if (dbgKey === "injection") {
      const inj = debugData?.injection;
      dbgMeta.textContent = inj ? `injected directive · ${new Date(inj.at).toLocaleString()}` : "no capture yet";
      dbgOut.textContent = inj?.directive || "No directive captured yet — take a turn.";
      return;
    }
    const t = debugData?.[dbgKey];
    if (!t) {
      dbgMeta.textContent = "no capture yet";
      dbgOut.textContent = dbgKey === "seed" ? "No seed capture yet — seed only runs on the first turn of a run (try Reroll seed)." : `No ${dbgKey} capture yet — take a turn.`;
      return;
    }
    dbgMeta.textContent = `${t.meta ?? ""} · ${new Date(t.at).toLocaleString()}`;
    dbgOut.textContent = `########## REQUEST — sent to the model ##########

${t.request}

` + `########## RESPONSE — model output ##########

${t.response}`;
  }
  const requestDebug = () => ctx.sendToBackend({ type: "get_debug" });
  const requestEngine = () => ctx.sendToBackend({ type: "get_engine" });
  function setEngine(state, stage) {
    const running = state === "running";
    engineEl.className = `ps-engine ${running ? "run" : "idle"}`;
    engineEl.textContent = running ? `● Engine working${stage ? " — " + stage : ""}… please wait before replying` : "● Idle — safe to reply";
    tab.setBadge(running ? "⏳" : null);
  }
  ctx.sendToBackend({ type: "get_config" });
  ctx.sendToBackend({ type: "get_connections" });
  requestState();
  requestDebug();
  requestEngine();
  tab.onActivate(() => {
    requestState();
    requestDebug();
    requestEngine();
    ctx.sendToBackend({ type: "get_connections" });
  });
  ctx.events.on("CHAT_SWITCHED", () => {
    selectedId = null;
    clearBadges();
    requestState();
    requestDebug();
    requestEngine();
  });
  tab.root.querySelectorAll(".ps-dbg").forEach((b) => b.addEventListener("click", () => {
    dbgKey = b.dataset.k;
    renderDebug();
  }));
  q(".ps-dbg-refresh").addEventListener("click", requestDebug);
  q(".ps-refresh").addEventListener("click", requestState);
  presentEl.addEventListener("change", () => {
    const c = selected();
    if (c)
      ctx.sendToBackend({ type: "set_present", characterId: c.id, present: presentEl.checked });
  });
  apprValEl.addEventListener("change", () => {
    const c = selected();
    const v = Number(apprValEl.value);
    if (c && Number.isFinite(v))
      ctx.sendToBackend({ type: "set_approval", characterId: c.id, value: v });
  });
  q(".ps-save-persona").addEventListener("click", () => {
    const c = selected();
    if (c)
      ctx.sendToBackend({ type: "save_persona", characterId: c.id, persona: personaEl.value });
  });
  q(".ps-save-goals").addEventListener("click", () => {
    const c = selected();
    if (c)
      ctx.sendToBackend({ type: "save_goals", characterId: c.id, goals: goalsEl.value });
  });
  q(".ps-save-canon").addEventListener("click", () => {
    const c = selected();
    if (c)
      ctx.sendToBackend({ type: "save_canon", characterId: c.id, canon: canonEl.value });
  });
  q(".ps-save-player").addEventListener("click", () => {
    ctx.sendToBackend({ type: "save_player_profile", profile: playerEl.value });
  });
  q(".ps-ed-save").addEventListener("click", () => {
    ctx.sendToBackend({
      type: "set_config",
      config: {
        editorEnabled: edEnEl.checked,
        editorBadge: edBadgeEl.checked,
        editorPrompt: edPromptEl.value,
        editorConnectionId: edConnEl.value
      }
    });
  });
  q(".ps-ed-reset").addEventListener("click", () => {
    if (editorPromptDefault)
      edPromptEl.value = editorPromptDefault;
  });
  q(".ps-addsec").addEventListener("click", () => {
    const c = selected();
    const name = newSecEl.value.trim();
    if (c && name) {
      ctx.sendToBackend({ type: "save_sheet", characterId: c.id, section: name, content: " " });
      newSecEl.value = "";
    }
  });
  q(".ps-reseed").addEventListener("click", async () => {
    const { confirmed } = await ctx.ui.showConfirm({
      title: "Reroll seed",
      message: "Reroll this run's hidden persona and starting temperament with a fresh seed? The primary character's feelings and sheet are reset and re-rolled. The story text is untouched.",
      variant: "warning",
      confirmLabel: "Reroll"
    });
    if (confirmed)
      ctx.sendToBackend({ type: "reseed" });
  });
  q(".ps-reset").addEventListener("click", async () => {
    const { confirmed } = await ctx.ui.showConfirm({
      title: "Reset run",
      message: "Clear all tracked characters, feelings, and sheets for this chat? The next message reseeds.",
      variant: "danger",
      confirmLabel: "Reset"
    });
    if (confirmed)
      ctx.sendToBackend({ type: "reset_run" });
  });
  q(".ps-save-cfg").addEventListener("click", () => {
    ctx.sendToBackend({
      type: "set_config",
      config: {
        enabled: enEl.checked,
        maxRounds: Number(roundsEl.value),
        decayRate: Number(decayEl.value),
        directive: dirEl.value,
        agentConnectionId: connEl.value,
        humanTexture: textureEl.checked
      }
    });
  });
  const unsub = ctx.onBackendMessage((raw) => {
    const p = raw;
    switch (p?.type) {
      case "state": {
        snap = p.snapshot ?? null;
        if (selectedId && !snap?.characters.some((c) => c.id === selectedId))
          selectedId = null;
        render();
        if (p.note)
          activity.textContent = p.note;
        break;
      }
      case "state_changed": {
        activity.textContent = `Last turn: ${p.edits} edits over ${p.rounds} rounds${p.note ? ` — ${p.note}` : ""}`;
        requestState();
        requestDebug();
        break;
      }
      case "debug": {
        debugData = p.debug ?? {};
        renderDebug();
        break;
      }
      case "engine": {
        if (p.chatId && snap?.chatId && p.chatId !== snap.chatId)
          break;
        setEngine(p.state, p.stage);
        break;
      }
      case "player_profile": {
        playerEl.value = typeof p.profile === "string" ? p.profile : "";
        break;
      }
      case "reply_edited": {
        if (p.chatId && snap?.chatId && p.chatId !== snap.chatId)
          break;
        markEdited(String(p.messageId), String(p.chars ?? ""), String(p.original ?? ""));
        break;
      }
      case "edited_messages": {
        if (p.chatId && snap?.chatId && p.chatId !== snap.chatId)
          break;
        for (const e of Array.isArray(p.entries) ? p.entries : []) {
          markEdited(String(e.messageId), String(e.chars ?? ""), String(e.original ?? ""));
        }
        break;
      }
      case "config": {
        const c = p.config ?? {};
        enEl.checked = c.enabled !== false;
        textureEl.checked = c.humanTexture !== false;
        roundsEl.value = String(c.maxRounds ?? 8);
        decayEl.value = String(c.decayRate ?? 0.12);
        dirEl.value = c.directive ?? "";
        agentConnId = c.agentConnectionId ?? "";
        edEnEl.checked = c.editorEnabled === true;
        edPromptEl.value = c.editorPrompt ?? "";
        editorConnId = c.editorConnectionId ?? "";
        const badgeNow = c.editorBadge !== false;
        edBadgeEl.checked = badgeNow;
        if (badgeNow !== badgeEnabled) {
          badgeEnabled = badgeNow;
          if (!badgeEnabled)
            clearBadges();
          else
            ctx.sendToBackend({ type: "get_edited_messages" });
        }
        editorPromptDefault = typeof p.editorPromptDefault === "string" ? p.editorPromptDefault : "";
        renderConnections();
        break;
      }
      case "connections": {
        connOptions = Array.isArray(p.connections) ? p.connections : [];
        connError = typeof p.error === "string" ? p.error : "";
        renderConnections();
        break;
      }
    }
  });
  return () => {
    unsub();
    tab.destroy();
    removeStyle();
    ctx.dom.cleanup();
  };
}
export {
  setup
};
