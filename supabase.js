// supabase.js — thin data adapter.
// If SUPABASE_URL + ANON_KEY are filled in, talks to Supabase via REST.
// Otherwise falls back to an in-memory mock so the app still runs.
// No localStorage is used for final progress data.

(function (global) {
  const SUPABASE_URL = "https://wqqeixsbecjfbenljlac.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcWVpeHNiZWNqZmJlbmxqbGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODMxNTYsImV4cCI6MjA5Mjg1OTE1Nn0.vyCVhom0lu4bzMnF8kMyPK5huMGVffYCxORDyIPJ7p8";

  const isLive = SUPABASE_URL && SUPABASE_ANON_KEY;

  // ---------- REST helpers ----------
  async function rest(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': opts.prefer || 'return=representation',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
  }

  // ---------- Live API ----------
  const live = {
    async getChallenge() {
      const rows = await rest('challenges?select=*&order=created_at.asc&limit=1');
      return rows[0] || null;
    },
    async updateChallenge(id, patch) {
      const rows = await rest(`challenges?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      return rows[0];
    },
    async getMembers(challengeId) {
      return rest(`members?challenge_id=eq.${challengeId}&select=*&order=created_at.asc`);
    },
    async getTasks(memberId) {
      return rest(`tasks?member_id=eq.${memberId}&select=*&order=day.asc,position.asc`);
    },
    async addTask(memberId, day, label, position) {
      const rows = await rest('tasks', {
        method: 'POST',
        body: JSON.stringify({ member_id: memberId, day, label, position }),
      });
      return rows[0];
    },
    async updateTask(id, patch) {
      const rows = await rest(`tasks?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      return rows[0];
    },
    async deleteTask(id) {
      await rest(`tasks?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    },
    async getCheckins(memberIds) {
      const list = memberIds.map(encodeURIComponent).join(',');
      return rest(`checkins?member_id=in.(${list})&select=*`);
    },
    async upsertCheckin(row) {
      const rows = await rest('checkins?on_conflict=member_id,day', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify(row),
      });
      return rows[0];
    },
    async getNudges(challengeId) {
      return rest(`nudges?challenge_id=eq.${challengeId}&select=*&order=created_at.desc&limit=50`);
    },
    async sendNudge(row) {
      const rows = await rest('nudges', { method: 'POST', body: JSON.stringify(row) });
      return rows[0];
    },
  };

  // ---------- Mock API (in-memory, resets on reload) ----------
  const mockState = {
    challenge: {
      id: 'c1', name: '30 Days Together',
      start_date: new Date().toISOString().slice(0, 10),
      total_days: 30, season: 1,
    },
    members: [
      { id: 'm1', challenge_id: 'c1', name: 'Saireen', emoji: '🌸', color: '#ff6fa3' },
      { id: 'm2', challenge_id: 'c1', name: 'Kaisu',   emoji: '⚡', color: '#7c5cff' },
    ],
    tasks: [],   // { id, member_id, day, label, position }
    checkins: [], // { id, member_id, day, workout_done, home_food_done, ate_out, mood, notes, task_state, completed_at }
    nudges: [],
  };

  function uid() { return 'x' + Math.random().toString(36).slice(2, 10); }

  // Seed default editable tasks for each member, days 1..30
  (function seedTasks() {
    const defaults = {
      Saireen: ['Workout (today\'s plan)', 'Home-cooked meal', '8 glasses of water'],
      Kaisu:   ['Workout (today\'s plan)', 'Hit protein target',  '8 glasses of water'],
    };
    for (const m of mockState.members) {
      for (let day = 1; day <= 30; day++) {
        defaults[m.name].forEach((label, i) => {
          mockState.tasks.push({
            id: uid(), member_id: m.id, day, label, position: i,
          });
        });
      }
    }
  })();

  const mock = {
    async getChallenge() { return { ...mockState.challenge }; },
    async updateChallenge(id, patch) {
      Object.assign(mockState.challenge, patch);
      return { ...mockState.challenge };
    },
    async getMembers() { return mockState.members.map(m => ({ ...m })); },
    async getTasks(memberId) {
      return mockState.tasks
        .filter(t => t.member_id === memberId)
        .sort((a, b) => a.day - b.day || a.position - b.position)
        .map(t => ({ ...t }));
    },
    async addTask(memberId, day, label, position) {
      const t = { id: uid(), member_id: memberId, day, label, position };
      mockState.tasks.push(t); return { ...t };
    },
    async updateTask(id, patch) {
      const t = mockState.tasks.find(x => x.id === id);
      if (t) Object.assign(t, patch);
      return t ? { ...t } : null;
    },
    async deleteTask(id) {
      const i = mockState.tasks.findIndex(x => x.id === id);
      if (i >= 0) mockState.tasks.splice(i, 1);
    },
    async getCheckins(memberIds) {
      return mockState.checkins
        .filter(c => memberIds.includes(c.member_id))
        .map(c => ({ ...c }));
    },
    async upsertCheckin(row) {
      const i = mockState.checkins.findIndex(c => c.member_id === row.member_id && c.day === row.day);
      const merged = { ...(i >= 0 ? mockState.checkins[i] : { id: uid() }), ...row, updated_at: new Date().toISOString() };
      if (i >= 0) mockState.checkins[i] = merged; else mockState.checkins.push(merged);
      return { ...merged };
    },
    async getNudges() {
      return [...mockState.nudges].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async sendNudge(row) {
      const n = { id: uid(), created_at: new Date().toISOString(), read_at: null, ...row };
      mockState.nudges.unshift(n);
      return { ...n };
    },
  };

  global.DB = isLive ? live : mock;
  global.DB_MODE = isLive ? 'live' : 'mock';
})(window);
