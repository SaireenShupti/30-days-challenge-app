// app.js — single-page app with gamified onboarding, tasks, meals, check-in,
// together, progress, and a Tweaks panel (rename players, theme, accent, etc.)

(() => {
  const $app  = document.getElementById('app');
  const $nav  = document.getElementById('nav');
  const $fab  = document.getElementById('tweaksFab');
  const $tw   = document.getElementById('tweaksRoot');

  const VIEWER_KEY = 'tdt:viewer';
  const TWEAK_KEY  = 'tdt:tweaks'; // UI prefs only — not progress data
  const DEFAULT_TWEAKS = {
    theme: 'gamified',
    accent: '',          // '' = use theme default
    celebration: 'high', // low | normal | high
  };

  const state = {
    challenge: null, members: [], meId: null,
    tasks: {}, meals: {}, checkins: {}, nudges: [],
    route: 'home', selectedDay: null,
    tweaks: { ...DEFAULT_TWEAKS },
    tweaksOpen: false,
  };

  // ---------- Helpers ----------
  function todayDayIndex() {
    if (!state.challenge?.start_date) return 1;
    const start = new Date(state.challenge.start_date + 'T00:00:00');
    const diff = Math.floor((new Date() - start) / 86400000);
    return Math.min(state.challenge.total_days, Math.max(1, diff + 1));
  }
  const getMember = id => state.members.find(m => m.id === id);
  const partnerOf = id => state.members.find(m => m.id !== id);
  const ckey = (m, d) => `${m}:${d}`;
  const getCheckin = (m, d) => state.checkins[ckey(m, d)] || null;
  const isDayDone = c => !!c && (c.workout_done || c.home_food_done || c.ate_out || c.mood);
  function fmt(d) { return new Date(d).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }); }
  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso))/1000);
    if (s<60) return 'just now';
    if (s<3600) return Math.floor(s/60)+'m ago';
    if (s<86400) return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago';
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
  }
  function fireConfetti(intensity='high') {
    if (intensity === 'low') return;
    const n = intensity === 'high' ? 80 : 40;
    const el = document.createElement('div'); el.className = 'confetti';
    const colors = ['#FF3D7F','#FFC857','#7FFFD4','#9D7FFF','#fff'];
    for (let i = 0; i < n; i++) {
      const i2 = document.createElement('i');
      i2.style.left = Math.random()*100 + 'vw';
      i2.style.background = colors[i % colors.length];
      i2.style.animationDelay = (Math.random()*0.6) + 's';
      i2.style.transform = `rotate(${Math.random()*360}deg)`;
      el.appendChild(i2);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ---------- Tweaks persistence (UI only, not progress) ----------
  function loadTweaks() {
    try {
      const raw = localStorage.getItem(TWEAK_KEY);
      if (raw) state.tweaks = { ...DEFAULT_TWEAKS, ...JSON.parse(raw) };
    } catch {}
    applyTheme();
  }
  function saveTweaks() { localStorage.setItem(TWEAK_KEY, JSON.stringify(state.tweaks)); }
  function applyTheme() {
    document.body.dataset.theme = state.tweaks.theme;
    if (state.tweaks.accent) {
      document.documentElement.style.setProperty('--primary', state.tweaks.accent);
      document.documentElement.style.setProperty('--blob1', state.tweaks.accent);
    } else {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--blob1');
    }
  }

  // ---------- Data ----------
  async function loadAll() {
    state.challenge = await DB.getChallenge();
    state.members   = await DB.getMembers(state.challenge.id);
    const saved = sessionStorage.getItem(VIEWER_KEY);
    state.meId = (saved && state.members.find(m => m.id === saved)) ? saved : state.members[0].id;
    state.tasks = {}; state.meals = {};
    for (const m of state.members) {
      state.tasks[m.id] = await DB.getTasks(m.id);
      state.meals[m.id] = await DB.getMeals(m.id);
    }
    const ck = await DB.getCheckins(state.members.map(m => m.id));
    state.checkins = {}; for (const c of ck) state.checkins[ckey(c.member_id, c.day)] = c;
    state.nudges = await DB.getNudges(state.challenge.id);
    state.selectedDay = todayDayIndex();
  }

  // ---------- Routing ----------
  function go(route) {
    state.route = route;
    $nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.route === route));
    render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $nav.addEventListener('click', e => {
    const btn = e.target.closest('button[data-route]');
    if (btn) go(btn.dataset.route);
  });
  $fab.onclick = () => { state.tweaksOpen = !state.tweaksOpen; renderTweaks(); };

  // ---------- Render dispatch ----------
  function render() {
    if (!state.challenge) { $app.innerHTML = `<div class="empty">Loading…</div>`; return; }
    const onboarding = !state.challenge.start_date;
    $nav.classList.toggle('hidden', onboarding);
    $fab.classList.toggle('hidden', onboarding);
    if (onboarding) return renderOnboard();
    if (state.route === 'home')     return renderHome();
    if (state.route === 'checkin')  return renderCheckin();
    if (state.route === 'together') return renderTogether();
    if (state.route === 'progress') return renderProgress();
  }

  // ---------- Onboarding ----------
  function renderOnboard() {
    const stage = state._onboardStage || 'welcome';
    if (stage === 'welcome') return renderWelcome();
    if (stage === 'date')    return renderPickDate();
  }

  function renderWelcome() {
    const [a, b] = state.members;
    $app.innerHTML = `
      <div class="onboard">
        <div class="orb">⚡<div class="spk">✦</div></div>
        <div class="kicker">SEASON 1 · A QUEST FOR TWO</div>
        <h1 class="title-display">
          ${escapeHtml(a.name)}
          <span class="amp">${a.emoji}</span>
          ${escapeHtml(b.name)}
        </h1>
        <p class="subline">30 days. Two players. One streak. No mercy.</p>
        <button class="btn btn-primary" id="startQuest">START QUEST →</button>
      </div>
    `;
    $app.querySelector('#startQuest').onclick = () => { state._onboardStage = 'date'; render(); };
  }

  function renderPickDate() {
    const today = new Date().toISOString().slice(0,10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
    function nextMon() {
      const d = new Date(); const day = d.getDay();
      const diff = (8 - day) % 7 || 7;
      return new Date(d.getTime() + diff * 86400000).toISOString().slice(0,10);
    }
    function lab(date) { return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' }); }

    $app.innerHTML = `
      <div class="step-screen">
        <div class="kicker">⚡ STEP 1 / 2</div>
        <h2>When does Day 1<br/>begin?</h2>
        <p class="sub">Pick today, tomorrow, or set a custom date.</p>

        <button class="list-card" data-d="${today}"><div class="ic">📅</div><div style="flex:1"><div class="text-1">Today</div><div class="text-2">${lab(today)}</div></div><div class="arrow">→</div></button>
        <button class="list-card" data-d="${tomorrow}"><div class="ic">📅</div><div style="flex:1"><div class="text-1">Tomorrow</div><div class="text-2">${lab(tomorrow)}</div></div><div class="arrow">→</div></button>
        <button class="list-card" data-d="${nextMon()}"><div class="ic">📅</div><div style="flex:1"><div class="text-1">Next Monday</div><div class="text-2">${lab(nextMon())}</div></div><div class="arrow">→</div></button>

        <div class="field-card" style="margin-top:14px">
          <div class="lab">Custom date</div>
          <input type="date" id="customDate" value="${today}" />
          <button class="btn btn-primary btn-block" id="useCustom" style="margin-top:10px">Use this date</button>
        </div>
      </div>
    `;
    $app.querySelectorAll('.list-card[data-d]').forEach(b => {
      b.onclick = () => setStartDate(b.dataset.d);
    });
    $app.querySelector('#useCustom').onclick = () => setStartDate($app.querySelector('#customDate').value);
  }

  async function setStartDate(d) {
    state.challenge = await DB.updateChallenge(state.challenge.id, { start_date: d });
    state.selectedDay = todayDayIndex();
    state._onboardStage = null;
    fireConfetti(state.tweaks.celebration);
    toast('Quest begins ✨');
    render();
  }

  // ---------- HOME ----------
  function topbar() {
    const me = getMember(state.meId);
    const banner = window.DB_MODE === 'mock'
      ? `<div class="banner-warn">Demo mode — add Supabase keys in <code>supabase.js</code> to sync.</div>` : '';
    const today = todayDayIndex();
    const greet = (() => { const h = new Date().getHours(); return h<12?'Morning':h<18?'Afternoon':'Evening'; })();
    return `
      ${banner}
      <div class="topbar">
        <div class="greet">
          <div class="date">DAY ${today} · ${fmt(new Date()).toUpperCase()}</div>
          <h1>${greet},<br/><em>${escapeHtml(me.name)}</em> ${me.emoji}</h1>
        </div>
        <div class="who-pill">
          <div class="l">PLAYER</div>
          <div class="v">${me.emoji}</div>
          <div class="x">${escapeHtml(me.name)}</div>
        </div>
      </div>
    `;
  }

  function renderHome() {
    const me = getMember(state.meId);
    const friend = partnerOf(state.meId);
    const today = todayDayIndex();
    const total = state.challenge.total_days;
    const myTasks = (state.tasks[me.id] || []).filter(t => t.day === today);
    const myMeals = (state.meals[me.id] || []).filter(m => m.day === today);
    const c = getCheckin(me.id, today) || { task_state: {} };
    const ts = c.task_state || {};
    const doneCount = myTasks.filter(t => ts[t.id]).length;
    const pips = Array.from({length: total}, (_,i)=>{
      const cls = isDayDone(getCheckin(me.id, i+1)) ? 'pip done' : 'pip';
      return `<div class="${cls}"></div>`;
    }).join('');

    const friendCheck = getCheckin(friend.id, today);
    const slots = ['breakfast','lunch','dinner','snack'];

    $app.innerHTML = `
      ${topbar()}

      <div class="hero">
        <div class="label">Day ${today} of ${total}</div>
        <div class="day-num">Today's <em>quest</em></div>
        <div class="progress">${pips}</div>
      </div>

      <div class="card">
        <div class="row-spread">
          <div>
            <h2 class="card-title">Today's tasks</h2>
            <p class="card-sub">${doneCount} of ${myTasks.length} done</p>
          </div>
          <button class="btn btn-soft" data-action="go-checkin" style="padding:10px 16px;font-size:13px">Check-in →</button>
        </div>
        <div class="tasklist" id="homeTasks">
          ${myTasks.length === 0
            ? `<div class="empty">No tasks yet. Add one below ↓</div>`
            : myTasks.map(t => taskRow(t, !!ts[t.id])).join('')}
        </div>
        <div class="add-task">
          <input id="addTaskInput" placeholder="Add a task…" maxlength="80" />
          <button data-action="add-task">Add</button>
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">Meals · day ${today}</h2>
        <p class="card-sub">Editable per slot. Tap to mark eaten.</p>
        ${slots.map(slot => mealSection(slot, myMeals.filter(m => m.slot === slot))).join('')}
      </div>

      <div class="card">
        <h2 class="card-title">Rival · ${friend.emoji} ${escapeHtml(friend.name)}</h2>
        <p class="card-sub">${friendCheck ? `Logged today ${friendCheck.completed_at ? '· ' + timeAgo(friendCheck.completed_at) : ''}` : `Hasn't logged today. Don't let them catch up.`}</p>
        <button class="btn btn-primary btn-block" data-action="nudge">⚡ Trash-talk ${escapeHtml(friend.name)}</button>
      </div>
    `;
    bindHome();
  }

  function taskRow(t, done) {
    return `
      <div class="task ${done ? 'done' : ''}" data-task-id="${t.id}">
        <button class="check" data-action="toggle-task">
          ${done ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </button>
        <input class="label" data-action="edit-task" value="${escapeHtml(t.label)}" />
        <button class="x" data-action="delete-task" title="Delete">×</button>
      </div>`;
  }

  function mealSection(slot, items) {
    return `
      <div class="meal-section">
        <div class="slot">${slot}</div>
        <div class="tasklist" data-slot="${slot}">
          ${items.length === 0 ? `<div class="empty">No ${slot} planned</div>` : items.map(mealRow).join('')}
        </div>
        <div class="add-task">
          <input class="add-meal-input" data-slot="${slot}" placeholder="Add ${slot}…" maxlength="120" />
          <button class="add-meal-btn" data-slot="${slot}">Add</button>
        </div>
      </div>
    `;
  }
  function mealRow(m) {
    return `
      <div class="task ${m.done ? 'done' : ''}" data-meal-id="${m.id}">
        <button class="check" data-action="toggle-meal">
          ${m.done ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </button>
        <input class="label" data-action="edit-meal" value="${escapeHtml(m.label)}" />
        <button class="x" data-action="delete-meal" title="Delete">×</button>
      </div>`;
  }

  function bindHome() {
    // Tasks
    $app.querySelectorAll('.task[data-task-id]').forEach(row => {
      const id = row.dataset.taskId;
      row.querySelector('[data-action=toggle-task]').onclick = () => toggleTaskDone(id);
      const inp = row.querySelector('[data-action=edit-task]');
      inp.onblur = () => editTaskLabel(id, inp.value.trim());
      inp.onkeydown = e => e.key === 'Enter' && inp.blur();
      row.querySelector('[data-action=delete-task]').onclick = () => removeTask(id);
    });
    const addBtn = $app.querySelector('[data-action=add-task]');
    if (addBtn) {
      const inp = $app.querySelector('#addTaskInput');
      addBtn.onclick = () => { const v = inp.value.trim(); if (v) { addTask(v); inp.value=''; } };
      inp.onkeydown = e => e.key === 'Enter' && addBtn.click();
    }
    // Meals
    $app.querySelectorAll('.task[data-meal-id]').forEach(row => {
      const id = row.dataset.mealId;
      row.querySelector('[data-action=toggle-meal]').onclick = () => toggleMealDone(id);
      const inp = row.querySelector('[data-action=edit-meal]');
      inp.onblur = () => editMealLabel(id, inp.value.trim());
      inp.onkeydown = e => e.key === 'Enter' && inp.blur();
      row.querySelector('[data-action=delete-meal]').onclick = () => removeMeal(id);
    });
    $app.querySelectorAll('.add-meal-btn').forEach(btn => {
      btn.onclick = () => {
        const slot = btn.dataset.slot;
        const inp = $app.querySelector(`.add-meal-input[data-slot="${slot}"]`);
        const v = inp.value.trim(); if (!v) return;
        addMeal(slot, v); inp.value = '';
      };
    });
    $app.querySelectorAll('.add-meal-input').forEach(inp => {
      inp.onkeydown = e => {
        if (e.key === 'Enter') $app.querySelector(`.add-meal-btn[data-slot="${inp.dataset.slot}"]`).click();
      };
    });
    const goCi = $app.querySelector('[data-action=go-checkin]');
    if (goCi) goCi.onclick = () => go('checkin');
    const nudgeBtn = $app.querySelector('[data-action=nudge]');
    if (nudgeBtn) nudgeBtn.onclick = () => sendNudge();
  }

  // ---------- Mutations ----------
  async function patchCheckin(patch, day = null) {
    const d = day || (state.route === 'checkin' ? state.selectedDay : todayDayIndex());
    const base = getCheckin(state.meId, d) || {
      member_id: state.meId, day: d,
      workout_done: false, home_food_done: false, ate_out: false,
      mood: null, notes: '', task_state: {},
    };
    const saved = await DB.upsertCheckin({ ...base, ...patch });
    state.checkins[ckey(saved.member_id, saved.day)] = saved;
    return saved;
  }
  async function toggleTaskDone(id) {
    const day = state.route === 'checkin' ? state.selectedDay : todayDayIndex();
    const c = getCheckin(state.meId, day) || { task_state: {} };
    const ts = { ...(c.task_state || {}) };
    ts[id] = !ts[id];
    await patchCheckin({ task_state: ts }, day);
    if (ts[id]) fireConfetti('low');
    render();
  }
  async function addTask(label) {
    const day = state.route === 'checkin' ? state.selectedDay : todayDayIndex();
    const list = state.tasks[state.meId] || [];
    const t = await DB.addTask(state.meId, day, label, list.filter(x => x.day === day).length);
    state.tasks[state.meId] = [...list, t]; render();
  }
  async function editTaskLabel(id, label) {
    if (!label) return;
    const t = await DB.updateTask(id, { label });
    const list = state.tasks[state.meId]; const i = list.findIndex(x => x.id === id);
    if (i >= 0) list[i] = t;
  }
  async function removeTask(id) {
    await DB.deleteTask(id);
    state.tasks[state.meId] = (state.tasks[state.meId] || []).filter(t => t.id !== id);
    render();
  }
  async function toggleMealDone(id) {
    const meals = state.meals[state.meId];
    const m = meals.find(x => x.id === id); if (!m) return;
    const updated = await DB.updateMeal(id, { done: !m.done });
    Object.assign(m, updated);
    if (updated.done) fireConfetti('low');
    render();
  }
  async function addMeal(slot, label) {
    const day = state.route === 'checkin' ? state.selectedDay : todayDayIndex();
    const list = state.meals[state.meId] || [];
    const pos = list.filter(x => x.day === day && x.slot === slot).length;
    const m = await DB.addMeal(state.meId, day, slot, label, pos);
    state.meals[state.meId] = [...list, m]; render();
  }
  async function editMealLabel(id, label) {
    if (!label) return;
    const m = await DB.updateMeal(id, { label });
    const list = state.meals[state.meId]; const i = list.findIndex(x => x.id === id);
    if (i >= 0) list[i] = m;
  }
  async function removeMeal(id) {
    await DB.deleteMeal(id);
    state.meals[state.meId] = (state.meals[state.meId] || []).filter(m => m.id !== id);
    render();
  }

  // ---------- CHECK-IN ----------
  function renderCheckin() {
    const me = getMember(state.meId);
    const total = state.challenge.total_days;
    const today = todayDayIndex();
    const day = state.selectedDay || today;
    const tasks = (state.tasks[me.id] || []).filter(t => t.day === day);
    const meals = (state.meals[me.id] || []).filter(m => m.day === day);
    const c = getCheckin(me.id, day) || {
      workout_done:false, home_food_done:false, ate_out:false, mood:null, notes:'', task_state:{},
    };
    const chips = Array.from({length: total}, (_,i)=>{
      const d = i+1;
      return `<button class="day-chip ${d === day ? 'active' : ''}" data-day="${d}">
        ${d === today ? 'TODAY' : 'DAY'}<span class="num">${d}</span>
      </button>`;
    }).join('');
    const moods = ['😞','😕','😐','🙂','🤩'];
    const slots = ['breakfast','lunch','dinner','snack'];

    $app.innerHTML = `
      ${topbar()}
      <h2 style="font-family:var(--font-display);font-size:24px;margin:4px 0 12px">
        Log · <em style="color:var(--primary);font-style:italic">Day ${day}</em>
      </h2>
      <div class="day-chips">${chips}</div>

      <div class="card">
        <div class="field">
          <div class="field-label">Workout</div>
          <button class="toggle ${c.workout_done?'on':''}" data-toggle="workout_done" style="width:100%">💪 ${c.workout_done?'Done':'Mark done'}</button>
        </div>
        <div class="field">
          <div class="field-label">Food</div>
          <div class="toggle-row">
            <button class="toggle ${c.home_food_done?'on mint':''}" data-toggle="home_food_done">🍲 Home food</button>
            <button class="toggle ${c.ate_out?'on peach':''}" data-toggle="ate_out">🍕 Ate out</button>
          </div>
        </div>
        <div class="field">
          <div class="field-label">Mood</div>
          <div class="mood-row">
            ${moods.map((e,i)=>`<button class="mood ${c.mood===i+1?'on':''}" data-mood="${i+1}">${e}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <div class="field-label">Notes</div>
          <textarea class="notes" id="notesField" placeholder="How did it go? Anything to remember…">${escapeHtml(c.notes||'')}</textarea>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">Tasks</h3>
        <div class="tasklist">
          ${tasks.length===0?`<div class="empty">No tasks. Add one below.</div>`:tasks.map(t=>taskRow(t, !!c.task_state?.[t.id])).join('')}
        </div>
        <div class="add-task">
          <input id="addTaskInput" placeholder="Add a task…" maxlength="80" />
          <button data-action="add-task">Add</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">Meals</h3>
        ${slots.map(slot => mealSection(slot, meals.filter(m => m.slot === slot))).join('')}
      </div>

      <div style="height:14px"></div>
      <button class="btn btn-primary btn-block" data-action="save-checkin">⚔️ Lock in day ${day}</button>
    `;

    $app.querySelectorAll('.day-chip').forEach(b => b.onclick = () => { state.selectedDay = +b.dataset.day; render(); });
    $app.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
      const k = b.dataset.toggle; const cur = getCheckin(state.meId, day) || {};
      await patchCheckin({ [k]: !cur[k] }, day); render();
    });
    $app.querySelectorAll('[data-mood]').forEach(b => b.onclick = async () => {
      await patchCheckin({ mood: +b.dataset.mood }, day); render();
    });
    bindHome(); // covers tasks + meals
    $app.querySelector('[data-action=save-checkin]').onclick = async () => {
      const notes = $app.querySelector('#notesField').value;
      await patchCheckin({ notes, completed_at: new Date().toISOString() }, day);
      fireConfetti(state.tweaks.celebration);
      toast(`Day ${day} locked in. +1 XP`); render();
    };
  }

  // ---------- TOGETHER ----------
  function renderTogether() {
    const me = getMember(state.meId);
    const friend = partnerOf(state.meId);
    const today = todayDayIndex();
    const stats = (mid) => {
      let done=0, run=0, best=0;
      for (let d=1; d<=today; d++) {
        if (isDayDone(getCheckin(mid, d))) { done++; run++; best = Math.max(best, run); } else run = 0;
      }
      return { done, best, pct: Math.round((done/today)*100) };
    };
    const sMe = stats(me.id), sFr = stats(friend.id);
    const quickMessages = [
      "👀 your move",
      "catching up to you 📈",
      "⚔️ no slacking today",
      "streak's on the line 🔥",
      "easy day. you got nothing? 😏",
    ];
    $app.innerHTML = `
      ${topbar()}
      <h2 style="font-family:var(--font-display);font-size:24px;margin:4px 0 12px"><em style="font-style:italic">Versus</em> ⚡</h2>
      <div class="card">
        <div class="partner-row">
          ${partnerCard(me, sMe)}
          ${partnerCard(friend, sFr)}
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">Throw shade</h3>
        <p class="card-sub">Send ${escapeHtml(friend.name)} some heat.</p>
        <div class="nudge-quick">
          ${quickMessages.map(m=>`<button class="btn btn-soft" data-quick="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
        </div>
        <div class="add-task" style="margin-top:10px">
          <input id="customNudge" placeholder="Or write your own…" maxlength="140" />
          <button data-action="send-custom">Send</button>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">Battle log</h3>
        <div class="nudge-feed">
          ${state.nudges.length===0?`<div class="empty">No nudges yet.</div>`:state.nudges.slice(0,20).map(renderNudge).join('')}
        </div>
      </div>
    `;
    $app.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => sendNudge(b.dataset.quick));
    $app.querySelector('[data-action=send-custom]').onclick = () => {
      const inp = $app.querySelector('#customNudge'); const v = inp.value.trim();
      if (v) { sendNudge(v); inp.value = ''; }
    };
  }
  function partnerCard(m, s) {
    return `
      <div class="partner">
        <div class="emoji">${m.emoji}</div>
        <div class="ring" style="--p:${s.pct};background:conic-gradient(${m.color} ${s.pct}%, rgba(255,255,255,0.1) 0)"><div>${s.pct}%</div></div>
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="stat">${s.done} days · best ${s.best}</div>
      </div>`;
  }
  function renderNudge(n) {
    const from = getMember(n.from_member_id) || { name:'—', emoji:'✨', color:'#fff' };
    const to   = getMember(n.to_member_id)   || { name:'—' };
    return `
      <div class="nudge">
        <div class="av" style="background:${from.color}33">${from.emoji}</div>
        <div class="body">
          <div class="h">${escapeHtml(from.name)} → ${escapeHtml(to.name)}${n.day?' · day '+n.day:''}</div>
          <div class="t">${escapeHtml(n.message)}</div>
          <div class="when">${timeAgo(n.created_at)}</div>
        </div>
      </div>`;
  }
  async function sendNudge(message) {
    const friend = partnerOf(state.meId);
    const fallback = ['👀 your move','no slacking ⚔️','streak on the line 🔥','catching up 📈'];
    const msg = message || fallback[Math.floor(Math.random()*fallback.length)];
    const n = await DB.sendNudge({
      challenge_id: state.challenge.id, from_member_id: state.meId,
      to_member_id: friend.id, day: todayDayIndex(), message: msg,
    });
    state.nudges = [n, ...state.nudges];
    toast(`Shot fired at ${friend.name} ⚡`);
    if (state.route === 'together') render();
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    const me = getMember(state.meId), friend = partnerOf(state.meId);
    const total = state.challenge.total_days, today = todayDayIndex();
    const cells = Array.from({length: total}, (_,i)=>{
      const d = i+1;
      const s = isDayDone(getCheckin(me.id, d));
      const f = isDayDone(getCheckin(friend.id, d));
      const both = s && f, isToday = d === today;
      return `<button class="cell ${both?'both':''} ${isToday?'today':''}" data-day="${d}">
        ${d}<div class="dot"><i class="${s?'s':''}"></i><i class="${f?'k':''}"></i></div>
      </button>`;
    }).join('');
    $app.innerHTML = `
      ${topbar()}
      <h2 style="font-family:var(--font-display);font-size:24px;margin:4px 0 4px">The <em style="font-style:italic">map</em> 🏆</h2>
      <p class="card-sub" style="margin-bottom:14px">
        <span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${me.color}"></i> ${escapeHtml(me.name)}</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${friend.color}"></i> ${escapeHtml(friend.name)}</span>
      </p>
      <div class="card"><div class="grid-30">${cells}</div></div>
    `;
    $app.querySelectorAll('.cell').forEach(b => b.onclick = () => { state.selectedDay = +b.dataset.day; go('checkin'); });
  }

  // ---------- TWEAKS panel ----------
  function renderTweaks() {
    if (!state.tweaksOpen) { $tw.innerHTML = ''; return; }
    const t = state.tweaks;
    const swatches = ['#FF3D7F','#FFC857','#7FFFD4','#9D7FFF','#ff6fa3','#6dd6b0','#1a1a1a'];
    const [a, b] = state.members;
    $tw.innerHTML = `
      <div class="tweaks">
        <div class="head">
          <h3>Tweaks</h3>
          <button class="close" id="twClose">×</button>
        </div>

        <div class="sec">VISUAL</div>
        <div class="row">
          <label>Theme</label>
          <div class="seg" id="twTheme">
            <button class="${t.theme==='gamified'?'on':''}" data-v="gamified">gamified</button>
            <button class="${t.theme==='soft'?'on':''}" data-v="soft">soft</button>
            <button class="${t.theme==='minimal'?'on':''}" data-v="minimal">minimal</button>
          </div>
        </div>
        <div class="row">
          <label>Accent color</label>
          <div class="swatches" id="twSwatches">
            ${swatches.map(c => `<div class="swatch ${t.accent === c ? 'sel':''}" style="background:${c}" data-c="${c}"></div>`).join('')}
            <input type="color" id="twAccentColor" value="${t.accent || '#FF3D7F'}" style="width:36px;height:30px;padding:0;border-radius:8px" />
          </div>
          <button class="tw-btn" id="twAccentReset">Reset accent</button>
        </div>

        <div class="sec">PLAYERS</div>
        <div class="row">
          <label>Player 1 name</label>
          <div class="row-input">
            <input type="text" id="twP1" value="${escapeHtml(a.name)}" maxlength="20" />
            <input type="text" id="twP1e" value="${escapeHtml(a.emoji)}" maxlength="4" style="width:50px;text-align:center" />
          </div>
        </div>
        <div class="row">
          <label>Player 2 name</label>
          <div class="row-input">
            <input type="text" id="twP2" value="${escapeHtml(b.name)}" maxlength="20" />
            <input type="text" id="twP2e" value="${escapeHtml(b.emoji)}" maxlength="4" style="width:50px;text-align:center" />
          </div>
        </div>
        <button class="tw-btn" id="twSavePlayers">Save player names</button>
        <div class="row" style="margin-top:10px">
          <label>Viewing as</label>
          <div class="seg" id="twViewer">
            <button class="${state.meId===a.id?'on':''}" data-v="${a.id}">${escapeHtml(a.name)}</button>
            <button class="${state.meId===b.id?'on':''}" data-v="${b.id}">${escapeHtml(b.name)}</button>
          </div>
        </div>

        <div class="sec">DAY</div>
        <div class="row">
          <label>Jump to day <span style="float:right">${state.selectedDay || todayDayIndex()}</span></label>
          <input type="range" min="1" max="${state.challenge.total_days}" value="${state.selectedDay || todayDayIndex()}" id="twDay" />
        </div>
        <button class="tw-btn" id="twTodayBtn">Use today's date</button>

        <div class="sec">CELEBRATION</div>
        <div class="row">
          <label>Confetti</label>
          <div class="seg" id="twCele">
            <button class="${t.celebration==='low'?'on':''}" data-v="low">low</button>
            <button class="${t.celebration==='normal'?'on':''}" data-v="normal">normal</button>
            <button class="${t.celebration==='high'?'on':''}" data-v="high">high</button>
          </div>
        </div>

        <div class="sec">CHALLENGE</div>
        <div class="row">
          <label>Start date</label>
          <input type="date" id="twStartDate" value="${state.challenge.start_date || ''}" style="width:100%" />
        </div>
        <button class="tw-btn" id="twResetProgress">Reset all progress</button>
      </div>
    `;
    $tw.querySelector('#twClose').onclick = () => { state.tweaksOpen = false; renderTweaks(); };
    $tw.querySelectorAll('#twTheme button').forEach(b => b.onclick = () => { state.tweaks.theme = b.dataset.v; saveTweaks(); applyTheme(); renderTweaks(); });
    $tw.querySelectorAll('#twSwatches .swatch').forEach(s => s.onclick = () => { state.tweaks.accent = s.dataset.c; saveTweaks(); applyTheme(); renderTweaks(); });
    $tw.querySelector('#twAccentColor').oninput = e => { state.tweaks.accent = e.target.value; saveTweaks(); applyTheme(); };
    $tw.querySelector('#twAccentReset').onclick = () => { state.tweaks.accent = ''; saveTweaks(); applyTheme(); renderTweaks(); };
    $tw.querySelector('#twSavePlayers').onclick = async () => {
      const n1 = $tw.querySelector('#twP1').value.trim() || 'Player 1';
      const e1 = $tw.querySelector('#twP1e').value.trim() || '🌸';
      const n2 = $tw.querySelector('#twP2').value.trim() || 'Player 2';
      const e2 = $tw.querySelector('#twP2e').value.trim() || '⚡';
      const u1 = await DB.updateMember(a.id, { name: n1, emoji: e1 });
      const u2 = await DB.updateMember(b.id, { name: n2, emoji: e2 });
      const i1 = state.members.findIndex(m => m.id === a.id); state.members[i1] = u1;
      const i2 = state.members.findIndex(m => m.id === b.id); state.members[i2] = u2;
      toast('Players updated ✨'); render(); renderTweaks();
    };
    $tw.querySelectorAll('#twViewer button').forEach(b => b.onclick = () => {
      state.meId = b.dataset.v; sessionStorage.setItem(VIEWER_KEY, state.meId);
      render(); renderTweaks();
    });
    const dayRange = $tw.querySelector('#twDay');
    dayRange.oninput = e => { state.selectedDay = +e.target.value; if (state.route !== 'checkin') go('checkin'); else render(); renderTweaks(); };
    $tw.querySelector('#twTodayBtn').onclick = () => { state.selectedDay = todayDayIndex(); render(); renderTweaks(); };
    $tw.querySelectorAll('#twCele button').forEach(b => b.onclick = () => { state.tweaks.celebration = b.dataset.v; saveTweaks(); renderTweaks(); fireConfetti(b.dataset.v); });
    $tw.querySelector('#twStartDate').onchange = async e => {
      state.challenge = await DB.updateChallenge(state.challenge.id, { start_date: e.target.value });
      toast('Start date updated'); render();
    };
    $tw.querySelector('#twResetProgress').onclick = async () => {
      if (!confirm('Reset ALL progress for both players?')) return;
      // Clear all checkins and meal/task done flags
      for (const c of Object.values(state.checkins)) {
        await DB.upsertCheckin({ ...c, workout_done: false, home_food_done: false, ate_out: false, mood: null, notes: '', task_state: {}, completed_at: null });
      }
      for (const list of Object.values(state.meals)) {
        for (const m of list) if (m.done) await DB.updateMeal(m.id, { done: false });
      }
      await loadAll(); toast('Progress reset'); render(); renderTweaks();
    };
  }

  // ---------- Boot ----------
  loadTweaks();
  loadAll().then(render).catch(err => {
    console.error(err);
    $app.innerHTML = `<div class="empty">Couldn't load — ${escapeHtml(err.message)}</div>`;
  });
})();
