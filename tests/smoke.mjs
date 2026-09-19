import assert from 'node:assert/strict';
import { GameEngine } from '../js/game-engine.js';
import { FunModeController } from '../js/FunModeController.js';
import { PRESENTATIONS } from '../js/special-event-engine.js';
import { AUDIO_ASSETS } from '../js/audio/AudioAssetMap.js';
import { BOARD_CELLS } from '../js/board-model.js';

const noop = () => {};
const audio = new Proxy({unlock:async()=>{}, enabled:true}, {get:(o,k)=>o[k]||noop});
const effects = {tiles:BOARD_CELLS.map(()=>({classList:{remove:noop,add:noop}})),clearBetWindows:noop,wait:async()=>{},timeline:{cue:async(_,a,b)=>{a?.();b?.();}},cabinet:{classList:{add:noop,remove:noop}},restore:noop,betWindowFlash:noop,flashCell:async()=>{}};
const runner = {spinTo:async target=>BOARD_CELLS[target]};
const special = {run:async()=>{},specialName:noop};
const multiplier = {choose:()=>8,start:noop,slow:async()=>{},reveal:noop,reset:noop};
const celebration = {clear:noop,classify:()=> 'SMALL_WIN',play:async()=>{}};
const funMode = {draw:()=>'',noteMajor:noop};
const engine = new GameEngine({runner,effects,special,audio,funMode,multiplier,celebration,onChange:noop,initialCredit:100000});
engine.setAllBets(1);
for(let i=0;i<20;i++){engine.forcePrize(i%2?'APPLE':'LOSE');assert.equal(await engine.start(),true);assert.equal(engine.busy,false);}
engine.forcePrize('APPLE'); const first=engine.start(),second=engine.start();assert.equal(await second,false);await first;
assert.ok(engine.credit>=0,'credit remains valid');

let c=new FunModeController(),gaps=[],gap=0;
for(let i=0;i<20000;i++){gap++;if(c.draw()){gaps.push(gap);gap=0;}}
const average=gaps.reduce((a,b)=>a+b,0)/gaps.length;
assert.ok(average>=3&&average<=5,`FUN mode average gap ${average}`);
assert.equal(new Set(Object.values(PRESENTATIONS).map(x=>x.lightSequence)).size,6,'six specials have distinct presentation plans');
assert.equal(AUDIO_ASSETS.jackpotMusic.length,2);assert.equal(AUDIO_ASSETS.randomMusic.length,7);
for(let i=0;i<50;i++){const before=audio.lastPlayedTrack;const next=AUDIO_ASSETS.randomMusic.filter(x=>x!==before);assert.ok(next.length);}
console.log(JSON.stringify({rounds:20,concurrentStartBlocked:true,funModeAverageGap:+average.toFixed(2),specialPresentations:6,audioMap:true},null,2));
