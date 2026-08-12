// 梦幻西餐厅2 · 随机事件系统
// 设计要点：因数「每帧由所有活跃事件重新合成」，而非事件开始/结束时手动改写全局值。
// 这样多个事件同时影响同一因数（如评价加成）时不会互相清除。
//   加法合成：ratingBonus
//   乘法合成：patienceDrain / costRate / spawnBoost / tipRate / staffSpeed / cookSpeed

export const EVENTS = [
  // ---------- 客流类 ----------
  {
    id: 'celeb_visit', name: '美食博主探店', tone: 'good', icon: '📸',
    desc: '知名博主到店打卡，客流大增、小费更丰厚。',
    probability: 0.00012, duration: 60,
    factors: { spawnBoost: 1.6, tipRate: 1.5 },
  },
  {
    id: 'media_coverage', name: '本地媒体报导', tone: 'good', icon: '📰',
    desc: '餐厅上了美食专栏，顾客对你更宽容。',
    probability: 0.00009, duration: 240,
    factors: { ratingBonus: 6, spawnBoost: 1.15 },
  },
  {
    id: 'group_booking', name: '团体聚餐预订', tone: 'good', icon: '🎉',
    desc: '有公司包场聚餐，短时间内客人扎堆进店。',
    probability: 0.00011, duration: 45,
    factors: { spawnBoost: 2.2 },
  },
  {
    id: 'festival', name: '节庆日', tone: 'good', icon: '🏮',
    desc: '街区办活动，人流旺、顾客心情好。',
    probability: 0.00008, duration: 180,
    factors: { spawnBoost: 1.4, tipRate: 1.3 },
  },
  {
    id: 'competitor_open', name: '对面新餐厅开张', tone: 'bad', icon: '🏪',
    desc: '竞争对手分流客源，今日客流下降。',
    probability: 0.00012, duration: 180,
    factors: { spawnBoost: 0.7 },
  },
  {
    id: 'rainy_day', name: '突降大雨', tone: 'bad', icon: '🌧️',
    desc: '雨天客流骤减，但进店躲雨的客人小费稍多。',
    probability: 0.00013, duration: 150,
    factors: { spawnBoost: 0.65, tipRate: 1.1 },
  },

  // ---------- 成本/口碑类 ----------
  {
    id: 'food_price_hike', name: '食材涨价', tone: 'bad', icon: '📈',
    desc: '市场供应紧张，食材成本上涨 30%。',
    probability: 0.00012, duration: 120,
    factors: { costRate: 1.3 },
  },
  {
    id: 'health_inspection', name: '卫生检查', tone: 'bad', icon: '🔍',
    desc: '卫生局突击检查，顾客更挑剔、也更没耐心。',
    probability: 0.00010, duration: 90,
    factors: { ratingBonus: -5, patienceDrain: 1.25 },
  },
  {
    id: 'rat_sighting', name: '老鼠出现', tone: 'bad', icon: '🐭',
    desc: '有顾客看见老鼠，口碑受到严重打击！',
    probability: 0.00006, duration: 120,
    factors: { ratingBonus: -12, spawnBoost: 0.85 },
  },

  // ---------- 员工/设备类 ----------
  {
    id: 'staff_morale', name: '员工士气高涨', tone: 'good', icon: '💪',
    desc: '团队状态火热，上菜与烹饪明显更快。',
    probability: 0.00010, duration: 120,
    factors: { staffSpeed: 1.3, cookSpeed: 1.25 },
  },
  {
    id: 'kitchen_breakdown', name: '厨房设备故障', tone: 'bad', icon: '🔧',
    desc: '灶具出问题，出菜速度大幅下降。',
    probability: 0.00008, duration: 90,
    factors: { cookSpeed: 0.7 },
  },

  // ---------- 瞬时类 ----------
  {
    id: 'thief', name: '小偷光顾', tone: 'bad', icon: '🕵️',
    desc: '店内混入小偷，营业款被摸走一部分！',
    probability: 0.00008, duration: 0,
    instant: (s) => {
      const d = s.runtime.dayStats || {};
      const dayRev = (d.revenue || 0) + (d.tips || 0);
      // 只偷「当日营业款」的一部分，并设上下限，避免与总资产挂钩导致数值失控
      const loss = Math.min(3000, Math.max(150, Math.floor(dayRev * 0.25)));
      s.player.money = Math.max(0, s.player.money - loss);
      d.eventLoss = (d.eventLoss || 0) + loss;
      return `损失 ¥${loss.toLocaleString('zh-CN')}`;
    },
  },
  {
    id: 'broken_dishes', name: '打破餐具', tone: 'bad', icon: '🍽️',
    desc: '服务生手滑摔碎一叠盘子，需要补置餐具。',
    probability: 0.00014, duration: 0,
    instant: (s) => {
      const loss = 120 + Math.floor(Math.random() * 180);
      s.player.money = Math.max(0, s.player.money - loss);
      const d = s.runtime.dayStats || {};
      d.eventLoss = (d.eventLoss || 0) + loss;
      return `损失 ¥${loss.toLocaleString('zh-CN')}`;
    },
  },
];

