// 梦幻西餐厅2 · UI 控制（表现层 / 交互）
// 屏幕切换 · KPI 实时刷新 · 新游戏/继续/营业/清档 · 日终/月末报表弹窗

import * as State from './state.js';
import * as Save from './save.js';
import { getRenderer } from './renderer.js';
import { makeWaiter, makeChef } from './state.js';
import { UPGRADE_KEYS, levelOf, maxLevelOf, nextLevelInfo, purchaseUpgrade, initUpgrades, syncTables, staffCapacity, isStaffUnlocked } from './upgrades.js';
import { xpProgress } from './staffXp.js';

const $ = (s) => document.querySelector(s);
const $all = (s) => document.querySelectorAll(s);

let _onToggleOpen = null;
let _onStateChange = null;
let _modal = null;

function showScreen(id) {
  $all('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  if (id === 'restaurant') {
    const r = getRenderer();
    if (r) requestAnimationFrame(() => { r.resize(); r.render(); });
  } else if (id === 'staff') {
    renderStaff();
  } else if (id === 'menu-mgmt') {
    renderMenu();
  } else if (id === 'report') {
    renderReport();
  } else if (id === 'decor') {
    renderDecor();
  }
}

function setText(sel, t) {
  const el = $(sel);
  if (el) el.textContent = t;
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function fmtMoney(n) {
  return '¥' + Math.round(Number(n)).toLocaleString('zh-CN');
}

// 载入存档后规整：清空进行中的运行时，避免“已营业但循环未启动”的冻结态
function normalizeLoaded(s) {
  if (!s.runtime) s.runtime = {};
  s.runtime.customers = [];
  s.runtime.orders = [];
  s.runtime.waitingQueue = [];
  s.runtime.dayStats = { customers: 0, ratingSum: 0, revenue: 0, cost: 0, tips: 0, angryLeft: 0, salaryPaid: 0 };
  if (!s._monthStartMoney) s._monthStartMoney = s.player.money;
  if (s._monthStartCustomers == null) s._monthStartCustomers = s.player.totalCustomers;
  if (s._monthStartRatingSum == null) s._monthStartRatingSum = s.player.totalRatingSum;
  s.time.isOperating = false;
  if (s._monthCapex == null) s._monthCapex = 0;
  // 旧存档兼容：补齐改建等级字段，并把已购等级对应的额外桌位同步回场景
  initUpgrades(s);
  const cfgN = State.getConfigs() ? State.getConfigs().gameConfig : null;
  if (cfgN) syncTables(s, cfgN);
  if (s.restaurant && s.restaurant.tables) s.restaurant.tables.forEach((t) => { t.occupied = false; t.occupantId = null; t.state = 'empty'; t._claimed = false; });
  if (s.staff) {
    s.staff.waiters.forEach((w) => { w.state = 'idle'; w.task = null; w.taskTimer = 0; });
    s.staff.chefs.forEach((c) => { c.state = 'idle'; c.busy = false; c.currentOrderId = null; });
  }
  if (s.statistics && s.statistics.totalCapex == null) s.statistics.totalCapex = 0;
  return s;
}

// 随机事件通知：按事件基调（好/坏）弹提示
export function showEventToast(ev) {
  if (!ev) return;
  const type = ev.tone === 'good' ? 'good' : ev.tone === 'bad' ? 'bad' : 'info';
  const title = (ev.icon ? ev.icon + ' ' : '') + ev.name;
  const body = ev.message || ev.desc || '';
  toast(title, body, type);
}

// 浮动提示（事件/升级）
function toast(title, body, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  const colors = type === 'good' ? 'background:#0e7a6b' : type === 'bad' ? 'background:#c0392b' : 'background:#33495f';
  el.style.cssText = colors + ';color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.25);max-width:320px;opacity:0;transition:opacity .3s;';
  el.innerHTML = '<b>' + title + '</b>' + (body ? '<br><span style="opacity:.9">' + body + '</span>' : '');
  container.appendChild(el);
  requestAnimationFrame(() => el.style.opacity = '1');
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4500);
}

