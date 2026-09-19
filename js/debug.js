// Development-only panel. It is rendered exclusively when the URL carries
// ?debug=1, so the production cabinet never shows a FORCE EVENT control.
const SPECIAL_BUTTONS = [
  ['SMALL_THREE', '小三元'], ['BIG_THREE', '大三元'], ['BIG_FOUR', '大四喜'],
  ['DOUBLE_CANNON', '双响炮'], ['TRAIN', '开火车'], ['GRAND_SLAM', '大满贯']
];

export function setupDebug(engine) {
  const panel = document.getElementById('debug');
  if (new URLSearchParams(location.search).get('debug') !== '1') return;
  panel.hidden = false;
  panel.innerHTML = `<strong>DEBUG 测试模式</strong>
    <label for="forced">普通开奖目标</label>
    <select id="forced"><option value="">随机</option><option value="APPLE">苹果</option><option value="BELL">铃铛</option><option value="SEVEN">蓝九</option><option value="BAR">BAR</option><option value="LOSE">未中奖</option></select>
    <button type="button" data-normal>普通开奖</button>
    <label for="forced-mult">强制倍率档</label>
    <select id="forced-mult"><option value="">跟随水果</option><option value="small">小倍率</option><option value="big">大倍率</option><option value="jackpot">Jackpot</option><option value="high">高倍率</option></select>
    <button type="button" data-target-mult>用指定倍率开一局</button>
    ${SPECIAL_BUTTONS.map(([type, label]) => `<button type="button" data-special="${type}">${label}</button>`).join('')}
    <button type="button" data-surprise>惊喜加码</button>
    <button type="button" data-highmult>高倍率水果</button>
    <button type="button" data-stress>连跑 20 局</button>
    <button type="button" data-add-credit>+1000 CREDIT</button>
    <button type="button" data-all-bets="10">全部下注10</button>
    <button type="button" data-all-bets="99">全部下注99</button>
    <button type="button" data-clear>清空下注</button>
    <button type="button" data-reset>重置积分</button>
    <output data-stats></output>`;
  const stats = panel.querySelector('[data-stats]');
  const tierSelect = panel.querySelector('#forced-mult');

  const report = (text) => { stats.textContent = text; };

  async function stress(rounds = 20) {
    engine.clearForced();
    engine.setAllBets(5);
    for (let round = 0; round < rounds; round++) {
      if (engine.credit < engine.totalBet) engine.addCredit(2000);
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    report(`完成 ${rounds} 局 · ${JSON.stringify(engine.stats())}`);
  }

  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || engine.busy) return;
    if (button.dataset.normal !== undefined) {
      engine.forceMultiplierTier(tierSelect.value);
      engine.forcePrize(panel.querySelector('#forced').value);
      engine.start();
    } else if (button.dataset.targetMult !== undefined) {
      engine.forceMultiplierTier(tierSelect.value || 'jackpot');
      engine.forcePrize('BELL');
      engine.start();
    } else if (button.dataset.special) {
      engine.forceSpecial(button.dataset.special);
      engine.start();
    } else if (button.dataset.surprise !== undefined) {
      engine.forceSurprise();
      engine.start();
    } else if (button.dataset.highmult !== undefined) {
      engine.forceMultiplierTier(tierSelect.value || 'high');
      engine.forcePrize('');
      engine.forcedSurprise = false;
      engine.forcedPrize = 'STAR';
      engine.start();
    } else if (button.dataset.stress !== undefined) {
      stress();
    } else if (button.dataset.addCredit !== undefined) engine.addCredit(1000);
    else if (button.dataset.allBets) engine.setAllBets(Number(button.dataset.allBets));
    else if (button.dataset.clear !== undefined) engine.clear();
    else if (button.dataset.reset !== undefined) engine.reset();
  });

  setInterval(() => {
    if (!engine.busy) report(JSON.stringify(engine.stats()));
  }, 700);
}