const NEUTRAL = {
  ratingBonus: 0,
  patienceDrain: 1,
  costRate: 1,
  spawnBoost: 1,
  tipRate: 1,
  staffSpeed: 1,
  cookSpeed: 1,
};

export function initEventState(s) {
  s.runtime.activeEvents = [];
  s.runtime.eventFactors = { ...NEUTRAL };
  s.runtime.eventLog = [];
}

// 由当前活跃事件重新合成因数（加法项相加，乘法项相乘）
function composeFactors(activeEvents) {
  const f = { ...NEUTRAL };
  for (const ev of activeEvents) {
    const src = ev.config.factors;
    if (!src) continue;
    if (src.ratingBonus) f.ratingBonus += src.ratingBonus;
    if (src.patienceDrain) f.patienceDrain *= src.patienceDrain;
    if (src.costRate) f.costRate *= src.costRate;
    if (src.spawnBoost) f.spawnBoost *= src.spawnBoost;
    if (src.tipRate) f.tipRate *= src.tipRate;
    if (src.staffSpeed) f.staffSpeed *= src.staffSpeed;
    if (src.cookSpeed) f.cookSpeed *= src.cookSpeed;
  }
  return f;
}

export function updateEvents(s, dtGame) {
  if (!s.runtime.activeEvents || !s.runtime.eventFactors) initEventState(s);

  // 1) 推进并移除到期事件
  const active = s.runtime.activeEvents;
  for (let i = active.length - 1; i >= 0; i--) {
    active[i].remaining -= dtGame;
    if (active[i].remaining <= 0) active.splice(i, 1);
  }

  // 2) 仅营业时段触发新事件（同一 tick 最多触发一个）
  if (s.time.isOperating) {
    for (const cfg of EVENTS) {
      if (cfg.duration > 0 && active.some((e) => e.config.id === cfg.id)) continue;
      if (Math.random() >= cfg.probability * dtGame) continue;

      let message = '';
      if (typeof cfg.instant === 'function') message = cfg.instant(s) || '';
      if (cfg.duration > 0) active.push({ config: cfg, remaining: cfg.duration });

      s.runtime.eventLog.push({
        id: cfg.id, name: cfg.name, desc: cfg.desc,
        tone: cfg.tone, icon: cfg.icon, message,
        day: s.time.day, month: s.time.month,
        hour: s.time.hour, minute: Math.floor(s.time.minute),
      });
      if (s.runtime.eventLog.length > 60) s.runtime.eventLog.shift();
      break;
    }
  }

  // 3) 重新合成并写回
  s.runtime.eventFactors = composeFactors(active);
  return s.runtime.eventFactors;
}

export function getActiveEvents(s) {
  if (!s.runtime.activeEvents) return [];
  return s.runtime.activeEvents.map((e) => ({
    id: e.config.id, name: e.config.name, icon: e.config.icon,
    tone: e.config.tone, desc: e.config.desc,
    remaining: Math.max(0, Math.round(e.remaining)),
  }));
}

export function getActiveEventNames(s) {
  if (!s.runtime.activeEvents) return [];
  return s.runtime.activeEvents.map((e) => e.config.name);
}
