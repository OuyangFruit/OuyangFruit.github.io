# OuyangFruit 经典水果机（视觉重构待审核）

纯前端、虚拟积分、无账户或支付。本地视觉版依据 `reference/original-fruit-machine.jpg` 与原机参考包制作；GitHub Pages 当前暂停发布，本分支尚未推送。

## 本地运行

在本目录启动任意静态 HTTP 服务器，例如 `npx serve .`，打开其本地地址。直接双击 `index.html` 可能受浏览器 ES Module 与 `file://` 音频加载限制。

## 操作

- 8 个红色按钮分别对应 BAR、蓝九、星星、西瓜、铃铛、紫李、橘子、苹果。每按一次，对应 LED 加 1，CREDIT 扣 1。
- 按 **START** 开始跑灯。灯停在已押的奖项时，按该路下注额与 `js/prize-table.js` 的倍率计算 WIN；没有押中的奖项不计赢分。
- **CLEAR** 退回尚未开始的下注。声音按钮切换 ON/OFF。
- 按 **D** 或添加 `?debug=1` 打开演示面板；可强制苹果、铃铛、蓝九、BAR 或未中奖。

## 视觉参考与截图

- `reference/original-fruit-machine.jpg`：用户提供的完整原机截图。
- `reference/annotated-machine-structure.jpg`：结构标注图。
- `current-version.png`：本地网页整页截图。
- `visual-comparison.png` 与 `visual-comparison.html`：原图与新版对照。
- `assets/images/machine-core.jpg`、`assets/images/eight-bet-displays.jpg`：参考包中的清晰原机局部画面，作为网页奖项盘与下注窗的视觉底图。原始包未修改。

外围为 7×7 边框的 24 格顺时针跑灯，中央功能盘目前保留原机视觉与数字显示；高级功能没有接入新玩法。LED、独立下注、跑灯、音频与中奖动画仍使用现有引擎。

## 配置

- `js/game-config.js`：积分、单次下注、跑灯阶段速度、圈数和拖尾。
- `js/prize-table.js`：外围格子顺序、8 路下注与概率倍率。`SEVEN` / `GRAPE` 保留内部键名，画面分别使用原机蓝九 / 紫李图案。
- `assets/audio/audio-map.json`：音频文件映射。当前真实音效仍是候选切片，灯步 tick 与按键短音由 Web Audio 产生；音效精修留待审核后的下一阶段。
