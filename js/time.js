// 梦幻西餐厅2 · 时间系统（逻辑层）
// 1 游戏月 = 7 天；每天 10:00–22:00；1 游戏时 = 现实 30 秒（见 game-config.json）

// 现实秒 → 游戏分钟 的换算系数
// 1 游戏时(60游戏分) = realSecPerGameHour(30) 现实秒 → 60/30 = 2 游戏分/现实秒
export function gameMinutesPerRealSecond(s) {
  const cfg = (globalThis.__DR2_CFG__ && globalThis.__DR2_CFG__.realSecPerGameHour) || 30;
  return 60 / cfg;
}

export function isWeekend(s) {
  return s.time.day >= 6; // 第6、7天为周末
}

export function isPeak(s) {
  const h = s.time.hour;
  return (h >= 12 && h < 14) || (h >= 18 && h < 20);
}

// 客流倍率（高峰 ×2，周末 ×1.5，可叠加）
export function spawnMultiplier(s) {
  let m = 1;
  if (isPeak(s)) m *= 2.0;
  if (isWeekend(s)) m *= 1.5;
  return m;
}

// 推进游戏时间；返回 'dayEnd' 表示当日结束（到达打烊时间）
export function advanceTime(s, dtGame) {
  if (!s.time.isOperating) return null;
  s.time.minute += dtGame;
  while (s.time.minute >= 60) {
    s.time.minute -= 60;
    s.time.hour += 1;
  }
  if (s.time.hour >= s.time.closeHour) {
    return 'dayEnd';
  }
  return null;
}
