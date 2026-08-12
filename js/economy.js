// 梦幻西餐厅2 · 经济系统（逻辑层）
// 收入：菜品 + 小费；支出：食材成本（出菜时扣）+ 月末员工月薪

export function addMoney(s, amt) {
  s.player.money += amt;
}

// 顾客结账：收入入账，记录当日统计
export function payCustomer(s, customer, waiter) {
  const factors = s.runtime.eventFactors || {};
  const bill = customer.bill || 0;
  const tip = Math.round((customer.tip || 0) * (factors.tipRate || 1));
  addMoney(s, bill + tip);
  const d = s.runtime.dayStats;
  d.revenue += bill;
  d.tips += tip;
  d.customers += 1;
  d.ratingSum += customer.rating || 0;
  s.player.totalCustomers += 1;
  s.player.totalRatingSum += customer.rating || 0;
}

// 出菜时扣食材成本
export function deductFoodCost(s, cost) {
  const factors = s.runtime.eventFactors || {};
  const actual = Math.round(cost * (factors.costRate || 1));
  addMoney(s, -actual);
  s.runtime.dayStats.cost += actual;
}

// 日终结算（不扣月薪，月薪月末扣）
export function settleDay(s) {
  const d = s.runtime.dayStats;
  // 记录到统计（供报表/月末使用）
  s.statistics.lastDay = {
    day: s.time.day,
    month: s.time.month,
    customers: d.customers,
    revenue: d.revenue,
    cost: d.cost,
    tips: d.tips,
    angryLeft: d.angryLeft,
    eventLoss: d.eventLoss || 0,
    ratingAvg: d.customers > 0 ? d.ratingSum / d.customers : 0,
  };
  s.player.daysOperated += 1;

  // 重置当日运行态
  s.runtime.customers = [];
  s.runtime.orders = [];
  s.runtime.waitingQueue = [];
  s.runtime.dayStats = {
    customers: 0, ratingSum: 0, revenue: 0, cost: 0, tips: 0,
    angryLeft: 0, salaryPaid: 0, eventLoss: 0,
  };
  s.restaurant.tables.forEach((t) => {
    t.occupied = false;
    t.occupantId = null;
    t.state = 'empty';
    t._claimed = false; // 必须清除认领标记，否则该桌次日起永远无法被清理
  });
  s.staff.waiters.forEach((w) => { w.state = 'idle'; w.task = null; w.taskTimer = 0; });
  s.staff.chefs.forEach((c) => { c.state = 'idle'; c.busy = false; c.currentOrderId = null; });

  // 进入下一天
  s.time.day += 1;
  s.time.hour = 10;
  s.time.minute = 0;
  s.time.isOperating = false;
}

// 月末结算：扣月薪 → 算纯利 → 星级评定 → 发奖金 → 记录并进位
// 返回 starResult（供报表展示）。星级/奖金由 rating.js 的纯函数 evaluateMonth 计算
import { evaluateMonth } from './rating.js';

export function endMonth(s, cfg) {
  // 1) 月薪
  let salary = 0;
  s.staff.waiters.forEach((w) => (salary += w.salary));
  s.staff.chefs.forEach((c) => (salary += c.salary));
  addMoney(s, -salary);

  // 2) 本月指标（相对月初基线）
  const customers = s.player.totalCustomers - (s._monthStartCustomers || 0);
  const ratingAvg =
    customers > 0 ? (s.player.totalRatingSum - (s._monthStartRatingSum || 0)) / customers : 0;
  // 经营纯利 = 现金变动 + 本月改建投资（资本开支不计入经营业绩）
  const capex = s._monthCapex || 0;
  const profit = s.player.money - (s._monthStartMoney || 0) + capex;

  // 3) 星级评定（纯函数，需知道当前星级以判断是否升星）
  const starResult = evaluateMonth({ customers, ratingAvg, profit }, cfg, s.player.currentStar);

  // 4) 记录
  s.statistics.lastMonthProfit = profit;
  s.statistics.lastMonthCustomers = customers;
  s.statistics.lastMonthRatingAvg = ratingAvg;
  s.statistics.lastMonthSalary = salary;
  s.statistics.lastMonthCapex = capex;
  starResult.salary = salary;
  starResult.capex = capex;
  s.statistics.monthlyHistory.push({
    month: s.time.month,
    profit,
    customers,
    ratingAvg,
    salary,
    capex,
    star: starResult.star,
    bonus: starResult.bonus,
    promoted: starResult.promoted,
  });

  // 5) 升星 + 一次性升星奖金（未升星不发钱）
  if (starResult.promoted) {
    s.player.currentStar = starResult.star;
    if (starResult.bonus > 0) addMoney(s, starResult.bonus);
  }
  // 餐厅当前星级（只升不降）；月度评定 starResult.star 可能低于它
  starResult.currentStar = s.player.currentStar;

  s.player.monthsOperated += 1;

  // 6) 月份进位 + 下月基线
  s.time.month += 1;
  s.time.day = 1;
  s.time.hour = 10;
  s.time.minute = 0;
  s.time.isOperating = false;
  s._monthStartMoney = s.player.money;
  s._monthStartCustomers = s.player.totalCustomers;
  s._monthStartRatingSum = s.player.totalRatingSum;
  s._monthCapex = 0; // 改建投资按月归零

  return starResult;
}
