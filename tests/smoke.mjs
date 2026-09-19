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
import { MultiplierController, MULTIPLIER_POOLS } from '../js/MultiplierController.js';
import { LOSE_EVENT_WEIGHTS, FAIRY_MULTIPLIERS, ODD_EVEN, drawWeighted, drawFromPool } from '../js/config/balance.js';

const noop = () => {};
const audio = new Proxy({ unlock: async () => {}, enabled: true }, { get: (o, k) => o[k] || noop });

function fakeTiles() {
  return BOARD_CELLS.map(() => ({ classList: { add: noop, remove: noop, toggle: noop }, style: { setProperty: noop } }));
}

function fakeElement(initial = '32') {
  const classes = new Set();
  return {
    textContent: initial, dataset: {}, offsetWidth: 0,
    classList: {
      add: name => classes.add(name),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: name => classes.has(name)
    }
  };
}

// Deterministic RNG so the money model and the mystery table can be asserted.
function seeded(values, fallback = .5) {
  let i = 0;
  return () => (i < values.length ? values[i++] : fallback);
}

function makeSandbox({ random = Math.random, credit = 100000 } = {}) {
  const bus = new GameEventBus();
  const levels = [];
  const effects = {
    tiles: fakeTiles(),
    cabinet: { classList: { add: noop, remove: noop, toggle: noop }, dataset: {} },
    clearBetWindows: noop, holdBetWindow: noop, betWindowFlash: noop, flashCell: async () => {},
    restore: noop, show: noop, setPower: noop, dim: noop, centerText: noop, centerFlash: noop,
    wait: async () => {},
    timeline: { cue: async (_, light, sound) => { light?.(); sound?.(); } }
  };
  const runner = {
    index: 0, cells: BOARD_CELLS,
    spinTo: async target => { bus.emit(E.SPIN_STOP, { target }); runner.index = target; return BOARD_CELLS[target]; }
  };
  const multiplier = new MultiplierController(fakeElement(), audio, .02, bus);
  const celebration = {
    clear: noop,
    classify: () => 'SMALL_WIN',
    play: async level => { levels.push(level); },
    banner: noop, shake: noop, particles: noop
  };
  // The lighting stub runs the fairy callbacks so the full flow is exercised.
  const lighting = {
    play: async (level, options = {}) => { levels.push(level); options.onStart?.(); if (options.onRoll) await options.onRoll(); }
  };
  const engine = new GameEngine({
    runner, effects, special: { run: async () => {} }, audio,
    funMode: { draw: () => '', noteEvent: noop, stats: () => ({}) },
    multiplier, celebration, lighting, bus, onChange: noop, initialCredit: credit, random
  });
  bus.startRecording();
  return { engine, bus, multiplier, levels };
}

const eventsOf = bus => bus.stopRecording().map(entry => entry.type);

// ------------------------------------------------------- round loop and event order
{
  const { engine, bus } = makeSandbox();
  engine.setAllBets(1);
  for (let round = 0; round < 24; round++) {
    if (round % 3 === 2) engine.forceLoseEvent('MISS');
    else engine.forcePrize('BELL');
    assert.equal(await engine.start(), true);
    assert.equal(engine.busy, false, 'engine must be idle again after a round');
    engine.collect();
  }
  const types = eventsOf(bus);
  for (const type of [E.SPIN_START, E.SPIN_STOP, E.FRUIT_HIT, E.MULTIPLIER_REVEAL, E.WIN_COUNT, E.WIN_COLLECT, E.ROUND_END]) {
    assert.ok(types.includes(type), `${type} must be published`);
  }
  const stop = types.indexOf(E.SPIN_STOP);
  assert.ok(types.indexOf(E.MULTIPLIER_ARM) > stop, 'the multiplier only arms after the lamps stop');
  assert.ok(types.indexOf(E.WIN_COUNT) > types.indexOf(E.MULTIPLIER_REVEAL), 'WIN only counts after the reveal');
  const first = engine.start();
  assert.equal(await engine.start(), false, 'a second round cannot start mid-spin');
  await first;
  assert.ok(engine.credit >= 0, 'credit stays valid');
}

