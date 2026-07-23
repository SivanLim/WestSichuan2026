const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const clone = (o) => JSON.parse(JSON.stringify(o));
let DATA = null;
let mode = 'local';          // 'supabase' | 'local'
let sb = null;               // supabase client
const CFG = window.APP_CONFIG || {};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));

// ---------------- 数据读写 ----------------
async function loadData() {
  if (mode === 'supabase') {
    const { data, error } = await sb.from('travel_data').select('data').eq('id', 1).maybeSingle();
    if (data && data.data) DATA = data.data;
    else { DATA = clone(window.SEED_DATA); await saveData(); }
  } else {
    const raw = localStorage.getItem('travel-data');
    DATA = raw ? JSON.parse(raw) : clone(window.SEED_DATA);
  }
  renderAll();
}
async function saveData() {
  if (mode === 'supabase') {
    const { error } = await sb.from('travel_data').upsert({ id: 1, data: DATA, updated_at: new Date().toISOString() });
    if (error) { toast('保存失败：' + error.message); return false; }
  } else {
    localStorage.setItem('travel-data', JSON.stringify(DATA));
  }
  return true;
}
function subscribeRealtime() {
  if (mode !== 'supabase') return;
  sb.channel('travel-data-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'travel_data' }, (payload) => {
      if (payload.new && payload.new.data) { DATA = payload.new.data; renderAll(); }
    })
    .subscribe();
}

// ---------------- 登录（仅云端模式） ----------------
async function enter() {
  if (!sb) { $('#loginErr').textContent = '⚠️ 云端未连接，请刷新页面重试（若反复出现，检查 config.js 配置）'; return; }
  const email = CFG.LOGIN_EMAIL || 'travel@example.com';
  const password = $('#pw').value;
  if (!password) { $('#loginErr').textContent = '请输入密码'; return; }
  $('#loginBtn').disabled = true;
  // 先尝试登录；若账号还不存在（首人使用），自动注册
  let { error } = await sb.auth.signInWithPassword({ email, password });
  if (error && /Invalid login credentials/.test(error.message)) {
    const r2 = await sb.auth.signUp({ email, password });
    if (r2.error) { $('#loginErr').textContent = '出错：' + r2.error.message; $('#loginBtn').disabled = false; return; }
    toast('已创建共享账号，欢迎～');
  } else if (error) {
    $('#loginErr').textContent = '出错：' + error.message; $('#loginBtn').disabled = false; return;
  }
  onLoggedIn();
}
function onLoggedIn() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  loadData();
  subscribeRealtime();
}
$('#loginBtn').onclick = enter;
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });
$('#logoutBtn').onclick = async () => {
  if (mode === 'supabase') await sb.auth.signOut();
  location.reload();
};

// ---------------- tabs ----------------
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('#' + t.dataset.tab).classList.add('active');
});

// ---------------- 行程 ----------------
$('#planForm').onsubmit = async (e) => {
  e.preventDefault(); const f = e.target;
  DATA.itinerary.push({ id: uid(), date: f.date.value, time: f.time.value, title: f.title.value, place: f.place.value, note: f.note.value });
  f.reset(); await saveData(); renderPlan(); toast('已添加');
};
function renderPlan() {
  const el = $('#planList');
  const list = DATA.itinerary.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  el.innerHTML = list.map(i => `<div class="card">
      <div class="body">
        <div class="title">${esc(i.title)} ${i.date ? '<span class="tag">' + esc(i.date) + (i.time ? ' ' + esc(i.time) : '') + '</span>' : ''}</div>
        ${i.place ? '<div class="meta">📍 ' + esc(i.place) + '</div>' : ''}
        ${i.note ? '<div class="note">' + esc(i.note).replace(/\n/g, '<br>') + '</div>' : ''}
      </div>
      <button class="del" data-del-plan="${i.id}">×</button>
    </div>`).join('') || '<p class="meta">还没有安排，加一条吧。</p>';
  $$('[data-del-plan]').forEach(b => b.onclick = async () => {
    DATA.itinerary = DATA.itinerary.filter(x => x.id !== b.dataset.delPlan); await saveData(); renderPlan();
  });
}

