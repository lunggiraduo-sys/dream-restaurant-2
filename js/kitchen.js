// 梦幻西餐厅2 · 厨房系统（逻辑层）
// 厨师逐一烹饪订单；出餐完成置为 ready，等待服务员送达
// 顾客离店（愤怒/结账）后，对应订单及时取消，避免厨师空烧

import { orderCost } from './menu.js';
import { deductFoodCost } from './economy.js';
import { addChefXp } from './staffXp.js';
import { upgradeEffects } from './upgrades.js';

export function updateKitchen(s, dtGame) {
  const chefs = s.staff.chefs;

  // 清理孤儿订单：顾客已离店的不该继续烹饪
  s.runtime.orders = s.runtime.orders.filter((o) => {
    const c = s.runtime.customers.find((x) => x.id === o.customerId);
    const alive = c && c.state !== 'angry' && c.state !== 'leaving';
    if (!alive && o.chefId) {
      const chef = chefs.find((ch) => ch.id === o.chefId);
      if (chef) { chef.busy = false; chef.currentOrderId = null; }
    }
    return alive;
  });

  // 空闲厨师认领最早进入烹饪、且未被认领的订单
  for (const chef of chefs) {
    if (chef.busy) continue;
    const order = s.runtime.orders.find((o) => o.status === 'cooking' && !o._chefClaimed);
    if (!order) continue;
    chef.busy = true;
    chef.currentOrderId = order.id;
    order.chefId = chef.id;
    order._chefClaimed = true;
  }

  // 推进烹饪
  for (const chef of chefs) {
    if (!chef.busy) continue;
    const order = s.runtime.orders.find((o) => o.id === chef.currentOrderId);
    if (!order || order.status !== 'cooking') {
      chef.busy = false;
      chef.currentOrderId = null;
      continue;
    }
    const evCook = (s.runtime.eventFactors && s.runtime.eventFactors.cookSpeed) || 1;
    const speedFactor = ((chef.speed || 70) / 70) * evCook * upgradeEffects(s).cookSpeed;
    order.remaining -= dtGame * speedFactor;
    if (order.remaining <= 0) {
      order.status = 'ready';
      deductFoodCost(s, orderCost(order.dishes)); // 出菜时扣食材成本
      // 厨师出菜获得经验
      if (addChefXp(chef, 1 + order.dishes.length * 0.2)) {
        s.runtime.levelUpChef = s.runtime.levelUpChef || [];
        s.runtime.levelUpChef.push(chef.name || chef.id);
      }
      chef.busy = false;
      chef.currentOrderId = null;
    }
  }
}
