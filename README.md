# OuyangFruit 经典水果盘

纯前端个人怀旧游戏，仅使用虚拟 CREDIT，无充值、提现或兑换。GitHub Organization Pages 从 `main` 的仓库根目录发布到 <https://ouyangfruit.github.io/>。

## 操作

- 八路红色按钮单击加 1；长按后每周期加 10，单路最高 99。下注时不扣 CREDIT，按 START 时只扣一次。
- 开奖后保留八路下注，可直接再次 START；CLEAR 清空当前下注，REBET 恢复上一局完整下注。
- 声音按钮切换 ON/OFF，偏好保存在浏览器本地。游戏声音由 Web Audio 实时合成，不依赖 MP3 才能运行。
- `?debug=1` 显示测试面板，可指定普通结果或直接触发小三元、大三元、大四喜、双响炮、开火车、大满贯，并提供测试 CREDIT 与下注预设。`?debug=1&test=1` 仅供自动化验收使用，会缩短动画等待。

## 代码

- `js/game-engine.js`：状态机、虚拟积分、下注、续压、结算与滚分。
- `js/board-model.js`、`js/bet-types.js`：24 格数据与八路下注映射。原机照片中紫李的旧版 `GRAPE` 资源及倍率保留，新的下注状态将其映射到 `papaya`。
- `js/light-runner.js`、`js/lighting-effects.js`：逐格跑灯、减速、拖尾和爆灯。
- `js/special-event-engine.js`、`js/config/special-events.js`：六种特殊节目与可调整概率。
- `js/audio/`：单个 AudioContext、程序化音效、压缩器与可选样本层。旧 MP3 素材保留，但当前玩法不依赖它们。
- `reference/`、`assets/images/`：用户提供的原机参考及裁取素材，机台画面继续沿用。

本地测试需使用 HTTP 静态服务器；`file://` 可能阻止 ES Modules 加载。
