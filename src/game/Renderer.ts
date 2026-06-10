// Canvas2D renderer. Draws a parallax sky, the price terrain (green where the
// chart rises, red where it dumps), the ATH flag, the finish line, and the bike.

import type { Body } from 'matter-js';
import type { Terrain } from '../data/terrain';
import type { Camera } from './Camera';
import type { Bike } from './Bike';
import type { Particles } from './Particles';
import { BIKE } from '../config';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  render(terrain: Terrain, bike: Bike, camera: Camera, particles?: Particles): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky();

    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    this.drawGrid(camera);
    this.drawTerrain(terrain);
    this.drawAth(terrain);
    this.drawFinish(terrain);
    if (particles) particles.draw(ctx);
    this.drawBike(bike);

    ctx.restore();
  }

  private drawSky(): void {
    const { ctx } = this;
    // Warm newsprint, very subtly graded so it reads as paper, not a screen.
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#fbf8f0');
    g.addColorStop(1, '#f3ecda');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawGrid(camera: Camera): void {
    const { ctx } = this;
    const step = 120;
    const left = camera.x - this.w / camera.scale;
    const right = camera.x + this.w / camera.scale;
    const top = camera.y - this.h / camera.scale;
    const bottom = camera.y + this.h / camera.scale;
    ctx.lineWidth = 1 / camera.scale;
    ctx.strokeStyle = 'rgba(20,17,12,0.06)'; // faint ledger rules
    ctx.beginPath();
    for (let x = Math.floor(left / step) * step; x < right; x += step) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  }

  private drawTerrain(terrain: Terrain): void {
    const { ctx } = this;
    const { surface, baselineY } = terrain;

    // Hatched ink body under the curve.
    ctx.beginPath();
    ctx.moveTo(surface[0].x, baselineY);
    for (const p of surface) ctx.lineTo(p.x, p.y);
    ctx.lineTo(surface[surface.length - 1].x, baselineY);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, -520, 0, baselineY);
    fill.addColorStop(0, 'rgba(20,17,12,0.10)');
    fill.addColorStop(1, 'rgba(20,17,12,0.03)');
    ctx.fillStyle = fill;
    ctx.fill();

    // Ink top stroke: muted bull-green rising, bear-red falling. Crisp, no glow.
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < surface.length - 1; i++) {
      const a = surface[i];
      const b = surface[i + 1];
      const rising = b.y < a.y; // smaller y = higher price
      ctx.strokeStyle = rising ? '#1a6b4a' : '#c0392b';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  private drawAth(terrain: Terrain): void {
    const { ctx } = this;
    const y = -((terrain.athPrice - terrain.minPrice) / (terrain.maxPrice - terrain.minPrice || 1)) * 520;
    ctx.strokeStyle = 'rgba(20,17,12,0.4)';
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(terrain.athX - 4000, y);
    ctx.lineTo(terrain.trackWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#14110c';
    ctx.font = '900 17px Fraunces, Georgia, serif';
    ctx.fillText('All-Time High', terrain.athX + 6, y - 8);
  }

  private drawFinish(terrain: Terrain): void {
    const { ctx } = this;
    const x = terrain.trackWidth;
    ctx.fillStyle = '#14110c';
    ctx.font = '900 22px Fraunces, Georgia, serif';
    ctx.fillText('TODAY', x - 64, -560);
    const tile = 16;
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#14110c' : '#faf6ec';
      ctx.fillRect(x, -560 + i * tile, tile, tile);
      ctx.fillStyle = i % 2 === 0 ? '#faf6ec' : '#14110c';
      ctx.fillRect(x + tile, -560 + i * tile, tile, tile);
    }
  }

  private drawBike(bike: Bike): void {
    this.drawFrame(bike); // fork, swingarm, frame, tank, seat, bars, rider
    this.drawWheel(bike.wheelBack);
    this.drawWheel(bike.wheelFront);
  }

  // The motorbike, drawn around the three physics bodies. Fork and swingarm run
  // to the wheels' *live* local positions (so they track axle flex); the frame,
  // tank, seat, bars and rider live in chassis-local space.
  private drawFrame(bike: Bike): void {
    const { ctx } = this;
    const { chassis } = bike;

    // wheel centres expressed in chassis-local coords (x = forward, y = down)
    const toLocal = (w: Body) => {
      const dx = w.position.x - chassis.position.x;
      const dy = w.position.y - chassis.position.y;
      const c = Math.cos(-chassis.angle);
      const s = Math.sin(-chassis.angle);
      return { x: dx * c - dy * s, y: dx * s + dy * c };
    };
    const rear = toLocal(bike.wheelBack);
    const front = toLocal(bike.wheelFront);

    const seat = { x: rear.x + 10, y: -9 };
    const tank = { x: 5, y: -7 };
    const head = { x: front.x - 7, y: -11 }; // steering head
    const pegs = { x: 1, y: 9 };

    const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    ctx.save();
    ctx.translate(chassis.position.x, chassis.position.y);
    ctx.rotate(chassis.angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14110c';

    // swingarm + front fork to the real wheel hubs
    ctx.lineWidth = 5;
    line(rear, pegs);
    line(head, front);
    // frame spine + down tubes
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(tank.x, tank.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.lineWidth = 5;
    line(seat, pegs);
    line(tank, pegs);

    // tank + seat pad (solid ink blocks)
    ctx.fillStyle = '#14110c';
    roundRect(ctx, tank.x - 9, tank.y - 7, 22, 9, 4);
    ctx.fill();
    roundRect(ctx, seat.x - 13, seat.y - 5, 22, 6, 3);
    ctx.fill();

    // handlebar + headlight
    ctx.lineWidth = 4;
    line(head, { x: head.x + 4, y: head.y - 14 });
    ctx.fillStyle = '#9a7b1f';
    ctx.beginPath();
    ctx.arc(front.x - 2, front.y - 17, 3, 0, Math.PI * 2);
    ctx.fill();

    this.drawRider(seat, head, chassis.angularVelocity);
    ctx.restore();
  }

  // Rider silhouette in chassis-local space. Leans from the chassis spin: front
  // popping up (negative angular velocity) throws the torso forward over the bars.
  private drawRider(
    seat: { x: number; y: number },
    head: { x: number; y: number },
    angVel: number,
  ): void {
    const { ctx } = this;
    const lean = Math.max(-10, Math.min(14, -angVel * 26));
    const hip = { x: seat.x - 1, y: seat.y - 7 };
    const shoulder = { x: hip.x + 12 + lean * 0.6, y: hip.y - 16 + Math.abs(lean) * 0.2 };
    const hands = { x: head.x + 3, y: head.y - 12 };

    ctx.strokeStyle = '#14110c';
    ctx.lineCap = 'round';

    // leg: hip -> peg-ish
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(hip.x + 4, hip.y + 12);
    ctx.stroke();
    // torso
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(shoulder.x, shoulder.y);
    ctx.stroke();
    // arm to bars
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(hands.x, hands.y);
    ctx.stroke();
    // helmet (bear-red pop)
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(shoulder.x + 2, shoulder.y - 7, 7, 0, Math.PI * 2);
    ctx.fill();
    // visor
    ctx.fillStyle = '#faf6ec';
    ctx.fillRect(shoulder.x + 4, shoulder.y - 9, 5, 3);
  }

  private drawWheel(wheel: Body): void {
    const { ctx } = this;
    const { x, y } = wheel.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wheel.angle);
    ctx.fillStyle = '#faf6ec';
    ctx.strokeStyle = '#14110c';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, BIKE.WHEEL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // ink spokes
    ctx.strokeStyle = 'rgba(20,17,12,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * BIKE.WHEEL_R, Math.sin(a) * BIKE.WHEEL_R);
    }
    ctx.stroke();
    // hub
    ctx.fillStyle = '#14110c';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
