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

    const wheelBase_ = { collisionFilter: filter, density: BIKE.WHEEL_DENSITY, restitution: 0.05, label: 'wheel' };
    // Rear is the DRIVEN wheel — high grip for traction.
    this.wheelBack = Bodies.circle(x - wheelBase, wheelY, WHEEL_R, {
      ...wheelBase_,
      friction: BIKE.WHEEL_FRICTION,
      frictionStatic: 4,
    });
    // Front is a passive caster — it only holds the nose up and rolls along. Low
    // friction so it never grips or fights the rear (no torque ever touches it).
    this.wheelFront = Bodies.circle(x + wheelBase, wheelY, WHEEL_R, {
      ...wheelBase_,
      friction: 0.2,
      frictionStatic: 0.4,
    });

    const axle = (wheel: Body, dx: number, stiffness: number) =>
      Constraint.create({
        bodyA: this.chassis,
        pointA: { x: dx, y: CHASSIS_H * 0.5 },
        bodyB: wheel,
        stiffness,
        damping: 0.1,
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

    // Drive: ALL torque goes to the REAR wheel only — the front is never touched.
    // Friction turns the rear spin into forward force, so the bike climbs hills
    // and gains speed downhill. Torque only adds below MAX_OMEGA so it can't run
    // away. Throttle drives forward, brake applies reverse torque (rear only).
    const omega = this.wheelBack.angularVelocity;
    if (t > 0) {
      if (omega < BIKE.MAX_OMEGA) this.wheelBack.torque += t * BIKE.DRIVE_TORQUE;
    } else if (t < 0) {
      if (omega > -BIKE.MAX_OMEGA) this.wheelBack.torque += t * BIKE.BRAKE_TORQUE;
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
