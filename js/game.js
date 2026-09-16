import { BET_CHANNELS, PRIZES } from './prize-table.js';
import { BOARD_CELLS } from './board-model.js';
import { toBetType } from './bet-types.js';
import { LightRunner } from './light-runner.js';
import { LightingEffects } from './lighting-effects.js';
import { SpecialEventEngine } from './special-event-engine.js';
import { GameEngine } from './game-engine.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { setupDebug } from './debug.js';
import { renderSevenSegment } from './led-display.js';

const $ = id => document.getElementById(id);
const machine = document.querySelector('.machine');
const board = $('board'), betStrip = $('bet-strip'), betKeys = $('bet-keys');
const creditEl = $('credit'), winEl = $('win'), statusEl = $('status'), resultEl = $('result');
const startButton = $('start'), clearButton = $('clear'), rebetButton = $('rebet'), soundButton = $('sound');
const debugMode = new URLSearchParams(location.search).get('debug') === '1';
const scale = debugMode && new URLSearchParams(location.search).get('test') === '1' ? .02 : 1;
const audio = new AudioEngine();
const PRINT_LABELS = [
  '10–20','10–20','×60','×120','×30','5–6','10–20',
  '20–40','×3','','5–6','×3',
  '10–20','10–20','×3','20–40','5–6','×3','10–20',
  '20–40','×3','','5–6','×3'
];

const coordinates = [];
for (let x = 1; x <= 7; x++) coordinates.push([x, 1]);
for (let y = 2; y <= 6; y++) coordinates.push([7, y]);
for (let x = 7; x >= 1; x--) coordinates.push([x, 7]);
for (let y = 6; y >= 2; y--) coordinates.push([1, y]);
const cells = BOARD_CELLS.map(cell => {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.style.gridColumn = coordinates[cell.index][0];
  tile.style.gridRow = coordinates[cell.index][1];
  tile.style.setProperty('--symbol-url', `url('../assets/images/symbols/${cell.symbol.toLowerCase()}.png')`);
  tile.innerHTML = `<span class="tile-art" aria-hidden="true"></span><span class="tile-print">${PRINT_LABELS[cell.index]}</span>`;
  tile.setAttribute('aria-label', `${cell.index + 1} ${PRIZES[cell.symbol].label}`);
  board.append(tile);
  return { ...cell, element: tile };
});
const tiles = cells.map(cell => cell.element);
const phaseLabels = {SPIN_START:'启动加速',SPINNING:'高速运行',SLOW_DOWN:'逐格减速'};
let engine;
const runner = new LightRunner(cells, tiles, audio, phase => {
  if (engine && phaseLabels[phase]) engine.state(phase, phaseLabels[phase]);
}, scale);
const effects = new LightingEffects(tiles, machine, runner, audio, scale);
const special = new SpecialEventEngine(runner, effects, audio);

const lanes = new Map(), buttons = new Map();
for (const channel of BET_CHANNELS) {
  const lane = document.createElement('div');
  lane.className = 'bet-lane'; lane.dataset.channel = channel.key;
  lane.setAttribute('aria-label', `${channel.label} 下注显示`);
  lane.innerHTML = '<strong class="bet-led led-digits">00</strong>';
  betStrip.append(lane); lanes.set(channel.key, lane);
  const button = document.createElement('button');
  button.className = 'bet-key'; button.type = 'button'; button.dataset.channel = channel.key;
  button.setAttribute('aria-label', `${channel.label} 下注 1 分`);
  button.innerHTML = `<span class="button-cap" aria-hidden="true"></span><span class="bet-key-label">${channel.label}</span>`;
  betKeys.append(button); buttons.set(channel.key, button);
}

function render(game) {
  machine.dataset.state = game.gameState;
  const winDigits = game.win > 9999 ? 6 : 4;
  const creditDigits = game.credit > 9999 ? 6 : 4;
  winEl.classList.toggle('wide', winDigits === 6);
  creditEl.classList.toggle('wide', creditDigits === 6);
  renderSevenSegment(creditEl, game.credit, creditDigits);
  renderSevenSegment(winEl, game.win, winDigits);
  statusEl.textContent = game.status;
  startButton.disabled = game.busy || game.totalBet === 0;
  clearButton.disabled = game.busy || game.totalBet === 0;
  rebetButton.disabled = game.busy || !Object.values(game.lastBets).some(Boolean);
  for (const channel of BET_CHANNELS) {
    const stake = game.currentBets[toBetType(channel.key)];
    const lane = lanes.get(channel.key), button = buttons.get(channel.key);
    renderSevenSegment(lane.querySelector('.bet-led'), stake, 2);
    lane.classList.toggle('active', stake > 0);
    button.classList.toggle('active', stake > 0);
    button.disabled = game.busy;
  }
}
engine = new GameEngine({ runner, effects, special, audio, onChange: render });
engine.onInsufficient = () => {
  creditEl.parentElement.classList.add('credit-warning');
  setTimeout(() => creditEl.parentElement.classList.remove('credit-warning'), 700);
};
render(engine);

for (const [key, button] of buttons) {
  let holdTimer = null, repeatTimer = null, pointerActive = false;
  const release = () => {
    clearTimeout(holdTimer); clearInterval(repeatTimer);
    holdTimer = null; repeatTimer = null; pointerActive = false;
  };
  button.addEventListener('pointerdown', event => {
    if (button.disabled) return;
    if (event.pointerType !== 'mouse') event.preventDefault();
    pointerActive = true;
    audio.unlock().catch(() => {});
    const changed = engine.placeBet(key, 1);
    if (!changed) { button.classList.add('at-limit'); setTimeout(() => button.classList.remove('at-limit'), 160); }
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => {
        if (!engine.placeBet(key, 10)) {
          button.classList.add('at-limit');
          setTimeout(() => button.classList.remove('at-limit'), 160);
          release();
        }
      }, 100);
    }, 480);
  });
  for (const event of ['pointerup','pointercancel','pointerleave']) button.addEventListener(event, release);
  button.addEventListener('click', event => { if (event.detail === 0 && !pointerActive) engine.placeBet(key, 1); });
  button.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('blur', release);
}

startButton.addEventListener('click', () => engine.start());
clearButton.addEventListener('click', () => { engine.clear(); resultEl.textContent = ''; });
rebetButton.addEventListener('click', () => engine.rebet());
soundButton.addEventListener('click', async () => {
  await audio.unlock().catch(() => {});
  audio.setEnabled(!audio.enabled);
  soundButton.innerHTML = `声音 <small>${audio.enabled ? 'ON' : 'OFF'}</small>`;
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
});
soundButton.innerHTML = `声音 <small>${audio.enabled ? 'ON' : 'OFF'}</small>`;
soundButton.setAttribute('aria-pressed', String(audio.enabled));
setupDebug(engine);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio.context?.state === 'running') audio.context.suspend();
  else if (!document.hidden && audio.context?.state === 'suspended') audio.context.resume().catch(() => {});
});