// ---------------- 费用 ----------------
$('#moneyForm').onsubmit = async (e) => {
  e.preventDefault(); const f = e.target;
  DATA.expenses.push({ id: uid(), who: f.who.value, amount: f.amount.value, currency: f.currency.value, what: f.what.value, date: f.date.value });
  f.reset(); f.currency.value = '¥'; await saveData(); renderMoney(); toast('已记账');
};
$('#splitN').onchange = renderMoney;
function renderMoney() {
  const N = Math.max(1, parseInt($('#splitN').value) || 4);
  const ex = DATA.expenses;
  const total = ex.reduce((s, x) => s + (+x.amount || 0), 0);
  const bal = {};
  ex.forEach(x => { const amt = +x.amount || 0; bal[x.who] = (bal[x.who] || 0) + amt - amt / N; });
  let creditors = Object.entries(bal).filter(([_, v]) => v > 0.01).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  let debtors = Object.entries(bal).filter(([_, v]) => v < -0.01).map(([k, v]) => ({ k, v: -v })).sort((a, b) => b.v - a.v);
  const lines = [];
  while (creditors.length && debtors.length) {
    const c = creditors[0], d = debtors[0];
    const pay = Math.min(c.v, d.v);
    lines.push(`<div>${esc(d.k)} 应付 <b>${pay.toFixed(2)}</b> 给 ${esc(c.k)}</div>`);
    c.v -= pay; d.v -= pay;
    if (c.v <= 0.01) creditors.shift();
    if (d.v <= 0.01) debtors.shift();
  }
  $('#settle').innerHTML = `<h3>AA 结算（平分 ${N} 人，合计 ${total.toFixed(2)}）</h3>` +
    (lines.length ? lines.join('') : '<div class="ok">已结清 🎉</div>');
  $('#moneyList').innerHTML = ex.slice().reverse().map(x => `<div class="card">
      <div class="body">
        <div class="title">${esc(x.currency)}${esc(x.amount)} · ${esc(x.what || '—')}</div>
        <div class="meta"><span class="tag">${esc(x.who)}付</span>${esc(x.date || '')}</div>
      </div>
      <button class="del" data-del-money="${x.id}">×</button>
    </div>`).join('') || '<p class="meta">还没记账。</p>';
  $$('[data-del-money]').forEach(b => b.onclick = async () => {
    DATA.expenses = DATA.expenses.filter(x => x.id !== b.dataset.delMoney); await saveData(); renderMoney();
  });
}

// ---------------- 清单 ----------------
$('#listForm').onsubmit = async (e) => {
  e.preventDefault(); const f = e.target;
  DATA.checklist.push({ id: uid(), text: f.text.value, by: f.by.value, done: false });
  f.reset(); await saveData(); renderList(); toast('已添加');
};
function renderList() {
  const done = DATA.checklist.filter(x => x.done).length;
  $('#listBox').innerHTML = `<div class="meta" style="margin-bottom:6px">已完成 ${done}/${DATA.checklist.length}</div>` +
    DATA.checklist.map(x => `<div class="check-item ${x.done ? 'done' : ''}">
      <input type="checkbox" ${x.done ? 'checked' : ''} data-check="${x.id}" />
      <span class="txt">${esc(x.text)}</span>
      ${x.by ? `<span class="by">${esc(x.by)}</span>` : ''}
      <button class="del" data-del-list="${x.id}">×</button>
    </div>`).join('') || '<p class="meta">清单是空的。</p>';
  $$('[data-check]').forEach(c => c.onchange = async () => {
    const it = DATA.checklist.find(x => x.id === c.dataset.check); if (it) it.done = c.checked;
    await saveData(); renderList();
  });
  $$('[data-del-list]').forEach(b => b.onclick = async () => {
    DATA.checklist = DATA.checklist.filter(x => x.id !== b.dataset.delList); await saveData(); renderList();
  });
}

// ---------------- 注意事项 ----------------
const NOTE_MAP = { nWeather: 'weather', nTemp: 'temperature', nCloth: 'clothing', nMed: 'medication' };
Object.entries(NOTE_MAP).forEach(([id, field]) => {
  const el = $(id);
  if (el) el.addEventListener('change', async () => {
    DATA.notes[field] = el.value; await saveData(); toast('已保存');
  });
});
function renderNotes() {
  for (const [id, field] of Object.entries(NOTE_MAP)) {
    const el = $(id);
    if (document.activeElement !== el) el.value = DATA.notes[field] || '';   // 不在编辑时才回填，避免打断输入
  }
  $('#customList').innerHTML = DATA.notes.custom.map((c, i) => `<div class="card">
      <div class="body"><div class="title">${esc(c)}</div></div>
      <button class="del" data-del-custom="${i}">×</button>
    </div>`).join('') || '<p class="meta">暂无。</p>';
  $$('[data-del-custom]').forEach(b => b.onclick = async () => {
    DATA.notes.custom.splice(+b.dataset.delCustom, 1); await saveData(); renderNotes();
  });
}
$('#customForm').onsubmit = async (e) => {
  e.preventDefault(); const f = e.target;
  DATA.notes.custom.push(f.text.value); f.reset(); await saveData(); renderNotes(); toast('已添加');
};

// ---------------- 渲染入口 ----------------
function renderAll() {
  renderPlan(); renderMoney(); renderList(); renderNotes();
}

// ---------------- 启动 ----------------
(async function init() {
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      // 验证客户端是否真的创建成功（有 auth 方法）
      if (!sb || !sb.auth) throw new Error('Supabase 客户端创建失败');
      mode = 'supabase';
      $('#loginEmail').textContent = CFG.LOGIN_EMAIL || 'travel@example.com';
      $('#modeHint').textContent = '云端四人共享模式';
      const { data: { session } } = await sb.auth.getSession();
      if (session) onLoggedIn();
    } catch (e) {
      console.error('云端模式初始化失败，回退到本地模式：', e);
      mode = 'local';
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#modeHint').textContent = '⚠️ 云端连接失败，已切换到本机预览模式';
      loadData();
    }
  } else if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
    // 已配置云端，但 Supabase 库没加载成功（如网络拦截）
    $('#modeHint').textContent = '⚠️ 云端组件未加载';
    $('#loginErr').textContent = '云端组件加载失败，请下拉刷新页面后重试';
    // 保留登录页，不静默进入本地模式
  } else {
    mode = 'local';
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#modeHint').textContent = '本机预览模式（仅本浏览器，不会共享）';
    loadData();
  }
})();
