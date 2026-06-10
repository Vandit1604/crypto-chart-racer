// Game orchestrator: owns the Matter engine, the loop, collisions, scoring and
// rendering. Emits HUD/ticker/end events via callbacks so the UI layer stays
// decoupled from the simulation.

import { Engine, World, Events, Composite, Body, type IEventCollision } from 'matter-js';
import {
  PHYSICS,
  WIPEOUT_TILT,
  SETTLE_AV,
  WIPEOUT_GRACE_STEPS,
  FALL_OFF_Y,
  COUNTDOWN_SECONDS,
  LAND_IMPACT_SPEED,
  BIKE,
} from '../config';
import { Particles } from './Particles';

/** Normalize an angle to [-PI, PI] so tilt magnitude is meaningful. */
function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  else if (x < -Math.PI) x += Math.PI * 2;
  return x;
}
import { buildTerrain, sampleAtX, type Terrain } from '../data/terrain';
import type { PricePoint } from '../data/api';
import { buildPhysTerrain } from './PhysTerrain';
import { Bike } from './Bike';
import { Input } from './input';
import { Camera } from './Camera';
import { Scoring, type ScoreState } from './Scoring';
import { Renderer } from './Renderer';

export type GameStatus = 'idle' | 'countdown' | 'running' | 'paused' | 'crashed' | 'finished';

export interface TickerInfo {
  price: number;
  t: number;
  pctFromStart: number;
  progress: number; // 0..1 along the track
}

export interface EndResult {
  reason: 'crashed' | 'finished';
  state: ScoreState;
}

export interface GameCallbacks {
  onHud?: (state: ScoreState, ticker: TickerInfo) => void;
  onFlip?: (flips: number) => void;
  onEnd?: (result: EndResult) => void;
  /** Countdown tick: 3,2,1 then null (go). */
  onCountdown?: (n: number | null) => void;
  onPause?: (paused: boolean) => void;
}

export class Game {
  private engine: Engine;
  private world: World;
  private renderer: Renderer;
  private input: Input;
  private camera = new Camera();
  private scoring = new Scoring();
  private particles = new Particles();

  private terrain!: Terrain;
  private physBodies: Body[] = [];
  private bike!: Bike;

  private status: GameStatus = 'idle';
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private prevAngle = 0;
  private groundContacts = 0;
  private countdownEndsAt = 0;
  private lastCountdownShown = -1;
  private dustCooldown = 0;
  private invertedSteps = 0; // consecutive settled-inverted steps (failed flip)

  constructor(
    canvas: HTMLCanvasElement,
    private cb: GameCallbacks = {},
  ) {
    this.engine = Engine.create();
    this.engine.gravity.y = PHYSICS.GRAVITY_Y;
    this.world = this.engine.world;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);

    Events.on(this.engine, 'collisionStart', (e) => this.onCollisionStart(e));
    Events.on(this.engine, 'collisionEnd', (e) => this.onCollisionEnd(e));
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => this.renderer.resize();

  loadTerrain(prices: PricePoint[]): void {
    // Clear previous terrain bodies.
    if (this.physBodies.length) Composite.remove(this.world, this.physBodies);
    this.terrain = buildTerrain(prices);
    this.physBodies = buildPhysTerrain(this.terrain);
    Composite.add(this.world, this.physBodies);
    this.spawnBike();
    this.renderOnce();
  }

  private spawnBike(): void {
    if (this.bike) Composite.remove(this.world, this.bike.composite);
    const start = this.terrain.surface[0];
    this.bike = new Bike(start.x + 40, start.y - 130);
    this.bike.addTo(this.world);
    this.prevAngle = this.bike.chassis.angle;
    this.groundContacts = 0;
    this.invertedSteps = 0;
    this.scoring.reset();
    this.camera.snapTo(this.bike.position.x, this.bike.position.y);
  }

  start(): void {
    if (this.status === 'running' || this.status === 'countdown') return;
    this.beginCountdown();
  }

  restart(): void {
    this.spawnBike();
    this.particles.reset();
    this.beginCountdown();
  }

  private beginCountdown(): void {
    this.status = 'countdown';
    this.countdownEndsAt = performance.now() + COUNTDOWN_SECONDS * 1000;
    this.lastCountdownShown = -1;
    this.lastTime = performance.now();
    this.accumulator = 0;
    if (!this.rafId) this.loop(this.lastTime);
  }

