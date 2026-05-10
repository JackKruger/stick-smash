import * as CANNON from 'cannon-es';

// Mario Galaxy-style gravity zones:
//   - Each planet exerts CONSTANT magnitude inside its halo, zero outside.
//   - SINGLE dominant planet at a time per body — no inter-planet sum.
//     Picking by closest center (smallest r) since constant magnitude makes
//     the field strength irrelevant for selection.
//   - GROUNDED players get a magnet bonus (1.3× pull) so micro-bumps from
//     wedge / sphere contact don't accumulate into orbital escape.
//
// Constant-magnitude gravity is what makes MG planets feel predictable.
// Inverse-square felt nice on paper but spikes inside the core and
// undershoots near the halo edge — neither helps arcade combat.

export function makePlanetGravity(level, game) {
  const SURFACE_G = 8;        // m/s² baseline pull inside any halo
  const STICK_BONUS = 1.3;    // grounded multiplier for magnet effect
  return function applyPlanetGravity() {
    const planets = level.planets;
    if (!planets.length) return;
    // Pick the SINGLE dominant planet for this body. With constant
    // magnitude, the choice that matters is "which zone owns me right
    // now." Use closest center; tie-break by smallest radius so denser
    // zones win in overlap.
    const pickPlanet = (px, py) => {
      let best = null, bestD2 = Infinity;
      for (const p of planets) {
        const dx = p.cx - px, dy = p.cy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > p.haloRadius * p.haloRadius) continue;
        if (d2 < bestD2) { bestD2 = d2; best = p; }
      }
      return best;
    };
    const applyTo = (body, isPlayer = false) => {
      if (!body || body.mass === 0) return;
      const planet = pickPlanet(body.position.x, body.position.y);
      if (!planet) return;
      const dx = planet.cx - body.position.x;
      const dy = planet.cy - body.position.y;
      const r = Math.hypot(dx, dy);
      if (r < 0.05) return;             // sitting on the singularity
      // Constant magnitude pull. Flat, predictable, MG-style.
      let aMag = SURFACE_G;
      if (isPlayer && body.userData?.stickman?.grounded) aMag *= STICK_BONUS;
      const ux = dx / r, uy = dy / r;
      // F = m * a in body.force. Shim's _stepOnce reads body.force AFTER
      // preStep listeners run and applies via Rapier.addForce.
      body.force.x += body.mass * ux * aMag;
      body.force.y += body.mass * uy * aMag;
    };
    for (const b of level.physics.world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC) continue;
      if (b.userData?.kind === 'projectile') continue;
      applyTo(b, b.userData?.kind === 'player');
    }
    if (game?.projectiles) {
      for (const pr of game.projectiles) {
        if (pr.dead || !pr.body) continue;
        applyTo(pr.body, false);
      }
    }
  };
}
