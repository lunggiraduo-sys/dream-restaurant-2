// 梦幻西餐厅2 · 全局状态（数据层）
// 加载 config + 构建初始存档（§5.1 结构 + 阶段2 运行时字段）

let _cfg = null;   // { dishes, staff, gameConfig }
let _state = null; // 当前游戏状态

export async function loadConfigs() {
  const [dishes, staff, gameConfig] = await Promise.all([
    fetch('config/dishes.json').then((r) => r.json()),
    fetch('config/staff.json').then((r) => r.json()),
    fetch('config/game-config.json').then((r) => r.json()),
  ]);
  _cfg = { dishes, staff, gameConfig };
  return _cfg;
}

export function getConfigs() {
  return _cfg;
}

// 新员工对象（来自候选池，附带运行时字段）
import { ensureBaseStats } from './staffXp.js';

export function makeWaiter(src, x, y) {
  return ensureBaseStats({
    ...src, type: 'waiter', level: 1, xp: 0,
    state: 'idle', x, y, tx: x, ty: y, task: null, taskTimer: 0,
  });
}
export function makeChef(src, x, y) {
  return ensureBaseStats({
    ...src, type: 'chef', level: 1, xp: 0,
    state: 'idle', busy: false, x, y, currentOrderId: null,
  });
}

export function newGameState() {
  const c = _cfg.gameConfig;
  const cand = _cfg.staff;

  // 开局预聘：2 服务生 + 1 厨师（阶段3 可在员工管理界面增减）
  const waiters = [
    makeWaiter(cand.waiters.find((w) => w.id === 'w1'), 0.12, 0.10),
    makeWaiter(cand.waiters.find((w) => w.id === 'w2'), 0.20, 0.10),
  ];
  const chefs = [makeChef(cand.chefs.find((ch) => ch.id === 'c1'), 0.55, 0.07)];

  return {
    version: c.version,
    player: {
      money: c.initialMoney,
      currentStar: 1,
      totalCustomers: 0,
      totalRatingSum: 0,
      daysOperated: 0,
      monthsOperated: 0,
    },
    restaurant: {
      name: c.restaurantName,
      decorLevel: c.decorLevel,
      upgrades: { decor: 1, tables: 1, kitchen: 1, ambience: 1 },
      tables: c.tables.map((t) => ({
        id: t.id,
        type: t.type,
        x: t.x,
        y: t.y,
        occupied: false,
        occupantId: null,
        state: 'empty', // empty | seated | ordered | eating | dirty
      })),
    },
    staff: { waiters, chefs },
    menu: { dishes: _cfg.dishes.dishes.map((d) => ({ ...d })) },
    time: {
      day: 1,
      month: 1,
      hour: c.operatingHours.start,
      minute: 0,
      closeHour: c.operatingHours.end,
      isOperating: false,
      speed: 1,
    },
    statistics: {
      lastMonthProfit: 0,
      lastMonthCustomers: 0,
      lastMonthRatingAvg: 0,
      monthlyHistory: [],
    },
    runtime: {
      customers: [],
      orders: [],
      waitingQueue: [], // 门口等待入座的顾客 id
      nextCustomerId: 1,
      nextOrderId: 1,
      dayStats: {
        customers: 0,
        ratingSum: 0,
        revenue: 0,
        cost: 0,
        tips: 0,
        angryLeft: 0,
        salaryPaid: 0,
      },
    },
  };
}

export function getState() {
  return _state;
}
export function setState(s) {
  _state = s;
}