// 实时刷新 KPI / 状态栏 / 营业按钮
export function updateHUD() {
  const s = State.getState();
  if (!s) return;
  const d = s.runtime ? s.runtime.dayStats : { customers: 0 };
  setText('#sys-money', '💰 ' + fmtMoney(s.player.money));
  setText('#sys-star', '⭐ ' + s.player.currentStar + '星');
  setText('#kpi-money', '💰 ' + fmtMoney(s.player.money));
  setText('#kpi-star', '⭐ ' + s.player.currentStar);
  setText('#kpi-today', '👥 ' + (d.customers || 0));
  setText('#kpi-day', '📅 第' + s.time.month + '月·第' + s.time.day + '天');
  setText('#kpi-time', '🕐 ' + pad(s.time.hour) + ':' + pad(Math.floor(s.time.minute)));
  const go = $('.op-go');
  if (go) {
    if (s.time.isOperating) { go.textContent = '营业中'; go.classList.add('operating'); }
    else { go.textContent = '营业'; go.classList.remove('operating'); }
  }
  // Phase 2：营业后隐藏提示
  const hint = $('#canvas-hint');
  if (hint) hint.style.display = s.time.isOperating ? 'none' : '';

  // 事件 / 升级提示
  if (s.runtime) {
    if (s.runtime.levelUpWaiter && s.runtime.levelUpWaiter.length) {
      for (const name of s.runtime.levelUpWaiter) toast('✨ 服务员升级', name + ' 升级了！', 'good');
      s.runtime.levelUpWaiter = [];
    }
    if (s.runtime.levelUpChef && s.runtime.levelUpChef.length) {
      for (const name of s.runtime.levelUpChef) toast('✨ 厨师升级', name + ' 升级了！', 'good');
      s.runtime.levelUpChef = [];
    }
    if (s.runtime.eventLog && s.runtime.eventLog.length) {
      const ev = s.runtime.eventLog[s.runtime.eventLog.length - 1];
      if (ev && ev._lastShown !== ev.time.hour + ':' + ev.time.minute) {
        ev._lastShown = ev.time.hour + ':' + ev.time.minute;
        toast('📢 ' + ev.name, ev.desc + (ev.message ? '<br>' + ev.message : ''), ev.id === 'thief' ? 'bad' : 'info');
      }
    }
  }
}

function handleAction(a) {
  switch (a) {
    case 'new': {
      const s = State.newGameState();
      State.setState(s);
      const r = getRenderer();
      if (r) r.setState(s);
      if (_onStateChange) _onStateChange(s); // 换绑游戏循环
      Save.save(s);
      showScreen('restaurant');
      updateHUD();
      break;
    }
    case 'continue': {
      const saved = Save.load();
      if (saved) {
        const s = normalizeLoaded(saved);
        State.setState(s);
        const r = getRenderer();
        if (r) r.setState(s);
        if (_onStateChange) _onStateChange(s); // 换绑游戏循环
        showScreen('restaurant');
        updateHUD();
      } else {
        alert('暂无存档，请先开始新游戏');
      }
      break;
    }
    case 'settings':
      showScreen('settings');
      break;
    case 'open': {
      const s = State.getState();
      if (!s) { alert('请先开始新游戏'); break; }
      s.time.isOperating = !s.time.isOperating;
      if (_onToggleOpen) _onToggleOpen(s.time.isOperating);
      updateHUD();
      break;
    }
    case 'speed': {
      const s = State.getState();
      if (!s) break;
      const order = [1, 2, 3];
      const idx = order.indexOf(s.time.speed || 1);
      s.time.speed = order[(idx + 1) % order.length];
      const btn = document.querySelector('[data-action="speed"]');
      if (btn) btn.textContent = '⏩ ' + s.time.speed + '×';
      updateHUD();
      break;
    }
    case 'reset-save': {
      if (confirm('确定清空存档？此操作不可恢复。')) {
        Save.clear();
        alert('存档已清空');
      }
      break;
    }
  }
}

