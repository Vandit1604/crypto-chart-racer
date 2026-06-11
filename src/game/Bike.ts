// The rideable bike: a chassis plus two wheels on stiff suspension axles.
// Throttle eases wheel spin toward a target angular velocity (reliable climbing
// feel); airborne lean applies a rotation impulse to the chassis for flips.

import { Bodies, Body, Composite, Constraint, type World } from 'matter-js';
import { BIKE } from '../config';

// Live-tunable air-pitch knob. Seeded from config; the dev probe can override it
// at runtime (window.__tune) without rebuilding. Production uses the default.
export const tuning = {
  AIR_PITCH: BIKE.AIR_PITCH,
};

export interface BikeInput {
  throttle: number; // -1 (reverse/brake) .. 1 (forward)
  lean: number; // -1 (back-flip) .. 1 (front-flip), used in air
}

export class Bike {
  readonly chassis: Body;
  readonly wheelBack: Body;
  readonly wheelFront: Body;
  readonly composite: Composite;

  constructor(x: number, y: number) {
    const { CHASSIS_W, CHASSIS_H, WHEEL_R, DENSITY } = BIKE;
    const group = Body.nextGroup(true); // bike parts never collide with each other
    const filter = { group };
    const wheelBase = CHASSIS_W * 0.5 + BIKE.WHEELBASE_EXT;
    const wheelY = y + CHASSIS_H * 0.5;

    this.chassis = Bodies.rectangle(x, y, CHASSIS_W, CHASSIS_H, {
      collisionFilter: filter,
      density: DENSITY,
      chamfer: { radius: 8 },
      friction: 0.4,
      label: 'chassis',
    });

    // A little restitution so the wheels hop over sharp features and don't dead-
    // stick in deep dips.
    const wheelBase_ = { collisionFilter: filter, density: BIKE.WHEEL_DENSITY, restitution: BIKE.WHEEL_RESTITUTION, label: 'wheel' };
    // Rear is the DRIVEN wheel — grippy, but frictionStatic kept near friction so
    // it doesn't stick-then-slip (that grab is what made it power-hop on accel).
    this.wheelBack = Bodies.circle(x - wheelBase, wheelY, WHEEL_R, {
      ...wheelBase_,
      friction: BIKE.WHEEL_FRICTION,
      frictionStatic: 1.1,
    });
    // Front is a frictionless caster — it ONLY holds the nose up. Near-zero
    // friction so it provides no traction and never fights the rear wheel.
    this.wheelFront = Bodies.circle(x + wheelBase, wheelY, WHEEL_R, {
      ...wheelBase_,
      friction: 0.005,
      frictionStatic: 0,
    });

    const axle = (wheel: Body, dx: number, stiffness: number) =>
      Constraint.create({
        bodyA: this.chassis,
        pointA: { x: dx, y: CHASSIS_H * 0.5 },
        bodyB: wheel,
        stiffness,
        damping: BIKE.AXLE_DAMPING,
        length: 0,
      });

    this.composite = Composite.create({ label: 'bike' });
    Composite.add(this.composite, [
      this.chassis,
      this.wheelBack,
      this.wheelFront,
      // Rear planted, front soft — lets the front end lift so throttle can
      // wheelie the bike over backward (the HCR "accel too strong" flip).
      axle(this.wheelBack, -wheelBase, BIKE.AXLE_REAR_STIFF),
      axle(this.wheelFront, wheelBase, BIKE.AXLE_FRONT_STIFF),
    ]);
  }

  addTo(world: World): void {
    Composite.add(world, this.composite);
  }

  apply(input: BikeInput, airborne: boolean): void {
    const t = input.throttle;

    // Drive: a velocity MOTOR on the REAR wheel only (the Box2D wheel-joint
    // model). Torque is proportional to how far the wheel is from its target
    // spin, capped at MAX_MOTOR_TORQUE. Far below target (uphill / from a stop)
    // it pulls at full torque; near target (cruise) it eases off so it neither
    // wheelspins nor rears up. The front wheel is never touched.
    if (t !== 0) {
      const target = t > 0 ? BIKE.TARGET_OMEGA : BIKE.REVERSE_OMEGA;
      const error = target - this.wheelBack.angularVelocity;
      const torque = Math.max(
        -BIKE.MAX_MOTOR_TORQUE,
        Math.min(BIKE.MAX_MOTOR_TORQUE, error * BIKE.MOTOR_GAIN),
      );
      this.wheelBack.torque += torque;
    }

    // Pitch control ONLY in the air (Hill Climb Racing style): gas rotates the
    // bike forward, brake rotates it back, so you can line up and land flips off
    // jumps. On the ground there is no pitch input at all — wheelies happen
    // naturally from slopes, bumps and landings.
    if (airborne && t !== 0) {
      Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity + t * tuning.AIR_PITCH);
    }
  }

  get position() {
    return this.chassis.position;
  }
}
