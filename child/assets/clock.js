// 시간 흐름 엔진 — requestAnimationFrame 으로 t 를 밀어 주고, 결정할 일이 오면 멈춰요.
import { BIRTH_T, END_T } from './events.js?v=20261111p';

// 1배속 기준: 임신기 1주 = 5초, 출산 후 1개월 = 6초 → 결정 시간 빼고 약 6분 30초
export const SEC_PER_WEEK = 5;
export const SEC_PER_MONTH = 6;

export class Clock {
  // opts: getT(), setT(t), nextStop(fromT, toT) → event|null, onStop(ev), onEnd(), onState(running)
  constructor(opts){
    this.o = opts;
    this.running = false;
    this.speed = 1;
    this._raf = 0;
    this._last = null;
    this._tick = this._tick.bind(this);
  }
  play(){
    if(this.running) return;
    this.running = true;
    this._last = null;
    this._raf = requestAnimationFrame(this._tick);
    this.o.onState?.(true);
  }
  pause(){
    if(!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.o.onState?.(false);
  }
  toggle(){ this.running ? this.pause() : this.play(); }

  _tick(ts){
    if(!this.running) return;
    if(this._last !== null){
      const dt = Math.min((ts - this._last) / 1000, 0.25);   // 탭을 오래 비웠다 와도 한꺼번에 건너뛰지 않게
      const t = this.o.getT();
      const unit = t < BIRTH_T ? SEC_PER_WEEK : SEC_PER_MONTH;
      const nt = Math.min(END_T, t + dt * this.speed / unit);
      const stop = this.o.nextStop(t, nt);
      if(stop){
        this.o.setT(Math.max(t, stop.t));
        this.pause();
        this.o.onStop(stop);
        return;
      }
      this.o.setT(nt);
      if(nt >= END_T){
        this.pause();
        this.o.onEnd();
        return;
      }
    }
    this._last = ts;
    this._raf = requestAnimationFrame(this._tick);
  }
}
