export function setupDebug(engine) {
  const panel = document.getElementById('debug');
  if (new URLSearchParams(location.search).get('debug') !== '1') return;
  panel.hidden = false;
  panel.innerHTML = `<strong>DEBUG 测试模式</strong>
    <label for="forced">普通开奖目标</label>
    <select id="forced"><option value="">随机</option><option value="APPLE">苹果</option><option value="BELL">铃铛</option><option value="SEVEN">77</option><option value="BAR">BAR</option><option value="LOSE">未中奖</option></select>
    <button type="button" data-normal>普通开奖</button>
    <button type="button" data-special="SMALL_THREE">小三元</button>
    <button type="button" data-special="BIG_THREE">大三元</button>
    <button type="button" data-special="BIG_FOUR">大四喜</button>
    <button type="button" data-special="DOUBLE_CANNON">双响炮</button>
    <button type="button" data-special="TRAIN">开火车</button>
    <button type="button" data-special="GRAND_SLAM">大满贯</button>
    <button type="button" data-add-credit>+1000 CREDIT</button>
    <button type="button" data-all-bets="10">全部下注10</button>
    <button type="button" data-all-bets="99">全部下注99</button>
    <button type="button" data-clear>清空下注</button>
    <button type="button" data-reset>重置积分</button>`;
  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || engine.busy) return;
    if (button.dataset.normal !== undefined) {
      engine.forcePrize(panel.querySelector('#forced').value); engine.start();
    } else if (button.dataset.special) {
      engine.forceSpecial(button.dataset.special); engine.start();
    } else if (button.dataset.addCredit !== undefined) engine.addCredit(1000);
    else if (button.dataset.allBets) engine.setAllBets(Number(button.dataset.allBets));
    else if (button.dataset.clear !== undefined) engine.clear();
    else if (button.dataset.reset !== undefined) engine.reset();
  });
}
