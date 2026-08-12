// 梦幻西餐厅2 · 员工系统（逻辑层）
// 服务员任务调度：收账 > 送餐 > 点餐 > 清桌；带移动与任务时长
// 厨师烹饪在 kitchen.js 中处理（固定站位厨房）

import { takeOrderFor, serveTo, collectFrom } from './customer.js';
import { addWaiterXp } from './staffXp.js';

const WAITER_BASE_SPEED = 0.40; // 归一化/游戏分（提速让服务更跟手）
const DURATIONS = { collect: 1.5, deliver: 1.5, takeOrder: 1.5, clear: 2 };

const cust = (s, id) => s.runtime.customers.find((c) => c.id === id);
const order = (s, id) => s.runtime.orders.find((o) => o.id === id);
const table = (s, id) => s.restaurant.tables.find((t) => t.id === id);

function findJob(s, w) {
  for (const c of s.runtime.customers)
    if (c.state === 'paying' && !c._claimed) return { type: 'collect', tableId: c.tableId, custId: c.id };
  for (const o of s.runtime.orders)
    if (o.status === 'ready' && !o._claimed) return { type: 'deliver', tableId: o.tableId, orderId: o.id };
  for (const c of s.runtime.customers)
    if (c.state === 'ordering' && !c._claimed) return { type: 'takeOrder', tableId: c.tableId, custId: c.id };
  for (const t of s.restaurant.tables)
    if (t.state === 'dirty' && !t._claimed) return { type: 'clear', tableId: t.id };
  return null;
}

function claim(s, job) {
  if (job.type === 'collect' || job.type === 'takeOrder') {
    const c = cust(s, job.custId);
    if (c) c._claimed = true;
  } else if (job.type === 'deliver') {
    const o = order(s, job.orderId);
    if (o) o._claimed = true;
  } else if (job.type === 'clear') {
    const t = table(s, job.tableId);
    if (t) t._claimed = true;
  }
}
function unclaim(s, job) {
  if (job.type === 'collect' || job.type === 'takeOrder') {
    const c = cust(s, job.custId);
    if (c) c._claimed = false;
  } else if (job.type === 'deliver') {
    const o = order(s, job.orderId);
    if (o) o._claimed = false;
  } else if (job.type === 'clear') {
    const t = table(s, job.tableId);
    if (t) t._claimed = false;
  }
}

// 事件因数：员工手脚快慢（士气高涨等）
const speedFactor = (s) => (s.runtime.eventFactors && s.runtime.eventFactors.staffSpeed) || 1;
const waiterSpeed = (s, w) => WAITER_BASE_SPEED * ((w.mobility || 70) / 70) * speedFactor(s);

function moveToward(e, speed, dtGame) {
  const dx = e.tx - e.x;
  const dy = e.ty - e.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dtGame;
  if (dist <= step || dist < 1e-4) {
    e.x = e.tx;
    e.y = e.ty;
    return true;
  }
  e.x += (dx / dist) * step;
  e.y += (dy / dist) * step;
  return false;
}

function completeTask(s, w) {
  const job = w.task;
  switch (job.type) {
    case 'collect': {
      const c = cust(s, job.custId);
      if (c) collectFrom(s, c);
      break;
    }
    case 'deliver': {
      const o = order(s, job.orderId);
      const c = o ? cust(s, o.customerId) : null;
      if (o && c) {
        serveTo(s, c);
        // 出餐完成，移出订单队列
        s.runtime.orders = s.runtime.orders.filter((x) => x.id !== o.id);
      }
      break;
    }
    case 'takeOrder': {
      const c = cust(s, job.custId);
      if (c) takeOrderFor(s, c, w);
      break;
    }
    case 'clear': {
      const t = table(s, job.tableId);
      if (t) t.state = 'empty';
      break;
    }
  }
  // 任务完成获得经验（收账/送餐经验更高）
  const factor = job.type === 'collect' ? 1.5 : job.type === 'deliver' ? 1.3 : 1;
  if (addWaiterXp(w, factor)) {
    s.runtime.levelUpWaiter = s.runtime.levelUpWaiter || [];
    s.runtime.levelUpWaiter.push(w.name || w.id);
  }
}

// 认领标记（_claimed）改为「每帧由员工当前任务反推」，而不是长期维护的可变状态。
// 原先若服务生在任务进行中遇到日终重置，标记会永久残留，导致该桌/该客再也无人认领
// —— 表现为几个月后桌子逐张永久卡死、客流雪崩。派生式同步从根本上杜绝这类泄漏。
function syncClaims(s) {
  for (const t of s.restaurant.tables) t._claimed = false;
  for (const c of s.runtime.customers) c._claimed = false;
  for (const o of s.runtime.orders) o._claimed = false;
  for (const w of s.staff.waiters) if (w.task) claim(s, w.task);
}

export function updateStaff(s, dtGame) {
  syncClaims(s);

  s.staff.waiters.forEach((w, i) => {
    // 校验当前任务目标是否仍有效
    if (w.task) {
      const t = table(s, w.task.tableId);
      const cOk = !w.task.custId || !!cust(s, w.task.custId);
      const oOk = !w.task.orderId || !!order(s, w.task.orderId);
      if (!t || !cOk || !oOk) {
        unclaim(s, w.task);
        w.task = null;
        w.taskTimer = 0;
        w.state = 'idle';
      }
    }

    if (!w.task) {
      const job = findJob(s, w);
      if (job) {
        w.task = job;
        claim(s, job);
        const t = table(s, w.task.tableId);
        if (t) {
          w.tx = t.x;
          w.ty = t.y - 0.04;
        }
        w.state = 'moving';
      } else {
        // 待命：回到厨房前 standby 位
        const sx = 0.12 + i * 0.07;
        const sy = 0.13;
        if (Math.hypot(sx - w.x, sy - w.y) > 0.01) {
          w.tx = sx;
          w.ty = sy;
          moveToward(w, waiterSpeed(s, w), dtGame);
          w.state = 'moving';
        } else {
          w.state = 'idle';
        }
      }
    }

    if (w.task) {
      const arrived = moveToward(w, waiterSpeed(s, w), dtGame);
      if (arrived) {
        w.state = 'working';
        w.taskTimer += dtGame * speedFactor(s);
        if (w.taskTimer >= DURATIONS[w.task.type]) {
          completeTask(s, w);
          unclaim(s, w.task);
          w.task = null;
          w.taskTimer = 0;
          w.state = 'idle';
        }
      } else {
        w.state = 'moving';
      }
    }
  });
}
