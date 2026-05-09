# Space Level — Planet Redesign

**Status:** Design approved 2026-05-10. Awaiting implementation plan.

## Goal

Replace the current `space` level (flat orbital ring with low gravity) with a Mario Galaxy-style planet system: 6 round destructible planets, each with its own gravity well, with players walking continuously around their surfaces.

The level should feel unmistakably "spacey" — distinct from every other level. Hopping from a small moon onto a big lava-cored sun, watching a Kamehameha beam curve into a planet's gravity well, getting yeeted by a punch and recaptured by a neighbouring halo — these are the moments we're building toward.

## Design picks (from brainstorm)

| Decision | Pick |
| --- | --- |
| Walk style | Continuous walk-around (Mario Galaxy) |
| Planet count + variety | 6 planets, mixed sizes — 2 anchors (~6m radius) + 4 smaller (~2-4m) |
| Destruction model | Layered annular wedges — crust + mantle + glowing core |
| Crust appearance | 16 wedges, uniform crust color (no patchwork tones) |
| Mantle | 8 wedges per planet, darker red/brown |
| Core | Indestructible glowing lava sphere — damages on touch |
| Camera | Dynamic auto-fit (existing camera, widened zoom clamp) |
| Kill condition | Extended kill box ±50×±35 + gravity halos that recapture drifting players |
| Themed planets | No — all 6 are plain rock |
| Cosmic hazards | Meteor showers, gated to start at the 30-second match mark |
| Body rotation | Continuous (Mario Galaxy) — body always feet-down to current planet |
| Projectile gravity | All projectiles obey planet gravity sum on this level (override individual gravity flags) |

## Architecture

### 1. Gravity system

The level overrides the world's global gravity to zero (`physics.world.gravity = (0,0,0)`) on level boot, and registers a per-step force callback that applies a custom multi-source gravity to every dynamic body.

For each dynamic body each tick:
```
F_total = sum over each planet of:
   if dist(body, planet.center) > planet.haloRadius:  0
   else:                                              G * planet.mass / r² toward center
```

- `G = 1.5` (tuned constant).
- `planet.mass` defaults proportional to radius³ but explicit per planet.
- `haloRadius = haloMul * planet.radius`, default `haloMul = 3`.
- Forces are smoothed near the halo boundary so bodies don't snap-pop in/out.

Bodies affected: players, projectiles, crates, meteors. Static tiles are unaffected (their bodies are mass=0).

The "current planet" for a player is whichever planet's pull is strongest at their position right now. If the strongest pull is below a tiny threshold (`< 0.5 m/s²`), the player is "in deep space" and uses no tangential walk control.

### 2. Planet geometry

Each planet is a new Level subsystem object:

```js
{
  id, cx, cy,                    // unique id, world center
  radius: 6,                     // crust outer radius
  mantleRadius: 4,               // crust inner / mantle outer
  coreRadius: 2,                 // mantle inner / core outer (lava)
  mass: 220, haloMul: 3,
  crustWedges: 16, mantleWedges: 8,
  crustHp: 80, mantleHp: 200,
  crustColor: 0x808898,
  mantleColor: 0x7a3a3a,
  coreColor: 0xff6633,
}
```

Each planet builds:
- 16 crust wedges as `Tile`-like objects, each one an annular sector mesh + Cannon convex collider.
- 8 mantle wedges, similar.
- 1 indestructible static sphere body for the core, registered as a hazard (kind: `'planet_core'`, dps: 60).

Each wedge object carries:
```js
{
  planet,          // back-reference to owning planet
  kind: 'crust' | 'mantle',
  wedgeIdx,        // 0..(N-1) within its ring
  theta0, theta1,  // angular bounds
  rIn, rOut,       // radial bounds
  hp, maxHp,
  body, mesh,
}
```

Each wedge is created with `userData.kind = 'tile'` so existing tile-damage code paths (projectile impact, `damageArea`) work unchanged. Wedges register in `level.tiles` keyed by their unique id (e.g. `planet${id}_${kind}_${idx}`).

