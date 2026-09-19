export const ROUND_STATES = Object.freeze([
  'IDLE','START_INTRO','SPIN_ACCEL','SPIN_FAST','SPIN_DECEL','LANDING','RESULT_HOLD',
  'SPECIAL_INTRO','SPECIAL_SHOW','MULTIPLIER_REVEAL','PAYOUT','CELEBRATION','OUTRO','READY'
]);

export const BEAT_CUES = Object.freeze({INTRO:0,BUILD:.15,HIT_1:.35,HIT_2:.50,CLIMAX:.70,MULTIPLIER:.82,PAYOUT:.90,OUTRO:.96});

// Every round-owned delay and cue passes through this clock. Starting a new round
// invalidates the previous token, so stale lamps, sounds and payouts cannot leak.
export class RoundDirector {
  constructor({scale=1,onState=()=>{}}={}) { this.scale=scale; this.onState=onState; this.token=0; this.state='IDLE'; this.startedAt=0; }
  begin(){this.token++;this.startedAt=performance.now();this.transition('START_INTRO');return this.token;}
  transition(state,detail=''){if(!ROUND_STATES.includes(state))throw new Error(`Unknown round state ${state}`);this.state=state;this.onState(state,detail);}
  active(token){return token===this.token;}
  wait(ms,token=this.token){return new Promise(resolve=>setTimeout(()=>resolve(this.active(token)),Math.max(1,ms*this.scale)));}
  async cue(ms,options={},soundArg=null,token=this.token){const legacy=typeof options==='function';const {state,visual,sound}=legacy?{visual:options,sound:soundArg}:options;if(!(await this.wait(ms,token)))return false;if(state)this.transition(state);visual?.();sound?.();return true;}
  cues(duration){return Object.fromEntries(Object.entries(BEAT_CUES).map(([name,ratio])=>[name,duration*ratio]));}
  cancel(){this.token++;this.transition('READY');}
  elapsed(){return performance.now()-this.startedAt;}
}