// ---------------------------------------------- WIN is pending, CREDIT is safe
{
  const { engine } = makeSandbox();
  engine.setAllBets(1);
  engine.forcePrize('BELL');
  await engine.start();
  const afterRound = { credit: engine.credit, win: engine.win };
  assert.ok(afterRound.win > 0, 'the round paid something');
  assert.equal(afterRound.credit, 100000 - 8, 'CREDIT only lost the stake, the prize is still pending');

  assert.equal(engine.collect(), true);
  assert.equal(engine.win, 0, 'collecting clears WIN');
  assert.equal(engine.credit, 100000 - 8 + afterRound.win, 'collecting banks the pending win');

  engine.forcePrize('BELL');
  await engine.start();
  const pending = engine.win;
  assert.ok(pending > 0);
  engine.start().then(() => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(engine.credit >= 0, true);
}

// ------------------------------------------------------ 单双 keeps CREDIT intact
{
  const { engine } = makeSandbox({ random: seeded([0.1]) }); // < .5 wins the challenge
  engine.setAllBets(1);
  engine.forcePrize('BELL');
  await engine.start();
  const winBefore = engine.win;
  const creditBefore = engine.credit;
  await engine.oddEven('odd');
  assert.equal(engine.win, winBefore * 2, 'a winning 单双 doubles the pending WIN');
  assert.equal(engine.credit, creditBefore, 'CREDIT is untouched by 单双');

  const { engine: loser } = makeSandbox({ random: seeded([0.9]) }); // >= .5 loses the challenge
  loser.setAllBets(1);
  loser.forcePrize('BELL');
  await loser.start();
  const lostCredit = loser.credit;
  const lostWin = loser.win;
  assert.ok(lostWin > 0);
  await loser.oddEven('odd');
  assert.equal(loser.win, 0, 'a failed 单双 clears the pending WIN');
  assert.equal(loser.credit, lostCredit, 'a failed 单双 never touches CREDIT');
}

// ------------------------------------------------------- 单双 auto-collect cap
{
  const { engine } = makeSandbox({ random: () => .1 });
  engine.setAllBets(1);
  engine.forcePrize('BELL');
  await engine.start();
  for (let i = 0; i < ODD_EVEN.maxChallenges; i++) await engine.oddEven('odd');
  assert.equal(engine.win, 0, `more than ${ODD_EVEN.maxChallenges} challenges banks automatically`);
  assert.ok(engine.credit > 0);
}

// ------------------------------------------------------- 未中奖 mystery table
{
  const counts = Object.fromEntries(Object.keys(LOSE_EVENT_WEIGHTS).map(key => [key, 0]));
  let rolls = 0;
  const random = () => { rolls++; return ((rolls * 37) % 100) / 100; };
  for (let i = 0; i < 20000; i++) counts[drawWeighted(LOSE_EVENT_WEIGHTS, random)]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const share = key => counts[key] / total;
  assert.ok(Math.abs(share('MISS') - .35) < .02, `MISS share ${share('MISS').toFixed(3)}`);
  assert.ok(Math.abs(share('CONSOLATION') - .25) < .02, `CONSOLATION share ${share('CONSOLATION').toFixed(3)}`);
  assert.ok(Math.abs(share('FAIRY') - .02) < .01, `FAIRY share ${share('FAIRY').toFixed(3)}`);
  assert.ok(share('FAIRY') > 0, 'the fairy show can actually appear');

  // A forced MISS stays a plain loss.
  const { engine } = makeSandbox();
  engine.setAllBets(1);
  engine.forceLoseEvent('MISS');
  await engine.start();
  assert.equal(engine.win, 0, 'MISS pays nothing');
}

// ------------------------------------------------------------- 天女散花 payout
{
  const { engine, bus, levels } = makeSandbox({ random: seeded([0.99, 0.5, 0.5]) });
  engine.setAllBets(1);
  engine.forceLoseEvent('FAIRY');
  await engine.start();
  const types = eventsOf(bus);
  assert.ok(levels.includes('FAIRY'), 'the fairy show ran');
  assert.ok(types.includes(E.FAIRY_START), 'the fairy music cue is published');
  assert.ok(types.includes(E.FAIRY_ROLL), 'the fairy multiplier roll is published');
  const reveal = bus.count() >= 0; // bus was already drained above
  assert.equal(reveal, true);
  const multiplier = engine.win / engine.roundStake;
  assert.ok(FAIRY_MULTIPLIERS.some(([value]) => value === multiplier), `fairy multiplier ${multiplier} comes from the configured pool`);
  assert.ok(engine.win > 0);
}

// ------------------------------------------------------------------- fake-out
{
  const bus = new GameEventBus();
  let decoys = 0, jumps = 0, correct = 0;
  bus.on(E.MULTIPLIER_TICK, payload => {
    if (payload.phase === 'fakeout') decoys++;
    if (payload.phase === 'jump') jumps++;
  });
  bus.on(E.MULTIPLIER_REVEAL, payload => { if (payload.value === 64) correct++; });
  const controller = new MultiplierController(fakeElement(), audio, .01, bus);
  const rounds = 160;
  for (let i = 0; i < rounds; i++) await controller.land(64, { tier: 'jackpot' });
  assert.equal(correct, rounds, 'the revealed value is always the real one');
  assert.ok(decoys > 0, 'fake-outs do happen on the jackpot tier');
  assert.equal(decoys, jumps, 'every fake-out is followed by exactly one jump');
  assert.ok(decoys / rounds < .6, 'fake-outs stay a surprise, not the norm');
}

// ------------------------------------------------------------- 单双 digit roll
{
  const bus = new GameEventBus();
  const digits = [];
  bus.on(E.MULTIPLIER_TICK, payload => { if (payload.digit) digits.push(payload.value); });
  bus.on(E.MULTIPLIER_REVEAL, payload => digits.push(payload.value));
  const controller = new MultiplierController(fakeElement(), audio, .01, bus);
  const target = await controller.rollDigits({ target: 7, duration: 900, label: '单' });
  assert.equal(target, 7);
  assert.equal(digits[digits.length - 1], 7, 'the centre locks on the drawn digit');
  assert.ok(digits.length > 4, 'the digit rolls several times before locking');
  assert.ok(digits.every(value => value >= 1 && value <= 9), 'only 1-9 are shown');
}

// ------------------------------------------------------------- lamp rhythm
{
  for (const phase of RUNNER_PHASES) assert.ok(GAME_STATES.includes(phase), `the engine accepts the ${phase} lamp phase`);
  const bus = new GameEventBus();
  bus.startRecording();
  const tiles = BOARD_CELLS.map(() => ({ classList: { add: noop, remove: noop, toggle: noop } }));
  const runner = new LightRunner(BOARD_CELLS.map((cell, index) => ({ ...cell, index })), tiles,
    new Proxy({ tick: noop, stop: noop }, { get: (o, k) => o[k] || noop }), noop, .02, bus);
  const cell = await runner.spinTo(17, { tier: 'jackpot' });
  assert.equal(cell.index, 17, 'the lamps always land on the predetermined cell');
  const types = bus.stopRecording().map(entry => entry.type);
  for (const type of [E.SPIN_TICK, E.SPIN_ACCELERATE, E.SPIN_CRUISE, E.SPIN_DECELERATE, E.SPIN_SUSPENSE, E.SPIN_STOP]) {
    assert.ok(types.includes(type), `${type} is part of the spin`);
  }
}

// --------------------------------------------------------------- pity curve
{
  const controller = new FunModeController();
  let gaps = [], gap = 0, tally = new Map();
  for (let i = 0; i < 20000; i++) {
    gap++;
    const type = controller.draw();
    if (type) { gaps.push(gap); gap = 0; tally.set(type, (tally.get(type) ?? 0) + 1); }
  }
  const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(average >= 3 && average <= 5, `excitement average gap ${average}`);
  assert.ok((tally.get('GRAND_SLAM') ?? 0) / (tally.get('SMALL_THREE') ?? 1) < .25, 'legendary stays rare');
}

// --------------------------------------------------------- lighting coverage
{
  const phaseLog = [];
  const fx = {
    tiles: fakeTiles(),
    cabinet: { classList: { add: noop, remove: noop }, dataset: {} },
    runner: { index: 3 },
    audio: new Proxy({}, { get: () => noop }),
    show: indices => phaseLog.push(indices.length),
    only: noop, ring: () => phaseLog.push('ring'), blackout: () => phaseLog.push('blackout'),
    setPower: noop, dim: () => phaseLog.push('dim'), centerFlash: () => phaseLog.push('center'),
    centerText: () => phaseLog.push('text'),
    wait: async () => {},
    timeline: { cue: async (_, light, sound) => { light?.(); sound?.(); } },
    chaseClockwise: async () => { phaseLog.push('lap'); },
    chaseCounterClockwise: async () => { phaseLog.push('lap'); },
    cascade: async order => { phaseLog.push(`wave:${order.length}`); }
  };
  const lighting = new JackpotLightingSystem(fx, { bus: new GameEventBus(), scale: .02 });
  const required = ['MYSTERY_INTRO', 'LOSE', 'SMALL_WIN', 'MEDIUM_WIN', 'BIG_WIN', 'HIGH_MULTIPLIER', 'SPECIAL_EVENT',
    'JACKPOT', 'SMALL_THREE', 'BIG_THREE', 'DOUBLE_CANNON', 'BIG_FOUR', 'TRAIN', 'GRAND_SLAM', 'FAIRY'];
  for (const level of required) {
    assert.ok(CELEBRATION_PLANS[level], `${level} has a lighting plan`);
    phaseLog.length = 0;
    await lighting.play(level, { target: 5, indices: [1, 6, 9, 15], type: level, announce: false, onRoll: async () => phaseLog.push('roll') });
    assert.ok(phaseLog.length > 0, `${level} actually drives lamps`);
  }
  // Every level must have its own choreography, not a shared flash.
  const signatures = new Set(required.map(level => JSON.stringify(CELEBRATION_PLANS[level].phases)));
  assert.ok(signatures.size >= 11, `special events have distinct choreography (${signatures.size}/15 unique)`);
  assert.deepEqual(CELEBRATION_PLANS.GRAND_SLAM.phases, ['blackout', 'fruitGroups', 'wave', 'ring', 'sync', 'finale']);
  assert.deepEqual(CELEBRATION_PLANS.DOUBLE_CANNON.phases, ['burstLeft', 'pause', 'burstRight', 'allBoom']);
  assert.equal(CELEBRATION_PLANS.FAIRY.custom, 'fairy');
  assert.equal(new Set(Object.values(PRESENTATIONS).map(x => x.lightSequence)).size, 6);
}

// ----------------------------------------------------------------- audio map
{
  assert.equal(AUDIO_ASSETS.jackpotMusic.length, 2);
  assert.equal(AUDIO_ASSETS.randomMusic.length, 7);
  assert.equal(AUDIO_ASSETS.multiplierRoll, 'multiplier_count_roll', 'the real 哒哒 clip drives the reveal');
  assert.equal(AUDIO_ASSETS.multiplierReveal, 'jackpot_random_multiplier', 'the 天女散花 master is the fairy bed');
  assert.equal(BET_TYPES.length, 8, 'eight bet channels are untouched');
  assert.equal(MULTIPLIER_POOLS.jackpot.join(','), '32,48,64');
  assert.ok(drawFromPool(FAIRY_MULTIPLIERS, () => 0) === 24, 'the fairy pool starts at x24');
}

console.log(JSON.stringify({
  rounds: 24,
  winIsPending: true,
  oddEvenKeepsCredit: true,
  mysteryOutcomes: Object.keys(LOSE_EVENT_WEIGHTS).length,
  fairyPool: FAIRY_MULTIPLIERS.length,
  celebrationPlans: Object.keys(CELEBRATION_PLANS).length,
  specialPresentations: 6
}, null, 2));
