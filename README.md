# 经典水果机（本地娱乐版）

纯前端静态网页，所有积分均为虚拟分数，无账户、支付或服务器。刷新页面会重新开始。

## 运行

在本目录运行任意静态文件服务器，例如 `npx serve .`，然后打开显示的本地地址。ES Module 和音频加载需要 HTTP，直接双击 `index.html` 可能受到浏览器的 `file://` 限制。

## 操作

- 选择 1 / 5 / 10 / 20 / 50 分，按 **START** 开始。**CLEAR** 清空本次显示的赢分。
- 按 **D** 或添加 `?debug=1` 打开演示面板，可强制苹果、铃铛、77、BAR 或未中奖。
- 顶部声音按钮控制音效。浏览器首次点击 START 后才会启用音频。

## 调整

- `js/game-config.js`：跑灯速度、圈数、拖尾及初始积分。
- `js/prize-table.js`：概率权重、倍率与灯盘顺序。
- `assets/audio/audio-map.json`：声音路径。现有音效为从用户提供的两套候选切片中暂选的第一套。原始 ZIP 和 MP4 均未更改。`tick` 与 `button` 暂由 Web Audio 产生短音，避免用长切片造成声音堆叠。第二阶段应逐段试听、精修切点，再确认 start、stop、win、jackpot 的最终映射。

## GitHub Pages

将此目录的内容放在 Git 仓库根目录，推送到 GitHub。在仓库 Settings → Pages 中选择 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`。所有资源使用相对路径，可部署在项目子路径。
