// app.js — single-page app: router, state, render.
// Talks to window.DB (live Supabase or in-memory mock from supabase.js).
// No localStorage is used for progress; the only persisted preference
// is which member the device is "viewing as", which is a UI choice, not data.

(() => {
  const $app  = document.getElementById('app');
  const $nav  = document.getElementById('nav');

  // ---------- State ----------
  const state = {
    challenge: null,
    members: [],            // [{id,name,emoji,color}]
    meId: null,             // currently active member id (which person is using the device)
    tasksByMember: {},      // { memberId: [tasks] }
    checkinsByKey: {},      // { 'memberId:day': checkin }
    nudges: [],
    route: 'home',
    selectedDay: null,      // for check-in & progress; defaults to today
  };

  // ---------- Helpers ----------
  const VIEWER_KEY = 'tdt:viewer'; // UI preference only — not progress data

  function todayDayIndex() {
    if (!state.challenge) return 1;
    const start = new Date(state.challenge.start_date + 'T00:00:00');
    const now   = new Date();
    const diff  = Math.floor((now - start) / 86400000);
    return Math.min(state.challenge.total_days, Math.max(1, diff + 1));
  }

  function getMember(id) { return state.members.find(m => m.id === id); }
  function partnerOf(id) { return state.members.find(m => m.id !== id); }
  function ckey(memberId, day) { return `${memberId}:${day}`; }
  function getCheckin(memberId, day) {
    return state.checkinsByKey[ckey(memberId, day)] || null;
  }
  function isDayDone(c) {
    return !!c && (c.workout_done || c.home_food_done || c.ate_out || c.mood);
  }
  function fmt(d) {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ---------- Data loading ----------
  async function loadAll() {
    state.challenge = await DB.getChallenge();
    state.members   = await DB.getMembers(state.challenge.id);

    const savedViewer = sessionStorage.getItem(VIEWER_KEY);
    state.meId = (savedViewer && state.members.find(m => m.id === savedViewer))
      ? savedViewer
      : state.members[0].id;

    state.tasksByMember = {};
    for (const m of state.members) {
      state.tasksByMember[m.id] = await DB.getTasks(m.id);
    }

    const checkins = await DB.getCheckins(state.members.map(m => m.id));
    state.checkinsByKey = {};
    for (const c of checkins) state.checkinsByKey[ckey(c.member_id, c.day)] = c;

    state.nudges = await DB.getNudges(state.challenge.id);
    state.selectedDay = todayDayIndex();
  }

  // ---------- Routing ----------
  function go(route) {
    state.route = route;
    $nav.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.route === route);
    });
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $nav.addEventListener('click', e => {
    const btn = e.target.closest('button[data-route]');
    if (btn) go(btn.dataset.route);
  });

  // ---------- Render dispatch ----------
  function render() {
    if (!state.challenge) {
      $app.innerHTML = `<div class="empty">Loading…</div>`;
      return;
    }
    const r = state.route;
    if (r === 'home')     return renderHome();
    if (r === 'checkin')  return renderCheckin();
    if (r === 'together') return renderTogether();
    if (r === 'progress') return renderProgress();
  }

  // ---------- Top bar ----------
  function topbar() {
    const me = getMember(state.meId);
    const opts = state.members.map(m =>
      `<option value="${m.id}" ${m.id === state.meId ? 'selected' : ''}>${m.emoji} ${escapeHtml(m.name)}</option>`
    ).join('');
    const banner = window.DB_MODE === 'mock'
      ? `<div class="banner">⚠️ Demo mode (no Supabase). Add your URL + anon key in <code>supabase.js</code> to sync for real.</div>`
      : '';
    return `
      ${banner}
      <div class="topbar">
        <h1>30 days <em>together</em></h1>
        <label class="who-pill">
          <span>Viewing as</span>
          <select id="viewerSelect">${opts}</select>
        </label>
      </div>
    `;
  }

  // ---------- HOME ----------
  function renderHome() {
    const me = getMember(state.meId);
    const friend = partnerOf(state.meId);
    const today = todayDayIndex();
    const total = state.challenge.total_days;

    const myTasks = (state.tasksByMember[me.id] || []).filter(t => t.day === today);
    const myCheck = getCheckin(me.id, today) || { task_state: {} };
    const taskState = myCheck.task_state || {};

    const doneCount = myTasks.filter(t => taskState[t.id]).length;
    const pips = Array.from({ length: Math.min(total, 30) }, (_, i) => {
      const d = i + 1;
      const c = getCheckin(me.id, d);
      const cls = isDayDone(c) ? 'pip done' : 'pip';
      return `<div class="${cls}"></div>`;
    }).join('');

    const friendCheck = getCheckin(friend.id, today);

    $app.innerHTML = `
      ${topbar()}

      <div class="hero">
        <div class="label">Day ${today} of ${total} · ${fmt(new Date())}</div>
        <div class="day-num">Hi <em>${escapeHtml(me.name)}</em> ${me.emoji}</div>
        <div class="progress">${pips}</div>
      </div>

      <div class="card tinted-pink" style="margin-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div>
            <h2 class="card-title">Today's plan</h2>
            <p class="card-sub">${doneCount} of ${myTasks.length} done · tap to check off</p>
          </div>
          <button class="btn btn-soft" data-action="go-checkin">Check-in →</button>
        </div>
        <div class="tasklist" id="homeTasks">
          ${myTasks.length === 0
            ? `<div class="empty">No tasks yet for today. Add one below ↓</div>`
            : myTasks.map(t => taskRow(t, !!taskState[t.id])).join('')}
        </div>
        <div class="add-task">
          <input id="addTaskInput" placeholder="Add a task for today…" maxlength="80" />
          <button data-action="add-task">Add</button>
        </div>
      </div>

      <div class="card tinted-lilac">
        <h2 class="card-title">${friend.emoji} ${escapeHtml(friend.name)}</h2>
        <p class="card-sub">
          ${friendCheck
            ? `Checked in today ${friendCheck.completed_at ? '· ' + timeAgo(friendCheck.completed_at) : ''}`
            : `Hasn't checked in yet today.`}
        </p>
        <div class="btn-row">
          <button class="btn btn-primary btn-block" data-action="nudge">⚡ Nudge ${escapeHtml(friend.name)}</button>
        </div>
      </div>
    `;

    bindCommon();
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
      </div>
    `;
  }

  function bindHome() {
    $app.querySelectorAll('.task').forEach(row => {
      const id = row.dataset.taskId;
      row.querySelector('[data-action=toggle-task]').onclick = () => toggleTaskDone(id);
      const input = row.querySelector('[data-action=edit-task]');
      input.onblur = () => editTaskLabel(id, input.value.trim());
      input.onkeydown = e => { if (e.key === 'Enter') input.blur(); };
      row.querySelector('[data-action=delete-task]').onclick = () => removeTask(id);
    });

    $app.querySelector('[data-action=add-task]').onclick = () => {
      const input = $app.querySelector('#addTaskInput');
      const v = input.value.trim();
      if (!v) return;
      addTask(v);
      input.value = '';
    };
    $app.querySelector('#addTaskInput').onkeydown = e => {
      if (e.key === 'Enter') $app.querySelector('[data-action=add-task]').click();
    };

    $app.querySelector('[data-action=go-checkin]').onclick = () => go('checkin');
    $app.querySelector('[data-action=nudge]').onclick = () => sendNudge();
  }

  // ---------- Task mutations ----------
  async function toggleTaskDone(taskId) {
    const day = todayDayIndex();
    const me = state.meId;
    const existing = getCheckin(me, day) || {
      member_id: me, day,
      workout_done: false, home_food_done: false, ate_out: false,
      mood: null, notes: '', task_state: {},
    };
    const next = { ...existing.task_state, [taskId]: !existing.task_state[taskId] };
    const saved = await DB.upsertCheckin({ ...existing, task_state: next });
    state.checkinsByKey[ckey(me, day)] = saved;
    render();
  }

  async function addTask(label) {
    const day = state.route === 'checkin' ? state.selectedDay : todayDayIndex();
    const list = state.tasksByMember[state.meId] || [];
    const dayTasks = list.filter(t => t.day === day);
    const t = await DB.addTask(state.meId, day, label, dayTasks.length);
    state.tasksByMember[state.meId] = [...list, t];
    render();
  }

  async function editTaskLabel(taskId, label) {
    if (!label) return;
    const t = await DB.updateTask(taskId, { label });
    const list = state.tasksByMember[state.meId];
    const i = list.findIndex(x => x.id === taskId);
    if (i >= 0) list[i] = t;
  }

  async function removeTask(taskId) {
    await DB.deleteTask(taskId);
    state.tasksByMember[state.meId] =
      (state.tasksByMember[state.meId] || []).filter(t => t.id !== taskId);
    render();
  }

  // ---------- CHECK-IN ----------
  function renderCheckin() {
    const me = getMember(state.meId);
    const total = state.challenge.total_days;
    const today = todayDayIndex();
    const day = state.selectedDay || today;

    const tasks = (state.tasksByMember[me.id] || []).filter(t => t.day === day);
    const c = getCheckin(me.id, day) || {
      workout_done: false, home_food_done: false, ate_out: false,
      mood: null, notes: '', task_state: {},
    };

    const chips = Array.from({ length: total }, (_, i) => {
      const d = i + 1;
      const isToday = d === today;
      const active = d === day;
      return `<button class="day-chip ${active ? 'active' : ''}" data-day="${d}">
        ${isToday ? 'Today' : 'Day'}
        <span class="num">${d}</span>
      </button>`;
    }).join('');

    const moodEmojis = ['😞', '😕', '😐', '🙂', '🤩'];

    $app.innerHTML = `
      ${topbar()}

      <h2 style="font-family:var(--font-display);font-size:24px;margin:4px 0 12px">
        Check-in · <em style="font-style:italic;color:var(--pink-deep)">Day ${day}</em>
      </h2>

      <div class="day-chips" id="dayChips">${chips}</div>

      <div class="card">
        <div class="field">
          <div class="field-label">Workout</div>
          <div class="toggle-row">
            <button class="toggle ${c.workout_done ? 'on lilac' : ''}" data-toggle="workout_done">
              💪 ${c.workout_done ? 'Done' : 'Mark done'}
            </button>
          </div>
        </div>

        <div class="field">
          <div class="field-label">Food</div>
          <div class="toggle-row">
            <button class="toggle ${c.home_food_done ? 'on mint' : ''}" data-toggle="home_food_done">
              🍲 Home food
            </button>
            <button class="toggle ${c.ate_out ? 'on peach' : ''}" data-toggle="ate_out">
              🍕 Ate out
            </button>
          </div>
        </div>

        <div class="field">
          <div class="field-label">Mood</div>
          <div class="mood-row">
            ${moodEmojis.map((e, i) => `
              <button class="mood ${c.mood === i + 1 ? 'on' : ''}" data-mood="${i + 1}">${e}</button>
            `).join('')}
          </div>
        </div>

        <div class="field">
          <div class="field-label">Notes</div>
          <textarea class="notes" id="notesField" placeholder="How did it go? What did you eat? Anything to remember…">${escapeHtml(c.notes || '')}</textarea>
        </div>
      </div>

      <div class="card tinted-pink">
        <h3 class="card-title">Tasks for day ${day}</h3>
        <p class="card-sub">Editable — these are just for you.</p>
        <div class="tasklist">
          ${tasks.length === 0
            ? `<div class="empty">No tasks. Add one below.</div>`
            : tasks.map(t => taskRow(t, !!c.task_state?.[t.id])).join('')}
        </div>
        <div class="add-task">
          <input id="addTaskInput" placeholder="Add a task…" maxlength="80" />
          <button data-action="add-task">Add</button>
        </div>
      </div>

      <div style="height:14px"></div>
      <button class="btn btn-primary btn-block" data-action="save-checkin">💾 Save check-in</button>
    `;

    bindCommon();
    bindCheckin();
  }

  function bindCheckin() {
    $app.querySelectorAll('#dayChips .day-chip').forEach(btn => {
      btn.onclick = () => { state.selectedDay = +btn.dataset.day; render(); };
    });

    $app.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.onclick = async () => {
        const k = btn.dataset.toggle;
        await patchCheckin({ [k]: !currentDraft()[k] });
        render();
      };
    });
    $app.querySelectorAll('[data-mood]').forEach(btn => {
      btn.onclick = async () => {
        await patchCheckin({ mood: +btn.dataset.mood });
        render();
      };
    });

    // Tasks (same handlers as home)
    $app.querySelectorAll('.task').forEach(row => {
      const id = row.dataset.taskId;
      row.querySelector('[data-action=toggle-task]').onclick = async () => {
        const c = currentDraft();
        const ts = { ...(c.task_state || {}), [id]: !(c.task_state || {})[id] };
        await patchCheckin({ task_state: ts });
        render();
      };
      const input = row.querySelector('[data-action=edit-task]');
      input.onblur = () => editTaskLabel(id, input.value.trim());
      input.onkeydown = e => { if (e.key === 'Enter') input.blur(); };
      row.querySelector('[data-action=delete-task]').onclick = () => removeTask(id);
    });
    $app.querySelector('[data-action=add-task]').onclick = () => {
      const input = $app.querySelector('#addTaskInput');
      const v = input.value.trim();
      if (!v) return;
      addTask(v);
      input.value = '';
    };

    $app.querySelector('[data-action=save-checkin]').onclick = async () => {
      const notes = $app.querySelector('#notesField').value;
      await patchCheckin({ notes, completed_at: new Date().toISOString() });
      toast('Saved · nice work ✨');
      render();
    };
  }

  function currentDraft() {
    const day = state.selectedDay;
    return getCheckin(state.meId, day) || {
      member_id: state.meId, day,
      workout_done: false, home_food_done: false, ate_out: false,
      mood: null, notes: '', task_state: {},
    };
  }

  async function patchCheckin(patch) {
    const base = currentDraft();
    const row = { ...base, ...patch };
    const saved = await DB.upsertCheckin(row);
    state.checkinsByKey[ckey(saved.member_id, saved.day)] = saved;
  }

  // ---------- TOGETHER ----------
  function renderTogether() {
    const me = getMember(state.meId);
    const friend = partnerOf(state.meId);
    const today = todayDayIndex();

    const stats = (mid) => {
      let done = 0, streak = 0, run = 0;
      for (let d = 1; d <= today; d++) {
        if (isDayDone(getCheckin(mid, d))) { done++; run++; streak = Math.max(streak, run); }
        else run = 0;
      }
      return { done, streak, pct: Math.round((done / today) * 100) };
    };
    const sMe = stats(me.id);
    const sFr = stats(friend.id);

    $app.innerHTML = `
      ${topbar()}

      <h2 style="font-family:var(--font-display);font-size:24px;margin:4px 0 12px">
        <em style="font-style:italic">Together</em> 💞
      </h2>

      <div class="card">
        <div class="partner-row">
          ${partnerCard(me, sMe)}
          ${partnerCard(friend, sFr)}
        </div>
      </div>

      <div class="card tinted-lilac">
        <h3 class="card-title">Send a nudge</h3>
        <p class="card-sub">Gentle pokes for ${escapeHtml(friend.name)}.</p>
        <div style="display:grid;gap:8px">
          ${[
            "👀 your turn",
            "tap tap tap — where you at?",
            "💪 let's go, today's the day",
            "thinking of you 🌷",
          ].map(m => `<button class="btn btn-soft" data-quick="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
        </div>
        <div class="add-task" style="margin-top:10px">
          <input id="customNudge" placeholder="Or write your own…" maxlength="140" />
          <button data-action="send-custom">Send</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">Recent nudges</h3>
        <div id="nudgeFeed">
          ${state.nudges.length === 0
            ? `<div class="empty">No nudges yet. Send the first one!</div>`
            : state.nudges.slice(0, 20).map(renderNudge).join('')}
        </div>
      </div>
    `;

    bindCommon();
    $app.querySelectorAll('[data-quick]').forEach(b => {
      b.onclick = () => sendNudge(b.dataset.quick);
    });
    $app.querySelector('[data-action=send-custom]').onclick = () => {
      const input = $app.querySelector('#customNudge');
      const v = input.value.trim();
      if (!v) return;
      sendNudge(v);
      input.value = '';
    };
  }

  function partnerCard(m, s) {
    const fromColor = m.color || '#ff6fa3';
    return `
      <div class="partner">
        <div class="emoji">${m.emoji}</div>
        <div class="ring" style="--p:${s.pct};background:conic-gradient(${fromColor} ${s.pct}%, #f0e9f8 0)">
          <div>${s.pct}%</div>
        </div>
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="stat">${s.done} days · best streak ${s.streak}</div>
      </div>
    `;
  }

  function renderNudge(n) {
    const from = getMember(n.from_member_id) || { name: '—', emoji: '✨' };
    const to   = getMember(n.to_member_id)   || { name: '—' };
    return `
      <div class="nudge">
        <div class="av" style="background:${(from.color || '#ffd6e7')}33">${from.emoji}</div>
        <div class="body">
          <div class="h">${escapeHtml(from.name)} → ${escapeHtml(to.name)}${n.day ? ' · day ' + n.day : ''}</div>
          <div class="t">${escapeHtml(n.message)}</div>
          <div class="when">${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `;
  }

  async function sendNudge(message) {
    const me = state.meId;
    const friend = partnerOf(me);
    const msg = message || ['👀 your turn', 'tap tap tap — where you at?', '💪 let\'s go', '🌷 thinking of you'][Math.floor(Math.random() * 4)];
    const n = await DB.sendNudge({
      challenge_id: state.challenge.id,
      from_member_id: me, to_member_id: friend.id,
      day: todayDayIndex(), message: msg,
    });
    state.nudges = [n, ...state.nudges];
    toast(`Nudge sent to ${friend.name} ⚡`);
    if (state.route === 'together') render();
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    const me = getMember(state.meId);
    const friend = partnerOf(state.meId);
    const total = state.challenge.total_days;
    const today = todayDayIndex();

    const cells = Array.from({ length: total }, (_, i) => {
      const d = i + 1;
      const sDone = isDayDone(getCheckin(me.id, d));
      const fDone = isDayDone(getCheckin(friend.id, d));
      const both  = sDone && fDone;
      const isToday = d === today;
      return `
        <button class="cell ${both ? 'both' : ''} ${isToday ? 'today' : ''}" data-day="${d}">
          ${d}
          <div class="dot">
            <i class="${sDone ? 's' : ''}"></i>
            <i class="${fDone ? 'k' : ''}"></i>
          </div>
        </button>
      `;
    }).join('');

    $app.innerHTML = `
      ${topbar()}

      <h2 style="font-family:var(--font-display);font-size:24px;margin:4px 0 4px">
        30 <em style="font-style:italic">days</em>
      </h2>
      <p class="card-sub" style="margin-bottom:14px">
        <span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">
          <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pink-deep)"></i> ${escapeHtml(me.name)}
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px">
          <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--lilac-deep)"></i> ${escapeHtml(friend.name)}
        </span>
      </p>

      <div class="card">
        <div class="grid-30" id="progressGrid">${cells}</div>
      </div>
    `;

    bindCommon();
    $app.querySelectorAll('#progressGrid .cell').forEach(b => {
      b.onclick = () => { state.selectedDay = +b.dataset.day; go('checkin'); };
    });
  }

  // ---------- Common bindings ----------
  function bindCommon() {
    const sel = $app.querySelector('#viewerSelect');
    if (sel) {
      sel.onchange = () => {
        state.meId = sel.value;
        sessionStorage.setItem(VIEWER_KEY, state.meId);
        render();
      };
    }
  }

  // ---------- Boot ----------
  loadAll().then(render).catch(err => {
    console.error(err);
    $app.innerHTML = `<div class="empty">Couldn't load — ${escapeHtml(err.message)}</div>`;
  });
})();