export function initUI({ onToggleOpen, onStateChange } = {}) {
  _onToggleOpen = onToggleOpen;
  _onStateChange = onStateChange;
  $all('[data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.getAttribute('data-screen')));
  });
  $all('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.getAttribute('data-action')));
  });

  // 员工管理：雇佣 / 解雇（事件委托）
  const staffBody = $('#staff-body');
  if (staffBody) {
    staffBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hire],[data-fire]');
      if (!btn) return;
      const s = State.getState();
      if (!s) return;
      const cfg = State.getConfigs().gameConfig;
      if (btn.hasAttribute('data-hire')) {
        const kind = btn.getAttribute('data-hire');
        const id = btn.getAttribute('data-id');
        const cand = State.getConfigs().staff[kind === 'waiter' ? 'waiters' : 'chefs'].find((x) => x.id === id);
        if (!cand) return;
        if (!isStaffUnlocked(s, cand)) {
          toast('暂时请不来', cand.name + ' 要求餐厅达到 ★' + (cand.minStar || 1), 'bad');
          return;
        }
        const cap = staffCapacity(s, cfg);
        if (kind === 'waiter') {
          if (s.staff.waiters.length >= cap.waiters) {
            toast('编制已满', '服务生上限 ' + cap.waiters + ' 人，升星后可再扩编', 'bad');
            return;
          }
          s.staff.waiters.push(makeWaiter(cand, 0.12 + s.staff.waiters.length * 0.07, 0.13));
        } else {
          if (s.staff.chefs.length >= cap.chefs) {
            toast('编制已满', '厨师上限 ' + cap.chefs + ' 人，升星后可再扩编', 'bad');
            return;
          }
          s.staff.chefs.push(makeChef(cand, 0.55 + s.staff.chefs.length * 0.10, 0.07));
        }
        toast('已聘用 ' + cand.name, '月薪 ' + fmtMoney(cand.salary) + '，月末结算', 'good');
      } else if (btn.hasAttribute('data-fire')) {
        const kind = btn.getAttribute('data-fire');
        const id = btn.getAttribute('data-id');
        if (kind === 'waiter') s.staff.waiters = s.staff.waiters.filter((w) => w.id !== id);
        else s.staff.chefs = s.staff.chefs.filter((c) => c.id !== id);
      }
      Save.save(s);
      renderStaff();
      updateHUD();
    });
  }

  // 内部改建：购买升级
  const decorBody = $('#decor-body');
  if (decorBody) {
    decorBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-upgrade]');
      if (!btn || btn.disabled) return;
      const s = State.getState();
      if (!s) return;
      const cfg = State.getConfigs().gameConfig;
      const key = btn.getAttribute('data-upgrade');
      const r = purchaseUpgrade(s, cfg, key);
      if (r.ok) {
        toast('改建完成', r.msg, 'good');
        const rd = getRenderer();
        if (rd) rd.render(); // 加桌等变化立即反映到场景
      } else {
        toast('无法改建', r.msg, 'bad');
      }
      Save.save(s);
      renderDecor();
      updateHUD();
    });
  }

  // 菜单管理：上架开关 / 改价
  const menuBody = $('#menu-body');
  if (menuBody) {
    menuBody.addEventListener('click', (e) => {
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      const s = State.getState();
      const id = t.getAttribute('data-toggle');
      const dish = s.menu.dishes.find((d) => d.id === id);
      if (dish) { dish.enabled = !dish.enabled; Save.save(s); renderMenu(); }
    });
    menuBody.addEventListener('change', (e) => {
      const t = e.target.closest('[data-price]');
      if (!t) return;
      const s = State.getState();
      const id = t.getAttribute('data-price');
      const dish = s.menu.dishes.find((d) => d.id === id);
      if (!dish) return;
      let v = Number(t.value);
      const lo = Math.round(dish.cost * 1.5);
      const hi = Math.round(dish.cost * 5);
      if (isNaN(v)) v = dish.price;
      v = Math.max(lo, Math.min(hi, v));
      dish.price = v;
      t.value = v;
      Save.save(s);
      renderMenu();
    });
  }
}

