// Tracks distance, airtime and flips and folds them into a single score.
// Fed by collision-driven grounded state from Game.

import { SCORE } from '../config';

export interface ScoreState {
  score: number;
  distance: number; // furthest world X reached
  flips: number;
  airborne: boolean;
  combo: number;
  wheelieActive: boolean;
  wheelieSeconds: number;
}

export class Scoring {
  private furthestX = 0;
  private flips = 0;
  private airSeconds = 0;
  private airAngleAccum = 0;
  private pendingFlips = 0;
  private combo = 0;
  private wheelieSeconds = 0;
  private wheelieActive = false;
  airborne = false;

  reset(): void {
    this.furthestX = 0;
    this.flips = 0;
    this.airSeconds = 0;
    this.airAngleAccum = 0;
    this.pendingFlips = 0;
    this.combo = 0;
    this.wheelieSeconds = 0;
    this.wheelieActive = false;
    this.airborne = false;
  }

  /**
   * Called every fixed step. `angleDelta` is chassis rotation since last step,
   * `tilt` is the chassis angle (negative = front up).
   */
  step(bikeX: number, dtSec: number, angleDelta: number, tilt: number): void {
    if (bikeX > this.furthestX) this.furthestX = bikeX;
    if (this.airborne) {
      this.airSeconds += dtSec;
      this.airAngleAccum += Math.abs(angleDelta);
      while (this.airAngleAccum >= Math.PI * 2) {
        this.airAngleAccum -= Math.PI * 2;
        this.pendingFlips += 1;
      }
      this.wheelieActive = false;
      return;
    }
    // Wheelie-hold: front clearly up but not yet toppling = scoring zone.
    this.wheelieActive = tilt < -SCORE.WHEELIE_TILT_MIN && tilt > -SCORE.WHEELIE_TILT_MAX;
    if (this.wheelieActive) this.wheelieSeconds += dtSec;
  }

  onTakeoff(): void {
    this.airborne = true;
    this.airAngleAccum = 0;
    this.pendingFlips = 0;
  }

  /** Returns flips landed this touchdown (for HUD feedback). */
  onLanding(): number {
    this.airborne = false;
    const landed = this.pendingFlips;
    if (landed > 0) {
      this.flips += landed;
      this.combo += landed;
    } else {
      this.combo = 0;
    }
    this.pendingFlips = 0;
    this.airAngleAccum = 0;
    return landed;
  }

  get state(): ScoreState {
    const distancePts = Math.floor(this.furthestX / SCORE.DISTANCE_DIVISOR);
    const airPts = Math.floor(this.airSeconds * SCORE.AIRTIME_PER_SEC);
    const flipPts = Math.floor(this.flips * SCORE.FLIP_BONUS * (1 + this.combo * 0.1));
    const wheeliePts = Math.floor(this.wheelieSeconds * SCORE.WHEELIE_PER_SEC);
    return {
      score: distancePts + airPts + flipPts + wheeliePts,
      distance: this.furthestX,
      flips: this.flips,
      airborne: this.airborne,
      combo: this.combo,
      wheelieActive: this.wheelieActive,
      wheelieSeconds: this.wheelieSeconds,
    };
  }
}
