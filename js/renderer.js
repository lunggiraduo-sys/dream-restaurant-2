/* 梦幻西餐厅2 · 等角投影 Canvas 渲染器
 * 2.5D isometric / diamond floor, 暖色温馨 bistro 风格
 */

const COLORS = {
  // 暖色木地板
  floor: '#8a5a32',
  floorLight: '#9c6b3e',
  floorDark: '#6f4626',
  plank: '#5a3a1f',
  // 墙面（奶油 + 木护墙板）
  wall: '#f7ecd8',
  wallUpper: '#fbf4e6',
  wainscot: '#a9743f',
  wainscotDark: '#8a5d31',
  trim: '#6d4420',
  trimDark: '#523418',
  windowFrame: '#6d4420',
  glassDay: '#cfe6f3',
  glassNight: '#1b2740',
  kitchen: '#a9743f',
  kitchenTop: '#c08a4f',
  steel: '#b6bcc6',
  door: '#7a4e2e',
  carpet: '#b91c1c',
  carpetDark: '#8f1414',
  rug: '#c2410c',
  rugEdge: '#f59e0b',
  tableBase: '#6d4420',
  clothFree: '#fff1f5',
  clothOcc: '#ffc2cf',
  clothDirty: '#aab0b8',
  chair: '#8a5a2c',
  chairDark: '#5c3a1a',
  plantPot: '#b06a32',
  plantLeaf: '#4e8a5e',
  plate: '#fff',
  gold: '#fbbf24',
  lampGlow: 'rgba(255,221,150,0.55)'
};

const TYPE_COLORS = {
  normal: ['#3b82f6', '#60a5fa', '#1d4ed8'],
  business: ['#374151', '#4b5563', '#1f2937'],
  family: ['#f97316', '#fb923c', '#c2410c'],
  gourmet: ['#7c3aed', '#a78bfa', '#5b21b6']
};

const HAIR_COLORS = ['#3b2f2a', '#5b3a29', '#1f2937', '#7c5a3a', '#4b3b6b', '#6b3a3a', '#2f3a4b', '#8a6d3b'];

const WALK_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

let _renderer = null;

export function createRenderer(canvas) {
  const el = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  _renderer = new Renderer(el);
  return _renderer;
}

