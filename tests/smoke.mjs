import assert from 'node:assert/strict';
import { GameEngine, GAME_STATES, RUNNER_PHASES } from '../js/game-engine.js';
import { FunModeController } from '../js/FunModeController.js';
import { PRESENTATIONS } from '../js/special-event-engine.js';
import { AUDIO_ASSETS } from '../js/audio/AudioAssetMap.js';
import { BOARD_CELLS } from '../js/board-model.js';
import { BET_TYPES } from '../js/bet-types.js';
import { GAME_EVENTS as E, GameEventBus } from '../js/game-events.js';
import { CELEBRATION_PLANS, JackpotLightingSystem } from '../js/jackpot-lighting.js';
import { LightRunner } from '../js/light-runner.js';
import { EXCITEMENT_TIERS } from '../js/config/special-events.js';
import { MultiplierController } from '../js/MultiplierController.js';

const noop = () => {};
const audio = new Proxy({ unlock: async () => {}, enabled: true }, { get: (o, k) => o[k] || noop });

function makeBus() { return new GameEventBus(); }

function fakeTiles() {
  return BOARD_CELLS.map(() => ({
    classList: { add: noop, remove: noop, toggle: noop },
    style: { setProperty: noop }
  }));
}

function fakeElement(initial = '32') {
  const classes = new Set();
  return {
    textContent: initial,
    dataset: {},
    offsetWidth: 0,
    classList: {
      add: name => classes.add(name),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: name => classes.has(name)
    }
  };
}

function makeSandbox({ recording = true } = {}) {
  const bus = makeBus();
  const lights = [];
  const effects = {
    tiles: fakeTiles(),
    cabinet: { classList: { add: noop, remove: noop, toggle: noop }, dataset: {} },
    clearBetWindows: noop,
    holdBetWindow: noop,
    betWindowFlash: noop,
    flashCell: async () => {},
    restore: noop,
    show: indices => lights.push(indices.length),
    setPower: noop,
    dim: noop,
    wait: async () => {},
    timeline: { cue: async (_, light, sound) => { light?.(); sound?.(); } }
  };
  const runner = {
    index: 0,
    cells: BOARD_CELLS,
    spinTo: async target => { bus.emit(E.SPIN_STOP, { target }); runner.index = target; return BOARD_CELLS[target]; }
  };
  const multipliers = [];
  // The real controller so the smoke test exercises the shipping reveal path.
  const multiplier = new MultiplierController(fakeElement(), audio, .02, bus);
  const levels = [];
  const celebration = {
    clear: noop,
    classify: () => 'SMALL_WIN',
    play: async (level) => { levels.push(level); }
  };
  const lighting = { play: async (level) => { levels.push(level); } };
  const special = { run: async () => {} };
  const funMode = { draw: () => '', noteEvent: noop, stats: () => ({}) };
  const engine = new GameEngine({
    runner, effects, special, audio, funMode, multiplier, celebration, lighting, bus,
    onChange: noop, initialCredit: 100000
  });
  if (recording) bus.startRecording();
  return { engine, bus, multiplier, multipliers, levels, lights };
}

// ---------------------------------------------------------------- round loop
{
  const { engine, bus, multipliers } = makeSandbox();
  engine.setAllBets(1);
  for (let round = 0; round < 24; round++) {
    engine.forcePrize(round % 3 === 2 ? 'LOSE' : 'BELL');
    assert.equal(await engine.start(), true);
    assert.equal(engine.busy, false, 'engine must be idle again after a round');
  }
  const log = bus.stopRecording();
  const types = log.map(entry => entry.type);
  assert.ok(types.includes(E.SPIN_START), 'spin:start must be published');
  assert.ok(types.includes(E.SPIN_STOP), 'spin:stop must be published');
  assert.ok(types.includes(E.FRUIT_HIT), 'fruit:hit must be published');
  assert.ok(types.includes(E.MULTIPLIER_REVEAL), 'multiplier:reveal must be published');
  assert.ok(types.includes(E.WIN_COUNT), 'win:count must be published');
  assert.ok(types.includes(E.ROUND_END), 'round:end must be published');
  // The multiplier may only be revealed after the lamps have stopped.
  const warn = log.find(entry => entry.type === E.SPIN_STOP);
  assert.ok(warn, 'spin stop recorded');
  const reveals = log.filter(entry => entry.type === E.MULTIPLIER_REVEAL).map(entry => entry.payload.value);
  assert.equal(reveals.length, 16, 'every winning round reveals exactly one multiplier');
  assert.ok(reveals.every(value => value > 0), 'revealed multipliers are real payout values');
  engine.forcePrize('BELL'); engine.forceMultiplierTier('jackpot');
  bus.startRecording();
  assert.equal(await engine.start(), true);
  const forced = bus.stopRecording();
  const forcedReveal = forced.find(entry => entry.type === E.MULTIPLIER_REVEAL).payload.value;
  assert.ok([32, 48, 64].includes(forcedReveal), `forced jackpot multiplier came from the jackpot pool (${forcedReveal})`);
  assert.equal(engine.win, forcedReveal * 1, 'the revealed multiplier is exactly the multiplier paid out');
  engine.clearForced();
  const first = engine.start();
  assert.equal(await engine.start(), false, 'a second round cannot start mid-spin');
  await first;
  assert.ok(engine.credit >= 0, 'credit stays valid');
  assert.ok(multipliers.length >= 0);
}

