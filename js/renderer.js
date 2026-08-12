/* 梦幻西餐厅2 · 等角投影 Canvas 渲染器（精绘 2.5D bistro 版）
 * 设计目标：暖色童话风、柔和体积光、精致 Q 版人物，观感超越原作。
 * 全部使用标准 Canvas2D，零依赖；支持昼夜与粒子。
 */

const COLORS = {
  // 暖色木地板
  floorA: '#a9743f',
  floorB: '#6f4626',
  floorHi: '#c08a52',
  plankSeam: 'rgba(70,44,22,0.45)',
  // 墙面（奶油 + 木护墙板）
  wallTop: '#fdf3df',
  wallBot: '#ecdcbd',
  wainscot: '#a9743f',
  wainscotPanel: '#8a5d31',
  wainscotHi: '#c08a52',
  trim: '#6d4420',
  trimDark: '#4f3016',
  windowFrame: '#7a4e2e',
  glassDay1: '#dff0fb',
  glassDay2: '#bfe0f2',
  glassNight1: '#1a2742',
  glassNight2: '#0e1830',
  kitchen: '#b07d4a',
  kitchenTop: '#caa06a',
  steel: '#c2c8d2',
  door: '#7a4e2e',
  carpet: '#b5341f',
  carpetHi: '#d8452c',
  carpetDark: '#8f1414',
  rug: '#c0532b',
  rugHi: '#d96a3c',
  rugEdge: '#f0b35a',
  clothFree: '#fff4f7',
  clothOcc: '#ffd2dc',
  clothDirty: '#aab1ba',
  chair: '#9a6630',
  chairHi: '#b5824a',
  chairDark: '#6f4620',
  plantPot: '#b06a32',
  plantPotHi: '#c8824a',
  plantLeaf: '#4e8a5e',
  plantLeafD: '#3c6f4a',
  plate: '#ffffff',
  gold: '#f0b35a',
  lampShade: '#e8b765',
  lampShadeD: '#caa050'
};

const TYPE_COLORS = {
  normal: { body: '#3b82f6', bodyD: '#1d4ed8', accent: '#60a5fa' },
  business: { body: '#3b4250', bodyD: '#222834', accent: '#6b7488' },
  family: { body: '#f97316', bodyD: '#c2410c', accent: '#fb923c' },
  gourmet: { body: '#8b5cf6', bodyD: '#5b21b6', accent: '#a78bfa' }
};

const HAIR_COLORS = ['#3b2f2a', '#5b3a29', '#1f2937', '#7c5a3a', '#4b3b6b', '#6b3a3a', '#2f3a4b', '#8a6d3b', '#5a3b2a', '#3a2f3f'];

const SKIN = '#f7d9b0';
const SKIN_D = '#e6c193';

let _renderer = null;

