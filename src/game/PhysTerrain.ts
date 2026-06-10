// Builds static Matter bodies from the smoothed surface polyline.
//
// Each pair of adjacent surface points becomes a convex trapezoid running down
// to a shared baseline. Adjacent trapezoids share their vertical seam exactly,
// so the rolling surface is continuous with no gaps for the wheels to snag on.

import { Bodies, Composite, type Body } from 'matter-js';
import type { Terrain } from '../data/terrain';

export function buildPhysTerrain(terrain: Terrain): Body[] {
  const { surface, baselineY } = terrain;
  const bodies: Body[] = [];

  for (let i = 0; i < surface.length - 1; i++) {
    const a = surface[i];
    const b = surface[i + 1];

    // Trapezoid: top edge a->b, dropping to the flat baseline.
    const verts = [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: b.x, y: baselineY },
      { x: a.x, y: baselineY },
    ];

    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y + 2 * baselineY) / 4;

    const body = Bodies.fromVertices(
      cx,
      cy,
      [verts],
      { isStatic: true, friction: 1, label: 'terrain' },
      true,
    );
    if (body) bodies.push(body);
  }

  return bodies;
}

export function addTerrain(world: Composite, bodies: Body[]): void {
  Composite.add(world, bodies);
}