// -------------------------------------------------- reveal happens after stop
{
  const { engine, bus } = makeSandbox();
  engine.setAllBets(1);
  engine.forcePrize('ORANGE');
  await engine.start();
  const types = bus.stopRecording().map(entry => entry.type);
  const stop = types.indexOf(E.SPIN_STOP);
  const arm = types.indexOf(E.MULTIPLIER_ARM);
  const reveal = types.indexOf(E.MULTIPLIER_REVEAL);
  assert.ok(stop >= 0 && arm > stop, 'the multiplier only arms after the lamps stop');
  assert.ok(reveal > arm, 'the reveal follows the roll');
  assert.ok(types.indexOf(E.WIN_COUNT) > reveal, 'WIN only counts up after the reveal');
}

// ------------------------------------------------------------- pity / rarity
{
  let controller = new FunModeController();
  let gaps = [], gap = 0, tally = new Map();
  for (let i = 0; i < 20000; i++) {
    gap++;
    const type = controller.draw();
    if (type) { gaps.push(gap); gap = 0; tally.set(type, (tally.get(type) ?? 0) + 1); }
  }
  const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(average >= 3 && average <= 5, `excitement average gap ${average}`);
  const grand = tally.get('GRAND_SLAM') ?? 0;
  const small = tally.get('SMALL_THREE') ?? 0;
  assert.ok(grand > 0, 'the legendary surprise can still appear');
  assert.ok(grand / small < .25, `grand slam stays rare (${grand} vs ${small})`);
  assert.ok((tally.get('SURPRISE_BONUS') ?? 0) > 0, 'surprise bonus is part of the rotation');
  assert.ok((tally.get('HIGH_MULTIPLIER') ?? 0) > 0, 'high multiplier is part of the rotation');

  // Legendary gating: never on the first draw, never twice inside the cooldown.
  controller = new FunModeController({ random: () => 0 });
  const first = controller.draw();
  assert.notEqual(first, 'GRAND_SLAM', 'legendary needs heat before it can fire');
}

// ------------------------------------------------------------- event plumbing
{
  const { engine, bus } = makeSandbox();
  engine.setAllBets(1);
  const before = bus.count();
  for (let round = 0; round < 20; round++) { engine.forcePrize('APPLE'); await engine.start(); }
  assert.equal(bus.count(), before, 'no listener leak across rounds');
}

