// 梦幻西餐厅2 · Game Loop（逻辑层核心）
// 每帧：推进时间 → 生成客人 → 更新客人 → 厨房 → 员工 → 日终/月末结算 → 渲染 → HUD

import { advanceTime } from './time.js';
import { spawnTick, updateCustomers } from './customer.js';
import { updateKitchen } from './kitchen.js';
import { updateStaff } from './staff.js';
import { settleDay, endMonth } from './economy.js';
import { getConfigs } from './state.js';
import { initEventState, updateEvents } from './events.js';

export class Game {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
    this.running = false;
    this.last = 0;
    // 回调（由 main.js 注入）
    this.onHud = null;
    this.onDayEnd = null;
    this.onMonthEnd = null;
    this.onEvent = null; // 随机事件发生时通知 UI（弹 toast）
    this._eventLogLen = 0;
  }

  // 新游戏 / 读档后必须换绑，否则循环仍在更新旧的 state 对象（UI 与逻辑脱钩）
  setState(s) {
    this.stop();
    this.state = s;
    this._eventLogLen = (s && s.runtime && s.runtime.eventLog) ? s.runtime.eventLog.length : 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    // 初始化当月基线（用于纯利计算）
    const s = this.state;
    if (s._monthStartMoney == null) {
      s._monthStartMoney = s.player.money;
      s._monthStartCustomers = s.player.totalCustomers;
      s._monthStartRatingSum = s.player.totalRatingSum;
    }
    initEventState(s);
    this._eventLogLen = (s.runtime.eventLog || []).length;
    this.last = performance.now();
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    let dtReal = (now - this.last) / 1000;
    this.last = now;
    if (dtReal > 0.1) dtReal = 0.1; // 防止后台标签页跳变
    this._update(dtReal);
    if (this.renderer) this.renderer.render();
    if (this.onHud) this.onHud();
    requestAnimationFrame(() => this._loop());
  }

  _update(dtReal) {
    const s = this.state;
    if (!s.time.isOperating) return;

    const cfg = getConfigs().gameConfig;
    const perSec = 60 / (cfg.realSecPerGameHour || 30);
    const dtGame = dtReal * perSec * (s.time.speed || 1);

    const ended = advanceTime(s, dtGame);
    if (ended === 'dayEnd') {
      this._endDay();
      return;
    }

    updateEvents(s, dtGame);
    this._flushEvents(s);
    spawnTick(s, dtGame, cfg);
    updateCustomers(s, dtGame);
    updateKitchen(s, dtGame);
    updateStaff(s, dtGame);
  }

  // 把新产生的事件日志推给 UI（eventLog 有 60 条上限，会 shift，故取尾部差量）
  _flushEvents(s) {
    const log = s.runtime.eventLog || [];
    if (log.length === this._eventLogLen) return;
    const added = log.length > this._eventLogLen ? log.slice(this._eventLogLen) : log.slice(-1);
    this._eventLogLen = log.length;
    if (this.onEvent) added.forEach((ev) => this.onEvent(ev));
  }

  _endDay() {
    const s = this.state;
    const cfg = getConfigs().gameConfig;
    settleDay(s);
    if (this.onDayEnd) this.onDayEnd(s);
    // 月末判定（天数由配置决定）
    if (s.time.day > (cfg.daysPerMonth || 7)) {
      const starResult = endMonth(s, cfg);
      if (this.onMonthEnd) this.onMonthEnd(s, starResult);
    }
  }
}
