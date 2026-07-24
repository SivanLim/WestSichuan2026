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

// 📋 复制文本到剪贴板
function copyText(text, label) {
  if (!text) { toast('没有可复制的内容'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('已复制：' + (label || text))).catch(() => fallbackCopy(text, label));
  } else {
    fallbackCopy(text, label);
  }
}
function fallbackCopy(text, label) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('已复制：' + (label || text)); } catch(e) { toast('复制失败，请手动选择复制'); }
  document.body.removeChild(ta);
}

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
  // 兼容：旧数据缺少 tickets 字段时补上
  if (!DATA.tickets) DATA.tickets = clone(window.SEED_DATA.tickets || []);
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
$('#resetBtn').onclick = async () => {
  if (!confirm('确定把全部内容（行程 / 费用 / 待办清单 / 门票预订）恢复为默认初始值吗？\n此操作会覆盖当前云端已填内容，包括之前测试乱填的数据，且无法撤销。')) return;
  DATA = clone(window.SEED_DATA);
  const ok = await saveData();
  if (ok) { renderAll(); toast('已重置为默认（测试数据已清除）'); }
  else toast('重置失败，请重试');
};

// ---------------- tabs ----------------
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('#' + t.dataset.tab).classList.add('active');
});

// ---------------- SVG 路线示意图生成 ----------------
function buildRouteSvg(legs) {
  if (!legs || !legs.length) return '';
  const W = 320, H = legs.length * 36 + 20;
  let dots = [], lines = [];
  let y = 24;
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    const x1 = 30, x2 = W - 30;
    dots.push(`<circle cx="${x1}" cy="${y}" r="6" fill="#3b82f6" stroke="#fff" stroke-width="2"/>`);
    dots.push(`<circle cx="${x2}" cy="${y}" r="6" fill="#ef4444" stroke="#fff" stroke-width="2"/>`);
    lines.push(`<line x1="${x1+8}" y1="${y}" x2="${x2-8}" y2="${y}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6,4"/>`);
    // arrow at end
    lines.push(`<polygon points="${x2-10},${y-4} ${x2},${y} ${x2-10},${y+4}" fill="#94a3b8"/>`);
    // labels
    dots.push(`<text x="${x1}" y="${y-10}" text-anchor="middle" font-size="11" fill="#3b82f6" font-weight="600">${esc(l.from)}</text>`);
    dots.push(`<text x="${x2}" y="${y-10}" text-anchor="middle" font-size="11" fill="#ef4444" font-weight="600">${esc(l.to)}</text>`);
    // distance
    dots.push(`<text x="${(x1+x2)/2}" y="${y-4}" text-anchor="middle" font-size="10" fill="#64748b">${l.km}km · ${l.min}分钟</text>`);
    y += 36;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="route-svg" xmlns="http://www.w3.org/2000/svg">${lines.join('')}${dots.join('')}</svg>`;
}

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
        ${i.dur ? '<span class="dur">⏱ ' + esc(i.dur) + '</span>' : ''}
        ${i.legs && i.legs.length ? '<div class="legs">🚗 行车预估：' + i.legs.map(l => esc(l.from) + ' → ' + esc(l.to) + '：<b>' + l.km + 'km</b> · 约' + l.min + '分钟').join('；') + '</div>' : ''}
        ${i.spots && i.spots.length ? '<div class="spots">' + i.spots.map(s =>
            '<span class="spot"><b>' + esc(s.name) + '</b>' +
            '<button class="copy-btn" data-copy="' + encodeURIComponent(s.copyText || s.name) + '" title="复制名称去百度地图搜">📋 复制</button>' +
            (s.ticket ? '<a class="spot-link ticket" href="' + esc(s.ticket) + '" target="_blank" rel="noopener">🎫 购票</a>' : '<span class="spot-free">免费</span>') +
            '</span>'
          ).join('') + '</div>' : ''}
        ${buildRouteSvg(i.legs)}
        ${(i.sunset || i.weather || i.clothing) ? '<div class="info-bar">' +
          (i.sunset ? '<div class="info-item">🌅 日落 <b>' + esc(i.sunset) + '</b></div>' : '') +
          (i.weather ? '<div class="info-item">🌤️ 天气 <b>' + esc(i.weather) + '</b></div>' : '') +
          (i.clothing ? '<div class="info-item">👕 穿搭 <b>' + esc(i.clothing) + '</b></div>' : '') +
          '</div>' : ''}
        ${i.note ? '<div class="note">' + esc(i.note).replace(/\n/g, '<br>').replace(/(\d{1,2}:\d{2})/g, '<span class="time">$1</span>') + '</div>' : ''}
      </div>
      <button class="del" data-del-plan="${i.id}">×</button>
    </div>`).join('') || '<p class="meta">还没有安排，加一条吧。</p>';
  $$('[data-del-plan]').forEach(b => b.onclick = async () => {
    DATA.itinerary = DATA.itinerary.filter(x => x.id !== b.dataset.delPlan); await saveData(); renderPlan();
  });
  // 绑定复制按钮
  $$('[data-copy]').forEach(btn => btn.onclick = () => {
    copyText(decodeURIComponent(btn.dataset.copy), decodeURIComponent(btn.dataset.copy));
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
  const P = ex.filter(x => x.who === '胖哥').reduce((s, x) => s + (+x.amount || 0), 0);
  const H = ex.filter(x => x.who === '华老师').reduce((s, x) => s + (+x.amount || 0), 0);
  const share = total / N;
  const diff = P - H;
  let settleHtml;
  if (Math.abs(diff) < 0.01) {
    settleHtml = '<div class="ok">已结清 🎉 两人付得一样多</div>';
  } else if (diff > 0) {
    settleHtml = `<div>华老师 应付 <b>¥${(diff / 2).toFixed(2)}</b> 给 胖哥</div><div class="muted">（胖哥多付的部分，两人互相抵消后的净额）</div>`;
  } else {
    settleHtml = `<div>胖哥 应付 <b>¥${(-diff / 2).toFixed(2)}</b> 给 华老师</div><div class="muted">（华老师多付的部分，两人互相抵消后的净额）</div>`;
  }
  $('#settle').innerHTML = `<h3>实时结算（平分 ${N} 人 · 合计 ¥${total.toFixed(2)}）</h3>` +
    `<div>胖哥 已付 <b>¥${P.toFixed(2)}</b> ｜ 华老师 已付 <b>¥${H.toFixed(2)}</b></div>` +
    `<div class="muted">每人应承担 ¥${share.toFixed(2)}</div>` +
    `<hr class="sline">` + settleHtml;
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
  DATA.checklist.push({ id: uid(), type: 'todo', text: f.text.value, by: f.by.value, done: false });
  f.reset(); await saveData(); renderList(); toast('已添加');
};
function renderTodo(x) {
  return `<div class="check-item ${x.done ? 'done' : ''}">
      <input type="checkbox" ${x.done ? 'checked' : ''} data-check="${x.id}" />
      <span class="txt">${esc(x.text)}</span>
      ${x.by ? `<span class="by">${esc(x.by)}</span>` : ''}
      <button class="del" data-del-list="${x.id}">×</button>
    </div>`;
}
function renderHotel(x) {
  const sel = (v) => v === x.by ? 'selected' : '';
  const hotelSummary = (x.name || '___') + ' ' + (x.location || '');
  return `<div class="hotel ${x.confirmed ? 'confirmed' : ''}" data-hotel="${x.id}">
    <div class="h-top">
      <span class="h-label">🏨 ${esc(x.label)}</span>
      ${x.confirmed ? '<span class="h-ok">✅ 已确认</span>' : '<span class="h-wait">⏳ 待确认</span>'}
      <button class="del" data-del-list="${x.id}">×</button>
    </div>
    <div class="h-row">
      <label>入住<input type="date" class="h-checkin" value="${esc(x.checkin || '')}" /></label>
      <label>离店<input type="date" class="h-checkout" value="${esc(x.checkout || '')}" /></label>
    </div>
    <div class="h-row">
      <label class="h-name-label">酒店名称<input type="text" class="h-name" placeholder="订的酒店名（可填空格）" value="${esc(x.name || '')}" /></label>
    </div>
    <div class="h-row">
      <label class="h-loc-label">位置<input type="text" class="h-loc" placeholder="酒店/民宿位置" value="${esc(x.location || '')}" /></label>
    </div>
    <div class="h-row h-summary-row">
      <span class="h-summary" id="summary-${x.id}">${esc(hotelSummary)}</span>
      <button class="copy-btn h-copy-btn" data-hotel-copy="${x.id}" title="复制酒店信息去百度地图搜">📋 复制</button>
    </div>
    <div class="h-row">
      <label>负责人
        <select class="h-by">
          <option value="" ${sel('')}>待定</option>
          <option value="胖哥" ${sel('胖哥')}>胖哥</option>
          <option value="Leo" ${sel('Leo')}>Leo</option>
          <option value="华老师" ${sel('华老师')}>华老师</option>
          <option value="AT" ${sel('AT')}>AT</option>
        </select>
      </label>
      <button class="h-confirm" data-confirm-hotel="${x.id}">确认</button>
    </div>
    ${x.confirmed ? `<div class="h-status">当前负责人：<b>${esc(x.by || '待定')}</b>${x.confirmedAt ? '（' + esc(x.confirmedAt) + '）' : ''}</div>` : ''}
  </div>`;
}
function renderList() {
  const todos = DATA.checklist.filter(x => x.type !== 'hotel');
  const done = todos.filter(x => x.done).length;
  $('#listBox').innerHTML =
    (todos.length ? `<div class="meta" style="margin-bottom:6px">普通待办已完成 ${done}/${todos.length}</div>` : '') +
    DATA.checklist.map(x => x.type === 'hotel' ? renderHotel(x) : renderTodo(x)).join('') || '<p class="meta">清单是空的。</p>';
  $$('[data-check]').forEach(c => c.onchange = async () => {
    const it = DATA.checklist.find(x => x.id === c.dataset.check); if (it) it.done = c.checked;
    await saveData(); renderList();
  });
  $$('[data-del-list]').forEach(b => b.onclick = async () => {
    DATA.checklist = DATA.checklist.filter(x => x.id !== b.dataset.delList); await saveData(); renderList();
  });
  $$('[data-confirm-hotel]').forEach(b => b.onclick = async () => {
    const id = b.dataset.confirmHotel;
    const card = b.closest('[data-hotel]');
    const it = DATA.checklist.find(x => x.id === id);
    if (!it || !card) return;
    it.checkin = card.querySelector('.h-checkin').value;
    it.checkout = card.querySelector('.h-checkout').value;
    it.name = card.querySelector('.h-name').value;
    it.location = card.querySelector('.h-loc').value;
    it.by = card.querySelector('.h-by').value;
    it.confirmed = true;
    const d = new Date();
    it.confirmedAt = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    await saveData(); renderList(); toast('已确认：' + (it.by || '待定'));
  });
  // 酒店复制按钮
  $$('[data-hotel-copy]').forEach(b => b.onclick = () => {
    const id = b.dataset.hotelCopy;
    const it = DATA.checklist.find(x => x.id === id);
    if (!it) return;
    const name = it.name || '（待填）';
    const loc = it.location || '（待填）';
    const text = name + ' ' + loc;
    copyText(text, text);
  });
}

// ---------------- 门票预订 ----------------
function renderTickets() {
  const el = $('#ticketList');
  if (!DATA.tickets || !DATA.tickets.length) {
    el.innerHTML = '<p class="meta">暂无门票信息。</p>'; return;
  }
  el.innerHTML = DATA.tickets.map(g => {
    const doneCount = g.items.filter(x => x.done).length;
    return `<div class="ticket-group">
      <div class="tg-header">
        <span class="tg-date">${esc(g.date)}</span>
        <span class="tg-title">${esc(g.dayRef ? ('Day' + g.dayRef.replace('d','')) : '')} 门票</span>
        <span class="tg-progress">✅ ${doneCount}/${g.items.length}</span>
      </div>
      ${g.items.map(item => `
        <div class="ticket-item ${item.done ? 'done' : ''}">
          <div class="ti-top">
            <input type="checkbox" ${item.done ? 'checked' : ''} data-tick="${g.id}-${item.name}" />
            <div class="ti-info">
              <div class="ti-name"><b>${esc(item.name)}</b><button class="copy-btn ti-copy-btn" data-tick-copy="${esc(item.name)}" title="复制名称去公众号/抖音搜索">📋</button></div>
              <div class="ti-price">${esc(item.price)}</div>
              <div class="ti-channel">🔗 ${esc(item.channel)}</div>
              <div class="ti-ahead">⏰ ${esc(item.ahead)}</div>
              <div class="ti-tips">💡 ${esc(item.tips)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }).join('');
  // 绑定 checkbox
  $$('[data-tick]').forEach(c => c.onchange = async () => {
    const key = c.dataset.tick; // "groupId-name"
    const idx = key.lastIndexOf('-');
    const gid = key.substring(0, idx);
    const nm = key.substring(idx + 1);
    const g = DATA.tickets.find(t => t.id === gid);
    if (g) { const item = g.items.find(i => i.name === nm); if (item) item.done = c.checked; }
    await saveData(); renderTickets();
  });
  // 绑定门票名称复制按钮
  $$('[data-tick-copy]').forEach(btn => btn.onclick = () => {
    copyText(btn.dataset.tickCopy, btn.dataset.tickCopy);
  });
}

// ---------------- 渲染入口 ----------------
function renderAll() {
  renderPlan(); renderMoney(); renderList(); renderTickets();
}

// ---------------- 启动 ----------------
(async function init() {
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
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
    $('#modeHint').textContent = '⚠️ 云端组件未加载';
    $('#loginErr').textContent = '云端组件加载失败，请下拉刷新页面后重试';
  } else {
    mode = 'local';
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#modeHint').textContent = '本机预览模式（仅本浏览器，不会共享）';
    loadData();
  }
})();