#### Wedge mesh

For each wedge between angles `θ0..θ1` and radii `rIn..rOut`:
- 2D shape = the four arc-corner points + sampled arcs along outer + inner edges.
- `THREE.ExtrudeGeometry` to give it 0.5 z-depth.
- `MeshStandardMaterial { color: crustColor, roughness: 0.85 }`.
- Mesh added to scene with `matrixAutoUpdate = false` (static).

#### Wedge collider

Single Cannon `Box` whose center is at the radial midpoint of the wedge and dimensions ≈ wedge bounding box. Approximate but fine at this scale — players walk on the outer arc, projectiles hit center mass.

### 3. Player movement on a curved surface

Replace flat-physics movement in this level via a feature flag `level.curvedGravity = true`. When set, `Stickman._move` uses tangential motion instead of world-x.

For each tick:
1. Compute `up = (player.pos - currentPlanet.center).normalize()`. `tangent = vec2(-up.y, up.x)`.
2. `speedMax = ...` (existing rules).
3. `targetVel = tangent * (moveX * speedMax)`.
4. Velocity lerp toward target, capped by `accel * dt`. The component along `up` is preserved (so jumps + gravity work normally).
5. **Jump**: `velocity += up * jumpSpeed`.
6. **Grounded check**: short raycast from body center along `down` for current planet wedge bodies (existing pattern, only direction differs).

If no current planet (deep space):
- No tangential walk control.
- Small lateral nudge available for steering air.
- `moveX` becomes a sideways thruster, capped low so it can't override gravity capture.

### 4. Body rotation

On level boot with `curvedGravity = true`, every existing stickman body has `fixedRotation` flipped to `false` (and back to `true` on level cleanup). Late joiners and respawns inherit the level flag at body construction. Each preStep:
- Target Z rotation = `atan2(up.y, up.x) - π/2` so capsule local +y aligns with up.
- Slerp body quaternion toward target at ~12 rad/s damping rate.

The visual rig follows body quaternion automatically.

The Z-axis lock from `PhysicsWorld.postStep` (clamping `position.z = 0` and zeroing angular velocity around x/y axes) is preserved — players still rotate only around the camera-facing axis.

### 5. Projectile gravity arcs

Inside this level only, projectiles ignore their per-instance `gravity: false` flag. The level installs a `physics.addPreStep(projectileGravityCallback)` that applies the same planet-gravity-sum force to every body in `game.projectiles[*].body`.

Tuning (defaults — adjustable per playtest):
- `G = 1.5`
- Bullets at 60 m/s through a 6m planet's halo bend ~1m over 0.3s flight → noticeable.
- Grenades / arrows / RPG missiles arc dramatically.
- Beams (Kamehameha) curve into a planet from far away → spectacle.

Tracer lines automatically draw the curved path since they sample post-step position.

### 6. Meteor showers

Match-timer-gated periodic hazard. Lives on the level as a small system.

- **Activation**: `level._meteorTimer = 30` at level boot. Meteors don't spawn until `level.matchTime >= 30`.
- After activation, every **8–14 seconds** (`rand(8, 14)`), spawn **1–3 meteors** (`randInt(1, 3)`).
- Each meteor:
  - Spawns at a random world-edge point (just outside the camera frame).
  - Initial velocity ~14 m/s aimed roughly at the system center, ±30° random.
  - Body: `CANNON.Sphere(0.4)`, mass 1.5, `COL_GROUPS.PROJECTILE` group, mask = `WORLD | PLAYER`.
  - Mesh: red-orange emissive sphere + spark-particle tail (each tick spawns 1 spark behind it).
  - Subject to the same per-step gravity sum → curves through halos.
- **On player contact**: 30 dmg + heavy knockback (kb = velocity × 0.6). Despawn.
- **On wedge contact**: 50 area damage centered on hit point (uses existing `level.damageArea`). Despawn with debris burst.
- **Time-out**: despawn after 12 s, or when leaving the kill-bound rectangle.