  /** Esc / tap — toggle pause while running. */
  togglePause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.cb.onPause?.(true);
    } else if (this.status === 'paused') {
      this.status = 'running';
      this.lastTime = performance.now(); // avoid a post-pause time jump
      this.accumulator = 0;
      this.cb.onPause?.(false);
    }
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const frame = Math.min(now - this.lastTime, 100);
    this.lastTime = now;
    const frameSec = frame / 1000;

    if (this.status === 'countdown') {
      this.tickCountdown(now);
      // Let the bike drop and settle on the start line during 3-2-1 (no input,
      // no scoring) so it's grounded and ready the instant the run begins.
      this.accumulator += frame;
      let steps = 0;
      while (this.accumulator >= PHYSICS.STEP_MS && steps < PHYSICS.MAX_STEPS_PER_FRAME) {
        this.settleStep();
        this.accumulator -= PHYSICS.STEP_MS;
        steps += 1;
      }
    } else if (this.status === 'running') {
      this.accumulator += frame;
      let steps = 0;
      while (this.accumulator >= PHYSICS.STEP_MS && steps < PHYSICS.MAX_STEPS_PER_FRAME) {
        this.fixedStep();
        this.accumulator -= PHYSICS.STEP_MS;
        steps += 1;
      }
    }

    this.particles.update(frameSec);
    const pos = this.bike.position;
    this.camera.follow(pos.x, pos.y);
    this.renderer.render(this.terrain, this.bike, this.camera, this.particles);
    this.emitHud();
  };

  private tickCountdown(now: number): void {
    const remainMs = this.countdownEndsAt - now;
    if (remainMs <= 0) {
      this.status = 'running';
      this.lastTime = now;
      this.accumulator = 0;
      this.cb.onCountdown?.(null);
      this.lastCountdownShown = -1;
      return;
    }
    const n = Math.ceil(remainMs / 1000);
    if (n !== this.lastCountdownShown) {
      this.lastCountdownShown = n;
      this.cb.onCountdown?.(n);
    }
  }

  /** True once the bike has dropped below the track into the void. */
  private fellOff(): boolean {
    return this.bike.position.y > FALL_OFF_Y;
  }

  // Physics step during the countdown: let the bike settle vertically onto the
  // start line, but pin its horizontal motion so a sloped start can't roll it
  // forward/backward off the platform before the run begins.
  private settleStep(): void {
    this.bike.apply({ throttle: 0, lean: 0 }, this.groundContacts === 0);
    Engine.update(this.engine, PHYSICS.STEP_MS);
    Body.setVelocity(this.bike.chassis, { x: 0, y: this.bike.chassis.velocity.y });
    for (const wheel of [this.bike.wheelBack, this.bike.wheelFront]) {
      Body.setVelocity(wheel, { x: 0, y: wheel.velocity.y });
      Body.setAngularVelocity(wheel, 0);
    }
    this.prevAngle = this.bike.chassis.angle;
    if (this.fellOff()) this.end('crashed'); // safety net — never free-fall, even pre-run
  }

  private fixedStep(): void {
    const input = this.input.read();
    const airborne = this.groundContacts === 0;
    this.bike.apply(input, airborne);

    Engine.update(this.engine, PHYSICS.STEP_MS);

    const angle = this.bike.chassis.angle;
    let delta = angle - this.prevAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    else if (delta < -Math.PI) delta += Math.PI * 2;
    this.prevAngle = angle;

    this.scoring.airborne = airborne;
    this.scoring.step(this.bike.position.x, PHYSICS.STEP_MS / 1000, delta, wrapAngle(angle));

    // Dust kicked off the rear wheel while driving on the ground.
    this.dustCooldown -= PHYSICS.STEP_MS;
    if (!airborne && this.dustCooldown <= 0 && Math.abs(this.bike.wheelBack.angularVelocity) > 0.25) {
      const w = this.bike.wheelBack;
      this.particles.dust(w.position.x, w.position.y + BIKE.WHEEL_R * 0.7, 1, 1);
      this.dustCooldown = 45;
    }

    // Wipeout: end the run only once the bike is inverted AND has stopped
    // rotating (a failed flip or a slow fall-over that settled on its head). A
    // flip in motion keeps a high angular velocity, so it's never cut off — the
    // rider always gets to complete the rotation and try to land it.
    const inverted = Math.abs(wrapAngle(angle)) > WIPEOUT_TILT;
    const settled = Math.abs(this.bike.chassis.angularVelocity) < SETTLE_AV;
    this.invertedSteps = inverted && settled ? this.invertedSteps + 1 : 0;
    if (this.invertedSteps >= WIPEOUT_GRACE_STEPS) this.end('crashed');

    // Fallen off the platform into the void (e.g. backed off the start edge):
    // no terrain to land on, so end the run on the way down.
    if (this.fellOff()) this.end('crashed');

    if (this.bike.position.x >= this.terrain.trackWidth - 30) this.end('finished');
  }

  private emitHud(): void {
    if (!this.cb.onHud) return;
    const sample = sampleAtX(this.terrain, this.bike.position.x);
    const pctFromStart = ((sample.price - this.terrain.startPrice) / this.terrain.startPrice) * 100;
    const ticker: TickerInfo = {
      price: sample.price,
      t: sample.t,
      pctFromStart,
      progress: Math.max(0, Math.min(1, this.bike.position.x / this.terrain.trackWidth)),
    };
    this.cb.onHud(this.scoring.state, ticker);
  }

  private end(reason: 'crashed' | 'finished'): void {
    if (this.status !== 'running' && this.status !== 'countdown') return;
    this.status = reason;
    this.cb.onCountdown?.(null); // clear any countdown UI if we end mid-countdown
    const p = this.bike.position;
    if (reason === 'crashed') {
      this.particles.burst(p.x, p.y, 22, 320);
    }
    this.cb.onEnd?.({ reason, state: this.scoring.state });
  }

  private onCollisionStart(e: IEventCollision<Engine>): void {
    for (const pair of e.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      const hasTerrain = labels.includes('terrain');
      if (!hasTerrain) continue;
      if (labels.includes('wheel')) {
        if (this.groundContacts === 0 && this.status === 'running') {
          const landed = this.scoring.onLanding();
          if (landed > 0) this.cb.onFlip?.(landed);
          // Hard-landing dust scaled by impact speed.
          const impact = this.bike.wheelBack.speed;
          if (impact > LAND_IMPACT_SPEED) {
            this.particles.burst(this.bike.wheelBack.position.x, this.bike.wheelBack.position.y + 12, 8, 160);
          }
        }
        this.groundContacts += 1;
      }
      // Chassis-vs-terrain contact no longer crashes on its own: a flip may graze
      // the ground mid-rotation. The settled-inverted check in fixedStep decides
      // a wipeout, so the rider can always complete the flip first.
    }
  }

  private onCollisionEnd(e: IEventCollision<Engine>): void {
    for (const pair of e.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (labels.includes('terrain') && labels.includes('wheel')) {
        this.groundContacts = Math.max(0, this.groundContacts - 1);
        if (this.groundContacts === 0 && this.status === 'running') this.scoring.onTakeoff();
      }
    }
  }

  private renderOnce(): void {
    this.camera.snapTo(this.bike.position.x, this.bike.position.y);
    this.renderer.render(this.terrain, this.bike, this.camera, this.particles);
  }

  get currentStatus(): GameStatus {
    return this.status;
  }

  /** Dev-only snapshot for the tuning probe (chassis tilt, progress, status). */
  debug() {
    return {
      status: this.status,
      tilt: wrapAngle(this.bike.chassis.angle), // 0 upright, <0 front-up, >0 nose-down
      airborne: this.groundContacts === 0,
      progress: Math.max(0, Math.min(1, this.bike.position.x / this.terrain.trackWidth)),
      score: this.scoring.state.score,
      vx: this.bike.chassis.velocity.x, // forward speed
      rearAV: this.bike.wheelBack.angularVelocity,
      frontAV: this.bike.wheelFront.angularVelocity,
    };
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    window.removeEventListener('resize', this.handleResize);
    Events.off(this.engine, 'collisionStart', undefined as never);
    Events.off(this.engine, 'collisionEnd', undefined as never);
  }
}