export function getRenderer() {
  return _renderer;
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.size = { w: 0, h: 0, dpr: 1 };
    this.iso = { cx: 0, cy: 0, tw: 1, th: 1, scale: 1 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setState(state) {
    this.state = state;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 320);
    const h = Math.max(rect.height, 240);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.size = { w, h, dpr };
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.max(0.72, Math.min(1.15, Math.min(w / 420, h / 520)));
    this.iso.scale = scale;
    this.iso.tw = 210 * scale; // half diamond width
    this.iso.th = 105 * scale; // half diamond height
    this.iso.cx = w / 2;
    this.iso.cy = h * 0.78; // front of room near bottom
  }

  // 投影逻辑坐标 (x,y 0~1, z 高度 0~1) 到屏幕坐标
  toIso(x, y, z = 0) {
    return {
      x: this.iso.cx + (x - y) * this.iso.tw,
      y: this.iso.cy - (x + y) * this.iso.th - z * this.iso.th * 1.8
    };
  }

  render() {
    const ctx = this.ctx;
    const s = this.state;
    ctx.clearRect(0, 0, this.size.w, this.size.h);

    if (!s) return;

    this._drawRoom();
    this._drawRug();
    this._drawPictures();
    this._drawKitchen();

    const drawables = [];
    if (s.restaurant && s.restaurant.tables) {
      for (const t of s.restaurant.tables) drawables.push({ kind: 'table', obj: t, z: t.x + t.y });
    }
    if (s.runtime && s.runtime.customers) {
      for (const c of s.runtime.customers) drawables.push({ kind: 'customer', obj: c, z: c.x + c.y });
    }
    if (s.runtime && s.runtime.waiters) {
      for (const w of s.runtime.waiters) drawables.push({ kind: 'waiter', obj: w, z: w.x + w.y });
    }
    if (s.runtime && s.runtime.chefs) {
      for (const c of s.runtime.chefs) drawables.push({ kind: 'chef', obj: c, z: c.x + c.y });
    }

    // 从后往前画：大 z (深处) 先画
    drawables.sort((a, b) => a.z - b.z || a.obj.y - b.obj.y);

    for (const d of drawables) {
      if (d.kind === 'table') this._drawTable(d.obj);
      else if (d.kind === 'customer') this._drawCustomer(d.obj);
      else if (d.kind === 'waiter') this._drawWaiter(d.obj);
      else if (d.kind === 'chef') this._drawChef(d.obj);
    }

    this._drawQueue();
    this._drawBubbles();
    this._drawDoorOverlay();
    this._drawLights();
  }

  _drawRoom() {
    const ctx = this.ctx;
    const { w, h } = this.size;

    // 背景天空/城市
    const night = this._isNight();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (night) {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
    } else {
      grad.addColorStop(0, '#eaf6ff');
      grad.addColorStop(1, '#fef7ea');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 城市远景剪影
    this._drawCityscape(night);

    // 地板（暖色木地板）
    this._drawFloor();

    // 后墙和侧墙（奶油墙 + 木护墙板）
    this._drawWalls();
  }

  _isNight() {
    const s = this.state;
    if (!s || !s.time) return false;
    const hour = s.time.hour || 0;
    return hour >= 18 || hour < 6;
  }

  _drawCityscape(night) {
    const ctx = this.ctx;
    const { w } = this.size;
    ctx.save();
    ctx.globalAlpha = 0.32;
    const baseY = this.iso.cy - this.iso.th * 2.2;
    const colors = night ? ['#334155', '#475569', '#1e293b'] : ['#9fb3c8', '#c3d4e6', '#7e93a8'];
    const seed = (x) => Math.abs(Math.sin(x * 12.9898) * 43758.5453 % 1);
    for (let i = 0; i < 40; i++) {
      const bx = (i / 40) * w + Math.sin(i * 3) * 18;
      const bw = 18 + seed(i) * 28;
      const bh = 40 + seed(i + 10) * 90;
      const bh2 = 40 + seed(i + 20) * 60;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(bx, baseY - bh, bw, bh);
      ctx.fillStyle = colors[(i + 1) % colors.length];
      ctx.fillRect(bx + 6, baseY - bh2, bw - 12, bh2);
      if (night && i % 3 === 0) {
        ctx.fillStyle = 'rgba(253,224,71,0.5)';
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 2; c++) {
            ctx.fillRect(bx + 8 + c * 8, baseY - bh + 12 + r * 12, 4, 6);
          }
        }
      }
    }
    ctx.restore();
  }

  _drawFloor() {
    const ctx = this.ctx;
    const iso = this.iso;
    const tiles = 8;

    ctx.save();
    const corners = [
      this.toIso(0, 0),
      this.toIso(1, 0),
      this.toIso(1, 1),
      this.toIso(0, 1)
    ];
    // 地板底色
    const fg = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[2].x, corners[2].y);
    fg.addColorStop(0, COLORS.floorLight);
    fg.addColorStop(1, COLORS.floorDark);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fill();

    // 木地板拼缝（沿一个方向的木纹条）
    ctx.strokeStyle = COLORS.plank;
    ctx.lineWidth = 1.4;
    for (let i = 0; i <= tiles; i++) {
      const a = this.toIso(i / tiles, 0);
      const b = this.toIso(1, i / tiles);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // 横向短缝（错落木板感）
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(90,58,31,0.45)';
    for (let i = 0; i <= tiles; i++) {
      const off = (i % 2) * 0.12;
      for (let j = 0; j < tiles; j += 2) {
        const p1 = this.toIso(j / tiles + off, i / tiles);
        const p2 = this.toIso((j + 1) / tiles + off, i / tiles);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // 入口红毯
    const r0 = this.toIso(0.35, 0.02);
    const r1 = this.toIso(0.65, 0.02);
    const r2 = this.toIso(0.55, 0.28);
    const r3 = this.toIso(0.45, 0.28);
    ctx.fillStyle = COLORS.carpet;
    ctx.beginPath();
    ctx.moveTo(r0.x, r0.y);
    ctx.lineTo(r1.x, r1.y);
    ctx.lineTo(r2.x, r2.y);
    ctx.lineTo(r3.x, r3.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.carpetDark;
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const p1 = { x: r0.x + (r1.x - r0.x) * t, y: r0.y + (r1.y - r0.y) * t };
      const p2 = { x: r3.x + (r2.x - r3.x) * t, y: r3.y + (r2.y - r3.y) * t };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawRug() {
    const ctx = this.ctx;
    const c = this.toIso(0.5, 0.5);
    const scale = this.iso.scale;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = COLORS.rug;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, 150 * scale, 80 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = COLORS.rugEdge;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 150 * scale, 80 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawWalls() {
    const ctx = this.ctx;
    const hWall = this.iso.th * 2.6;
    const backLeft = this.toIso(0, 1);
    const backRight = this.toIso(1, 1);
    const frontLeft = this.toIso(0, 0);
    const frontRight = this.toIso(1, 0);
    const trim = 8 * this.iso.scale;

    ctx.save();

    // 后墙：上部奶油 + 下部木护墙板
    const bTopY = backLeft.y - hWall;
    ctx.fillStyle = COLORS.wallUpper;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y);
    ctx.lineTo(backRight.x, backRight.y);
    ctx.lineTo(backRight.x, backRight.y - hWall * 0.62);
    ctx.lineTo(backLeft.x, backLeft.y - hWall * 0.62);
    ctx.closePath();
    ctx.fill();
    // 护墙板
    ctx.fillStyle = COLORS.wainscot;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y - hWall * 0.62);
    ctx.lineTo(backRight.x, backRight.y - hWall * 0.62);
    ctx.lineTo(backRight.x, backRight.y);
    ctx.lineTo(backLeft.x, backLeft.y);
    ctx.closePath();
    ctx.fill();
    // 护墙板横向木纹
    ctx.strokeStyle = COLORS.wainscotDark;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const t = (hWall * 0.62) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(backLeft.x, backLeft.y - t);
      ctx.lineTo(backRight.x, backRight.y - t);
      ctx.stroke();
    }

    // 后墙大窗
    const bw1 = this.toIso(0.10, 1, 0.28);
    const bw2 = this.toIso(0.90, 1, 0.28);
    const bw3 = this.toIso(0.90, 1, 0.92);
    const bw4 = this.toIso(0.10, 1, 0.92);
    ctx.fillStyle = this._isNight() ? COLORS.glassNight : COLORS.glassDay;
    ctx.beginPath();
    ctx.moveTo(bw1.x, bw1.y);
    ctx.lineTo(bw2.x, bw2.y);
    ctx.lineTo(bw3.x, bw3.y);
    ctx.lineTo(bw4.x, bw4.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.windowFrame;
    ctx.lineWidth = trim * 0.4;
    ctx.stroke();
    ctx.beginPath();
    const bwm = this.toIso(0.5, 1, 0.92);
    const bwb = this.toIso(0.5, 1, 0.28);
    ctx.moveTo(bwm.x, bwm.y);
    ctx.lineTo(bwb.x, bwb.y);
    const bwh = this.toIso(0.10, 1, 0.60);
    const bwh2 = this.toIso(0.90, 1, 0.60);
    ctx.moveTo(bwh.x, bwh.y);
    ctx.lineTo(bwh2.x, bwh2.y);
    ctx.stroke();

    // 后墙踢脚线
    ctx.strokeStyle = COLORS.trimDark;
    ctx.lineWidth = trim * 0.5;
    ctx.beginPath();
    const kick1 = this.toIso(0, 1, 0.30);
    const kick2 = this.toIso(1, 1, 0.30);
    ctx.moveTo(kick1.x, kick1.y);
    ctx.lineTo(kick2.x, kick2.y);
    ctx.stroke();

    // 左墙（同样护墙板 + 大窗）
    ctx.fillStyle = COLORS.wallUpper;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y);
    ctx.lineTo(frontLeft.x, frontLeft.y);
    ctx.lineTo(frontLeft.x, frontLeft.y - hWall * 0.62);
    ctx.lineTo(backLeft.x, backLeft.y - hWall * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.wainscot;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y - hWall * 0.62);
    ctx.lineTo(frontLeft.x, frontLeft.y - hWall * 0.62);
    ctx.lineTo(frontLeft.x, frontLeft.y);
    ctx.lineTo(backLeft.x, backLeft.y);
    ctx.closePath();
    ctx.fill();

    const lw1 = this.toIso(0, 0.12, 0.22);
    const lw2 = this.toIso(0, 0.88, 0.22);
    const lw3 = this.toIso(0, 0.88, 0.92);
    const lw4 = this.toIso(0, 0.12, 0.92);
    ctx.fillStyle = this._isNight() ? COLORS.glassNight : COLORS.glassDay;
    ctx.beginPath();
    ctx.moveTo(lw1.x, lw1.y);
    ctx.lineTo(lw2.x, lw2.y);
    ctx.lineTo(lw3.x, lw3.y);
    ctx.lineTo(lw4.x, lw4.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.windowFrame;
    ctx.lineWidth = trim * 0.35;
    ctx.stroke();
    ctx.beginPath();
    const lwm = this.toIso(0, 0.50, 0.92);
    const lwb = this.toIso(0, 0.50, 0.22);
    ctx.moveTo(lwm.x, lwm.y);
    ctx.lineTo(lwb.x, lwb.y);
    const lwh = this.toIso(0, 0.12, 0.57);
    const lwh2 = this.toIso(0, 0.88, 0.57);
    ctx.moveTo(lwh.x, lwh.y);
    ctx.lineTo(lwh2.x, lwh2.y);
    ctx.stroke();

    // 右侧开放，矮木护栏
    ctx.strokeStyle = COLORS.trim;
    ctx.lineWidth = trim * 0.5;
    ctx.beginPath();
    ctx.moveTo(backRight.x, backRight.y);
    ctx.lineTo(frontRight.x, frontRight.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.trimDark;
    for (let i = 0; i <= 4; i++) {
      const p = this.toIso(1, i / 4, 0);
      ctx.fillRect(p.x - 3, p.y - hWall * 0.12, 6, hWall * 0.12);
    }

    // 窗台盆栽
    this._drawPlant(0.04, 0.95);
    this._drawPlant(0.96, 0.95);
    // 壁灯（侧墙）
    this._drawSconce(0, 0.30);
    this._drawSconce(0, 0.70);

    ctx.restore();
  }

  _drawSconce(x, y) {
    const ctx = this.ctx;
    const base = this.toIso(x, y, 0.5);
    const scale = this.iso.scale;
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.fillStyle = COLORS.wainscotDark;
    ctx.fillRect(-3 * scale, -10 * scale, 6 * scale, 10 * scale);
    const glow = ctx.createRadialGradient(0, -10 * scale, 0, 0, -10 * scale, 16 * scale);
    glow.addColorStop(0, 'rgba(255,221,150,0.5)');
    glow.addColorStop(1, 'rgba(255,221,150,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -10 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(0, -10 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawPictures() {
    this._drawPicture(0.30, 1, '🍷');
    this._drawPicture(0.70, 1, '🍴');
  }

  _drawLights() {
    // 吊灯 + 落地光晕
    this._drawLight(0.28, 0.32);
    this._drawLight(0.72, 0.32);
    this._drawLight(0.28, 0.68);
    this._drawLight(0.72, 0.68);
  }

  _drawLight(x, y) {
    const ctx = this.ctx;
    const pos = this.toIso(x, y, 1.25);
    const scale = this.iso.scale;
    // 落地光晕池
    const ground = this.toIso(x, y, 0);
    const night = this._isNight();
    const pool = ctx.createRadialGradient(ground.x, ground.y, 0, ground.x, ground.y, 70 * scale);
    pool.addColorStop(0, night ? 'rgba(255,214,140,0.35)' : 'rgba(255,236,180,0.22)');
    pool.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.save();
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, 70 * scale, 36 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.strokeStyle = 'rgba(80,60,40,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 22 * scale);
    ctx.stroke();
    ctx.fillStyle = '#d4a373';
    ctx.beginPath();
    ctx.moveTo(-8 * scale, 20 * scale);
    ctx.quadraticCurveTo(0, 12 * scale, 8 * scale, 20 * scale);
    ctx.lineTo(10 * scale, 26 * scale);
    ctx.lineTo(-10 * scale, 26 * scale);
    ctx.closePath();
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 28 * scale, 0, 0, 28 * scale, 22 * scale);
    glow.addColorStop(0, COLORS.lampGlow);
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 28 * scale, 20 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawPlant(x, y) {
    const ctx = this.ctx;
    const base = this.toIso(x, y);
    ctx.save();
    ctx.fillStyle = COLORS.plantPot;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.plantLeaf;
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i - 2) * 0.4;
      ctx.beginPath();
      ctx.ellipse(base.x + Math.cos(ang) * 8, base.y - 14 + Math.sin(ang) * 5, 6, 12, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawPicture(cxNorm, cyNorm, emoji) {
    const ctx = this.ctx;
    const center = this.toIso(cxNorm, cyNorm, 0.55);
    ctx.save();
    ctx.fillStyle = '#f3e5ab';
    ctx.strokeStyle = COLORS.wainscotDark;
    ctx.lineWidth = 3;
    ctx.fillRect(center.x - 16, center.y - 12, 32, 24);
    ctx.strokeRect(center.x - 16, center.y - 12, 32, 24);
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, center.x, center.y);
    ctx.restore();
  }

  _drawKitchen() {
    const ctx = this.ctx;
    const p1 = this.toIso(0.60, 0.98, 0);
    const p2 = this.toIso(0.98, 0.98, 0);
    const p3 = this.toIso(0.98, 0.98, 0.28);
    const p4 = this.toIso(0.60, 0.98, 0.28);
    const topY = p3.y;

    ctx.save();
    ctx.fillStyle = COLORS.kitchen;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.kitchenTop;
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p3.x, p3.y - 5);
    ctx.lineTo(p4.x, p4.y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(p1.x + 14, topY + 5, 36, 20);
    ctx.fillRect(p2.x - 50, topY + 5, 32, 20);
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.arc(p1.x + 32, topY + 16, 5, 0, Math.PI * 2);
    ctx.arc(p2.x - 34, topY + 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('厨房', (p1.x + p2.x) / 2, topY + 18);
    ctx.restore();
  }

  _drawTable(t) {
    const ctx = this.ctx;
    const base = this.toIso(t.x, t.y);
    const scale = this.iso.scale;
    const w = 48 * scale;
    const d = 32 * scale;
    const h = 18 * scale;
    const clothH = 8 * scale;

    let cloth = COLORS.clothFree;
    if (t.state === 'occupied' || t.occupied) cloth = COLORS.clothOcc;
    else if (t.state === 'dirty') cloth = COLORS.clothDirty;

    ctx.save();
    ctx.translate(base.x, base.y);

    // 桌子投影
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    this._isoRectShadow(0, 0, w * 1.1, d * 1.1);

    // 桌腿
    ctx.fillStyle = COLORS.tableBase;
    const legR = 3.5 * scale;
    this._isoLeg(-w * 0.38, d * 0.28, legR, h);
    this._isoLeg(w * 0.38, d * 0.28, legR, h);
    this._isoLeg(-w * 0.38, -d * 0.28, legR, h);
    this._isoLeg(w * 0.38, -d * 0.28, legR, h);

    // 桌面 + 下垂桌布
    this._isoBox(0, -h, w, d, clothH, cloth);

    // 桌布折痕
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, -h - d * 0.25);
    ctx.lineTo(-w * 0.15, -h + clothH * 0.4);
    ctx.moveTo(w * 0.15, -h - d * 0.25);
    ctx.lineTo(w * 0.15, -h + clothH * 0.4);
    ctx.stroke();

    // 桌号
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = `bold ${12 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.id.replace('t', ''), 0, -h - d * 0.22);

    // 餐具 / 盘子 / 食物
    if (t.state === 'occupied' || t.occupied) {
      const plateY = -h - d * 0.05;
      ctx.fillStyle = COLORS.plate;
      ctx.beginPath();
      ctx.ellipse(-10 * scale, plateY, 8 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(10 * scale, plateY, 8 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(-10 * scale, plateY, 5 * scale, 3 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(10 * scale, plateY, 5 * scale, 3 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 四把椅子
    this._drawChair(-w * 0.62, 0, 'left');
    this._drawChair(w * 0.62, 0, 'right');
    this._drawChair(0, -d * 0.75, 'back');
    this._drawChair(0, d * 0.75, 'front');

    ctx.restore();
  }

  _isoRectShadow(cx, cy, w, d) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy + d * 0.5);
    ctx.lineTo(cx + w * 0.5, cy);
    ctx.lineTo(cx, cy - d * 0.5);
    ctx.lineTo(cx - w * 0.5, cy);
    ctx.closePath();
    ctx.fill();
  }

  _isoBox(cx, cy, w, d, h, fillColor) {
    const ctx = this.ctx;
    const topY = cy - h;
    const baseColor = fillColor || ctx.fillStyle;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(cx, topY + d * 0.5);
    ctx.lineTo(cx + w * 0.5, topY);
    ctx.lineTo(cx, topY - d * 0.5);
    ctx.lineTo(cx - w * 0.5, topY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this._shade(baseColor, -0.18);
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.5, topY);
    ctx.lineTo(cx + w * 0.5, topY + h);
    ctx.lineTo(cx, topY + h + d * 0.5);
    ctx.lineTo(cx, topY + d * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this._shade(baseColor, -0.08);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, topY);
    ctx.lineTo(cx - w * 0.5, topY + h);
    ctx.lineTo(cx, topY + h + d * 0.5);
    ctx.lineTo(cx, topY + d * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  _isoLeg(x, y, r, h) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - r, y, r * 2, h);
    ctx.beginPath();
    ctx.ellipse(x, y + h, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawChair(x, y, dir) {
    const ctx = this.ctx;
    const scale = this.iso.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = COLORS.chair;
    if (dir === 'front' || dir === 'back') {
      const w = 10 * scale, d = 8 * scale;
      ctx.beginPath();
      ctx.moveTo(0, d * 0.5);
      ctx.lineTo(w * 0.5, 0);
      ctx.lineTo(0, -d * 0.5);
      ctx.lineTo(-w * 0.5, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      const w = 8 * scale, d = 10 * scale;
      ctx.beginPath();
      ctx.moveTo(0, d * 0.5);
      ctx.lineTo(w * 0.5, 0);
      ctx.lineTo(0, -d * 0.5);
      ctx.lineTo(-w * 0.5, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCustomer(c) {
    this._drawPerson(c.x, c.y, c.z || 0, this._customerPalette(c), c.state, c.patience, c.patienceMax || c.maxPatience, null, c.id);
  }

  _drawWaiter(w) {
    this._drawPerson(w.x, w.y, w.z || 0, { body: '#1f2937', apron: '#f9fafb', head: '#fde68a', hat: 'waiter' }, w.state || 'idle', null, null, w.actionEmoji, 'waiter');
  }

  _drawChef(c) {
    this._drawPerson(c.x, c.y, c.z || 0, { body: '#ffffff', apron: '#ffffff', head: '#fde68a', hat: 'chef' }, c.state || 'idle', null, null, null, 'chef');
  }

  _customerPalette(c) {
    const colors = TYPE_COLORS[c.type] || TYPE_COLORS.normal;
    const idHash = String(c.id == null ? 'x' : c.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    return {
      body: colors[0],
      head: '#fde68a',
      hair: HAIR_COLORS[idHash % HAIR_COLORS.length],
      hat: 'none'
    };
  }

  _drawPerson(x, y, z, palette, state, patience, maxPatience, emoji, idTag, role) {
    const ctx = this.ctx;
    const pos = this.toIso(x, y, z);
    const scale = this.iso.scale * 1.55;
    const baseY = pos.y;

    ctx.save();
    ctx.translate(pos.x, baseY);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鞋
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-6 * scale, -6 * scale, 5 * scale, 4 * scale);
    ctx.fillRect(1.5 * scale, -6 * scale, 5 * scale, 4 * scale);

    // 身体（小梯形，带渐变）
    const bg = ctx.createLinearGradient(0, -17 * scale, 0, -5 * scale);
    bg.addColorStop(0, this._shade(palette.body, 0.12));
    bg.addColorStop(1, palette.body);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-9 * scale, -17 * scale);
    ctx.lineTo(9 * scale, -17 * scale);
    ctx.lineTo(12 * scale, -5 * scale);
    ctx.lineTo(-12 * scale, -5 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 围裙 / 服务员围兜
    if (palette.apron) {
      ctx.fillStyle = palette.apron;
      ctx.beginPath();
      ctx.moveTo(-6 * scale, -17 * scale);
      ctx.lineTo(6 * scale, -17 * scale);
      ctx.lineTo(8 * scale, -5 * scale);
      ctx.lineTo(-8 * scale, -5 * scale);
      ctx.closePath();
      ctx.fill();
    }

    // 手臂
    ctx.fillStyle = palette.head;
    ctx.beginPath();
    ctx.ellipse(-10 * scale, -11 * scale, 3.5 * scale, 2 * scale, -0.3, 0, Math.PI * 2);
    ctx.ellipse(10 * scale, -11 * scale, 3.5 * scale, 2 * scale, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // 头（大圆头 Q 版）+ 描边
    ctx.fillStyle = palette.head;
    ctx.beginPath();
    ctx.arc(0, -27 * scale, 11 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,40,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 头发
    ctx.fillStyle = palette.hair || '#4b5563';
    ctx.beginPath();
    ctx.arc(0, -30 * scale, 11 * scale, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9 * scale, -32 * scale);
    ctx.quadraticCurveTo(0, -25 * scale, 9 * scale, -32 * scale);
    ctx.lineTo(9 * scale, -35 * scale);
    ctx.lineTo(-9 * scale, -35 * scale);
    ctx.closePath();
    ctx.fill();

    // 腮红
    ctx.fillStyle = 'rgba(255,150,150,0.4)';
    ctx.beginPath();
    ctx.arc(-6 * scale, -25 * scale, 2.2 * scale, 0, Math.PI * 2);
    ctx.arc(6 * scale, -25 * scale, 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(-4 * scale, -28 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.arc(4 * scale, -28 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4.8 * scale, -29 * scale, 0.7 * scale, 0, Math.PI * 2);
    ctx.arc(3.2 * scale, -29 * scale, 0.7 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 小嘴
    ctx.fillStyle = '#be123c';
    ctx.beginPath();
    ctx.arc(0, -23 * scale, 1 * scale, 0, Math.PI);
    ctx.fill();

    // 帽子
    if (palette.hat === 'chef') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-11 * scale, -40 * scale, 22 * scale, 9 * scale);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(-9 * scale, -42 * scale, 18 * scale, 3 * scale);
    } else if (palette.hat === 'waiter') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-10 * scale, -39 * scale, 20 * scale, 5 * scale);
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(0, -37 * scale, 2.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // 情绪 / 耐心环
    if (patience !== undefined && maxPatience) {
      const ratio = Math.max(0, patience / maxPatience);
      const color = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -40 * scale, 13 * scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    if (emoji) {
      this._drawEmojiBubble(0, -55 * scale, emoji);
    }

    ctx.restore();
  }

  _drawEmojiBubble(x, y, emoji) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);
    ctx.restore();
  }

  _drawQueue() {
    const s = this.state;
    if (!s || !s.runtime || !s.runtime.waitingQueue) return;
    const ctx = this.ctx;
    const queue = s.runtime.waitingQueue || [];
    for (let i = 0; i < queue.length; i++) {
      const spot = { x: 0.12 + (i % 3) * 0.08, y: 0.22 + Math.floor(i / 3) * 0.08 };
      const pos = this.toIso(spot.x, spot.y);
      const c = queue[i];
      ctx.save();
      ctx.translate(pos.x, pos.y);
      const cols = (TYPE_COLORS[c.type] || TYPE_COLORS.normal)[0];
      ctx.fillStyle = cols;
      ctx.beginPath();
      ctx.arc(0, -16, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(0, -22, 6, 0, Math.PI * 2);
      ctx.fill();
      const ratio = Math.max(0, c.patience / (c.patienceMax || c.maxPatience || 1));
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -6, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawBubbles() {
    const s = this.state;
    if (!s || !s.runtime) return;
    const customers = s.runtime.customers || [];
    for (const c of customers) {
      if (c.state === 'leaving') this._drawFloatingEmoji(c.x, c.y, '👋');
      else if (c.state === 'angryLeave') this._drawFloatingEmoji(c.x, c.y, '💢');
    }
    const waiters = s.runtime.waiters || [];
    for (const w of waiters) {
      const e = this._waiterEmoji(w);
      if (e) this._drawFloatingEmoji(w.x, w.y, e);
    }
  }

  _waiterEmoji(w) {
    if (!w.task) return null;
    if (w.task.type === 'collect') return '💰';
    if (w.task.type === 'deliver') return '🍽️';
    if (w.task.type === 'takeOrder') return '📝';
    if (w.task.type === 'clear') return '🧹';
    return null;
  }

  _drawFloatingEmoji(x, y, emoji) {
    this._drawEmojiBubbleAt(x, y - 0.08, emoji);
  }

  _drawEmojiBubbleAt(x, y, emoji) {
    const ctx = this.ctx;
    const pos = this.toIso(x, y, 0.18);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0.5);
    ctx.restore();
  }

  _drawDoorOverlay() {
    const ctx = this.ctx;
    const pos = this.toIso(0.5, 0.08, 0.45);
    const scale = this.iso.scale;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = 'rgba(124,58,237,0.9)';
    const w = 56 * scale, h = 20 * scale, r = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `bold ${11 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('🚪 入口', 0, 0);
    ctx.restore();
  }

  _shade(hex, amount) {
    if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount * 255));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount * 255));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount * 255));
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }
}
