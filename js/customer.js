// 梦幻西餐厅2 · 客人系统（逻辑层）
// 生成（按时段概率）+ 状态机：门口等待 → 入座 → 点餐 → 等上菜 → 用餐 → 结账 → 离店
// 任一段耐心耗尽 → 愤怒离店

import { pickOrder, orderBill, orderFlavor } from './menu.js';
import { payCustomer } from './economy.js';
import { computeCustomerRating } from './rating.js';
import { CUSTOMER_TYPES } from './types.js';
import { findFreeTable, doorSpot } from './restaurant.js';
import { upgradeEffects } from './upgrades.js';

const CUSTOMER_SPEED = 0.22; // 归一化/游戏分
const EAT_TIME = 8;           // 用餐时长（游戏分）
const QUEUE_CAP = 4;
const PATIENCE_WARN = 0.35;   // 剩余耐心低于此比例显示警告

// 星级名气带来的客流加成——这是「升星」的核心回报（越高星名气越大，自然客流越多）
// 覆盖全部 5 个星级，缺失时回退到已定义的最高档，避免高星反而掉客流
const STAR_TRAFFIC = { 1: 1.0, 2: 1.35, 3: 1.6, 4: 1.85, 5: 2.1 };
function starTraffic(star) {
  if (STAR_TRAFFIC[star] != null) return STAR_TRAFFIC[star];
  const keys = Object.keys(STAR_TRAFFIC).map(Number).sort((a, b) => a - b);
  return STAR_TRAFFIC[keys[keys.length - 1]];
}

export function spawnTick(s, dtGame, cfg) {
  if (!s.time.isOperating) return;
  const mult = spawnMultiplier(s, cfg) * (s.runtime.eventFactors?.spawnBoost || 1);
  const perMin = ((cfg.customerSpawn.basePerHour || 4) * mult) / 60;
  if (Math.random() < perMin * dtGame) {
    // 容量判断：有空桌，或门口队列未满
    const free = findFreeTable(s);
    if (!free && s.runtime.waitingQueue.length >= QUEUE_CAP) return;
    createCustomer(s, free);
  }
}

// 客流倍率 = 时段 × 周末 × 星级名气 × 口碑
export function spawnMultiplier(s, cfg) {
  const cs = (cfg && cfg.customerSpawn) || {};
  let m = 1;
  const h = s.time.hour;
  if ((h >= 12 && h < 14) || (h >= 18 && h < 20)) m *= cs.peakMultiplier || 2.0;
  if (s.time.day >= 6) m *= cs.weekendMultiplier || 1.5;

  // 星级越高，名气越大，自然客流越多
  m *= starTraffic(s.player.currentStar);

  // 口碑：以上月平均评价为准，偏离 70 分基准每 1 分 ±1.2%，封顶 ±25%
  const rep = s.statistics.lastMonthRatingAvg || 0;
  if (rep > 0) m *= 1 + Math.max(-0.25, Math.min(0.25, (rep - 70) * 0.012));

  // 装修档次带来的额外吸引力
  m *= upgradeEffects(s).decorTraffic;

  return m;
}

// 供 UI 显示当前客流状态
export function trafficInfo(s, cfg) {
  const h = s.time.hour;
  const isPeak = (h >= 12 && h < 14) || (h >= 18 && h < 20);
  return {
    isPeak,
    isWeekend: s.time.day >= 6,
    starBoost: starTraffic(s.player.currentStar),
    reputation: s.statistics.lastMonthRatingAvg || 0,
    multiplier: spawnMultiplier(s, cfg),
  };
}

function pickType() {
  const total = CUSTOMER_TYPES.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * total;
  for (const t of CUSTOMER_TYPES) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return CUSTOMER_TYPES[0];
}

function createCustomer(s, freeTable) {
  const type = pickType();
  const id = s.runtime.nextCustomerId++;
  // 店内氛围提升顾客耐心上限
  const patience = Math.round(type.patience * upgradeEffects(s).patience);
  const c = {
    id,
    type,
    x: 0.5,
    y: 0.02,
    tx: 0.5,
    ty: 0.02,
    state: 'waiting',
    tableId: null,
    order: null,
    orderId: null,
    patience,
    patienceMax: patience,
    waitAccum: 0,
    bill: 0,
    tip: 0,
    dishScore: 0,
    waitScore: 0,
    waiterCharm: 70,
    rating: 0,
    eatTimer: 0,
  };

  if (freeTable) {
    assignToTable(s, c, freeTable);
  } else {
    const idx = s.runtime.waitingQueue.length;
    const spot = doorSpot(idx);
    c.tx = spot.x;
    c.ty = spot.y;
    s.runtime.waitingQueue.push(id);
  }
  s.runtime.customers.push(c);
}

function assignToTable(s, c, table) {
  table.occupied = true;
  table.occupantId = c.id;
  table.state = 'seated';
  c.tableId = table.id;
  c.tx = table.x;
  c.ty = table.y - 0.04; // 坐于桌前
  c.state = 'seating';
}

