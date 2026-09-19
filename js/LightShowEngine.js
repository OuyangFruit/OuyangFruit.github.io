export class LightShowEngine {
  constructor(effects) { this.fx=effects; }
  chase(rounds=1,speed=40){ return this.fx.chaseClockwise(rounds,speed); }
  reverseChase(rounds=1){ return this.fx.chaseCounterClockwise(rounds); }
  allFlash(times=3){ return this.fx.allFlash(times); }
  async alternate(times=4){ const even=this.fx.tiles.map((_,i)=>i).filter(i=>i%2===0), odd=this.fx.tiles.map((_,i)=>i).filter(i=>i%2); for(let i=0;i<times;i++){this.fx.show(i%2?odd:even);this.fx.audio.hit(1);await this.fx.wait(105);} }
  async centerBurst(target){ const n=this.fx.tiles.length; for(let d=0;d<=12;d++){this.fx.show([target,(target+d)%n,(target-d+n)%n]);this.fx.audio.chime(d);await this.fx.wait(50);} }
  async jackpotStorm(target){ await this.chase(1,30);await this.reverseChase(1);await this.allFlash(2);await this.centerBurst(target);await this.alternate(5);await this.allFlash(3); }
}
