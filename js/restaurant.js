// 梦幻西餐厅2 · 餐厅场景（逻辑层辅助）
// 桌位查找 / 占用 / 门口队列

export function findFreeTable(s) {
  return s.restaurant.tables.find((t) => !t.occupied && t.state === 'empty') || null;
}

export function tableById(s, id) {
  return s.restaurant.tables.find((t) => t.id === id) || null;
}

// 门口等待位（归一化坐标，略偏门两侧）
export function doorSpot(index) {
  return { x: 0.42 + (index % 2) * 0.16, y: 0.20 + Math.floor(index / 2) * 0.05 };
}
