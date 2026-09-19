export const AUDIO_ASSETS = Object.freeze({
  gameStart: 'game_start_bgm', credit: 'credit_transfer', multiplierRoll: 'multiplier_count_roll',
  multiplierReveal: 'jackpot_random_multiplier', jackpotHit: 'jackpot_10x_plus',
  bigFourHits: 'bonus_big_four_4_hits', bigFourMusic: 'bonus_big_four_full_bgm', doubleHit: 'bonus_double_hit',
  highLowLose: ['music_highlow_lose_lei_hai', 'music_highlow_lose_hou_lai'],
  smallWinMusic: 'music_small_win_ai_pin', normalWinMusic: 'music_win_hudie_01',
  jackpotMusic: ['music_jackpot_bones_01', 'music_jackpot_bones_02'],
  randomMusic: ['music_random_chenmo_buyu','music_random_huida_wo','music_random_qianshi_jinsheng',
    'music_random_tage_erxing','music_random_tiexue_danxin','music_random_xibie_hai_an','music_random_zhixiang_bugai'],
  fruit: { APPLE:'fruit_apple', ORANGE:'fruit_orange', BELL:'fruit_bell', WATERMELON:'fruit_watermelon',
    BAR:'fruit_bar', SEVEN:'fruit_double7', STAR:'fruit_99', GRAPE:'fruit_lemon' }
});

export const LIBRARY_SAMPLES = Object.freeze(Object.fromEntries([
  'bonus_big_four_4_hits','bonus_big_four_full_bgm','bonus_double_hit','credit_transfer','game_start_bgm',
  'jackpot_10x_plus','jackpot_random_multiplier','multiplier_count_roll','fruit_99','fruit_apple','fruit_bar',
  'fruit_bell','fruit_double7','fruit_lemon','fruit_orange','fruit_watermelon','music_highlow_lose_hou_lai',
  'music_highlow_lose_lei_hai','music_jackpot_bones_01','music_jackpot_bones_02','music_random_chenmo_buyu',
  'music_random_huida_wo','music_random_qianshi_jinsheng','music_random_tage_erxing','music_random_tiexue_danxin',
  'music_random_xibie_hai_an','music_random_zhixiang_bugai','music_small_win_ai_pin','music_win_hudie_01'
].map(key => [key, `./assets/audio/library/${key}.mp3`])));
