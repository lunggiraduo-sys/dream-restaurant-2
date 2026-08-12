// 梦幻西餐厅2 · 菜单系统（数据层辅助）
// 负责从已上架菜品中按客人类型挑选下单组合

export function getEnabledDishes(s) {
  return s.menu.dishes.filter((d) => d.enabled);
}

function priceTier(dishes) {
  const prices = dishes.map((d) => d.price).sort((a, b) => a - b);
  const mid = prices[Math.floor(prices.length / 2)] || 50;
  return mid;
}

// 根据客人类型生成一份订单（若干菜品对象）
export function pickOrder(s, type) {
  const pool = getEnabledDishes(s);
  if (pool.length === 0) return [];
  const mid = priceTier(pool);
  let filtered = pool;
  if (type.priceBias === 'high') filtered = pool.filter((d) => d.price >= mid);
  else if (type.priceBias === 'low') filtered = pool.filter((d) => d.price <= mid);
  else if (type.priceBias === 'top') filtered = [...pool].sort((a, b) => b.price - a.price);
  if (filtered.length === 0) filtered = pool;

  const n = randInt(type.orderMin, type.orderMax);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = filtered[Math.floor(Math.random() * filtered.length)];
    out.push(d);
  }
  return out;
}

export function orderBill(order) {
  return order.reduce((sum, d) => sum + d.price, 0);
}
export function orderCost(order) {
  return order.reduce((sum, d) => sum + d.cost, 0);
}
export function orderFlavor(order) {
  if (order.length === 0) return 70;
  return order.reduce((sum, d) => sum + (d.flavor || 75), 0) / order.length;
}

function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}
