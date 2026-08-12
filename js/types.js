// 梦幻西餐厅2 · 客人类型定义（数据层）
// 耐心为游戏分钟；出现率 weight；priceBias 决定点菜价位偏好

export const CUSTOMER_TYPES = [
  { key: 'normal',    name: '普通客人', patience: 60, tipRate: 0.05, weight: 60, orderMin: 1, orderMax: 2, priceBias: 'mid' },
  { key: 'business',  name: '商务人士', patience: 40, tipRate: 0.10, weight: 20, orderMin: 2, orderMax: 3, priceBias: 'high' },
  { key: 'family',    name: '家庭聚餐', patience: 90, tipRate: 0.03, weight: 15, orderMin: 2, orderMax: 3, priceBias: 'low' },
  { key: 'gourmet',   name: '美食家',   patience: 70, tipRate: 0.15, weight: 5,  orderMin: 1, orderMax: 1, priceBias: 'top' },
];