// 有空桌时，从门口队列拉客入座
function pullFromQueue(s) {
  while (s.runtime.waitingQueue.length > 0) {
    const free = findFreeTable(s);
    if (!free) break;
    const id = s.runtime.waitingQueue.shift();
    const c = s.runtime.customers.find((x) => x.id === id);
    if (!c || c.state === 'angry' || c.state === 'leaving') continue;
    assignToTable(s, c, free);
  }
}

function moveToward(c, speed, dtGame) {
  const dx = c.tx - c.x;
  const dy = c.ty - c.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dtGame;
  if (dist <= step || dist < 1e-4) {
    c.x = c.tx;
    c.y = c.ty;
    return true;
  }
  c.x += (dx / dist) * step;
  c.y += (dy / dist) * step;
  return false;
}

function freeTableOf(s, c) {
  const t = s.restaurant.tables.find((t) => t.id === c.tableId);
  if (t) {
    t.occupied = false;
    t.occupantId = null;
    t.state = 'dirty';
  }
}

function angryLeave(s, c) {
  c.state = 'angry';
  s.runtime.dayStats.angryLeft += 1;
  freeTableOf(s, c);
  c.tx = 0.5;
  c.ty = 0.02;
}

export function updateCustomers(s, dtGame) {
  const list = s.runtime.customers;
  const patienceDrain = s.runtime.eventFactors?.patienceDrain || 1;
  for (const c of list) {
    switch (c.state) {
      case 'waiting': {
        c.waitAccum += dtGame;
        c.patience -= dtGame * patienceDrain;
        if (c.patience <= 0) angryLeave(s, c);
        break;
      }
      case 'seating': {
        if (moveToward(c, CUSTOMER_SPEED, dtGame)) c.state = 'ordering';
        break;
      }
      case 'ordering': {
        c.waitAccum += dtGame;
        c.patience -= dtGame * patienceDrain;
        if (c.patience <= 0) angryLeave(s, c);
        break;
      }
      case 'waitingFood': {
        c.waitAccum += dtGame;
        c.patience -= dtGame * patienceDrain;
        if (c.patience <= 0) angryLeave(s, c);
        break;
      }
      case 'eating': {
        c.eatTimer -= dtGame;
        if (c.eatTimer <= 0) c.state = 'paying';
        break;
      }
      case 'paying': {
        // 由服务员 collect 任务触发结账（见 staff.js）
        break;
      }
      case 'leaving':
      case 'angry': {
        if (moveToward(c, CUSTOMER_SPEED, dtGame)) c._done = true;
        break;
      }
    }
  }

  // 清理离店顾客
  s.runtime.customers = list.filter((c) => !c._done);

  // 有空桌则拉队列
  pullFromQueue(s);
}

// 服务员点餐后创建订单（由 staff.js 调用）
export function takeOrderFor(s, c, waiter) {
  const order = pickOrder(s, c.type);
  if (order.length === 0) return null;
  const oid = s.runtime.nextOrderId++;
  s.runtime.orders.push({
    id: oid,
    tableId: c.tableId,
    customerId: c.id,
    dishes: order,
    status: 'cooking',
    remaining: order.reduce((a, d) => a + (d.cookTime || 3), 0),
    chefId: null,
  });
  c.order = order;
  c.orderId = oid;
  c.bill = orderBill(order);
  c.tip = Math.round(c.bill * c.type.tipRate);
  c.dishScore = orderFlavor(order);
  c.waiterCharm = waiter ? waiter.charm : 70;
  c.state = 'waitingFood';
  const t = s.restaurant.tables.find((t) => t.id === c.tableId);
  if (t) t.state = 'ordered';
  return oid;
}

// 服务员送达后，顾客开始用餐
export function serveTo(s, c) {
  c.state = 'eating';
  c.eatTimer = EAT_TIME;
  const t = s.restaurant.tables.find((t) => t.id === c.tableId);
  if (t) t.state = 'eating';
  // 等待评分：等待越久分越低
  const ratio = Math.min(1, c.waitAccum / c.patienceMax);
  c.waitScore = Math.max(0, Math.round(100 - ratio * 100));
}

// 服务员收账后，计算评分并结账
export function collectFrom(s, c) {
  const factors = s.runtime.eventFactors || {};
  let base = computeCustomerRating({
    waitScore: c.waitScore,
    dishScore: c.dishScore,
    charm: c.waiterCharm,
    decorLevel: s.restaurant.decorLevel,
  });
  base = Math.min(100, base + (factors.ratingBonus || 0));
  c.rating = base;
  payCustomer(s, c, null);
  freeTableOf(s, c);
  c.state = 'leaving';
  c.tx = 0.5;
  c.ty = 0.02;
}

export const CUSTOMER_STATE_META = {
  waiting: { label: '等待入座', color: '#f59e0b' },
  seating: { label: '入座中', color: '#f59e0b' },
  ordering: { label: '点餐中', color: '#f59e0b' },
  waitingFood: { label: '等上菜', color: '#f59e0b' },
  eating: { label: '用餐中', color: '#10b981' },
  paying: { label: '结账中', color: '#7c3aed' },
  leaving: { label: '离店', color: '#94a3b8' },
  angry: { label: '愤怒离店', color: '#ef4444' },
};
