// Smooth follow camera. Holds the world point shown at screen center + scale.

import { CAMERA } from '../config';

export class Camera {
  x = 0;
  y = 0;
  scale = CAMERA.SCALE;

  snapTo(x: number, y: number): void {
    this.x = x + CAMERA.LOOKAHEAD;
    this.y = y;
  }

  follow(targetX: number, targetY: number): void {
    const desiredX = targetX + CAMERA.LOOKAHEAD;
    this.x += (desiredX - this.x) * CAMERA.LERP;
    this.y += (targetY - this.y) * CAMERA.LERP;
  }
}
