// Cheap ink-speck particle system drawn in world space (inside the camera
// transform). Used for wheel dust while driving and a burst on land/crash.
// Capped so it stays light on mobile.

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  max: number; // initial life
  size: number;
}

const MAX = 120;
const GRAVITY = 900; // px/s^2

export class Particles {
  private specks: Speck[] = [];

  private add(s: Speck): void {
    if (this.specks.length >= MAX) this.specks.shift();
    this.specks.push(s);
  }

  /** Dust kicked backward/up from a driven wheel. `dir` is +1 forward. */
  dust(x: number, y: number, dir: number, intensity = 1): void {
    const n = Math.round(2 * intensity);
    for (let i = 0; i < n; i++) {
      const life = 0.3 + Math.random() * 0.4;
      this.add({
        x,
        y,
        vx: -dir * (40 + Math.random() * 90),
        vy: -(20 + Math.random() * 80),
        life,
        max: life,
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  /** Omnidirectional burst (landing thud / crash debris). */
  burst(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const life = 0.4 + Math.random() * 0.5;
      this.add({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life,
        max: life,
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.specks.splice(i, 1);
        continue;
      }
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  reset(): void {
    this.specks.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.specks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life / s.max)) * 0.7;
      ctx.fillStyle = '#14110c';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
