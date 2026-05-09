import * as CANNON from 'cannon-es';
import { PHYS_STEP } from '../../physics/PhysicsWorld.js';

// Returns a per-step callback that applies summed planet gravity to every
// dynamic body in the world AND every active projectile in `game`. The same
// callback is used for both pre-step physics integration and projectile arc.
export function makePlanetGravity(level, game) {
  const G = 1.5;                  // tuning constant
  return function applyPlanetGravity(dt) {
    // preStep fires fn() with no arguments — fall back to the fixed step size.
    const dtLocal = dt ?? PHYS_STEP;
    const planets = level.planets;
    if (!planets.length) return;
    // Helper: write summed acceleration onto velocity for one body.
    const applyTo = (body) => {
      if (!body || body.mass === 0) return;
      let ax = 0, ay = 0;
      for (const p of planets) {
        const dx = p.cx - body.position.x;
        const dy = p.cy - body.position.y;
        const r2 = dx * dx + dy * dy;
        if (r2 > p.haloRadius * p.haloRadius) continue;
        if (r2 < 0.04) continue;          // avoid singularity inside core
        const r = Math.sqrt(r2);
        const a = G * p.mass / r2;
        ax += (dx / r) * a;
        ay += (dy / r) * a;
      }
      body.velocity.x += ax * dtLocal;
      body.velocity.y += ay * dtLocal;
    };
    // 1. Every dynamic body in the world.
    for (const b of level.physics.world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC) continue;
      applyTo(b);
    }
    // 2. Every active projectile (host-side; clients use snapshot interp).
    // Override per-projectile gravity flag — every projectile arcs here.
    if (game?.projectiles) {
      for (const pr of game.projectiles) {
        if (pr.dead || !pr.body) continue;
        applyTo(pr.body);
      }
    }
  };
}
