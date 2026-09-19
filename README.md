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

- `reference/`：用户提供的原机参考照片；机台外框、中央功能盘与下注窗继续沿用原机照片。

## 音效系统

单例 `AudioContext` + 五条总线（master / music / sfx / mechanical / jackpot）经压缩器汇流。

- **分级预载**：核心音（原机启动、八个水果、启动 / 移分 / 倍率揭晓 / 大奖 sting，约 1.5 MB）在首次点击时解码；14 首长音乐（约 4.3 MB）在第一局开始后**后台分批**预热（每批 3 首），永不阻塞第一局，也不阻塞下注。
- **跑灯音随速度变化**：每个灯位事件 `spin:tick` 都带当前格速，音高与音量随之改变——加速段清脆变密、巡航段形成连续紧张节奏、减速段音高下沉且间隔拉长、最后 3–5 格进入 suspense。
- **机台底噪**：`SynthEffects.motorStart / motorSet / motorStop` 用一条循环噪声 + 带通滤波提供持续马达声，中心频率与增益跟随格速，停灯瞬间淡出。
- **加速扫频**：`spin:accelerate` 触发一次锯齿 + 噪声扫频，配合灯光起步。
- **兜底合成音**：任何样本未就绪都会回落到 Web Audio 合成音，游戏不会因为素材未加载而哑掉。
- 压缩器阈值 −14 dB、比率 4:1，保留大奖 sting 的瞬态冲击，而不是把所有声音压成同一电平。

## 图案资产

默认使用**矢量重绘**（`assets/images/symbols-vector/*.svg`，100×100 viewBox，任意尺寸锐利）：

`apple` `orange` `grape`(紫李) `watermelon` `bell` `star` `seven`(蓝九) `bar` `lose`

统一规范：方形画布、深棕描边 `#2b1206`、平涂高饱和主色 + 左上高光、无外部阴影、无文字（BAR 除外）。

原始照片裁切保留在 `assets/images/symbols/*.png`（150–190 px，来自 709×1536 原机照片，含印刷文字与相邻格边缘）。
访问 `?art=photo` 可切回照片版；`css/art.css` 负责矢量模式的 `background-size: contain` 与滤镜。

## 测试

- `node tests/smoke.mjs`：24 局流程、倍率与派奖一致性、揭晓时序、事件顺序、灯效计划覆盖、pity 间隔与稀有度、监听器不泄漏。
- 浏览器验收（Playwright，51 项，含 iPhone 尺寸截图）：正式页面无 Debug 控件、20 连局无 DOM 增长、六种特殊节目、Jackpot 全盘爆闪、移动端无横向溢出、音频分级预载行为。

## 性能约定

- 灯光只在 24 个既有灯位上切换 class，不新增节点。
- 火花粒子为固定 28 个节点的复用池，只改 CSS 变量。
- 动画只用 `transform` / `opacity`；跑灯、揭晓与灯光序列共用同一条按 scale 缩放的 `EventTimeline` 时钟，不额外创建常驻计时器。
- `AudioContext.unlock()` 有上限等待，解码永远不阻塞下注与跑灯。

本地测试需使用 HTTP 静态服务器；`file://` 可能阻止 ES Modules 加载。
