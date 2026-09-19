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
import { FunModeController } from './FunModeController.js';
import { MultiplierController } from './MultiplierController.js';
import { WinCelebrationController } from './WinCelebrationController.js';
import { JackpotLightingSystem } from './jackpot-lighting.js';
import { GameEventBus } from './game-events.js';

const $ = id => document.getElementById(id);
const machine = document.querySelector('.machine');
const board = $('board');
const betDeck = $('bet-deck');
const creditEl = $('credit'), winEl = $('win'), statusEl = $('status'), resultEl = $('result');
const startButton = $('start'), clearButton = $('clear'), rebetButton = $('rebet'), soundButton = $('sound');
const collectButton = $('collect'), oddButton = $('odd'), evenButton = $('even');
const betTotalEl = $('bet-total-value'), betTotalBox = $('bet-total');
const centerCaption = $('center-caption');
winEl.parentElement.classList.add('win-box');
creditEl.parentElement.classList.add('credit-box');
const debugMode = new URLSearchParams(location.search).get('debug') === '1';
const scale = debugMode && new URLSearchParams(location.search).get('test') === '1' ? .02 : 1;
// Vector symbols are the default: they stay crisp at any size on a retina phone.
// The original photo crops remain available with ?art=photo.
const artStyle = new URLSearchParams(location.search).get('art') === 'photo' ? 'photo' : 'vector';
const symbolUrl = name => `url('../assets/images/symbols${artStyle === 'photo' ? '' : '-vector'}/${name.toLowerCase()}.${artStyle === 'photo' ? 'png' : 'svg'}')`;
machine.dataset.art = artStyle;
const audio = new AudioEngine();
const bus = new GameEventBus();
audio.bind(bus);
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
  tile.style.setProperty('--symbol-url', symbolUrl(cell.symbol));
  tile.style.setProperty('--tile-index', String(cell.index));
  // The printed label comes from the payout table itself (js/config/board-payouts.js)
  // so the lamp can never advertise one multiplier and settle another.
  tile.innerHTML = `<span class="tile-art" aria-hidden="true"></span><span class="tile-print">${cell.label}</span>`;
  tile.setAttribute('aria-label', `${cell.index + 1} ${PRIZES[cell.symbol].label} ${cell.label || '未中奖'}`);
  board.append(tile);
  return { ...cell, element: tile };
});
const tiles = cells.map(cell => cell.element);
const phaseLabels = {SPIN_START:'启动加速',SPINNING:'高速运行',SLOW_DOWN:'逐格减速',SUSPENSE:'即将开奖'};
let engine;
const runner = new LightRunner(cells, tiles, audio, phase => {
  if (engine && phaseLabels[phase]) engine.state(phase, phaseLabels[phase]);
  machine.classList.toggle('spin-suspense', phase === 'SUSPENSE');
}, scale, bus);
const effects = new LightingEffects(tiles, machine, runner, audio, scale);
const special = new SpecialEventEngine(runner, effects, audio);
const funMode = new FunModeController({ enabled: true });
const multiplier = new MultiplierController($('feature-value'), audio, scale, bus);
multiplier.captionEl = centerCaption;
const lighting = new JackpotLightingSystem(effects, { bus, scale });
const celebration = new WinCelebrationController(machine, effects, lighting, audio, scale, bus);

// One card per channel: the fruit art is the button, the LED readout is the stake.
const buttons = new Map();
for (const channel of BET_CHANNELS) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'bet-card';
  card.dataset.channel = channel.key;
  card.setAttribute('aria-label', `${channel.label} 下注，当前 0 分`);
  card.innerHTML = `<span class="bet-card-art" aria-hidden="true"></span>
    <span class="bet-card-readout"><strong class="bet-led led-digits">00</strong></span>
    <span class="bet-card-label">${channel.label}</span>`;
  card.querySelector('.bet-card-art').style.setProperty('background-image', symbolUrl(channel.key));
  betDeck.append(card);
  buttons.set(channel.key, card);
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
  renderSevenSegment(betTotalEl, game.totalBet, 3);
  betTotalBox.classList.toggle('active', game.totalBet > 0);
  const canGamble = !game.busy && game.win > 0;
  collectButton.disabled = !canGamble;
  oddButton.disabled = !canGamble;
  evenButton.disabled = !canGamble;
  for (const channel of BET_CHANNELS) {
    const stake = game.currentBets[toBetType(channel.key)];
    const card = buttons.get(channel.key);
    renderSevenSegment(card.querySelector('.bet-led'), stake, 2);
    card.classList.toggle('active', stake > 0);
    card.disabled = game.busy;
    card.setAttribute('aria-label', `${PRIZES[channel.key].label} 下注，当前 ${stake} 分`);
  }
}
engine = new GameEngine({ runner, effects, special, audio, funMode, multiplier, celebration, lighting, bus, onChange: render });
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
    // Betting must never wait for the AudioContext. Decoding the sample bank can
    // take seconds on a cold phone and used to swallow the player's first tap.
    audio.unlock().catch(() => {});
    const changed = engine.placeBet(key, 1);
    if (!changed) { button.classList.add('limit'); setTimeout(() => button.classList.remove('limit'), 180); }
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => {
        if (!engine.placeBet(key, 10)) {
          button.classList.add('limit');
          setTimeout(() => button.classList.remove('limit'), 180);
          release();
        }
      }, 100);
    }, 480);
  });
  for (const event of ['pointerup','pointercancel','pointerleave']) button.addEventListener(event, release);
  button.addEventListener('click', event => {
    if (event.detail === 0 && !pointerActive) { audio.unlock().catch(() => {}); engine.placeBet(key, 1); }
  });
  button.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('blur', release);
}

startButton.addEventListener('click', () => engine.start());
clearButton.addEventListener('click', () => { engine.clear(); resultEl.textContent = ''; });
rebetButton.addEventListener('click', () => engine.rebet());
soundButton.addEventListener('click', () => {
  audio.setEnabled(!audio.enabled);
  audio.unlock().catch(() => {});
  soundButton.innerHTML = `声音 <small>${audio.enabled ? 'ON' : 'OFF'}</small>`;
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
});
soundButton.innerHTML = `声音 <small>${audio.enabled ? 'ON' : 'OFF'}</small>`;
soundButton.setAttribute('aria-pressed', String(audio.enabled));
collectButton.addEventListener('click', () => { audio.unlock().catch(() => {}); engine.collect(); });
oddButton.addEventListener('click', () => { audio.unlock().catch(() => {}); engine.oddEven('odd'); });
evenButton.addEventListener('click', () => { audio.unlock().catch(() => {}); engine.oddEven('even'); });
setupDebug(engine);
if (debugMode) window.__fruitDebug = { engine, bus, lighting, multiplier, funMode, effects };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.motor(false);
    if (audio.context?.state === 'running') audio.context.suspend();
  }
  else if (!document.hidden && audio.context?.state === 'suspended') audio.context.resume().catch(() => {});
});
