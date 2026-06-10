// Central tuning. All gameplay/visual constants live here so the feel can be
// dialed in from one place.

export const TERRAIN = {
  /** Evenly-resampled control points taken from the raw price series. */
  CONTROL_POINTS: 140,
  /** Catmull-Rom subdivisions between control points (smoothness). */
  SUBDIV: 6,
  /** Horizontal world distance between two adjacent spline points (px). */
  SEGMENT_W: 16,
  /** Vertical world height the full price range maps onto (px). */
  AMPLITUDE: 520,
  /** How far below the lowest point the solid ground extends (px). */
  BASELINE: 760,
} as const;

// Hill-Climb-Racing feel WITHOUT losing the ride. Wheels are velocity-driven so
// the bike always rolls smoothly along the chart (never launches). The
// difficulty is a *bounded* chassis pitch: gunning the throttle is overpowered
// and lifts the front toward a backflip; the brake bites hard and dives the
// nose. The pitch is capped, so you tip and loop on ramps but the bike is never
// flung — feathering is how you actually keep it rubber-side-down.
export const BIKE = {
  CHASSIS_W: 86,
  CHASSIS_H: 26,
  WHEEL_R: 22,
  DENSITY: 0.0009,
  /** Rear-wheel grip — high traction so torque becomes forward force, not spin. */
  WHEEL_FRICTION: 1,
  /** Extra wheelbase beyond the chassis half-width (px). A longer wheelbase
   *  resists rearing, so the rear wheel can put down real power without
   *  wheelie-ing the bike over. */
  WHEELBASE_EXT: 10,
  // Real engine: the rear wheel is driven by TORQUE, not a forced velocity.
  // Friction turns that into forward force, so the bike climbs real hills and
  // GAINS speed downhill (a velocity-capped wheel would brake you on descents).
  /** Wheel density — slightly over the chassis to nudge the centre of mass down
   *  (resists rearing) without adding so much inertia that it bogs down. */
  WHEEL_DENSITY: 0.0011,
  /** Rear-wheel drive torque per step. The wide wheelbase lets this be strong
   *  without rearing into a wheelie on flat ground. */
  DRIVE_TORQUE: 0.13,
  /** Brake/reverse torque per step (rear only). */
  BRAKE_TORQUE: 0.1,
  /** Top wheel spin (rad/step); torque stops adding past this so it can't run away. */
  MAX_OMEGA: 1.7,
  // Pitch control is AIR-ONLY (Hill Climb Racing style). On the ground the bike
  // just drives — no chassis pitch, so holding gas never stalls or wheelies on
  // its own. In the air, gas/brake rotate the bike so you can spin and land flips.
  /** Per-step air pitch (uncapped): gas rotates forward, brake rotates back.
   *  Higher = snappier flips off jumps. */
  AIR_PITCH: 0.032,
  /** Both axles equally planted so the bike rests level (no front-heavy lean). */
  AXLE_REAR_STIFF: 0.75,
  AXLE_FRONT_STIFF: 0.75,
  START_HEIGHT: 130,
} as const;

// Wipeout = the bike has come to REST while inverted (a failed flip or a slow
// fall-over). A flip in progress keeps a high angular velocity, so it's never
// interrupted — the rider gets to complete the rotation and land it. Only when
// the bike is past vertical AND has stopped rotating does the run end.
/** Tilt (rad from upright) beyond which the bike counts as inverted. */
export const WIPEOUT_TILT = 2.0; // ~115°: on its back / head
/** Chassis angular speed (rad/step) below which it's "not flipping" — settled. */
export const SETTLE_AV = 0.04;
/** Consecutive settled-inverted steps before the run ends (~130ms grace). */
export const WIPEOUT_GRACE_STEPS = 8;
/** World Y below the deepest track point (y=0) that means the bike fell off
 *  the platform into the void — ends the run. */
export const FALL_OFF_Y = 140;

export const PHYSICS = {
  GRAVITY_Y: 1.0,
  STEP_MS: 1000 / 60,
  MAX_STEPS_PER_FRAME: 5,
} as const;

export const CAMERA = {
  SCALE: 0.82,
  LOOKAHEAD: 180,
  LERP: 0.08,
} as const;

export const SCORE = {
  DISTANCE_DIVISOR: 8, // 1 point per N px of furthest progress
  AIRTIME_PER_SEC: 60,
  FLIP_BONUS: 150,
  WHEELIE_PER_SEC: 120, // points per second of held wheelie
  WHEELIE_TILT_MIN: 0.35, // rad front-up before a wheelie scores
  WHEELIE_TILT_MAX: 1.3, // rad beyond which it's a topple, not a wheelie
} as const;

/** Seconds of 3-2-1 before the run starts. */
export const COUNTDOWN_SECONDS = 3;
/** Wheel-landing impact speed above which we kick up a dust burst. */
export const LAND_IMPACT_SPEED = 4.5;

// All four are within CoinGecko's free 365-day limit ("max" is blocked free).
export const RANGES = ['7d', '30d', '90d', '1y'] as const;
export type Range = (typeof RANGES)[number];

export const DEFAULT_TOKEN = { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc' };
