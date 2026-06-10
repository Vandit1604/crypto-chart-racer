// Keyboard + touch input -> { throttle, lean }.
//   Right / D  -> throttle forward (also front-flip lean in air)
//   Left  / A  -> brake / reverse  (also back-flip lean in air)
// Touch: right half of screen = throttle, left half = brake.

import type { BikeInput } from './Bike';

export class Input {
  private right = false;
  private left = false;
  private touchRight = false;
  private touchLeft = false;
  private disposers: Array<() => void> = [];

  constructor(target: HTMLElement) {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowRight':
        case 'KeyD':
          this.right = down;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.left = down;
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.disposers.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
    );

    const setTouch = (e: PointerEvent, down: boolean) => {
      if (e.pointerType === 'mouse') return;
      const isRight = e.clientX > window.innerWidth / 2;
      if (isRight) this.touchRight = down;
      else this.touchLeft = down;
    };
    const pd = (e: PointerEvent) => setTouch(e, true);
    const pu = (e: PointerEvent) => {
      this.touchRight = false;
      this.touchLeft = false;
      void e;
    };
    target.addEventListener('pointerdown', pd);
    target.addEventListener('pointerup', pu);
    target.addEventListener('pointercancel', pu);
    this.disposers.push(
      () => target.removeEventListener('pointerdown', pd),
      () => target.removeEventListener('pointerup', pu),
      () => target.removeEventListener('pointercancel', pu),
    );
  }

  read(): BikeInput {
    const forward = this.right || this.touchRight;
    const back = this.left || this.touchLeft;
    const throttle = (forward ? 1 : 0) - (back ? 1 : 0);
    return { throttle, lean: throttle };
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}
