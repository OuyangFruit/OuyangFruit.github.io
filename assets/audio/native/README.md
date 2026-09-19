# 原机街机音效

这些 MP3 从用户提供的水果机 MP4 录像音轨中提取，统一为 44.1 kHz、单声道、160 kbps，并做高低频清理与响度/峰值标准化，供 Web Audio API 预解码复用。

| 文件 | 来源 | 游戏用途 |
| --- | --- | --- |
| `arcade-start.mp3` | 启动音效1 | START 启动 |
| `arcade-credit-start.mp3` | 移分加启动声音 | 上分/加分 |
| `arcade-orange.mp3` | 金忠 橘子音效 | 橘子中奖 |
| `arcade-lemon.mp3` | 柠檬音效 | 柠檬素材预留 |
| `arcade-double-seven.mp3` | 双七音效 | 7 / 双七中奖 |
| `arcade-big-win-chase.mp3` | 大奖1音效 两边跑马灯 | 大奖与大三元 |
| `arcade-double-cannon.mp3` | 双响炮 | 双响炮事件 |
| `arcade-random-multiplier.mp3` | 天女散花随机倍数10-20倍 | 大满贯/随机倍数事件 |
| `arcade-jackpot-3.mp3` | 大奖音效3 | 大四喜与 Jackpot 长音乐 |

`大奖音效3.mp4` 与 `大四喜连开四个带唱歌音效.mp4` 的 SHA-256 完全相同，因此只发布一份 `arcade-jackpot-3.mp3`，两个用途共享同一 AudioBuffer。
