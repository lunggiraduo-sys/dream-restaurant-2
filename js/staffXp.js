// 梦幻西餐厅2 · 员工经验/升级系统
// 服务生每完成一次任务、厨师每出一道菜积累经验；升级提升属性（有上限）
// 设计要点：角色由字段推断（厨师有 cooking，服务生有 mobility），不依赖外部写入 type

// 经验标定（按实测客流反推）：满员 2 服务生时，单人约 1200 次任务/月
//   → Lv.2 约半个月，Lv.5 约 3.5 个月，保证成长感贯穿整个中期
const XP_PER_TASK = 1;
const XP_PER_COOK = 1.5;
export const MAX_LEVEL = 5;

// XP_LEVELS[n] = 从 Lv.n 升到 Lv.n+1 所需经验
const XP_LEVELS = [0, 400, 800, 1200, 1700];

export function xpForNextLevel(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return XP_LEVELS[level] || Infinity;
}

function roleOf(staff) {
  if (staff.type === 'waiter' || staff.type === 'chef') return staff.type;
  // 兜底：按特征字段推断
  if (staff.cooking != null) return 'chef';
  if (staff.mobility != null) return 'waiter';
  return null;
}

function applyLevelBonus(staff) {
  // 每升一级：服务生 机动力+3 / 魅力+2；厨师 速度+3 / 手艺+2
  const bonus = Math.max(0, (staff.level || 1) - 1);
  const role = roleOf(staff);
  if (role === 'waiter') {
    staff.mobility = Math.min(100, staff.baseMobility + bonus * 3);
    staff.charm = Math.min(100, staff.baseCharm + bonus * 2);
  } else if (role === 'chef') {
    staff.speed = Math.min(100, staff.baseSpeed + bonus * 3);
    staff.cooking = Math.min(100, staff.baseCooking + bonus * 2);
  }
}

// 确保运行时字段齐备（幂等）。基础值只在第一次记录，避免加成被反复叠加
export function ensureBaseStats(staff) {
  if (typeof staff.level !== 'number' || !isFinite(staff.level)) staff.level = 1;
  if (typeof staff.xp !== 'number' || !isFinite(staff.xp)) staff.xp = 0;
  if (!staff.type) {
    const r = roleOf(staff);
    if (r) staff.type = r;
  }
  if (staff.baseMobility == null && staff.mobility != null) staff.baseMobility = staff.mobility;
  if (staff.baseCharm == null && staff.charm != null) staff.baseCharm = staff.charm;
  if (staff.baseSpeed == null && staff.speed != null) staff.baseSpeed = staff.speed;
  if (staff.baseCooking == null && staff.cooking != null) staff.baseCooking = staff.cooking;
  applyLevelBonus(staff);
  return staff;
}

function addXp(staff, amount) {
  ensureBaseStats(staff);
  staff.xp += amount;
  let leveled = false;
  while (staff.level < MAX_LEVEL && staff.xp >= xpForNextLevel(staff.level)) {
    staff.xp -= xpForNextLevel(staff.level);
    staff.level += 1;
    leveled = true;
  }
  if (leveled) applyLevelBonus(staff);
  if (staff.level >= MAX_LEVEL) staff.xp = 0; // 满级不再显示残余经验
  return leveled;
}

// 经验按小数累积（保留任务权重差异），仅在 UI 显示时取整
export function addWaiterXp(waiter, factor = 1) {
  return addXp(waiter, XP_PER_TASK * factor);
}

export function addChefXp(chef, factor = 1) {
  return addXp(chef, XP_PER_COOK * factor);
}

// 供 UI 显示进度条
export function xpProgress(staff) {
  const lvl = staff.level || 1;
  if (lvl >= MAX_LEVEL) return { cur: 0, need: 0, pct: 100, max: true };
  const need = xpForNextLevel(lvl);
  const cur = Math.max(0, staff.xp || 0);
  return { cur, need, pct: Math.min(100, Math.round((cur / need) * 100)), max: false };
}
