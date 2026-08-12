// 梦幻西餐厅2 · 星级评定（逻辑层）
// 单客评价 = 等待40% + 菜品30% + 服务生魅力20% + 装修10%（§3.3，统一为 0–100 口径）

export function computeCustomerRating({ waitScore, dishScore, charm, decorLevel }) {
  const decorScore = Math.min(100, 50 + decorLevel * 10); // 1级≈60
  const r =
    0.4 * waitScore +
    0.3 * dishScore +
    0.2 * charm +
    0.1 * decorScore;
  return Math.max(0, Math.min(100, Math.round(r)));
}

// 月末评定：在「当前星级」基础上，检查是否满足下一星的全部条件
// 纯函数：传入本月指标 { customers, ratingAvg, profit } 与当前星级
// 设计要点：
//  - 守住已得星级，不做降级（坏月份只会影响升星进度，不会掉星）
//  - 奖金只在「升星」时一次性发放，避免坐在高星级上每月重复领奖的刷钱漏洞
export function evaluateMonth(m, cfg, currentStar = 1) {
  const reqs = cfg.starRequirements;
  const missed = [];
  // 守住已经拿到的星级
  let star = currentStar;

  const nextLvl = currentStar + 1;
  const r = reqs[String(nextLvl)];
  if (r) {
    const custOk = m.customers >= r.customers;
    const rateOk = m.ratingAvg >= r.rating;
    const profitOk = r.minProfit <= 0 ? true : m.profit >= r.minProfit;
    if (custOk && rateOk && profitOk) {
      star = nextLvl; // 升星
    } else {
      // 记录「差一点」的原因，供报表提示玩家下月该补哪块
      if (!custOk) missed.push(`客流 ${m.customers}/${r.customers}`);
      if (!rateOk) missed.push(`评价 ${m.ratingAvg.toFixed(1)}/${r.rating}`);
      if (!profitOk) missed.push(`纯利 ¥${Math.round(m.profit)}/¥${r.minProfit}`);
    }
  }

  const promoted = star > currentStar;
  const bonus = promoted ? cfg.starBonuses[String(star)] || 0 : 0;
  // 最高星级（config 里最大的 key）
  const maxStar = Math.max(...Object.keys(reqs).map((k) => parseInt(k, 10)));

  return {
    star,
    bonus,
    promoted,
    missed,
    nextStar: star < maxStar ? star + 1 : null,
    nextReq: star < maxStar ? reqs[String(star + 1)] : null,
    customers: m.customers,
    ratingAvg: m.ratingAvg,
    profit: m.profit,
  };
}