export function createRenderer(canvas, state) {
  const el = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  _renderer = new Renderer(el);
  if (state) _renderer.setState(state);
  _renderer._preloadSprites();
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
    this._sprites = {};
    this._t = 0;
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
    const scale = Math.max(0.78, Math.min(1.2, Math.min(w / 430, h / 540)));
    this.iso.scale = scale;
    this.iso.tw = 215 * scale;
    this.iso.th = 108 * scale;
    this.iso.cx = w / 2;
    this.iso.cy = h * 0.80;
  }

  toIso(x, y, z = 0) {
    return {
      x: this.iso.cx + (x - y) * this.iso.tw,
      y: this.iso.cy - (x + y) * this.iso.th - z * this.iso.th * 1.8
    };
  }

  render() {
    const ctx = this.ctx;
    const s = this.state;
    this._t = performance.now ? performance.now() : Date.now();
    ctx.clearRect(0, 0, this.size.w, this.size.h);
    if (!s) return;

    this._drawBackground();
    this._drawFloor();
    this._drawWalls();
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

    drawables.sort((a, b) => a.z - b.z || a.obj.y - b.obj.y);

    for (const d of drawables) {
      if (d.kind === 'table') this._drawTable(d.obj);
      else if (d.kind === 'customer') this._drawCustomer(d.obj);
      else if (d.kind === 'waiter') this._drawWaiter(d.obj);
      else if (d.kind === 'chef') this._drawChef(d.obj);
    }

    this._drawQueue();
    this._drawParticles();
    this._drawBubbles();
    this._drawDoorOverlay();
    this._drawLights();
    this._drawAtmosphere();
  }

  _isNight() {
    const s = this.state;
    if (!s || !s.time) return false;
    const hour = s.time.hour || 0;
    return hour >= 18 || hour < 6;
  }

  /* ============ 背景 / 环境 ============ */

  _drawBackground() {
    const ctx = this.ctx;
    const { w, h } = this.size;
    const night = this._isNight();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (night) {
      g.addColorStop(0, '#0c1426');
      g.addColorStop(0.55, '#16223a');
      g.addColorStop(1, '#241a2e');
    } else {
      g.addColorStop(0, '#eaf6ff');
      g.addColorStop(0.55, '#fbf3e6');
      g.addColorStop(1, '#f6e7d2');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    this._drawCityscape(night);
  }

  _drawCityscape(night) {
    const ctx = this.ctx;
    const { w } = this.size;
    const baseY = this.iso.cy - this.iso.th * 2.35;
    if (baseY < 0) return;
    ctx.save();
    ctx.globalAlpha = night ? 0.5 : 0.3;
    const palette = night
      ? ['#2a3a55', '#34466a', '#1d2840']
      : ['#aebfd2', '#c8d6e6', '#90a4b8'];
    const rnd = (x) => {
      const v = Math.sin(x * 91.7 + 13.3) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < 46; i++) {
      const bx = (i / 46) * (w + 40) - 20;
      const bw = 16 + rnd(i) * 26;
      const bh = 46 + rnd(i + 7) * 110;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(bx, baseY - bh, bw, bh);
      // 屋顶高光
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(bx, baseY - bh, bw, 3);
      if (night) {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 2; c++) {
            if (rnd(i * 3 + r * 2 + c) > 0.55) {
              ctx.fillStyle = 'rgba(253,224,120,0.65)';
              ctx.fillRect(bx + 4 + c * 7, baseY - bh + 10 + r * 13, 3.5, 5);
            }
          }
        }
      }
    }
    ctx.restore();
  }

  _drawFloor() {
    const ctx = this.ctx;
    const iso = this.iso;
    const corners = [this.toIso(0, 0), this.toIso(1, 0), this.toIso(1, 1), this.toIso(0, 1)];
    ctx.save();
    // 底色
    const fg = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[2].x, corners[2].y);
    fg.addColorStop(0, COLORS.floorA);
    fg.addColorStop(1, COLORS.floorB);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fill();

    // 逐板木地板（前→后 为条带，带渐变与高光）
    const N = 9;
    for (let i = 0; i < N; i++) {
      const y0 = i / N, y1 = (i + 1) / N;
      const p0 = this.toIso(0, y0), p1 = this.toIso(1, y0), p2 = this.toIso(1, y1), p3 = this.toIso(0, y1);
      const tint = (i % 2 === 0) ? 0 : -0.06;
      const pg = ctx.createLinearGradient((p0.x + p3.x) / 2, p0.y, (p1.x + p2.x) / 2, p2.y);
      pg.addColorStop(0, this._shade(COLORS.floorA, 0.05 + tint));
      pg.addColorStop(1, this._shade(COLORS.floorB, tint));
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      // 顶部高光
      ctx.strokeStyle = 'rgba(220,170,110,0.25)';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      // 板缝
      ctx.strokeStyle = COLORS.plankSeam;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    // 错落短缝
    ctx.strokeStyle = 'rgba(70,44,22,0.30)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < N; i++) {
      const off = (i % 2) * 0.11;
      for (let j = 0; j < N; j += 2) {
        const a = this.toIso(j / N + off, i / N);
        const b = this.toIso((j + 1) / N + off, i / N);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // 中心柔光（吊灯洒落）
    const c = this.toIso(0.5, 0.5);
    const sheen = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, iso.tw * 1.15);
    sheen.addColorStop(0, 'rgba(255,232,180,0.18)');
    sheen.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, iso.tw * 1.15, iso.th * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // 入口红毯
    const r0 = this.toIso(0.35, 0.02), r1 = this.toIso(0.65, 0.02), r2 = this.toIso(0.55, 0.30), r3 = this.toIso(0.45, 0.30);
    const rg = ctx.createLinearGradient(r0.x, r0.y, r2.x, r2.y);
    rg.addColorStop(0, COLORS.carpetHi);
    rg.addColorStop(1, COLORS.carpetDark);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.lineTo(r3.x, r3.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const p1 = { x: r0.x + (r1.x - r0.x) * t, y: r0.y + (r1.y - r0.y) * t };
      const p2 = { x: r3.x + (r2.x - r3.x) * t, y: r3.y + (r2.y - r3.y) * t };
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawWalls() {
    const ctx = this.ctx;
    const hWall = this.iso.th * 2.7;
    const backLeft = this.toIso(0, 1), backRight = this.toIso(1, 1);
    const frontLeft = this.toIso(0, 0), frontRight = this.toIso(1, 0);
    const sc = this.iso.scale;
    const wTop = hWall * 0.60;

    ctx.save();
    // ===== 后墙 =====
    // 上部奶油墙（竖向渐变）
    const upperG = ctx.createLinearGradient(0, backLeft.y - hWall, 0, backLeft.y - wTop);
    upperG.addColorStop(0, COLORS.wallTop);
    upperG.addColorStop(1, COLORS.wallBot);
    ctx.fillStyle = upperG;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y); ctx.lineTo(backRight.x, backRight.y);
    ctx.lineTo(backRight.x, backRight.y - wTop); ctx.lineTo(backLeft.x, backLeft.y - wTop);
    ctx.closePath(); ctx.fill();
    // 护墙板
    ctx.fillStyle = COLORS.wainscot;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y - wTop); ctx.lineTo(backRight.x, backRight.y - wTop);
    ctx.lineTo(backRight.x, backRight.y); ctx.lineTo(backLeft.x, backLeft.y);
    ctx.closePath(); ctx.fill();
    // 护墙板嵌板
    const panels = 7;
    for (let i = 0; i < panels; i++) {
      const a = this.toIso(i / panels, 1, 0.04);
      const b = this.toIso((i + 0.82) / panels, 1, 0.04);
      const e = this.toIso((i + 0.82) / panels, 1, 0.56);
      const d = this.toIso(i / panels, 1, 0.56);
      const pg = ctx.createLinearGradient(a.x, a.y, a.x, d.y);
      pg.addColorStop(0, COLORS.wainscotHi);
      pg.addColorStop(1, COLORS.wainscotPanel);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,36,16,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 腰线 / 踢脚线
    ctx.strokeStyle = COLORS.trim;
    ctx.lineWidth = 2.5 * sc;
    ctx.beginPath(); ctx.moveTo(backLeft.x, backLeft.y - wTop); ctx.lineTo(backRight.x, backRight.y - wTop); ctx.stroke();
    ctx.strokeStyle = COLORS.trimDark;
    ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.moveTo(backLeft.x, backLeft.y - 2); ctx.lineTo(backRight.x, backRight.y - 2); ctx.stroke();

    // 后墙大窗 + 光
    this._drawWindow(0.10, 1, 0.90, 1);
    // 窗光洒地
    this._drawWindowLight(0.10, 1, 0.90, 1);

    // ===== 左墙 =====
    const luG = ctx.createLinearGradient(0, backLeft.y - hWall, 0, backLeft.y - wTop);
    luG.addColorStop(0, COLORS.wallTop);
    luG.addColorStop(1, COLORS.wallBot);
    ctx.fillStyle = luG;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y); ctx.lineTo(frontLeft.x, frontLeft.y);
    ctx.lineTo(frontLeft.x, frontLeft.y - wTop); ctx.lineTo(backLeft.x, backLeft.y - wTop);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORS.wainscot;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y - wTop); ctx.lineTo(frontLeft.x, frontLeft.y - wTop);
    ctx.lineTo(frontLeft.x, frontLeft.y); ctx.lineTo(backLeft.x, backLeft.y);
    ctx.closePath(); ctx.fill();
    const lp = 6;
    for (let i = 0; i < lp; i++) {
      const a = this.toIso(0, i / lp, 0.04);
      const b = this.toIso(0, (i + 0.82) / lp, 0.04);
      const e = this.toIso(0, (i + 0.82) / lp, 0.56);
      const d = this.toIso(0, i / lp, 0.56);
      const pg = ctx.createLinearGradient(a.x, a.y, a.x, d.y);
      pg.addColorStop(0, COLORS.wainscotHi);
      pg.addColorStop(1, COLORS.wainscotPanel);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,36,16,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.strokeStyle = COLORS.trim; ctx.lineWidth = 2.5 * sc;
    ctx.beginPath(); ctx.moveTo(backLeft.x, backLeft.y - wTop); ctx.lineTo(frontLeft.x, frontLeft.y - wTop); ctx.stroke();
    ctx.strokeStyle = COLORS.trimDark; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.moveTo(backLeft.x, backLeft.y - 2); ctx.lineTo(frontLeft.x, frontLeft.y - 2); ctx.stroke();

    this._drawWindow(0, 0.12, 0, 0.88);
    this._drawWindowLight(0, 0.12, 0, 0.88);

    // ===== 右侧开放矮护栏 =====
    ctx.strokeStyle = COLORS.trim;
    ctx.lineWidth = 3 * sc;
    ctx.beginPath(); ctx.moveTo(backRight.x, backRight.y); ctx.lineTo(frontRight.x, frontRight.y); ctx.stroke();
    const railTop = backRight.y - hWall * 0.14;
    ctx.strokeStyle = COLORS.trimDark;
    ctx.lineWidth = 1.5 * sc;
    ctx.beginPath(); ctx.moveTo(backRight.x, railTop); ctx.lineTo(frontRight.x, frontRight.y - hWall * 0.14); ctx.stroke();
    for (let i = 0; i <= 5; i++) {
      const p = this.toIso(1, i / 5, 0);
      const top = this.toIso(1, i / 5, 0.14);
      const pg = ctx.createLinearGradient(p.x, p.y, top.x, top.y);
      pg.addColorStop(0, COLORS.trimDark);
      pg.addColorStop(1, COLORS.trim);
      ctx.fillStyle = pg;
      ctx.fillRect(p.x - 3 * sc, top.y, 6 * sc, p.y - top.y);
      ctx.beginPath(); ctx.arc(p.x, top.y, 3.5 * sc, 0, Math.PI * 2); ctx.fillStyle = COLORS.trim; ctx.fill();
    }

    // 窗台盆栽
    this._drawPlant(0.05, 0.95);
    this._drawPlant(0.95, 0.95);
    // 壁灯
    this._drawSconce(0, 0.30);
    this._drawSconce(0, 0.70);

    ctx.restore();
  }

  _drawWindow(x0, y0, x1, y1) {
    const ctx = this.ctx;
    const sc = this.iso.scale;
    const a = this.toIso(x0, y0, 0.22);
    const b = this.toIso(x1, y1, 0.22);
    const c = this.toIso(x1, y1, 0.88);
    const d = this.toIso(x0, y0, 0.88);
    const night = this._isNight();
    const gg = ctx.createLinearGradient(d.x, d.y, a.x, a.y);
    gg.addColorStop(0, night ? COLORS.glassNight1 : COLORS.glassDay1);
    gg.addColorStop(1, night ? COLORS.glassNight2 : COLORS.glassDay2);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
    // 夜空星/月
    if (night) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 6; i++) {
        const sx = d.x + (a.x - d.x) * ((i * 0.17 + 0.1));
        const sy = d.y + (c.y - d.y) * ((i * 0.21 + 0.15));
        ctx.beginPath(); ctx.arc(sx, sy, 1.2 * sc, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // 窗外暖阳光晕
      const sg = ctx.createRadialGradient((a.x + d.x) / 2, (a.y + d.y) / 2, 0, (a.x + d.x) / 2, (a.y + d.y) / 2, 40 * sc);
      sg.addColorStop(0, 'rgba(255,255,255,0.45)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
    // 窗框
    ctx.strokeStyle = COLORS.windowFrame;
    ctx.lineWidth = 4 * sc;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.stroke();
    // 十字棂
    const mx = this.toIso((x0 + x1) / 2, (y0 + y1) / 2, 0.22);
    const my = this.toIso((x0 + x1) / 2, (y0 + y1) / 2, 0.88);
    ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.moveTo(mx.x, mx.y); ctx.lineTo(my.x, my.y); ctx.stroke();
    const hMid = this.toIso(x0, y0, 0.55);
    const hMid2 = this.toIso(x1, y1, 0.55);
    ctx.beginPath(); ctx.moveTo(hMid.x, hMid.y); ctx.lineTo(hMid2.x, hMid2.y); ctx.stroke();
  }

  _drawWindowLight(x0, y0, x1, y1) {
    const ctx = this.ctx;
    const top = this.toIso(x0, y0, 0.22);
    const bot = this.toIso((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const w = this.iso.scale * 60;
    const grad = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y + 30);
    grad.addColorStop(0, 'rgba(255,244,210,0.20)');
    grad.addColorStop(1, 'rgba(255,244,210,0)');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(top.x - w * 0.4, top.y);
    ctx.lineTo(top.x + w * 0.4, top.y);
    ctx.lineTo(bot.x + w * 0.9, bot.y + 40);
    ctx.lineTo(bot.x - w * 0.9, bot.y + 40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawRug() {
    const ctx = this.ctx;
    const c = this.toIso(0.5, 0.5);
    const sc = this.iso.scale;
    const rw = 150 * sc, rh = 80 * sc;
    ctx.save();
    ctx.translate(c.x, c.y);
    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(0, 4, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
    rg.addColorStop(0, COLORS.rugHi);
    rg.addColorStop(1, COLORS.rug);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
    // 内圈描金
    ctx.strokeStyle = COLORS.rugEdge;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, rw * 0.82, rh * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(240,179,90,0.6)';
    ctx.beginPath(); ctx.ellipse(0, 0, rw * 0.6, rh * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  _drawSconce(x, y) {
    const ctx = this.ctx;
    const base = this.toIso(x, y, 0.52);
    const sc = this.iso.scale;
    ctx.save();
    ctx.translate(base.x, base.y);
    const wallG = ctx.createLinearGradient(0, -12 * sc, 0, 0);
    wallG.addColorStop(0, COLORS.wainscotHi);
    wallG.addColorStop(1, COLORS.wainscotPanel);
    ctx.fillStyle = wallG;
    ctx.fillRect(-3.5 * sc, -12 * sc, 7 * sc, 12 * sc);
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath(); ctx.arc(0, -12 * sc, 3.5 * sc, 0, Math.PI * 2); ctx.fill();
    const glow = ctx.createRadialGradient(0, -12 * sc, 0, 0, -12 * sc, 18 * sc);
    glow.addColorStop(0, 'rgba(255,221,150,0.55)');
    glow.addColorStop(1, 'rgba(255,221,150,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -12 * sc, 18 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawPictures() {
    this._drawPicture(0.30, 1, 'wine');
    this._drawPicture(0.70, 1, 'fork');
  }

  _drawPicture(cxNorm, cyNorm, kind) {
    const ctx = this.ctx;
    const center = this.toIso(cxNorm, cyNorm, 0.78);
    const sc = this.iso.scale;
    const fw = 34 * sc, fh = 26 * sc;
    ctx.save();
    ctx.translate(center.x, center.y);
    // 外框
    ctx.fillStyle = COLORS.trim;
    ctx.fillRect(-fw / 2 - 3, -fh / 2 - 3, fw + 6, fh + 6);
    // 卡纸
    ctx.fillStyle = '#fbf3e2';
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    // 内画
    ctx.save();
    ctx.beginPath(); ctx.rect(-fw / 2 + 4, -fh / 2 + 4, fw - 8, fh - 8); ctx.clip();
    const bg = ctx.createLinearGradient(0, -fh / 2, 0, fh / 2);
    bg.addColorStop(0, '#fde9c8');
    bg.addColorStop(1, '#f6cda0');
    ctx.fillStyle = bg;
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    if (kind === 'wine') {
      ctx.fillStyle = '#7a1f2b';
      ctx.beginPath(); ctx.moveTo(-4 * sc, -2 * sc); ctx.lineTo(4 * sc, -2 * sc);
      ctx.lineTo(3 * sc, 8 * sc); ctx.lineTo(-3 * sc, 8 * sc); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9c2a39';
      ctx.beginPath(); ctx.ellipse(0, -2 * sc, 5 * sc, 2.4 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#caa050'; ctx.lineWidth = 2 * sc;
      ctx.beginPath(); ctx.moveTo(0, -2 * sc); ctx.lineTo(0, 9 * sc); ctx.stroke();
    } else {
      ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 2.5 * sc;
      ctx.beginPath(); ctx.moveTo(-6 * sc, 8 * sc); ctx.lineTo(-6 * sc, -6 * sc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6 * sc, 8 * sc); ctx.lineTo(6 * sc, -6 * sc); ctx.stroke();
      ctx.fillStyle = '#c9ccd2';
      ctx.beginPath(); ctx.arc(-6 * sc, -8 * sc, 2.6 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6 * sc, -8 * sc, 2.6 * sc, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = COLORS.trimDark; ctx.lineWidth = 1.2;
    ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }

  _drawPlant(x, y) {
    const ctx = this.ctx;
    const base = this.toIso(x, y);
    const sc = this.iso.scale;
    ctx.save();
    ctx.translate(base.x, base.y);
    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(0, 0, 11 * sc, 5 * sc, 0, 0, Math.PI * 2); ctx.fill();
    const pg = ctx.createLinearGradient(0, -14 * sc, 0, 0);
    pg.addColorStop(0, COLORS.plantPotHi);
    pg.addColorStop(1, COLORS.plantPot);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(-9 * sc, -14 * sc); ctx.lineTo(9 * sc, -14 * sc);
    ctx.lineTo(7 * sc, 0); ctx.lineTo(-7 * sc, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COLORS.plantPot; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * 0.42;
      ctx.fillStyle = i % 2 ? COLORS.plantLeaf : COLORS.plantLeafD;
      ctx.beginPath();
      ctx.ellipse(Math.cos(ang) * 9 * sc, -18 * sc + Math.sin(ang) * 6 * sc, 6 * sc, 13 * sc, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawKitchen() {
    const ctx = this.ctx;
    const sc = this.iso.scale;
    const p1 = this.toIso(0.60, 0.985, 0);
    const p2 = this.toIso(0.985, 0.985, 0);
    const p3 = this.toIso(0.985, 0.985, 0.30);
    const p4 = this.toIso(0.60, 0.985, 0.30);
    ctx.save();
    // 台体
    const kg = ctx.createLinearGradient(p1.x, p1.y, p1.x, p3.y);
    kg.addColorStop(0, COLORS.kitchenTop);
    kg.addColorStop(1, COLORS.kitchen);
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.closePath(); ctx.fill();
    // 台面高光
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x, p3.y - 4 * sc); ctx.lineTo(p4.x, p4.y - 4 * sc);
    ctx.closePath(); ctx.fill();
    // 灶具
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(p1.x + 12, p3.y + 6, 38, 18);
    ctx.fillRect(p2.x - 52, p3.y + 6, 34, 18);
    ctx.fillStyle = '#2b2f36';
    ctx.beginPath(); ctx.arc(p1.x + 31, p3.y + 15, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p2.x - 35, p3.y + 15, 5, 0, Math.PI * 2); ctx.fill();
    // 蒸汽
    const t = this._t / 600;
    for (let i = 0; i < 3; i++) {
      const sx = p1.x + 14 + i * 14;
      const sy = p3.y + 4 - ((t + i * 0.4) % 1) * 16 * sc;
      ctx.fillStyle = `rgba(255,255,255,${0.20 * (1 - ((t + i * 0.4) % 1))})`;
      ctx.beginPath(); ctx.arc(sx, sy, 3 * sc, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${12 * sc}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('厨房', (p1.x + p2.x) / 2, p3.y + 16);
    ctx.restore();
  }

  /* ============ 家具 ============ */

  _drawTable(t) {
    const ctx = this.ctx;
    const base = this.toIso(t.x, t.y);
    const sc = this.iso.scale;
    const w = 50 * sc, d = 33 * sc, h = 19 * sc, clothH = 11 * sc;
    let cloth = COLORS.clothFree;
    if (t.state === 'occupied' || t.occupied) cloth = COLORS.clothOcc;
    else if (t.state === 'dirty') cloth = COLORS.clothDirty;

    ctx.save();
    ctx.translate(base.x, base.y);
    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    this._isoShadow(0, 0, w * 1.15, d * 1.15);

    // 桌腿
    ctx.fillStyle = COLORS.chairDark;
    const legR = 3.4 * sc;
    this._isoLeg(-w * 0.36, d * 0.26, legR, h);
    this._isoLeg(w * 0.36, d * 0.26, legR, h);
    this._isoLeg(-w * 0.36, -d * 0.26, legR, h);
    this._isoLeg(w * 0.36, -d * 0.26, legR, h);

    // 桌布（带垂坠渐变）
    const cg = ctx.createLinearGradient(0, -h - d * 0.5, 0, -h + clothH);
    cg.addColorStop(0, this._shade(cloth, 0.05));
    cg.addColorStop(1, this._shade(cloth, -0.12));
    ctx.fillStyle = cg;
    this._isoCloth(0, -h, w, d, clothH);
    // 布褶
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.18, -h - d * 0.22);
      ctx.lineTo(i * w * 0.18, -h + clothH * 0.5);
      ctx.stroke();
    }
    // 桌面圆顶
    ctx.fillStyle = this._shade(cloth, 0.1);
    ctx.beginPath();
    ctx.ellipse(0, -h, w * 0.5, d * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath(); ctx.ellipse(0, -h, w * 0.5, d * 0.5, 0, 0, Math.PI * 2); ctx.stroke();

    // 桌号
    ctx.fillStyle = 'rgba(80,40,20,0.45)';
    ctx.font = `bold ${11 * sc}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.id).replace('t', ''), 0, -h - d * 0.18);

    // 餐具 / 餐盘 / 食物 / 烛台
    if (t.state === 'occupied' || t.occupied) {
      const plateY = -h - d * 0.04;
      for (const dx of [-11 * sc, 11 * sc]) {
        const pg = ctx.createRadialGradient(dx - 2, plateY - 2, 1, dx, plateY, 9 * sc);
        pg.addColorStop(0, '#ffffff');
        pg.addColorStop(1, '#dfe3e8');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(dx, plateY, 8.5 * sc, 4.8 * sc, 0, 0, Math.PI * 2); ctx.fill();
        // 食物
        ctx.fillStyle = '#e08a3c';
        ctx.beginPath(); ctx.ellipse(dx, plateY, 5 * sc, 3 * sc, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5fae5a';
        ctx.beginPath(); ctx.ellipse(dx + 2 * sc, plateY - 1 * sc, 2 * sc, 1.4 * sc, 0, 0, Math.PI * 2); ctx.fill();
        // 蒸汽
        const tt = (this._t / 700 + (dx > 0 ? 0.5 : 0)) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - tt)})`;
        ctx.beginPath(); ctx.arc(dx, plateY - 4 * sc - tt * 12 * sc, 2.4 * sc, 0, Math.PI * 2); ctx.fill();
      }
      // 烛台
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(-2 * sc, -h - 6 * sc, 4 * sc, 6 * sc);
      const fl = 0.7 + 0.3 * Math.sin(this._t / 120);
      const fg = ctx.createRadialGradient(0, -h - 9 * sc, 0, 0, -h - 9 * sc, 7 * sc);
      fg.addColorStop(0, `rgba(255,210,120,${0.9 * fl})`);
      fg.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(0, -h - 9 * sc, 7 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath(); ctx.ellipse(0, -h - 9 * sc, 1.6 * sc, 3 * sc, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 椅子
    this._drawChair(-w * 0.64, 0, 'left');
    this._drawChair(w * 0.64, 0, 'right');
    this._drawChair(0, -d * 0.78, 'back');
    this._drawChair(0, d * 0.78, 'front');

    ctx.restore();
  }

  _isoShadow(cx, cy, w, d) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy + d * 0.5);
    ctx.lineTo(cx + w * 0.5, cy);
    ctx.lineTo(cx, cy - d * 0.5);
    ctx.lineTo(cx - w * 0.5, cy);
    ctx.closePath();
    ctx.fill();
  }

  _isoCloth(cx, cy, w, d, h) {
    const ctx = this.ctx;
    const topY = cy - h;
    ctx.beginPath();
    ctx.moveTo(cx, topY + d * 0.5);
    ctx.lineTo(cx + w * 0.5, topY);
    ctx.lineTo(cx, topY - d * 0.5);
    ctx.lineTo(cx - w * 0.5, topY);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.5, topY);
    ctx.lineTo(cx + w * 0.5, topY + h);
    ctx.lineTo(cx, topY + h + d * 0.5);
    ctx.lineTo(cx, topY + d * 0.5);
    ctx.closePath();
    ctx.fill();
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
    ctx.fillStyle = this._shade(COLORS.chairDark, 0.1);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - r, y, r * 2, h);
    ctx.beginPath(); ctx.ellipse(x, y + h, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawChair(x, y, dir) {
    const ctx = this.ctx;
    const sc = this.iso.scale;
    ctx.save();
    ctx.translate(x, y);
    const w = dir === 'front' || dir === 'back' ? 13 * sc : 10 * sc;
    const d = dir === 'front' || dir === 'back' ? 10 * sc : 13 * sc;
    // 椅腿投影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, d * 0.5 + 1); ctx.lineTo(w * 0.5, 1); ctx.lineTo(0, -d * 0.5 + 1); ctx.lineTo(-w * 0.5, 1);
    ctx.closePath(); ctx.fill();
    // 坐垫
    const cg = ctx.createLinearGradient(0, -d * 0.5, 0, d * 0.5);
    cg.addColorStop(0, COLORS.chairHi);
    cg.addColorStop(1, COLORS.chair);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(0, d * 0.5); ctx.lineTo(w * 0.5, 0); ctx.lineTo(0, -d * 0.5); ctx.lineTo(-w * 0.5, 0);
    ctx.closePath(); ctx.fill();
    // 靠背
    const bg = this._shade(COLORS.chair, 0.08);
    ctx.fillStyle = bg;
    if (dir === 'back') {
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -d * 0.5);
      ctx.lineTo(-w * 0.5, -d * 0.5 - 16 * sc);
      ctx.lineTo(w * 0.5, -d * 0.5 - 16 * sc);
      ctx.lineTo(w * 0.5, -d * 0.5);
      ctx.closePath(); ctx.fill();
    } else if (dir === 'front') {
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, d * 0.5);
      ctx.lineTo(-w * 0.5, d * 0.5 + 14 * sc);
      ctx.lineTo(w * 0.5, d * 0.5 + 14 * sc);
      ctx.lineTo(w * 0.5, d * 0.5);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillRect(-w * 0.5 - 2 * sc, -d * 0.5, 4 * sc, d);
    }
    ctx.restore();
  }

  /* ============ 人物 ============ */

  _drawCustomer(c) {
    const keys = ['customer_red', 'customer_blue', 'customer_green', 'customer_purple'];
    const idh = String(c.id == null ? 'x' : c.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const spriteKey = keys[idh % 4];
    this._drawPerson(c.x, c.y, c.z || 0, this._customerPalette(c), c.state, c.patience, c.patienceMax || c.maxPatience, null, c.id, null, spriteKey);
  }

  _drawWaiter(w) {
    this._drawPerson(w.x, w.y, w.z || 0,
      { body: '#2b3a55', bodyD: '#1a2236', apron: '#fbfdff', head: SKIN, hair: '#3b2f2a', hat: 'waiter', accent: '#c0392b' },
      w.state || 'idle', null, null, w.actionEmoji, 'waiter', 'waiter');
  }

  _drawChef(c) {
    this._drawPerson(c.x, c.y, c.z || 0,
      { body: '#f4f6f9', bodyD: '#d7dde6', apron: '#f4f6f9', head: SKIN, hair: '#2a2a2a', hat: 'chef', accent: '#e5e7eb' },
      c.state || 'idle', null, null, null, 'chef', 'chef');
  }

  _customerPalette(c) {
    const t = TYPE_COLORS[c.type] || TYPE_COLORS.normal;
    const idHash = String(c.id == null ? 'x' : c.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    return {
      body: t.body, bodyD: t.bodyD, accent: t.accent,
      head: SKIN, hair: HAIR_COLORS[idHash % HAIR_COLORS.length], hat: 'none'
    };
  }

  _drawPerson(x, y, z, p, state, patience, maxPatience, emoji, idTag, role, spriteKey) {
    const ctx = this.ctx;
    const pos = this.toIso(x, y, z);
    const sc = this.iso.scale * 1.5;
    const seated = state === 'seated' || state === 'eating' || state === 'waitingOrder' || state === 'ordering';
    const baseY = pos.y;

    ctx.save();
    ctx.translate(pos.x, baseY);

    // 接触投影
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 * sc);
    sh.addColorStop(0, 'rgba(0,0,0,0.28)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(0, 0, 14 * sc, 6 * sc, 0, 0, Math.PI * 2); ctx.fill();

    // 精灵贴图（真实插画质感，优先于程序绘制；未就绪时降级到程序绘制）
    const spr = spriteKey ? this._ensureSprite(spriteKey) : null;
    if (spr && spr.ready) {
      const bb = spr.bbox;
      const chH = this.iso.scale * 1.5 * 72;
      const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
      const dw = chH * (bw / bh), dh = chH;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(spr.img, bb.minX, bb.minY, bw, bh, -dw / 2, -dh + 4 * sc, dw, dh);
      const topY = -dh + 4 * sc;
      if (patience !== undefined && maxPatience) {
        const ratio = Math.max(0, patience / maxPatience);
        const color = ratio > 0.5 ? '#34d399' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
        ctx.strokeStyle = color; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(0, topY - 6 * sc, 14 * sc, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio); ctx.stroke();
      }
      if (emoji) this._drawEmojiBubble(0, topY - 20 * sc, emoji);
      ctx.restore();
      return;
    }

    if (!seated) {
      // 腿
      ctx.fillStyle = this._shade(p.bodyD || '#2a2a33', -0.05);
      ctx.fillRect(-6 * sc, -10 * sc, 4.5 * sc, 9 * sc);
      ctx.fillRect(1.5 * sc, -10 * sc, 4.5 * sc, 9 * sc);
      // 鞋
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath(); ctx.ellipse(-4 * sc, -2 * sc, 4 * sc, 2.4 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4 * sc, -2 * sc, 4 * sc, 2.4 * sc, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 身体（圆润梯形 + 渐变）
    const bg = ctx.createLinearGradient(0, -30 * sc, 0, -8 * sc);
    bg.addColorStop(0, this._shade(p.body, 0.1));
    bg.addColorStop(1, p.bodyD || this._shade(p.body, -0.18));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-9 * sc, -32 * sc);
    ctx.lineTo(9 * sc, -32 * sc);
    ctx.lineTo(12 * sc, -8 * sc);
    ctx.lineTo(-12 * sc, -8 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 围裙/服务生
    if (p.hat === 'waiter' || p.apron) {
      ctx.fillStyle = p.apron || '#fff';
      ctx.beginPath();
      ctx.moveTo(-7 * sc, -32 * sc);
      ctx.lineTo(7 * sc, -32 * sc);
      ctx.lineTo(9 * sc, -8 * sc);
      ctx.lineTo(-9 * sc, -8 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.moveTo(0, -32 * sc); ctx.lineTo(0, -8 * sc); ctx.stroke();
      // 领结
      if (p.accent) {
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.moveTo(0, -32 * sc); ctx.lineTo(-4 * sc, -30 * sc); ctx.lineTo(0, -28 * sc); ctx.lineTo(4 * sc, -30 * sc);
        ctx.closePath(); ctx.fill();
      }
    } else if (p.hat === 'chef') {
      ctx.fillStyle = '#eef1f5';
      ctx.fillRect(-9 * sc, -30 * sc, 18 * sc, 10 * sc);
    }

    // 手臂
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.ellipse(-11 * sc, -20 * sc, 3.6 * sc, 2.2 * sc, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(11 * sc, -20 * sc, 3.6 * sc, 2.2 * sc, 0.3, 0, Math.PI * 2); ctx.fill();
    if (p.hat === 'waiter' && emoji === '🍽️') {
      // 端盘
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(12 * sc, -18 * sc, 6 * sc, 3 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e08a3c';
      ctx.beginPath(); ctx.ellipse(12 * sc, -19 * sc, 3 * sc, 1.8 * sc, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 头（圆头 + 柔光）
    const hx = 0, hy = -42 * sc, hr = 12 * sc;
    const hg = ctx.createRadialGradient(hx - 4 * sc, hy - 4 * sc, 2, hx, hy, hr);
    hg.addColorStop(0, this._shade(p.head, 0.06));
    hg.addColorStop(1, SKIN_D);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,40,0.30)';
    ctx.lineWidth = 1.1; ctx.stroke();

    // 头发
    if (p.hair) {
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 1 * sc, hr, Math.PI * 1.02, Math.PI * 1.98);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-hr * 0.9, hy - 3 * sc);
      ctx.quadraticCurveTo(0, hy - hr * 1.5, hr * 0.9, hy - 3 * sc);
      ctx.lineTo(hr * 0.7, hy - hr * 0.7);
      ctx.quadraticCurveTo(0, hy - hr * 1.1, -hr * 0.7, hy - hr * 0.7);
      ctx.closePath(); ctx.fill();
    }

    // 厨师帽
    if (p.hat === 'chef') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(hx - 5 * sc, hy - hr * 0.8, 5 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 5 * sc, hy - hr * 0.8, 5 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx, hy - hr * 1.1, 6 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(hx - 9 * sc, hy - hr * 0.6, 18 * sc, 5 * sc);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(hx - 9 * sc, hy - hr * 0.6, 18 * sc, 2 * sc);
    } else if (p.hat === 'waiter') {
      ctx.fillStyle = '#2b3a55';
      ctx.fillRect(hx - 9 * sc, hy - hr * 0.9, 18 * sc, 3 * sc);
    }

    // 脸
    ctx.fillStyle = '#22262e';
    ctx.beginPath(); ctx.arc(hx - 4.2 * sc, hy - 1 * sc, 2 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 4.2 * sc, hy - 1 * sc, 2 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx - 4.8 * sc, hy - 1.8 * sc, 0.8 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 3.7 * sc, hy - 1.8 * sc, 0.8 * sc, 0, Math.PI * 2); ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(255,150,150,0.4)';
    ctx.beginPath(); ctx.arc(hx - 6.5 * sc, hy + 2 * sc, 2.2 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 6.5 * sc, hy + 2 * sc, 2.2 * sc, 0, Math.PI * 2); ctx.fill();
    // 嘴
    ctx.strokeStyle = '#be123c'; ctx.lineWidth = 1.4 * sc; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx, hy + 4 * sc, 2.6 * sc, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

    // 耐心环
    if (patience !== undefined && maxPatience) {
      const ratio = Math.max(0, patience / maxPatience);
      const color = ratio > 0.5 ? '#34d399' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(hx, hy - hr - 4 * sc, 14 * sc, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    if (emoji) this._drawEmojiBubble(0, hy - hr - 14 * sc, emoji);

    ctx.restore();
  }

  _drawEmojiBubble(x, y, emoji) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);
    ctx.restore();
  }

  /* ============ 精灵图加载 ============ */

  _preloadSprites() {
    ['waiter', 'chef', 'customer_red', 'customer_blue', 'customer_green', 'customer_purple']
      .forEach((k) => this._ensureSprite(k));
  }

  _ensureSprite(key) {
    if (!this._sprites) this._sprites = {};
    let e = this._sprites[key];
    if (e) return e;
    const img = new Image();
    e = { img, bbox: null, ready: false };
    this._sprites[key] = e;
    img.onload = () => {
      try {
        const cw = img.naturalWidth, ch = img.naturalHeight;
        const oc = document.createElement('canvas');
        oc.width = cw; oc.height = ch;
        const octx = oc.getContext('2d');
        octx.drawImage(img, 0, 0);
        const d = octx.getImageData(0, 0, cw, ch).data;
        let minX = cw, minY = ch, maxX = 0, maxY = 0, found = false;
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            if (d[(y * cw + x) * 4 + 3] > 16) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        e.bbox = found ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: cw, maxY: ch };
        e.ready = true;
      } catch (err) {
        e.ready = false;
      }
    };
    img.onerror = () => { e.ready = false; };
    img.src = 'assets/sprites/' + key + '.png?v=1';
    return e;
  }

  /* ============ 队列 / 气泡 / 粒子 ============ */

  _drawQueue() {
    const s = this.state;
    if (!s || !s.runtime || !s.runtime.waitingQueue) return;
    const ctx = this.ctx;
    const queue = s.runtime.waitingQueue || [];
    for (let i = 0; i < queue.length; i++) {
      const spot = { x: 0.12 + (i % 3) * 0.08, y: 0.20 + Math.floor(i / 3) * 0.08 };
      const pos = this.toIso(spot.x, spot.y);
      const c = queue[i];
      const cols = (TYPE_COLORS[c.type] || TYPE_COLORS.normal).body;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cols;
      ctx.beginPath(); ctx.arc(0, -16, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath(); ctx.arc(0, -22, 6, 0, Math.PI * 2); ctx.fill();
      const ratio = Math.max(0, c.patience / (c.patienceMax || c.maxPatience || 1));
      ctx.fillStyle = ratio > 0.5 ? '#34d399' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.beginPath(); ctx.arc(0, -6, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  _drawParticles() {
    const ctx = this.ctx;
    const s = this.state;
    if (!s || !s.restaurant || !s.restaurant.tables) return;
    const t = this._t / 1000;
    // 心上浮（好评时）
    ctx.save();
    for (const tb of s.restaurant.tables) {
      if (tb.state === 'occupied' || tb.occupied) {
        const p = this.toIso(tb.x, tb.y, 0.5);
        const ph = (t * 0.6 + tb.x) % 1;
        ctx.fillStyle = `rgba(255,120,150,${0.35 * (1 - ph)})`;
        ctx.font = `${10 * this.iso.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('♥', p.x + 18 * this.iso.scale, p.y - ph * 22 * this.iso.scale);
      }
    }
    ctx.restore();
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
    this._drawEmojiBubbleAt(x, y - 0.10, emoji);
  }

  _drawEmojiBubbleAt(x, y, emoji) {
    const ctx = this.ctx;
    const pos = this.toIso(x, y, 0.18);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0.5);
    ctx.restore();
  }

  _drawDoorOverlay() {
    const ctx = this.ctx;
    const pos = this.toIso(0.5, 0.08, 0.45);
    const sc = this.iso.scale;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const w = 58 * sc, h = 20 * sc, r = 5 * sc;
    const dg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    dg.addColorStop(0, '#8b5cf6');
    dg.addColorStop(1, '#6d28d9');
    ctx.fillStyle = dg;
    this._roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    this._roundRect(-w / 2, -h / 2, w, h, r);
    ctx.stroke();
    ctx.font = `bold ${11 * sc}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('🚪 入口', 0, 0);
    ctx.restore();
  }

  _drawLights() {
    const spots = [[0.28, 0.32], [0.72, 0.32], [0.28, 0.68], [0.72, 0.68]];
    for (const [x, y] of spots) this._drawLight(x, y);
  }

  _drawLight(x, y) {
    const ctx = this.ctx;
    const sc = this.iso.scale;
    const pos = this.toIso(x, y, 1.3);
    const ground = this.toIso(x, y, 0);
    const night = this._isNight();
    // 落地光晕池
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pool = ctx.createRadialGradient(ground.x, ground.y, 0, ground.x, ground.y, 78 * sc);
    pool.addColorStop(0, night ? 'rgba(255,214,140,0.40)' : 'rgba(255,236,180,0.26)');
    pool.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 78 * sc, 40 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(pos.x, pos.y);
    // 吊线
    ctx.strokeStyle = 'rgba(80,60,40,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22 * sc); ctx.stroke();
    // 灯罩
    const sg = ctx.createLinearGradient(-10 * sc, 18 * sc, 10 * sc, 30 * sc);
    sg.addColorStop(0, COLORS.lampShade);
    sg.addColorStop(1, COLORS.lampShadeD);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-10 * sc, 20 * sc);
    ctx.quadraticCurveTo(0, 10 * sc, 10 * sc, 20 * sc);
    ctx.lineTo(12 * sc, 28 * sc);
    ctx.lineTo(-12 * sc, 28 * sc);
    ctx.closePath(); ctx.fill();
    // 灯泡光
    const glow = ctx.createRadialGradient(0, 30 * sc, 0, 0, 30 * sc, 24 * sc);
    glow.addColorStop(0, 'rgba(255,240,180,0.85)');
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(0, 30 * sc, 22 * sc, 11 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawAtmosphere() {
    const ctx = this.ctx;
    const { w, h } = this.size;
    // 暖色暗角
    const v = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, this._isNight() ? 'rgba(10,8,20,0.42)' : 'rgba(60,30,10,0.20)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  /* ============ 工具 ============ */

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _shade(hex, amount) {
    if (!hex || typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount * 255));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount * 255));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount * 255));
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }
}
