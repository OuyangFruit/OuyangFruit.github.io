# OuyangFruit 经典水果盘

纯前端个人怀旧游戏，仅使用虚拟 CREDIT，无充值、提现或兑换。GitHub Organization Pages 从 `main` 的仓库根目录发布到 <https://ouyangfruit.github.io/>。

## 操作

- 八路红色按钮单击加 1；长按后每周期加 10，单路最高 99。下注时不扣 CREDIT，按 START 时只扣一次。
- 开奖后保留八路下注，可直接再次 START；CLEAR 清空当前下注，REBET 恢复上一局完整下注。
- 声音按钮切换 ON/OFF，偏好保存在浏览器本地。游戏声音由 Web Audio 实时合成，不依赖 MP3 才能运行。
- `?debug=1` 显示测试面板，可指定普通结果或直接触发小三元、大三元、大四喜、双响炮、开火车、大满贯，并提供测试 CREDIT 与下注预设。`?debug=1&test=1` 仅供自动化验收使用，会缩短动画等待。
- 面板上另有强制倍率档、惊喜加码、高倍率水果与「连跑 20 局」压力测试。这些控件只存在于 `?debug=1`，正式站点不会渲染。

## 一局的时间线

跑灯（慢 → 加速 → 巡航 → 减速 → 最后几格「哒…哒…哒」）→ 停在中奖水果 → 300–600ms 静默 →
中央倍率高速跳动 → 逐渐减速停在**本局真实倍率** → 数字爆闪 + 揭晓音效 → 分档灯效 → WIN 滚分。

所有环节通过 `js/game-events.js` 的单一事件流广播，灯光与 AudioEngine 订阅同一批事件：

```
round:start → spin:start → spin:accelerate → spin:cruise → spin:decelerate
→ spin:suspense → spin:stop → fruit:hit → multiplier:arm → multiplier:start
→ multiplier:tick → multiplier:reveal → jackpot:start → jackpot:phase1
→ jackpot:phase2 → jackpot:finale → win:start → win:count → win:end → round:end
```

换音效只需要改 `js/audio/AudioEngine.js` 的 `bind()` 与 `js/audio/AudioAssetMap.js`，游戏逻辑与灯光节奏不受影响。

## 代码

- `js/game-engine.js`：状态机、虚拟积分、下注、续压、结算与滚分。
- `js/board-model.js`、`js/bet-types.js`：24 格数据与八路下注映射。原机照片中紫李的旧版 `GRAPE` 资源及倍率保留，新的下注状态将其映射到 `papaya`。
- `js/light-runner.js`、`js/lighting-effects.js`：逐格跑灯、减速、拖尾和爆灯。
- `js/special-event-engine.js`、`js/config/special-events.js`：六种特殊节目与可调整概率。
- `js/jackpot-lighting.js`：统一 Jackpot / Celebration Lighting System。每个等级（普通 / 中等 / 高倍率 / 大奖 / 六种特殊节目 / 大满贯）都是一份具名灯效计划，运行过程中广播 `jackpot:phase1/phase2/finale`。
- `js/MultiplierController.js`：倍率揭晓器。`arm → roll → 递减阶梯 → reveal`，数值取自该档真实派奖池，显示多少就赔多少。
- `js/FunModeController.js`：惊喜 / pity 系统。静默局数越多触发概率越高，大满贯需要热度且带冷却，平均约 4 局一次惊喜事件。
- `js/game-events.js`：事件总线（`GameEventBus`）。
- `js/audio/`：单个 AudioContext、程序化音效、压缩器与 AudioBuffer 样本层。`assets/audio/native/` 内的原机录像音轨用于启动、水果奖、大奖和特殊事件；样本未就绪时自动回退到合成音，不会阻塞游戏。

## 测试

- `node tests/smoke.mjs`：24 局流程、倍率与派奖一致性、揭晓时序、事件顺序、灯效计划覆盖、pity 间隔与稀有度、监听器不泄漏。
- 浏览器验收（Playwright，含 iPhone 尺寸截图）：正式页面无 Debug 控件、20 连局无 DOM 增长、六种特殊节目、Jackpot 全盘爆闪、移动端无横向溢出。

## 性能约定

- 灯光只在 24 个既有灯位上切换 class，不新增节点。
- 火花粒子为固定 28 个节点的复用池，只改 CSS 变量。
- 动画只用 `transform` / `opacity`；跑灯、揭晓与灯光序列共用同一条按 scale 缩放的 `EventTimeline` 时钟，不额外创建常驻计时器。
- `AudioContext.unlock()` 有上限等待，解码永远不阻塞下注与跑灯。
- `reference/`、`assets/images/`：用户提供的原机参考及裁取素材，机台画面继续沿用。

本地测试需使用 HTTP 静态服务器；`file://` 可能阻止 ES Modules 加载。