/* ===== 员工管理界面 ===== */
function renderStaff() {
  const s = State.getState();
  const body = $('#staff-body');
  if (!s || !body) return;
  const cfg = State.getConfigs().gameConfig;
  const cand = State.getConfigs().staff;
  const capacity = staffCapacity(s, cfg);

  let salaryTotal = 0;
  s.staff.waiters.forEach((w) => (salaryTotal += w.salary));
  s.staff.chefs.forEach((c) => (salaryTotal += c.salary));

  let html =
    '<div class="cash-line">当前资金 <b>' + fmtMoney(s.player.money) + '</b> · 每月工资支出 <b class="neg">' + fmtMoney(salaryTotal) + '</b></div>';

  const section = (title, list, kind, capNow, capMax, attrsOf) => {
    const full = capNow >= capMax;
    let h = '<div class="sub-title">' + title + '（' + capNow + '/' + capMax + '）' +
      (s.player.currentStar < 3 ? '<span class="hint">升星可放开编制</span>' : '') + '</div>';
    list.forEach((p) => {
      const inst = kind === 'waiter'
        ? s.staff.waiters.find((x) => x.id === p.id)
        : s.staff.chefs.find((x) => x.id === p.id);
      const hired = !!inst;
      const unlocked = isStaffUnlocked(s, p);
      h += staffCard(kind, inst || p, hired, attrsOf(inst || p), p.salary, {
        unlocked, minStar: p.minStar || 1, note: p.note,
        blocked: !hired && full, tier: p.tier || 1,
      });
    });
    return h;
  };

  html += section('服务生', cand.waiters, 'waiter', s.staff.waiters.length, capacity.waiters,
    (p) => ['机动力 ' + p.mobility, '魅力 ' + p.charm]);
  html += section('厨师', cand.chefs, 'chef', s.staff.chefs.length, capacity.chefs,
    (p) => ['厨艺 ' + p.cooking, '速度 ' + p.speed]);

  body.innerHTML = html;
}

function staffCard(kind, p, hired, attrs, salary, meta) {
  const m = meta || {};
  const lv = p.level || 1;
  let action;
  if (hired) {
    action = '<span class="tag on">Lv.' + lv + ' 在职</span>';
  } else if (!m.unlocked) {
    action = '<span class="tag lock">★' + m.minStar + ' 解锁</span>';
  } else if (m.blocked) {
    action = '<span class="tag lock">编制已满</span>';
  } else {
    action = '<button class="mini hire" data-hire="' + kind + '" data-id="' + p.id + '">雇佣</button>';
  }
  const fire = hired
    ? '<button class="mini fire" data-fire="' + kind + '" data-id="' + p.id + '">解雇</button>'
    : '';
  // 已聘用者显示升级进度条；未聘用者显示履历
  let extra = '';
  if (hired) {
    const prog = xpProgress(p);
    extra = prog.max
      ? '<div class="xp-line"><span>已满级 Lv.' + lv + '</span></div>'
      : '<div class="xp-line"><span>Lv.' + lv + ' → ' + (lv + 1) + '</span>' +
        '<i class="xp-bar"><b style="width:' + Math.round(prog.pct) + '%"></b></i>' +
        '<span>' + Math.floor(prog.cur) + '/' + prog.need + '</span></div>';
  } else if (m.note) {
    extra = '<div class="card-note">' + m.note + '</div>';
  }
  const tierTag = (m.tier || 1) > 1 && !hired ? '<span class="tag tier' + m.tier + '">T' + m.tier + '</span>' : '';
  return (
    '<div class="card' + (!hired && !m.unlocked ? ' locked' : '') + '">' +
    '<div class="card-top"><b>' + p.name + '</b>' + tierTag + action + '</div>' +
    '<div class="card-attrs">' + attrs.join(' · ') + '</div>' +
    extra +
    '<div class="card-foot"><span>月薪 ¥' + salary + '</span>' + fire + '</div>' +
    '</div>'
  );
}

/* ===== 菜单管理界面 ===== */
function renderMenu() {
  const s = State.getState();
  const body = $('#menu-body');
  if (!s || !body) return;
  let html = '<div class="sub-title">菜品（成本×1.5 ~ ×5 可定价，灰底为停售）</div>';
  s.menu.dishes.forEach((d) => {
    const lo = Math.round(d.cost * 1.5);
    const hi = Math.round(d.cost * 5);
    html +=
      '<div class="card' + (d.enabled ? '' : ' off') + '">' +
      '<div class="card-top"><b>' + d.name + '</b><span class="tag">' + d.type + '</span></div>' +
      '<div class="card-attrs">成本 ¥' + d.cost + ' · 烹饪 ' + (d.cookTime || 0) + '分</div>' +
      '<div class="card-foot">' +
      '<label>售价 <input type="number" data-price="' + d.id + '" value="' + d.price + '" min="' + lo + '" max="' + hi + '"></label>' +
      '<button class="mini ' + (d.enabled ? 'on' : '') + '" data-toggle="' + d.id + '">' + (d.enabled ? '在售' : '停售') + '</button>' +
      '</div>' +
      '</div>';
  });
  body.innerHTML = html;
}

