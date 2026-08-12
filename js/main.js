// 梦幻西餐厅2 · 入口（PWA 层 + 引导）
import * as State from './state.js';
import * as UI from './ui.js';
import * as Save from './save.js';
import { createRenderer } from './renderer.js';
import { Game } from './game.js';

async function boot() {
  console.log('boot start');
  try {
    await State.loadConfigs();
    console.log('configs loaded');
  } catch (e) {
    console.error('配置加载失败', e);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'color:#fff;background:#7c3aed;font-size:14px;padding:24px;text-align:center;line-height:1.7;">' +
        '配置加载失败：请通过本地服务器运行（勿用 file:// 直接打开）。<br>例如：python3 -m http.server 8080' +
        '</div>'
    );
    return;
  }

  try {
    const state = State.newGameState();
    State.setState(state);
    console.log('state created');
    const renderer = createRenderer('restaurant-canvas', state);
    console.log('renderer created');

    const game = new Game(state, renderer);
    console.log('game created');
    game.onHud = () => UI.updateHUD();
    game.onDayEnd = (s) => { Save.save(s); UI.showDayReport(s); };
    game.onMonthEnd = (s, r) => { Save.save(s); UI.showMonthReport(s, r); };
    game.onEvent = (ev) => UI.showEventToast(ev);

    console.log('initUI start');
    UI.initUI({
      onToggleOpen: (op) => {
        if (op) game.start();
        else game.stop();
      },
      // 新游戏 / 读档：把新的 state 换绑到游戏循环与渲染器
      onStateChange: (s) => {
        game.setState(s);
        renderer.setState(s);
      },
    });
    console.log('initUI done');
    UI.updateHUD();
    console.log('hud updated');
  } catch (e) {
    console.error('boot inner error', e);
  }

  registerSW();
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败', e));
    });
  }
}

boot();