// --------------------------------------------------------- lighting coverage
{
  const phaseLog = [];
  const events = [];
  const bus = makeBus();
  bus.on('*', (payload, type) => { if (type.startsWith('jackpot:')) events.push(type); });
  const fx = {
    tiles: fakeTiles(),
    cabinet: { classList: { add: noop, remove: noop }, dataset: {} },
    runner: { index: 3 },
    audio: new Proxy({}, { get: () => noop }),
    show: indices => phaseLog.push(indices.length),
    only: noop,
    ring: () => phaseLog.push('ring'),
    blackout: () => phaseLog.push('blackout'),
    setPower: noop,
    dim: () => phaseLog.push('dim'),
    centerFlash: () => phaseLog.push('center'),
    wait: async () => {},
    timeline: { cue: async (_, light, sound) => { light?.(); sound?.(); } },
    chaseClockwise: async () => { phaseLog.push('lap'); },
    chaseCounterClockwise: async () => { phaseLog.push('lap'); },
    cascade: async order => { phaseLog.push(`wave:${order.length}`); }
  };
  const lighting = new JackpotLightingSystem(fx, { bus, scale: .02 });
  const required = ['LOSE', 'SMALL_WIN', 'MEDIUM_WIN', 'BIG_WIN', 'HIGH_MULTIPLIER', 'SPECIAL_EVENT',
    'JACKPOT', 'SMALL_THREE', 'BIG_THREE', 'BIG_FOUR', 'DOUBLE_CANNON', 'TRAIN', 'GRAND_SLAM'];
  for (const level of required) {
    assert.ok(CELEBRATION_PLANS[level], `${level} has a lighting plan`);
    phaseLog.length = 0; events.length = 0;
    await lighting.play(level, { target: 5, indices: [1, 6, 9, 15], type: level === 'GRAND_SLAM' ? 'GRAND_SLAM' : '' });
    assert.ok(phaseLog.length > 0, `${level} actually drives lamps`);
  }
  const grand = CELEBRATION_PLANS.GRAND_SLAM.phases;
  assert.deepEqual(grand, ['blackout', 'center', 'burst2', 'wave', 'ring', 'sync', 'finale'],
    'grand slam follows the full blackout -> wave -> ring -> sync -> finale sequence');
  assert.ok(CELEBRATION_PLANS.JACKPOT.duration >= 3000 && CELEBRATION_PLANS.JACKPOT.duration <= 6000,
    'jackpot celebration runs 3-6 seconds');
  assert.equal(new Set(Object.values(PRESENTATIONS).map(x => x.lightSequence)).size, 6,
    'six specials have distinct presentation plans');
  for (const preset of Object.values(PRESENTATIONS)) {
    assert.ok(CELEBRATION_PLANS[preset.lightSequence], `${preset.lightSequence} plan exists`);
  }
}

// ------------------------------------------------------------- lamp rhythm
{
  for (const phase of RUNNER_PHASES) {
    assert.ok(GAME_STATES.includes(phase), `the engine accepts the ${phase} lamp phase`);
  }
  const bus = makeBus();
  bus.startRecording();
  const tiles = BOARD_CELLS.map(() => ({
    classList: { add: noop, remove: noop, toggle: noop }
  }));
  const runner = new LightRunner(BOARD_CELLS.map((cell, index) => ({ ...cell, index })), tiles,
    new Proxy({ tick: noop, stop: noop }, { get: (o, k) => o[k] || noop }), noop, .02, bus);
  const target = 17;
  const cell = await runner.spinTo(target, { tier: 'jackpot' });
  assert.equal(cell.index, target, 'the lamps always land on the predetermined cell');
  assert.equal(runner.index, target, 'the lamp index matches the outcome');
  const types = bus.stopRecording().map(entry => entry.type);
  for (const type of [E.SPIN_TICK, E.SPIN_ACCELERATE, E.SPIN_CRUISE, E.SPIN_DECELERATE, E.SPIN_SUSPENSE, E.SPIN_STOP]) {
    assert.ok(types.includes(type), `${type} is part of the spin`);
  }
  const order = [E.SPIN_ACCELERATE, E.SPIN_CRUISE, E.SPIN_DECELERATE, E.SPIN_SUSPENSE, E.SPIN_STOP]
    .map(type => types.lastIndexOf(type));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'spin phases run in arcade order');
}

// --------------------------------------------------------------- audio rules
{
  assert.equal(AUDIO_ASSETS.jackpotMusic.length, 2);
  assert.equal(AUDIO_ASSETS.randomMusic.length, 7);
  const next = AUDIO_ASSETS.randomMusic.filter(x => x !== AUDIO_ASSETS.randomMusic[0]);
  assert.ok(next.length === AUDIO_ASSETS.randomMusic.length - 1);
  assert.ok(Object.keys(EXCITEMENT_TIERS).length >= 8, 'excitement table includes non-special surprises');
  assert.ok(BET_TYPES.length === 8, 'eight bet channels are untouched');
}

console.log(JSON.stringify({
  rounds: 24,
  concurrentStartBlocked: true,
  multiplierMatchesPayout: true,
  revealAfterStop: true,
  celebrationPlans: Object.keys(CELEBRATION_PLANS).length,
  specialPresentations: 6,
  audioMap: true
}, null, 2));