/* ===== 内部改建界面 ===== */
function renderDecor() {
  const s = State.getState();
  const body = $('#decor-body');
  if (!s || !body) return;
  const cfg = State.getConfigs().gameConfig;
  initUpgrades(s);

  let html =
    '<div class="sub-title">改建投资不计入月度经营纯利，不影响星级评定</div>' +
    '<div class="cash-line">当前资金 <b>' + fmtMoney(s.player.money) + '</b></div>';

  for (const key of UPGRADE_KEYS) {
    const def = cfg.upgrades && cfg.upgrades[key];
    if (!def) continue;
    const cur = levelOf(s, key);
    const max = maxLevelOf(cfg, key);
    const curLabel = def.levels[cur - 1] ? def.levels[cur - 1].label : '—';
    const next = nextLevelInfo(s, cfg, key);

    // 等级点阵
    let dots = '';
    for (let i = 1; i <= max; i++) dots += '<i class="dot' + (i <= cur ? ' on' : '') + '"></i>';

    let foot;
    if (!next) {
      foot = '<span class="tag on">已满级</span>';
    } else {
      const afford = s.player.money >= next.cost;
      foot =
        '<span class="up-next">下一级「' + next.label + '」' +
        (next.effect ? '<em>' + next.effect + '</em>' : '') + '</span>' +
        '<button class="mini buy' + (afford ? ' on' : ' disabled') + '" data-upgrade="' + key + '"' +
        (afford ? '' : ' disabled') + '>' + fmtMoney(next.cost) + '</button>';
    }

    html +=
      '<div class="card up-card">' +
      '<div class="card-top"><b>' + def.icon + ' ' + def.name + '</b>' +
      '<span class="tag">Lv.' + cur + '/' + max + ' ' + curLabel + '</span></div>' +
      '<div class="card-attrs">' + def.desc + '</div>' +
      '<div class="up-dots">' + dots + '</div>' +
      '<div class="card-foot">' + foot + '</div>' +
      '</div>';
  }

  body.innerHTML = html;
}

/* ===== 报表界面 ===== */
// 单项进度条：.bar-label 是 flex 布局，必须只给两个子元素（左标签 / 右数值）
function bar(label, cur, target, unit) {
  const u = unit || '';
  const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 100;
  const ok = cur >= target;
  const gap = Math.max(0, Math.round((target - cur) * 10) / 10);
  const right = ok
    ? '<b class="ok">' + cur + u + ' 达标 ✓</b>'
    : '<b>' + cur + u + '</b> / ' + target + u + ' <em class="gap">差 ' + gap + u + '</em>';
  return '<div class="bar-label"><span>' + label + '</span><span>' + right + '</span></div>' +
    '<div class="bar"><span class="' + (ok ? 'full' : '') + '" style="width:' + pct + '%"></span></div>';
}

