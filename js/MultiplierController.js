const VALUES = [2,3,5,8,10,12,16,20,24,32,50];
export class MultiplierController {
  constructor(element, audio, scale = 1, timeline=null) { this.element = element; this.audio = audio; this.scale = scale; this.timeline=timeline; this.value = 2; this.timer = 0; }
  choose(tier = 'small') {
    const pools = { none:[2,3,5], small:[2,3,5,8,10,12], big:[12,16,20,24,32], jackpot:[32,50] };
    const pool = pools[tier] || VALUES; return pool[Math.floor(Math.random() * pool.length)];
  }
  start() {
    this.stop(); this.element.classList.add('multiplier-rolling'); let i = Math.floor(Math.random()*VALUES.length);
    this.element.textContent='?'; this.audio.multiplierRoll(true); this.timer = setInterval(() => { this.element.textContent = i%3===0?'?':VALUES[i%VALUES.length];i++; }, Math.max(18,58*this.scale));
  }
  slow(value) {
    this.stop(false); const sequence = ['?','?',2,5,10,16,24,32,50,value];
    return (async()=>{for(let i=0;i<sequence.length;i++){this.element.textContent=sequence[i];await (this.timeline?.wait((55+i*12))||new Promise(r=>setTimeout(r,(55+i*12)*this.scale)));}})();
  }
  reveal(value, label='') {
    this.value=value; this.stop(); this.element.textContent=`×${value}`; this.element.dataset.label=label;
    this.element.classList.remove('multiplier-rolling'); void this.element.offsetWidth; this.element.classList.add('multiplier-reveal');
    this.audio.multiplierReveal(); (this.timeline?.wait(1400)||new Promise(r=>setTimeout(r,Math.max(100,1400*this.scale)))).then(()=>this.element.classList.remove('multiplier-reveal'));
  }
  stop(stopAudio=true) { clearInterval(this.timer); clearTimeout(this.timer); this.timer=0; if(stopAudio) this.audio.multiplierRoll(false); }
  reset() { this.stop(); this.element.textContent='32'; this.element.dataset.label=''; this.element.classList.remove('multiplier-reveal','multiplier-rolling'); }
}
