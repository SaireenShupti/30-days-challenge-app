// supabase.js — data adapter (live Supabase via REST, or in-memory mock)
// Drop in SUPABASE_URL + SUPABASE_ANON_KEY to go live. Without them, the app
// runs in demo mode (in-memory; resets on reload). No localStorage is used
// for progress data — only sessionStorage for the "viewing as" UI choice.

(function (global) {
  const SUPABASE_URL = "https://wqqeixsbecjfbenljlac.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcWVpeHNiZWNqZmJlbmxqbGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODMxNTYsImV4cCI6MjA5Mjg1OTE1Nn0.vyCVhom0lu4bzMnF8kMyPK5huMGVffYCxORDyIPJ7p8";

  const isLive = SUPABASE_URL && SUPABASE_ANON_KEY;

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

  const live = {
    async getChallenge() {
      const rows = await rest('challenges?select=*&order=created_at.asc&limit=1');
      return rows[0] || null;
    },
    async updateChallenge(id, patch) {
      const rows = await rest(`challenges?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return rows[0];
    },
    async getMembers(cid) { return rest(`members?challenge_id=eq.${cid}&select=*&order=created_at.asc`); },
    async updateMember(id, patch) {
      const rows = await rest(`members?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return rows[0];
    },
    async getTasks(mid) { return rest(`tasks?member_id=eq.${mid}&select=*&order=day.asc,position.asc`); },
    async addTask(mid, day, label, position) {
      const rows = await rest('tasks', { method: 'POST', body: JSON.stringify({ member_id: mid, day, label, position }) });
      return rows[0];
    },
    async updateTask(id, patch) {
      const rows = await rest(`tasks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return rows[0];
    },
    async deleteTask(id) { await rest(`tasks?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }); },
    async getMeals(mid) { return rest(`meals?member_id=eq.${mid}&select=*&order=day.asc,position.asc`); },
    async addMeal(mid, day, slot, label, position) {
      const rows = await rest('meals', { method: 'POST', body: JSON.stringify({ member_id: mid, day, slot, label, position }) });
      return rows[0];
    },
    async updateMeal(id, patch) {
      const rows = await rest(`meals?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return rows[0];
    },
    async deleteMeal(id) { await rest(`meals?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }); },
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
    async getNudges(cid) { return rest(`nudges?challenge_id=eq.${cid}&select=*&order=created_at.desc&limit=50`); },
    async sendNudge(row) { const rows = await rest('nudges', { method: 'POST', body: JSON.stringify(row) }); return rows[0]; },
  };

  // ---------- Mock ----------
  const mockState = {
    challenge: { id: 'c1', name: '30 Days Together', start_date: null, total_days: 30, season: 1, season_name: 'A quest for two' },
    members: [
      { id: 'm1', challenge_id: 'c1', name: 'Saireen', emoji: '🌸', color: '#FF3D7F' },
      { id: 'm2', challenge_id: 'c1', name: 'Kaisu',   emoji: '⚡', color: '#9D7FFF' },
    ],
    tasks: [], meals: [], checkins: [], nudges: [],
  };
  function uid() { return 'x' + Math.random().toString(36).slice(2, 10); }

  (function seed() {
    const taskDefaults = {
      Saireen: ['Workout (today\'s plan)', 'Home-cooked meal', '8 glasses water', '15 min reading'],
      Kaisu:   ['Workout (today\'s plan)', 'Hit protein target', '8 glasses water', '15 min reading'],
    };
    const mealDefaults = {
      Saireen: {
        breakfast: 'Oats + whey + berries',
        lunch:     'Rice 50g + chicken curry + cucumber',
        dinner:    'Dal + 1 roti + sautéed spinach',
        snack:     'Apple + 5 almonds',
      },
      Kaisu: {
        breakfast: 'Oats 35g + skyr 125g + berries',
        lunch:     'Rice 50g + chicken 100g + asparagus',
        dinner:    'Pasta 50g + lean mince 100g + greens',
        snack:     'Egg-white omelette + 1/4 avocado',
      },
    };
    for (const m of mockState.members) {
      for (let day = 1; day <= 30; day++) {
        taskDefaults[m.name].forEach((label, i) =>
          mockState.tasks.push({ id: uid(), member_id: m.id, day, label, position: i }));
        ['breakfast','lunch','dinner','snack'].forEach((slot, i) =>
          mockState.meals.push({ id: uid(), member_id: m.id, day, slot, label: mealDefaults[m.name][slot], done: false, position: i }));
      }
    }
  })();

  const mock = {
    async getChallenge() { return { ...mockState.challenge }; },
    async updateChallenge(id, patch) { Object.assign(mockState.challenge, patch); return { ...mockState.challenge }; },
    async getMembers() { return mockState.members.map(m => ({ ...m })); },
    async updateMember(id, patch) {
      const m = mockState.members.find(x => x.id === id);
      if (m) Object.assign(m, patch);
      return m ? { ...m } : null;
    },
    async getTasks(mid) { return mockState.tasks.filter(t => t.member_id === mid).map(t => ({ ...t })); },
    async addTask(mid, day, label, position) { const t = { id: uid(), member_id: mid, day, label, position }; mockState.tasks.push(t); return { ...t }; },
    async updateTask(id, patch) { const t = mockState.tasks.find(x => x.id === id); if (t) Object.assign(t, patch); return t ? { ...t } : null; },
    async deleteTask(id) { const i = mockState.tasks.findIndex(x => x.id === id); if (i >= 0) mockState.tasks.splice(i, 1); },
    async getMeals(mid) { return mockState.meals.filter(m => m.member_id === mid).map(x => ({ ...x })); },
    async addMeal(mid, day, slot, label, position) { const m = { id: uid(), member_id: mid, day, slot, label, done: false, position }; mockState.meals.push(m); return { ...m }; },
    async updateMeal(id, patch) { const m = mockState.meals.find(x => x.id === id); if (m) Object.assign(m, patch); return m ? { ...m } : null; },
    async deleteMeal(id) { const i = mockState.meals.findIndex(x => x.id === id); if (i >= 0) mockState.meals.splice(i, 1); },
    async getCheckins(ids) { return mockState.checkins.filter(c => ids.includes(c.member_id)).map(c => ({ ...c })); },
    async upsertCheckin(row) {
      const i = mockState.checkins.findIndex(c => c.member_id === row.member_id && c.day === row.day);
      const merged = { ...(i >= 0 ? mockState.checkins[i] : { id: uid() }), ...row, updated_at: new Date().toISOString() };
      if (i >= 0) mockState.checkins[i] = merged; else mockState.checkins.push(merged);
      return { ...merged };
    },
    async getNudges() { return [...mockState.nudges].sort((a,b) => b.created_at.localeCompare(a.created_at)); },
    async sendNudge(row) { const n = { id: uid(), created_at: new Date().toISOString(), read_at: null, ...row }; mockState.nudges.unshift(n); return { ...n }; },
  };

  global.DB = isLive ? live : mock;
  global.DB_MODE = isLive ? 'live' : 'mock';
})(window);