function renderReport() {
  const s = State.getState();
  const body = $('#report-body');
  if (!s || !body) return;
  const cfg = State.getConfigs().gameConfig;
  const monthCust = s.player.totalCustomers - (s._monthStartCustomers || 0);
  const monthRating = monthCust > 0 ? Math.round((s.player.totalRatingSum - (s._monthStartRatingSum || 0)) / monthCust) : 0;
  const capex = s._monthCapex || 0;
  let salaryDue = 0;
  s.staff.waiters.forEach((w) => (salaryDue += w.salary));
  s.staff.chefs.forEach((c) => (salaryDue += c.salary));
  // 经营纯利口径与月末一致：现金变动 + 改建投资，再预扣本月月薪
  const cashDelta = s.player.money - (s._monthStartMoney || 0);
  const projProfit = cashDelta + capex - salaryDue;

  let html =
    '<div class="sub-title">本月经营（第 ' + s.time.month + ' 月 · 第 ' + s.time.day + ' / ' + cfg.daysPerMonth + ' 天）</div>' +
    '<div class="card">' +
    '<div class="card-top"><b>★' + s.player.currentStar + ' 餐厅</b><span class="tag">' + fmtMoney(s.player.money) + '</span></div>' +
    '<div class="stat-grid">' +
    '<div><span>累计客人</span><b>' + monthCust + ' 位</b></div>' +
    '<div><span>平均评价</span><b>' + monthRating + ' / 100</b></div>' +
    '<div><span>净现金流</span><b class="' + (cashDelta >= 0 ? 'pos' : 'neg') + '">' + (cashDelta >= 0 ? '+' : '') + fmtMoney(cashDelta) + '</b></div>' +
    '<div><span>改建投资</span><b>' + fmtMoney(capex) + '</b></div>' +
    '<div><span>待付月薪</span><b class="neg">-' + fmtMoney(salaryDue) + '</b></div>' +
    '<div><span>预估纯利</span><b class="' + (projProfit >= 0 ? 'pos' : 'neg') + '">' + (projProfit >= 0 ? '+' : '') + fmtMoney(projProfit) + '</b></div>' +
    '</div>' +
    '<div class="card-note">纯利口径＝净现金流＋改建投资－月薪。改建属资本开支，不拖累经营业绩。</div>' +
    '</div>';

  // 下一星进度
  const nextLvl = s.player.currentStar + 1;
  const nextReqObj = cfg.starRequirements[String(nextLvl)];
  if (nextReqObj) {
    const r = nextReqObj;
    html +=
      '<div class="sub-title">冲击 ★' + nextLvl + ' 进度</div>' +
      '<div class="card">' +
      bar('客流', monthCust, r.customers, ' 位') +
      bar('评价', monthRating, r.rating, ' 分') +
      (r.minProfit > 0 ? bar('纯利', Math.round(projProfit), r.minProfit, ' 元') : '') +
      '<div class="card-note">奖金 ' + fmtMoney(cfg.starBonuses[String(nextLvl)] || 0) + ' · 仅首次晋升发放</div>' +
      '</div>';
  } else {
    html += '<div class="sub-title">★★★★★ 已是五星餐厅</div><div class="card done"><div class="card-attrs">最高星级达成，继续冲营收与口碑吧！</div></div>';
  }

  html += '<div class="sub-title">升星目标</div>';
  Object.keys(cfg.starRequirements).sort((a, b) => Number(a) - Number(b)).forEach((lvl) => {
    const r = cfg.starRequirements[lvl];
    const done = s.player.currentStar >= Number(lvl);
    const bonus = cfg.starBonuses[lvl] || 0;
    html +=
      '<div class="card' + (done ? ' done' : '') + '"><div class="card-top"><b>★' + lvl + (done ? ' 已达成' : '') + '</b><span class="tag">' + (bonus > 0 ? '奖金 ' + fmtMoney(bonus) : '起始星级') + '</span></div>' +
      '<div class="card-attrs">月客流≥' + r.customers + ' · 平均评价≥' + r.rating + (r.minProfit > 0 ? ' · 月纯利≥' + fmtMoney(r.minProfit) : '') + '</div></div>';
  });

  html += '<div class="sub-title">月度历史</div>';
  if (!s.statistics.monthlyHistory || s.statistics.monthlyHistory.length === 0) {
    html += '<p class="placeholder">尚无月度记录，经营满 ' + cfg.daysPerMonth + ' 天即出首份月报</p>';
  } else {
    html += '<div class="hist"><div class="hist-head"><span>月份</span><span>客流 / 评价</span><span>纯利</span><span>改建</span></div>';
    s.statistics.monthlyHistory.slice().reverse().forEach((h) => {
      html +=
        '<div class="hist-row">' +
        '<span>第' + h.month + '月 ' + (h.promoted ? '<b class="pos">↑★' + h.star + '</b>' : '★' + h.star) + '</span>' +
        '<span>' + h.customers + '客 · ' + Math.round(h.ratingAvg) + '分</span>' +
        '<span class="' + ((h.profit || 0) >= 0 ? 'pos' : 'neg') + '">' + ((h.profit || 0) >= 0 ? '+' : '') + fmtMoney(h.profit || 0) + '</span>' +
        '<span>' + (h.capex ? fmtMoney(h.capex) : '—') + '</span>' +
        '</div>';
    });
    html += '</div>';
  }
  body.innerHTML = html;
}

