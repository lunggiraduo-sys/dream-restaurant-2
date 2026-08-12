// 梦幻西餐厅2 · 内部改建 / 升级系统
// 四条升级线：装修（评价+客流）/ 餐桌（容量）/ 厨房设备（出菜速度）/ 氛围（顾客耐心）
// 这是游戏中期的主要资金出口，也是把「赚到的钱」重新变成「经营能力」的循环

export const UPGRADE_KEYS = ['decor', 'tables', 'kitchen', 'ambience'];

// 各等级的数值效果（索引 = 等级-1）
const EFFECT_TABLE = {
  decor: { trafficBoost: [1.0, 1.05, 1.10, 1.16, 1.24] }, // 评价影响走 decorLevel，见 rating.js
  kitchen: { cookSpeed: [1.0, 1.15, 1.32, 1.55] },
  ambience: { patience: [1.0, 1.12, 1.25, 1.40] },
};

export function initUpgrades(s) {
  if (!s.restaurant.upgrades) {
    s.restaurant.upgrades = { decor: 1, tables: 1, kitchen: 1, ambience: 1 };
  }
  // 兼容旧存档：补齐缺失的升级线
  for (const k of UPGRADE_KEYS) {
    if (typeof s.restaurant.upgrades[k] !== 'number') s.restaurant.upgrades[k] = 1;
  }
  s.restaurant.decorLevel = s.restaurant.upgrades.decor;
  return s.restaurant.upgrades;
}

export function levelOf(s, key) {
  return (s.restaurant.upgrades && s.restaurant.upgrades[key]) || 1;
}

export function maxLevelOf(cfg, key) {
  const def = cfg.upgrades && cfg.upgrades[key];
  return def ? def.levels.length : 1;
}

// 下一级信息；已满级返回 null
export function nextLevelInfo(s, cfg, key) {
  const def = cfg.upgrades && cfg.upgrades[key];
  if (!def) return null;
  const cur = levelOf(s, key);
  if (cur >= def.levels.length) return null;
  const next = def.levels[cur]; // levels[cur] 即「下一级」（数组 0 基）
  return { level: cur + 1, cost: next.cost, label: next.label, effect: next.effect || '' };
}

// 购买升级。返回 { ok, msg }
export function purchaseUpgrade(s, cfg, key) {
  const info = nextLevelInfo(s, cfg, key);
  if (!info) return { ok: false, msg: '已经是最高等级了' };
  if (s.player.money < info.cost) {
    return { ok: false, msg: `资金不足，还差 ¥${(info.cost - s.player.money).toLocaleString('zh-CN')}` };
  }

  s.player.money -= info.cost;
  // 改建属于资本开支，单独记账：星级评定只看经营纯利，不该因为投资自己而被降级
  s._monthCapex = (s._monthCapex || 0) + info.cost;
  s.statistics.totalCapex = (s.statistics.totalCapex || 0) + info.cost;
  s.restaurant.upgrades[key] = info.level;

  if (key === 'decor') s.restaurant.decorLevel = info.level;
  if (key === 'tables') syncTables(s, cfg);

  const def = cfg.upgrades[key];
  return { ok: true, msg: `${def.name} 升级至「${info.label}」`, level: info.level };
}

// 根据餐桌升级等级，同步餐桌数量（等级 1 = 基础 8 张，每级 +1）
export function syncTables(s, cfg) {
  const target = levelOf(s, 'tables') - 1; // 需要额外增加的桌数
  const extra = cfg.extraTables || [];
  for (let i = 0; i < Math.min(target, extra.length); i++) {
    const def = extra[i];
    if (s.restaurant.tables.some((t) => t.id === def.id)) continue;
    s.restaurant.tables.push({
      id: def.id, type: def.type, x: def.x, y: def.y,
      occupied: false, occupantId: null, state: 'empty', _claimed: false,
    });
  }
  return s.restaurant.tables.length;
}

// 编制上限随星级放开（★1 4厅2厨 → ★2 6厅3厨 → ★3 8厅4厨）
export function staffCapacity(s, cfg) {
  const star = (s.player && s.player.currentStar) || 1;
  const byStar = cfg.maxStaffByStar;
  if (byStar) {
    // 取 ≤ 当前星级的最高档，避免配置缺档时报错
    for (let lvl = star; lvl >= 1; lvl--) {
      const c = byStar[String(lvl)];
      if (c) return { waiters: c.waiters, chefs: c.chefs };
    }
  }
  const m = cfg.maxStaff || { waiters: 4, chefs: 2 };
  return { waiters: m.waiters, chefs: m.chefs };
}

// 候选员工是否已因星级解锁（高级员工需更高星级才愿意来）
export function isStaffUnlocked(s, cand) {
  const need = cand.minStar || 1;
  return ((s.player && s.player.currentStar) || 1) >= need;
}

// 汇总当前所有升级带来的数值效果
export function upgradeEffects(s) {
  const u = (s.restaurant && s.restaurant.upgrades) || {};
  const pick = (key, field, dflt) => {
    const arr = EFFECT_TABLE[key] && EFFECT_TABLE[key][field];
    if (!arr) return dflt;
    return arr[Math.max(0, Math.min(arr.length - 1, (u[key] || 1) - 1))];
  };
  return {
    decorTraffic: pick('decor', 'trafficBoost', 1),
    cookSpeed: pick('kitchen', 'cookSpeed', 1),
    patience: pick('ambience', 'patience', 1),
  };
}