### 7. Camera

Reuse existing `GameCamera`. Two clamp adjustments only:
- `zoom` clamp: `[12, 28]` → `[14, 50]`.
- `center` clamp: `x: [-22, 22], y: [-6, 20]` → `x: [-50, 50], y: [-35, 35]`.

Dynamic auto-fit logic is unchanged. When players cluster on one planet, frame zooms in. When players spread across the system, frame zooms out.

### 8. Kill bound

The level installs a per-tick player check:
- For each alive player: if `|x| > 50 || |y| > 35` → instant KO via `player.takeDamage(player.maxHealth, ...)`.

Visual cue: a faint red dust gradient on the camera edge, alpha = `clamp((dist_to_bound / 0.2 - 4), 0, 1)` — only visible when a player is within 20% of the bound.

### 9. Background

- `bgColor: 0x000008` (deep space).
- 50–70 distant stars: small `bgGlow` flecks at z=-16 with varied sizes/colors.
- 2 nebula bands: large emissive strips, purple + magenta.
- 1 distant gas giant in upper-corner: large `bgSphere` with subtle ring (a wider `bgDisc`), z=-18.
- No moving BG elements.

### 10. Multiplayer / netcode

Snapshot extensions:
- Each player snapshot adds a quaternion (4 floats). Negligible bandwidth.
- Wedge HP table: array of `(planetId, wedgeIdx, hp)` for damaged wedges. Dropped wedges signaled via existing tile-destroy events.
- Active meteors: array of `(id, x, y, vx, vy)`, sent at 20 Hz like projectiles.

Drop-in mid-match: snapshot serializes wedge HP + active meteors so the late joiner sees the same world state. Same drop-in flow as today.

## Out of scope (deferred)

- **Ragdoll on curved surface** — existing ragdoll uses world-up. Thrown corpses look fine; not redesigning ragdoll for this level.
- **Force-Push / Force-Choke directional physics** — use world directions today. They'll function but feel slightly off in the planet system. Future tuning pass.
- **Smart bot pathfinding on curves** — bots will shoot + walk dumb on this level for v1. Bot AI overhaul is its own spec.
- **Themed planets (lava, ice, mine, etc.)** — out for v1. Easy to add later via per-planet config flags.
- **Wormholes / cosmic events** — meteor showers cover the system-wide hazard need for v1.

## Risks

- **Performance**: 6 planets × 24 wedges = 144 destructible chunks + projectile gravity scan per frame. Profile during impl. Mitigations: skip force calc for sleeping bodies; cap meteor count at 6 simultaneous.
- **Movement feel**: tangential walking with curving body rotation is a new feel. Risk of vertigo / disorientation. Mitigation: tune rotation slerp rate (12 rad/s) until it reads natural; expose tunable so we can demo two values to playtesters.
- **Multiplayer state divergence**: clients running their own gravity sum could drift from host. Authoritative host-sim is preserved (host runs gravity, sends snapshots), so this is the same risk as today's tile sync. No new failure mode.

## Acceptance criteria

A playtester opens the Space level and:
1. Lands on a planet, body rotated feet-first to its surface, walks all the way around it in ~3 seconds.
2. Jumps, briefly weightless, gets caught by a neighbouring planet's halo, lands feet-first on its surface.
3. Fires a Pistol — bullet visibly arcs into the nearest big planet.
4. Fires a Kamehameha across the system — beam curves dramatically.
5. Knocks crust wedges off a planet with explosives, exposing the lava core.
6. Touches the lava core → takes damage.
7. After ~30s of play, sees the first meteor streak in from off-screen, watches it curve into a planet, debris flies.
8. Punches an opponent so hard they fly off-system, drift back via halo capture (or die at extreme bound).
9. Runs in landscape on phone — readable, frame counts within today's targets.