/* ===== 报表弹窗 ===== */
function ensureModal() {
  if (_modal) return _modal;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = '<div class="modal-card"><div class="modal-body"></div><button class="modal-ok">继续</button></div>';
  document.body.appendChild(ov);
  ov.querySelector('.modal-ok').addEventListener('click', () => { ov.classList.remove('show'); });
  _modal = ov;
  return ov;
}

function stars(n) {
  const max = 5;
  let s = '';
  for (let i = 0; i < max; i++) s += i < n ? '★' : '☆';
  return s;
}

function openModal(title, rows, badge) {
  const ov = ensureModal();
  const body = ov.querySelector('.modal-body');
  let html = '<h3>' + title + '</h3>';
  if (badge) html += '<div class="modal-badge">' + badge + '</div>';
  html += '<div class="modal-rows">';
  for (const [k, v] of rows) html += '<div class="m-row"><span>' + k + '</span><b>' + v + '</b></div>';
  html += '</div>';
  body.innerHTML = html;
  ov.classList.add('show');
}

// 日终结算弹窗：读 statistics.lastDay（dayStats 已被 settleDay 重置）
export function showDayReport(s) {
  const d = (s.statistics && s.statistics.lastDay) || s.runtime.dayStats;
  const avg = d.customers > 0 ? Math.round(d.ratingAvg != null ? d.ratingAvg : d.ratingSum / d.customers) : 0;
  const net = (d.revenue || 0) + (d.tips || 0) - (d.cost || 0) - (d.eventLoss || 0);
  const mood = d.angryLeft === 0
    ? '今天客人都很满意 😊'
    : '有 ' + d.angryLeft + ' 位客人等太久离开了';
  const rows = [
    ['接待客人', d.customers + ' 位'],
    ['平均评价', avg + ' / 100'],
    ['营业收入', fmtMoney(d.revenue)],
    ['小费', '+' + fmtMoney(d.tips)],
    ['食材成本', '-' + fmtMoney(d.cost)],
  ];
  if (d.eventLoss > 0) rows.push(['意外损失', '-' + fmtMoney(d.eventLoss)]);
  rows.push(['当日净收', (net >= 0 ? '+' : '') + fmtMoney(net)]);
  rows.push(['愤怒离店', d.angryLeft + ' 位']);
  rows.push(['当前资金', fmtMoney(s.player.money)]);
  openModal('第 ' + (d.day != null ? d.day : s.time.day - 1) + ' 天 · 日终结算', rows, mood);
}

export function showMonthReport(s, r) {
  // 注意：endMonth 已更新 player.currentStar，是否升星只能看 r.promoted
  const badge = '<div class="big-stars">' + stars(r.promoted ? r.star : (r.currentStar || s.player.currentStar)) + '</div>' +
    (r.promoted
      ? '<div class="promote">🎉 晋升 ★' + r.star + '！奖金 +' + fmtMoney(r.bonus) + '</div>'
      : '<div class="promote hold">维持 ★' + (r.currentStar || s.player.currentStar) +
        (r.missed && r.missed.length ? ' · 差：' + r.missed.join('、') : ' · 本月未达更高标准') + '</div>');
  const rows = [
    ['本月客人', r.customers + ' 位'],
    ['平均评价', Math.round(r.ratingAvg) + ' / 100'],
    ['员工月薪', '-' + fmtMoney(r.salary || 0)],
  ];
  if (r.capex > 0) rows.push(['改建投资', '-' + fmtMoney(r.capex) + '（不计纯利）']);
  rows.push(['经营纯利', (r.profit >= 0 ? '+' : '') + fmtMoney(r.profit)]);
  rows.push(['当前资金', fmtMoney(s.player.money)]);
  openModal('第 ' + (s.time.month - 1) + ' 月 · 月末评定', rows, badge);
}
