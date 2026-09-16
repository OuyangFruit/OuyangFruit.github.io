import { GAME_CONFIG as config } from './game-config.js';
import { BOARD, SYMBOLS, PRIZES, drawPrize } from './prize-table.js';
import { LightEngine } from './light-engine.js';
import { AudioManager } from './audio-manager.js';
import { WinAnimationEngine } from './win-animation.js';
import { setupDebug } from './debug.js';

const $ = id => document.getElementById(id);
const cabinet = document.querySelector('.cabinet');
const board = $('board');
const creditEl = $('credit'), winEl = $('win'), betEl = $('bet-display');
const statusEl = $('status'), resultEl = $('result');
const startButton = $('start'), clearButton = $('clear'), soundButton = $('sound');
let credit = config.INITIAL_CREDIT, bet = config.DEFAULT_BET, win = 0, busy = false;
const audio = new AudioManager();

const coordinates = [];
for (let x = 1; x <= 8; x++) coordinates.push([x, 1]);
for (let y = 2; y <= 6; y++) coordinates.push([8, y]);
for (let x = 7; x >= 1; x--) coordinates.push([x, 6]);
for (let y = 5; y >= 2; y--) coordinates.push([1, y]);

BOARD.forEach((key, i) => {
  const [symbol, name] = SYMBOLS[key];
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.style.gridColumn = coordinates[i][0];
  tile.style.gridRow = coordinates[i][1];
  tile.innerHTML = `<span class="symbol ${['SEVEN','BAR'].includes(key) ? 'word' : ''}">${symbol}</span><span class="name">${name}</span>`;
  tile.setAttribute('aria-label', `${i + 1} ${name}`);
  board.append(tile);
});
const tiles = [...board.children];
const light = new LightEngine(tiles, config, (_index, phase, speed) => audio.tick(phase, speed), phase => {
  const labels = { ACCELERATE: '启动加速', RUNNING: '高速运行', DECELERATE: '逐格减速', WIN_ANIMATION: '中奖灯光表演' };
  if (labels[phase]) statusEl.textContent = labels[phase];
});
const winAnimation = new WinAnimationEngine(tiles, cabinet, light);

function render() {
  creditEl.textContent = credit;
  winEl.textContent = win;
  betEl.textContent = bet;
  startButton.disabled = busy || credit < bet;
  clearButton.disabled = busy;
  document.querySelectorAll('.bet-button').forEach(button => {
    button.classList.toggle('selected', Number(button.dataset.bet) === bet);
    button.disabled = busy;
  });
}

config.BET_OPTIONS.forEach(value => {
  const button = document.createElement('button');
  button.className = 'bet-button'; button.type = 'button'; button.dataset.bet = value; button.textContent = value;
  button.addEventListener('click', () => { if (busy) return; bet = value; audio.tone(450, .035, .035); render(); });
  $('bet-buttons').append(button);
});

soundButton.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  soundButton.textContent = audio.enabled ? '♪ 声音 开' : '♪ 声音 关';
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
});
clearButton.addEventListener('click', () => {
  if (busy) return;
  win = 0; resultEl.textContent = 'PRESS START'; statusEl.textContent = '赢分已清空';
  tiles.forEach(tile => tile.classList.remove('final'));
  audio.tone(330, .05, .04); render();
});
const forcedPrize = setupDebug(() => {
  if (busy) return;
  credit = config.INITIAL_CREDIT; win = 0; resultEl.textContent = 'PRESS START';
  statusEl.textContent = '积分已重置'; render();
});

startButton.addEventListener('click', async () => {
  if (busy || credit < bet) return;
  busy = true; win = 0; credit -= bet; render();
  tiles.forEach(tile => tile.classList.remove('final'));
  resultEl.textContent = 'GOOD LUCK!';
  try {
    await audio.unlock();
    audio.play('start', .14);
    const prizeKey = drawPrize(forcedPrize());
    const options = BOARD.map((key, i) => key === prizeKey ? i : -1).filter(i => i >= 0);
    const target = options[Math.floor(Math.random() * options.length)];
    await light.spin(target);
    audio.play('stop', .22);
    await new Promise(resolve => setTimeout(resolve, config.WIN_DELAY));
    const prize = PRIZES[prizeKey];
    win = bet * prize.multiplier;
    credit += win;
    resultEl.textContent = prize.multiplier ? `${prize.label} ×${prize.multiplier}  +${win}` : '再接再厉';
    statusEl.textContent = prize.multiplier ? `${prize.label}中奖 · 赢得 ${win} 分` : '未中奖 · 再试一次';
    render();
    if (prize.multiplier) {
      audio.play(prize.tier === 'jackpot' ? 'jackpot' : prize.tier === 'big' ? 'big_win' : 'small_win', .3);
      await winAnimation.play(prize.tier, target);
      statusEl.textContent = `${prize.label}中奖 · 赢得 ${win} 分`;
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = '运行中断，请刷新页面重试';
  } finally { busy = false; render(); }
});
render();
