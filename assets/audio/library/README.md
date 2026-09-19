# Audio Asset Map

All files are normalized to English ASCII names, stereo 44.1 kHz MP3 at 160 kbps.

- `fruit-machine-music-library.zip`: loss (`music_highlow_lose_*`), normal/small win, Bones jackpot, and seven non-repeating random round tracks.
- `fruit-machine-sfx.zip`: per-symbol landing sounds (`fruit_*`). `fruit_99` maps to STAR, `fruit_double7` maps to SEVEN, and `fruit_lemon` maps to the existing GRAPE/紫李 channel.
- `jackpot_codex_named.zip`: start, credit transfer, multiplier roll/reveal, 10x+ hit, Double Cannon, and Big Four hit/full-music cues.

The executable mapping is `js/audio/AudioAssetMap.js`. Background tracks use the music bus and replace the active track; short SFX use independent groups and may overlap safely.
