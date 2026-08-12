// 梦幻西餐厅2 · 存档（localStorage）

const KEY = 'dr2-save-v1';

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('存档写入失败', e);
    return false;
  }
}

export function load() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.warn('存档读取失败', e);
    return null;
  }
}

export function hasSave() {
  return !!localStorage.getItem(KEY);
}

export function clear() {
  localStorage.removeItem(KEY);
}
