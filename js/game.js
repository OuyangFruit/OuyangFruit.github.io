import { GAME_CONFIG as config } from './game-config.js';
import { BOARD, BET_CHANNELS, PRIZES, drawPrize } from './prize-table.js';
import { LightEngine } from './light-engine.js';
import { AudioManager } from './audio-manager.js';
import { WinAnimationEngine } from './win-animation.js';
import { setupDebug } from './debug.js';

const $ = id => document.getElementById(id);
const machine = document.querySelector('.machine');
const board = $('board'), betStrip = $('bet-strip'), betKeys = $('bet-keys');
const creditEl = $('credit'), winEl = $('win'), statusEl = $('status'), resultEl = $('result');
const startButton = $('start'), clearButton = $('clear'), soundButton = $('sound');
const audio = new AudioManager();
let credit = config.INITIAL_CREDIT, win = 0, busy = false;
const stakes = Object.fromEntries(BET_CHANNELS.map(channel => [channel.key, 0]));
const totalStake = () => Object.values(stakes).reduce((sum, stake) => sum + stake, 0);
const displayNumber = value => String(value).padStart(2, '0');

// 24 original-machine cells: top 7, right 5, bottom 7, left 5.
const coordinates = [];
for (let x = 1; x <= 7; x++) coordinates.push([x, 1]);
for (let y = 2; y <= 6; y++) coordinates.push([7, y]);
for (let x = 7; x >= 1; x--) coordinates.push([x, 7]);
for (let y = 6; y >= 2; y--) coordinates.push([1, y]);
BOARD.forEach((key, i) => {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.style.gridColumn = coordinates[i][0];
  tile.style.gridRow = coordinates[i][1];
  tile.setAttribute('aria-label', `${i + 1} ${PRIZES[key].label}`);
  board.append(tile);
});
const tiles = [...board.children];
const light = new LightEngine(tiles, config, (_index, phase, speed) => audio.tick(phase, speed), phase => {
  const labels = { ACCELERATE: '启动加速', RUNNING: '高速运行', DECELERATE: '逐格减速', WIN_ANIMATION: '中奖灯光表演' };
  if (labels[phase]) statusEl.textContent = labels[phase];
});
const winAnimation = new WinAnimationEngine(tiles, machine, light);

BET_CHANNELS.forEach(channel => {
  const lane = document.createElement('div');
  lane.className = 'bet-lane';
  lane.dataset.channel = channel.key;
  lane.setAttribute('aria-label', `${channel.label} 下注显示`);
  lane.innerHTML = '<strong class="bet-led led-digits">00</strong>';
  betStrip.append(lane);

  const button = document.createElement('button');
  button.className = 'bet-key';
  button.type = 'button';
  button.dataset.channel = channel.key;
  button.setAttribute('aria-label', `${channel.label} 下注 ${config.BET_STEP} 分`);
  button.innerHTML = `<span class="button-cap" aria-hidden="true"></span><span class="bet-key-label">${channel.label}</span>`;
  button.addEventListener('click', () => placeBet(channel.key));
  betKeys.append(button);
});

function render() {
  creditEl.textContent = String(credit).padStart(4, '0');
  winEl.textContent = String(win).padStart(4, '0');
  startButton.disabled = busy || totalStake() === 0;
  clearButton.disabled = busy || totalStake() === 0;
  BET_CHANNELS.forEach(channel => {
    const stake = stakes[channel.key];
    const lane = betStrip.querySelector(`[data-channel="${channel.key}"]`);
    const button = betKeys.querySelector(`[data-channel="${channel.key}"]`);
    lane.querySelector('.bet-led').textContent = displayNumber(stake);
    lane.classList.toggle('active', stake > 0);
    button.classList.toggle('active', stake > 0);
    button.disabled = busy || credit < config.BET_STEP || stake >= config.MAX_BET_PER_CHANNEL;
  });
}

function placeBet(key) {
  if (busy || credit < config.BET_STEP || stakes[key] >= config.MAX_BET_PER_CHANNEL) return;
  credit -= config.BET_STEP;
  stakes[key] += config.BET_STEP;
  statusEl.textContent = `${BET_CHANNELS.find(channel => channel.key === key).label} 下注 ${stakes[key]} 分`;
  audio.tone(490, .04, .04);
  render();
}

soundButton.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  soundButton.innerHTML = `声音 <small>${audio.enabled ? 'ON' : 'OFF'}</small>`;
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
});
clearButton.addEventListener('click', () => {
  if (busy) return;
  credit += totalStake();
  BET_CHANNELS.forEach(channel => { stakes[channel.key] = 0; });
  win = 0;
  statusEl.textContent = '下注已退回';
  resultEl.textContent = '';
  tiles.forEach(tile => tile.classList.remove('final'));
  audio.tone(330, .05, .04);
  render();
});
const forcedPrize = setupDebug(() => {
  if (busy) return;
  credit = config.INITIAL_CREDIT;
  win = 0;
  BET_CHANNELS.forEach(channel => { stakes[channel.key] = 0; });
  resultEl.textContent = '';
  statusEl.textContent = '积分已重置';
  render();
});

startButton.addEventListener('click', async () => {
  if (busy || totalStake() === 0) return;
  busy = true; win = 0; render();
  tiles.forEach(tile => tile.classList.remove('final'));
  resultEl.textContent = '跑灯开始';
  const roundBets = { ...stakes };
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
    win = (roundBets[prizeKey] || 0) * prize.multiplier;
    credit += win;
    resultEl.textContent = win ? `${prize.label}中奖 +${win}` : `${prize.label}，未押中`;
    statusEl.textContent = win ? `${prize.label}中奖 · 赢得 ${win} 分` : `${prize.label} · 未中奖`;
    render();
    if (win) {
      audio.play(prize.tier === 'jackpot' ? 'jackpot' : prize.tier === 'big' ? 'big_win' : 'small_win', .3);
      await winAnimation.play(prize.tier, target);
      statusEl.textContent = `${prize.label}中奖 · 赢得 ${win} 分`;
    }
    BET_CHANNELS.forEach(channel => { stakes[channel.key] = 0; });
  } catch (error) {
    console.error(error);
    statusEl.textContent = '运行中断，请刷新页面重试';
  } finally { busy = false; render(); }
});
render();
