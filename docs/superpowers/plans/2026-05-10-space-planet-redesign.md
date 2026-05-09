# Space Planet Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `space` level with a Mario Galaxy-style 6-planet system: each planet has its own gravity well, players walk continuously around their surfaces with body rotation, projectiles arc through gravity, meteor showers kick in 30 s into the match.

**Architecture:** Planets are a new geometry primitive (annular wedges) living in `src/levels/space/`. Planet gravity is implemented as a per-step force callback on the physics world. Player capsule physics gain a "curved gravity" mode that switches movement from world-x to tangential to the current planet's surface, plus a continuous body-rotation slerp. Existing weapon / projectile / damage systems are untouched — they just experience the new gravity sum.

**Tech Stack:** Three.js (rendering), cannon-shim → Rapier (physics), PeerJS (drop-in netcode), vanilla DOM UI. No test framework — verification is `node --check` for syntax + `mcp__Claude_Preview__preview_eval` for runtime state assertions + visual smoke via `preview_screenshot`.

**Spec:** `docs/superpowers/specs/2026-05-10-space-planet-redesign-design.md`

**Verification convention:** Each task ends with a "Verify" step that either (a) runs `node --check` on touched files, (b) launches the preview server and runs a `preview_eval` expression that returns concrete state to inspect, or (c) takes a `preview_screenshot` for visual smoke. The convention `EXPECT { ... }` in step text means the eval result must match the shown shape.

---

## File map

**New files:**
- `src/levels/space/Planet.js` — Planet class. Builds + owns 16 crust wedges + 8 mantle wedges + 1 core sphere. Each wedge is a `Tile`-like object registered into `level.tiles`.
- `src/levels/space/PlanetGravity.js` — per-step force callback factory. Given an array of planets, returns a function that applies summed gravity to every dynamic body in the world (and to every active projectile in the game).
- `src/levels/space/MeteorShower.js` — meteor-shower system. Owns an array of active meteors + a spawn timer; ticked from `Level.update`.

**Modified files:**
- `src/levels/Level.js` — read new level flags (`curvedGravity`, `planets`, `cameraClamp`, `meteorShower`); build Planet array; install gravity preStep; tick MeteorShower; fire kill-bound check.
- `src/levels/definitions.js` — replace the `space` level entry with the new planet config.
- `src/entities/Stickman.js` — when `level.curvedGravity` is true: tangential movement, jump-along-up, grounded raycast along down, body rotation slerp.
- `src/effects/Camera.js` — read `level.cameraClamp` to widen zoom + center clamps when set.
- `src/Game.js` — wire snapshot extension for player quaternion, wedge HP, and meteors; wire kill-bound trigger.

---

## Task 1 — Add level flags and convert the `space` entry to a planet shell

**Files:**
- Modify: `src/levels/definitions.js` — replace the existing `space` level object
- Modify: `src/levels/Level.js` — read `curvedGravity`, `planets`, `cameraClamp`, `meteorShower` fields

- [ ] **Step 1: Replace the `space` level entry in `definitions.js`**

Find the existing `space` entry (begins with `id: 'space'`). Delete its `tiles`, `hazards`, `weaponSpawns`, `background`, and replace with the new shell:

```js
  // ---------------------------------------------------------------------
  // SPACE — 6-planet gravity system. Walk-around surfaces, projectile arcs,
  // meteor showers gated to 30s. See docs/superpowers/specs/2026-05-10-space-planet-redesign-design.md
  // ---------------------------------------------------------------------
  {
    id: 'space',
    name: 'Space',
    bgColor: 0x000008,
    gravity: 0,                  // world gravity off — planets supply their own
    curvedGravity: true,         // Stickman + Camera switch to planet-aware mode
    cameraClamp: { x: [-50, 50], y: [-35, 35], zoom: [14, 50] },
    meteorShower: { activateAfter: 30, interval: [8, 14], perShower: [1, 3] },
    killBound: { x: 50, y: 35 }, // |x|>50 or |y|>35 → instant KO
    planets: [
      { id: 'p1', cx: -14, cy:  4, radius: 6.0, mantleRadius: 4.0, coreRadius: 2.0, mass: 240 },
      { id: 'p2', cx:  12, cy: -4, radius: 5.0, mantleRadius: 3.3, coreRadius: 1.6, mass: 180 },
      { id: 'p3', cx:  -2, cy: -7, radius: 2.4, mantleRadius: 1.6, coreRadius: 0.8, mass:  60 },
      { id: 'p4', cx:   1, cy:  6, radius: 2.8, mantleRadius: 1.9, coreRadius: 1.0, mass:  80 },
      { id: 'p5', cx:  19, cy:  7, radius: 2.4, mantleRadius: 1.6, coreRadius: 0.8, mass:  60 },
      { id: 'p6', cx: -22, cy: -7, radius: 2.0, mantleRadius: 1.4, coreRadius: 0.7, mass:  50 },
    ],
    tiles: [],                   // no integer-grid tiles on this level
    hazards: [],                 // no flat hazards either — planets carry their own
    spawns: [
      { x: -14, y: -2.5 },       // top of planet 1
      { x:  12, y:  1   },       // top of planet 2
      { x:  -2, y: -4.5 },       // top of planet 3
      { x:   1, y:  9   },       // top of planet 4
      { x:  19, y:  9.5 },       // top of planet 5
      { x: -22, y: -5   },       // top of planet 6
    ],
    weaponSpawns: [
      { x: -14, y: -2.5 }, { x: 12, y: 1 }, { x: -2, y: -4.5 },
      { x: 1, y: 9 }, { x: 19, y: 9.5 }, { x: -22, y: -5 },
    ],
    background: [],              // background art added in Task 11
  },
```

(Spawns sit one capsule-radius above each planet's surface — `cy + radius + 0.75 + 0.05`.)

- [ ] **Step 2: Read the new fields in `Level.js`**

Edit `Level.js` constructor (around line 497, after `this._chainSegs = new Set();`). Add:

```js
    // Space-level mode flags. When `curvedGravity` is true, players + projectiles
    // get planet-source gravity instead of the global world gravity. Camera, kill
    // bound, and meteor shower are also planet-level features.
    this.curvedGravity = !!def.curvedGravity;
    this.planetConfigs = def.planets ?? [];
    this.planets = [];
    this.cameraClamp = def.cameraClamp ?? null;
    this.killBound = def.killBound ?? null;
    this.meteorShowerCfg = def.meteorShower ?? null;
    this.meteorShower = null;
```

- [ ] **Step 3: Verify**

Run:
```cmd
node --check "src/levels/definitions.js"
node --check "src/levels/Level.js"
```
EXPECT both clean. Then start the preview server and run:

```js
(async () => {
  while (!window.game?.menu) await new Promise(r=>setTimeout(r,100));
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,300));
  return {
    levelId: window.game.levelId,
    curvedGravity: window.game.level.curvedGravity,
    planetCount: window.game.level.planetConfigs.length,
    cameraClamp: window.game.level.cameraClamp,
    killBound: window.game.level.killBound,
  };
})()
```

EXPECT `{ levelId: 'space', curvedGravity: true, planetCount: 6, cameraClamp: {...}, killBound: { x: 50, y: 35 } }`.

The level will load empty (no visible planets yet) — that's OK for this task.

- [ ] **Step 4: Commit**

```cmd
git add src/levels/definitions.js src/levels/Level.js
git commit -m "feat(space): scaffold 6-planet level config + Level flag readers"
```

---

## Task 2 — Build a single Planet with crust wedges (no mantle / core yet)

**Files:**
- Create: `src/levels/space/Planet.js`
- Modify: `src/levels/Level.js` (import + build planets in `_build`)

- [ ] **Step 1: Create `Planet.js` with the wedge constructor**

Create `src/levels/space/Planet.js`:

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL_GROUPS } from '../../physics/PhysicsWorld.js';

// One round destructible body. Owns annular-wedge tiles for crust + mantle and
// a single core sphere. Wedges register into level.tiles using composite ids
// (`planet${id}_${kind}_${idx}`) so existing tile-damage code paths Just Work.
export class Planet {
  constructor(level, cfg) {
    this.level = level;
    this.id = cfg.id;
    this.cx = cfg.cx;
    this.cy = cfg.cy;
    this.radius = cfg.radius;
    this.mantleRadius = cfg.mantleRadius ?? cfg.radius * 0.65;
    this.coreRadius = cfg.coreRadius ?? cfg.radius * 0.3;
    this.mass = cfg.mass ?? cfg.radius * cfg.radius * cfg.radius * 1.0;
    this.haloMul = cfg.haloMul ?? 3;
    this.crustWedges = cfg.crustWedges ?? 16;
    this.mantleWedges = cfg.mantleWedges ?? 8;
    this.crustHp = cfg.crustHp ?? 80;
    this.mantleHp = cfg.mantleHp ?? 200;
    this.crustColor = cfg.crustColor ?? 0x808898;
    this.mantleColor = cfg.mantleColor ?? 0x7a3a3a;
    this.coreColor = cfg.coreColor ?? 0xff6633;
    this.wedges = [];     // populated by _buildCrust / _buildMantle
    this.coreBody = null;
    this.coreMesh = null;
  }

  get haloRadius() { return this.radius * this.haloMul; }

  build(scene, world) {
    this._buildCrust(scene, world);
    // mantle + core added in later tasks
  }

  _buildCrust(scene, world) {
    const N = this.crustWedges;
    const rOut = this.radius;
    const rIn = this.mantleRadius;
    for (let i = 0; i < N; i++) {
      const theta0 = (i / N) * Math.PI * 2 - Math.PI / 2;
      const theta1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2;
      const wedge = this._buildWedge({
        kind: 'crust', idx: i, rIn, rOut, theta0, theta1,
        color: this.crustColor, hp: this.crustHp,
      });
      scene.add(wedge.mesh);
      world.add(wedge.body);
      this.wedges.push(wedge);
      // Register so damageArea / projectile impact can find it.
      const key = `planet${this.id}_crust_${i}`;
      wedge._key = key;
      this.level.tiles.set(key, wedge);
    }
  }

  // Build one annular wedge: arc-segment mesh + approximate Box collider at
  // the radial midpoint. Returned object is shaped like a Tile for compat
  // with damageArea / Projectile._impact (userData.kind = 'tile').
  _buildWedge({ kind, idx, rIn, rOut, theta0, theta1, color, hp }) {
    // Mesh: a closed 2D Shape from theta0..theta1 sweep at rIn..rOut, extruded.
    const shape = new THREE.Shape();
    const arcSegs = Math.max(4, Math.ceil((theta1 - theta0) / 0.12));
    // Outer arc (theta0 → theta1).
    shape.moveTo(Math.cos(theta0) * rOut, Math.sin(theta0) * rOut);
    for (let s = 1; s <= arcSegs; s++) {
      const t = theta0 + (theta1 - theta0) * (s / arcSegs);
      shape.lineTo(Math.cos(t) * rOut, Math.sin(t) * rOut);
    }
    // Back along inner arc.
    for (let s = arcSegs; s >= 0; s--) {
      const t = theta0 + (theta1 - theta0) * (s / arcSegs);
      shape.lineTo(Math.cos(t) * rIn, Math.sin(t) * rIn);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
    geo.translate(0, 0, -0.25);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.cx, this.cy, 0);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Collider: single Box at the radial midpoint of the wedge.
    const midR = (rIn + rOut) / 2;
    const midTheta = (theta0 + theta1) / 2;
    const localX = Math.cos(midTheta) * midR;
    const localY = Math.sin(midTheta) * midR;
    const arcLen = (theta1 - theta0) * midR;
    const halfX = arcLen * 0.5;
    const halfY = (rOut - rIn) * 0.5;
    const halfZ = 0.25;
    const body = new CANNON.Body({
      mass: 0,
      collisionFilterGroup: COL_GROUPS.WORLD,
      collisionFilterMask: -1,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));
    body.position.set(this.cx + localX, this.cy + localY, 0);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), midTheta);

    const wedge = {
      planet: this, kind, idx,
      theta0, theta1, rIn, rOut,
      hp, maxHp: hp,
      indestructible: false,
      material: 'stone',
      color, dynamic: false,
      gx: this.cx, gy: this.cy,
      mesh, body,
      // Damage callback — mirrors Tile.damage.
      damage(amt) {
        if (this.indestructible || this.hp <= 0) return false;
        this.hp -= amt;
        const f = Math.max(0, this.hp / this.maxHp);
        const c = new THREE.Color(this.color);
        c.lerp(new THREE.Color(0x111111), 1 - f);
        this.mesh.material.color.copy(c);
        if (this.hp <= 0) { this.destroy(); return true; }
        return false;
      },
      destroy() {
        if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
        this.mesh?.geometry?.dispose();
        this.mesh?.material?.dispose();
        if (this.body) this.planet.level.physics.remove(this.body);
        this.planet.level.tiles.delete(this._key);
        this.planet.level.fx.particles.debris(this.body.position.x, this.body.position.y, 0, this.color, 12);
      },
    };
    body.userData = { kind: 'tile', tile: wedge };
    return wedge;
  }
}
```

- [ ] **Step 2: Wire planet construction into `Level._build`**

Open `src/levels/Level.js`. At the top, add the import:
```js
import { Planet } from './space/Planet.js';
```

Then in `_build()`, after the existing `for (const t of this.def.tiles)` block, add:

```js
    // Space-level: build planets from the config.
    if (this.curvedGravity) {
      for (const cfg of this.planetConfigs) {
        const planet = new Planet(this, cfg);
        planet.build(this.scene, this.physics);
        this.planets.push(planet);
      }
    }
```

- [ ] **Step 3: Verify in browser**

Reload preview, then:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  return {
    planetCount: window.game.level.planets.length,
    wedgesPerPlanet: window.game.level.planets[0]?.wedges.length,
    totalTiles: window.game.level.tiles.size,
    sampleWedge: (() => {
      const w = window.game.level.planets[0]?.wedges[0];
      return w ? { kind: w.kind, hp: w.hp, color: w.color.toString(16) } : null;
    })(),
  };
})()
```

EXPECT `{ planetCount: 6, wedgesPerPlanet: 16, totalTiles: 96, sampleWedge: { kind: 'crust', hp: 80, ... } }`.

Take a `preview_screenshot` — six grey-blue circular discs should be visible across the screen.

- [ ] **Step 4: Commit**

```cmd
git add src/levels/space/Planet.js src/levels/Level.js
git commit -m "feat(space): build 6 planets with annular crust wedges"
```

---

## Task 3 — Add the mantle layer + indestructible lava core

**Files:**
- Modify: `src/levels/space/Planet.js`

- [ ] **Step 1: Add mantle wedges**

In `Planet.build`, replace the body with:

```js
  build(scene, world) {
    this._buildCrust(scene, world);
    this._buildMantle(scene, world);
    this._buildCore(scene, world);
  }

  _buildMantle(scene, world) {
    const N = this.mantleWedges;
    const rOut = this.mantleRadius;
    const rIn = this.coreRadius;
    for (let i = 0; i < N; i++) {
      const theta0 = (i / N) * Math.PI * 2 - Math.PI / 2;
      const theta1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2;
      const wedge = this._buildWedge({
        kind: 'mantle', idx: i, rIn, rOut, theta0, theta1,
        color: this.mantleColor, hp: this.mantleHp,
      });
      scene.add(wedge.mesh);
      world.add(wedge.body);
      this.wedges.push(wedge);
      const key = `planet${this.id}_mantle_${i}`;
      wedge._key = key;
      this.level.tiles.set(key, wedge);
    }
  }
```

- [ ] **Step 2: Add the core sphere (indestructible hazard + visual)**

Add this method to `Planet`:

```js
  _buildCore(scene, world) {
    const r = this.coreRadius;
    const geo = new THREE.SphereGeometry(r, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: this.coreColor,
      emissive: this.coreColor,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.cx, this.cy, 0);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    this.coreMesh = mesh;

    // Static trigger body — handled like a lava hazard (continuous DoT on touch).
    const body = new CANNON.Body({
      mass: 0, isTrigger: true,
      collisionFilterGroup: COL_GROUPS.HAZARD,
    });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(this.cx, this.cy, 0);
    // Reuse the existing Hazard contactPlayer pattern via a minimal stub.
    const hazard = {
      kind: 'lava', x: this.cx, y: this.cy, w: r * 2, h: r * 2,
      dps: 60, body, mesh,
      kb: { x: 0, y: 0 },
      contactPlayer(player, dt) {
        if (player.invuln > 0 || !player.alive) return;
        player.takeDamage(this.dps * dt, { attacker: null, weapon: 'lava' });
      },
      update() { /* no-op */ },
      destroy() {
        if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
        if (this.body) hazard.body && void 0;
      },
    };
    body.userData = { kind: 'hazard', hazard };
    world.add(body);
    this.coreBody = body;
    this.level.hazards.push(hazard);
  }
```

- [ ] **Step 3: Verify**

```cmd
node --check "src/levels/space/Planet.js"
```

Reload preview, run:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  const p = window.game.level.planets[0];
  return {
    wedgeCount: p.wedges.length,
    crustCount: p.wedges.filter(w=>w.kind==='crust').length,
    mantleCount: p.wedges.filter(w=>w.kind==='mantle').length,
    coreOK: !!p.coreMesh && !!p.coreBody,
    hazardCount: window.game.level.hazards.length,
  };
})()
```

EXPECT `{ wedgeCount: 24, crustCount: 16, mantleCount: 8, coreOK: true, hazardCount: 6 }`.

Take screenshot — planets now have a darker red ring inside grey crust + glowing core dot in the middle.

- [ ] **Step 4: Commit**

```cmd
git add src/levels/space/Planet.js
git commit -m "feat(space): add mantle wedges + glowing indestructible core"
```

---

## Task 4 — Per-step planet gravity for dynamic bodies

**Files:**
- Create: `src/levels/space/PlanetGravity.js`
- Modify: `src/levels/Level.js` (install preStep when `curvedGravity` is true)

- [ ] **Step 1: Create the gravity factory**

Create `src/levels/space/PlanetGravity.js`:

```js
import * as CANNON from 'cannon-es';

// Returns a per-step callback that applies summed planet gravity to every
// dynamic body in the world AND every active projectile in `game`. The same
// callback is used for both pre-step physics integration and projectile arc.
export function makePlanetGravity(level, game) {
  const G = 1.5;                  // tuning constant
  const minPullSq = 0.5 * 0.5;    // bodies in deeper-than-this pull are "captured"
  return function applyPlanetGravity(dt) {
    const planets = level.planets;
    if (!planets.length) return;
    // Helper: write summed acceleration onto velocity for one body.
    const applyTo = (body, dtLocal) => {
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
      applyTo(b, dt);
    }
    // 2. Every active projectile (host-side; clients use snapshot interp).
    if (game?.projectiles) {
      for (const pr of game.projectiles) {
        if (pr.dead || !pr.body) continue;
        // Override per-projectile gravity flag — every projectile arcs here.
        applyTo(pr.body, dt);
      }
    }
  };
}
```

- [ ] **Step 2: Install the preStep in `Level._build`**

In `Level.js`, at the top:
```js
import { makePlanetGravity } from './space/PlanetGravity.js';
```

In `_build()`, AFTER the planet-build loop, add:

```js
    if (this.curvedGravity) {
      // Custom multi-planet gravity. World gravity is already 0 (set per
      // level def). Pre-step accumulates summed pull onto each dynamic body.
      this._planetGravityFn = makePlanetGravity(this, this.fx?.game ?? null);
      this.physics.addPreStep(this._planetGravityFn);
    }
```

`fx.game` doesn't exist — wire the actual `Game` reference. Look at where Level is constructed (`new Level(this.scene, this.physics, this.fx, getLevel(levelId))` in `Game.startMatch`). Modify Level constructor signature to accept the game reference, then thread it through. Edit constructor:

```js
  constructor(scene, physics, fx, def, game = null) {
    this.scene = scene;
    this.physics = physics;
    this.fx = fx;
    this.def = def;
    this.game = game;
    // ...rest unchanged
  }
```

And in `Game._startMatch`:
```js
this.level = new Level(this.scene, this.physics, this.fx, getLevel(levelId), this);
```

Then `makePlanetGravity(this, this.game)`.

In `Level.destroy()`, before clearing arrays, add:
```js
    if (this._planetGravityFn) {
      this.physics.removePreStep(this._planetGravityFn);
      this._planetGravityFn = null;
    }
```

- [ ] **Step 3: Verify gravity is being applied**

```cmd
node --check "src/levels/space/PlanetGravity.js"
node --check "src/levels/Level.js"
node --check "src/Game.js"
```

Then in preview:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  const p = window.game.localPlayer;
  // Park player slightly above planet 1 (cx=-14, cy=4, r=6).
  p.body.position.set(-14, 12, 0);
  p.body.velocity.set(0, 0, 0);
  p._frozenUntil = 0;
  await new Promise(r=>setTimeout(r, 600));
  return {
    posY: Math.round(p.body.position.y * 10) / 10,
    velY: Math.round(p.body.velocity.y * 10) / 10,
  };
})()
```

EXPECT `posY` to have decreased (player fell toward planet 1). `velY` should be negative.

- [ ] **Step 4: Commit**

```cmd
git add src/levels/space/PlanetGravity.js src/levels/Level.js src/Game.js
git commit -m "feat(space): per-step planet gravity for dynamic bodies + projectiles"
```

---

## Task 5 — Player movement on a curved surface

**Files:**
- Modify: `src/entities/Stickman.js` (`_move` and grounded-check helpers)

- [ ] **Step 1: Add a planet-finder helper on `Stickman`**

In `Stickman.js`, add this method before `_move`:

```js
  // Find the planet whose pull on this body is strongest right now. Returns
  // null if nothing is exerting meaningful gravity (deep space).
  _currentPlanet() {
    const planets = this.game?.level?.planets;
    if (!planets || !planets.length) return null;
    let best = null, bestA = 0.5;          // require at least 0.5 m/s² to claim
    const G = 1.5;
    for (const p of planets) {
      const dx = p.cx - this.body.position.x;
      const dy = p.cy - this.body.position.y;
      const r2 = dx * dx + dy * dy;
      if (r2 > p.haloRadius * p.haloRadius) continue;
      const a = G * p.mass / Math.max(0.04, r2);
      if (a > bestA) { bestA = a; best = p; }
    }
    return best;
  }
```

- [ ] **Step 2: Tangential movement in `_move`**

Find the existing `_move(dt)` method. Inside, just before the existing `let speedMax = ...` line, add a curved-gravity branch:

```js
    if (this.game?.level?.curvedGravity) {
      const planet = this._currentPlanet();
      this._currentPlanetRef = planet;
      if (planet) {
        // Compute up = away from planet center, tangent = perp.
        const dx = this.body.position.x - planet.cx;
        const dy = this.body.position.y - planet.cy;
        const r = Math.hypot(dx, dy) || 1;
        const ux = dx / r, uy = dy / r;
        const tx = -uy, ty = ux;            // CCW perpendicular
        // Project current velocity into (tangent, radial) basis.
        const vT = this.body.velocity.x * tx + this.body.velocity.y * ty;
        const vR = this.body.velocity.x * ux + this.body.velocity.y * uy;
        const speedMaxC = this.crouching ? 2.5 : (boosted ? 9 : (flying ? 7 : 6.5));
        const accelC = this.grounded ? (boosted ? 65 : 45) : (flying ? 36 : 18);
        const targetT = moveX * speedMaxC;
        const dvT = targetT - vT;
        const stepT = clamp(dvT, -accelC * dt, accelC * dt);
        const newVT = vT + stepT;
        // Recompose velocity = newVT*tangent + vR*radial. Gravity preStep keeps adjusting vR.
        this.body.velocity.x = newVT * tx + vR * ux;
        this.body.velocity.y = newVT * ty + vR * uy;
        // Friction tangentially when no input + grounded.
        if (this.grounded && Math.abs(moveX) < 0.05) {
          const k = Math.pow(0.001, dt);
          this.body.velocity.x *= k;
          this.body.velocity.y *= k;
        }
        // Facing follows tangential velocity sign (dot tangent).
        if (Math.abs(newVT) > 0.2) this.facing = Math.sign(newVT) || this.facing;
        return;     // skip world-x branch entirely
      }
      // No planet captured — leave gravity preStep to handle drift, no walk control.
      return;
    }
```

- [ ] **Step 3: Replace the world-x grounded raycast in `_isGrounded`**

The current grounded check raycasts straight down (-y). For curved gravity, raycast along the radial down from the player to the current planet's center. Locate `_isGrounded` (search for the existing center-first raycast). Wrap with a planet-aware override:

```js
  _isGrounded(world) {
    if (this.game?.level?.curvedGravity) {
      const planet = this._currentPlanetRef;
      if (!planet) return false;
      const dx = this.body.position.x - planet.cx;
      const dy = this.body.position.y - planet.cy;
      const r = Math.hypot(dx, dy) || 1;
      const ux = dx / r, uy = dy / r;
      const top = { x: this.body.position.x, y: this.body.position.y, z: 0 };
      const bot = { x: this.body.position.x - ux * 0.95, y: this.body.position.y - uy * 0.95, z: 0 };
      const hit = world.raycast(top, bot, { mask: COL_GROUPS.WORLD });
      return !!hit;
    }
    // ... existing flat-gravity grounded check unchanged below ...
```

(Keep the existing flat code path intact below the new branch.)

- [ ] **Step 4: Verify player walks on planet surface**

```cmd
node --check "src/entities/Stickman.js"
```

Reload preview, run:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  const p = window.game.localPlayer;
  // Park on top of planet 1 (cx=-14, cy=4, r=6) → spawn at y=10.8.
  p.body.position.set(-14, 10.8, 0);
  p.body.velocity.set(0, 0, 0);
  p._frozenUntil = 0;
  await new Promise(r=>setTimeout(r,400));
  // Apply moveX = 1 for half a second; expect tangential motion (CCW).
  p.input.moveX = 1;
  await new Promise(r=>setTimeout(r,500));
  p.input.moveX = 0;
  return {
    pos: { x: Math.round(p.body.position.x*10)/10, y: Math.round(p.body.position.y*10)/10 },
    grounded: p.grounded,
    onPlanet: p._currentPlanetRef?.id,
  };
})()
```

EXPECT `pos` to have shifted along the planet's circumference (x increased toward +x side, y dropped slightly), `grounded: true`, `onPlanet: 'p1'`.

- [ ] **Step 5: Commit**

```cmd
git add src/entities/Stickman.js
git commit -m "feat(space): tangential walk + radial grounded check on curved planets"
```

---

## Task 6 — Continuous body rotation (Mario Galaxy slerp)

**Files:**
- Modify: `src/entities/Stickman.js` (constructor + new `_updateBodyRotation` called from update tick)

- [ ] **Step 1: Flip `fixedRotation` off when on a curved-gravity level**

In `Stickman` constructor, find the `body = new CANNON.Body({ ... fixedRotation: true ... })` block. Replace `fixedRotation: true` with:

```js
      fixedRotation: !(opts.game?.level?.curvedGravity),
```

(Defensive: `opts.game.level` may not exist at the moment the very first Stickman is constructed — `level` is built before players. If it doesn't, default to `true`. The expression handles `undefined` because of the optional chaining.)

- [ ] **Step 2: Add the rotation slerp in `update`**

In `Stickman.update(dt, ctx)` (top-level update method), at the END before the closing brace, add:

```js
    if (this.game?.level?.curvedGravity) {
      this._updateBodyRotation(dt);
    }
```

Then add the method itself:

```js
  // Continuously slerp the capsule body's quaternion so its local +Y axis
  // points away from the current planet's center. Outside any halo, decay
  // back toward world up. Z-axis lock in PhysicsWorld.postStep keeps
  // rotation strictly in-plane.
  _updateBodyRotation(dt) {
    const planet = this._currentPlanetRef ?? this._currentPlanet();
    let targetAngle = 0;
    if (planet) {
      const dx = this.body.position.x - planet.cx;
      const dy = this.body.position.y - planet.cy;
      targetAngle = Math.atan2(dy, dx) - Math.PI / 2;
    }
    // Read current Z rotation from quaternion.
    const q = this.body.quaternion;
    const curAngle = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
    let delta = targetAngle - curAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const rate = 12;          // rad/s — tunable feel
    const step = clamp(delta, -rate * dt, rate * dt);
    const newAngle = curAngle + step;
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), newAngle);
  }
```

(`CANNON` import: confirm it's already at the top of `Stickman.js`.)

- [ ] **Step 3: Verify body rotates feet-first**

```cmd
node --check "src/entities/Stickman.js"
```

Reload preview, run:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  const p = window.game.localPlayer;
  // Park on the LEFT side of planet 1 (cx=-14, cy=4, r=6). Up direction at
  // this point is -x. Body should rotate so capsule local +y points -x.
  p.body.position.set(-21, 4, 0);
  p.body.velocity.set(0, 0, 0);
  p._frozenUntil = 0;
  await new Promise(r=>setTimeout(r,800));
  const q = p.body.quaternion;
  const angleRad = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
  return {
    angleDeg: Math.round(angleRad * 180 / Math.PI),
    onPlanet: p._currentPlanetRef?.id,
  };
})()
```

EXPECT `angleDeg` near `180` (or `-180`) — body rotated 180° from world up, now pointing left (-x). `onPlanet: 'p1'`.

Take screenshot — stickman on left side of planet should appear sideways (head pointing -x).

- [ ] **Step 4: Commit**

```cmd
git add src/entities/Stickman.js
git commit -m "feat(space): continuous body rotation slerp toward planet up"
```

---

## Task 7 — Camera clamp expansion

**Files:**
- Modify: `src/effects/Camera.js`

- [ ] **Step 1: Read level clamp on each update**

Locate the existing `update(dt)` method of `GameCamera` and replace the hardcoded clamps:

```js
    // Hardcoded today: this.center.x = clamp(this.center.x, -22, 22); etc.
    // Replace with:
    const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    const lc = this.cam._level?.cameraClamp ?? null;
    const cx = lc?.x ?? [-22, 22];
    const cy = lc?.y ?? [-6, 20];
    const cz = lc?.zoom ?? [12, 28];
    this.center.x = clamp(this.center.x, cx[0], cx[1]);
    this.center.y = clamp(this.center.y, cy[0], cy[1]);
    this.zoomTarget = clamp(this.zoomTarget, cz[0], cz[1]);
    this.zoom = clamp(this.zoom, cz[0], cz[1]);
```

The camera doesn't currently know about the level. Hand it the reference: in `Game._startMatch`, after `this.level = new Level(...)`, add:

```js
    this.camera._level = this.level;
```

(`this.camera` is the THREE PerspectiveCamera. We're stashing a reference; `GameCamera` reads `this.cam._level` which is that same THREE camera.)

- [ ] **Step 2: Verify**

```cmd
node --check "src/effects/Camera.js"
node --check "src/Game.js"
```

Run preview eval:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,300));
  // Force the camera target to the system corner.
  window.game.gameCam.target.set(60, 30, 0);
  window.game.gameCam.zoomTarget = 100;
  await new Promise(r=>setTimeout(r,200));
  return {
    cx: Math.round(window.game.gameCam.center.x),
    cy: Math.round(window.game.gameCam.center.y),
    zoom: Math.round(window.game.gameCam.zoom),
  };
})()
```

EXPECT `cx` clamped to ≤50, `cy` clamped to ≤35, `zoom` clamped to ≤50.

- [ ] **Step 3: Commit**

```cmd
git add src/effects/Camera.js src/Game.js
git commit -m "feat(space): per-level camera clamp + wider zoom range"
```

---

## Task 8 — Kill bound (instant KO past ±50/±35)

**Files:**
- Modify: `src/levels/Level.js` (`update` method)

- [ ] **Step 1: Add the kill-bound check**

In `Level.update(dt, players)`, near the top, add:

```js
    if (this.killBound) {
      const bx = this.killBound.x, by = this.killBound.y;
      for (const p of players) {
        if (!p || !p.alive) continue;
        const x = p.body.position.x, y = p.body.position.y;
        if (Math.abs(x) > bx || Math.abs(y) > by) {
          p.takeDamage(p.maxHealth + 1, { attacker: null, weapon: 'void' });
        }
      }
    }
```

- [ ] **Step 2: Verify**

```cmd
node --check "src/levels/Level.js"
```

Preview eval:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  const p = window.game.localPlayer;
  p.body.position.set(80, 0, 0);   // far past kill bound
  p._frozenUntil = 0;
  await new Promise(r=>setTimeout(r,200));
  return { alive: p.alive, hp: p.health };
})()
```

EXPECT `alive: false, hp: 0`.

- [ ] **Step 3: Commit**

```cmd
git add src/levels/Level.js
git commit -m "feat(space): instant-KO kill-bound past ±50×±35"
```

---

## Task 9 — Meteor shower system

**Files:**
- Create: `src/levels/space/MeteorShower.js`
- Modify: `src/levels/Level.js`

- [ ] **Step 1: Create `MeteorShower.js`**

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL_GROUPS } from '../../physics/PhysicsWorld.js';

const G = 1.5;          // matches PlanetGravity

// Spawns periodic fiery rocks from outside the kill bound. They obey the same
// planet gravity sum as projectiles, so they curve dramatically into nearby
// planets. Damage planets and players on contact.
export class MeteorShower {
  constructor(level, cfg) {
    this.level = level;
    this.activateAfter = cfg.activateAfter ?? 30;
    this.intervalLo = cfg.interval?.[0] ?? 8;
    this.intervalHi = cfg.interval?.[1] ?? 14;
    this.perLo = cfg.perShower?.[0] ?? 1;
    this.perHi = cfg.perShower?.[1] ?? 3;
    this.t = 0;
    this.nextShowerAt = this.activateAfter + this._randInterval();
    this.meteors = [];
  }
  _randInterval() {
    return this.intervalLo + Math.random() * (this.intervalHi - this.intervalLo);
  }
  update(dt) {
    this.t += dt;
    // Spawn shower if due.
    if (this.t >= this.nextShowerAt) {
      const count = this.perLo + Math.floor(Math.random() * (this.perHi - this.perLo + 1));
      for (let i = 0; i < count; i++) this._spawnOne();
      this.nextShowerAt = this.t + this._randInterval();
    }
    // Tick active meteors.
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.life -= dt;
      // Tail particle.
      if (this.level.fx?.particles?.spark) {
        this.level.fx.particles.spark.spawn({
          x: m.body.position.x, y: m.body.position.y, z: 0,
          vx: -m.body.velocity.x * 0.2, vy: -m.body.velocity.y * 0.2,
          life: 0.4, size: 0.3, color: 0xff7733, gravity: 0, drag: 0.4, shrink: 1,
        });
      }
      m.mesh.position.copy(m.body.position);
      // Despawn on time-out or out-of-bound.
      const kb = this.level.killBound;
      const oob = kb && (Math.abs(m.body.position.x) > kb.x + 5 || Math.abs(m.body.position.y) > kb.y + 5);
      if (m.life <= 0 || oob) { this._destroyMeteor(m); this.meteors.splice(i, 1); }
    }
  }
  _spawnOne() {
    const kb = this.level.killBound ?? { x: 50, y: 35 };
    // Pick a random edge.
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0)      { x = -kb.x; y = -kb.y + Math.random() * (kb.y * 2); }
    else if (edge === 1) { x =  kb.x; y = -kb.y + Math.random() * (kb.y * 2); }
    else if (edge === 2) { x = -kb.x + Math.random() * (kb.x * 2); y = -kb.y; }
    else                 { x = -kb.x + Math.random() * (kb.x * 2); y =  kb.y; }
    // Initial velocity aimed roughly at center, ±30°.
    const dx = -x, dy = -y;
    const baseAng = Math.atan2(dy, dx);
    const ang = baseAng + (Math.random() - 0.5) * (Math.PI / 3);
    const speed = 14;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;

    const r = 0.4;
    const geo = new THREE.SphereGeometry(r, 12, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5520, emissive: 0xff5520, emissiveIntensity: 1.6, roughness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0);
    this.level.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 1.5,
      collisionFilterGroup: COL_GROUPS.PROJECTILE,
      collisionFilterMask: COL_GROUPS.WORLD | COL_GROUPS.PLAYER,
      linearDamping: 0,
    });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(x, y, 0);
    body.velocity.set(vx, vy, 0);
    const meteor = { body, mesh, life: 12, dead: false };
    body.userData = { kind: 'meteor', meteor };
    this.level.physics.add(body);

    body.addEventListener('collide', (e) => {
      if (meteor.dead) return;
      const other = e.body;
      if (other?.userData?.kind === 'tile') {
        this.level.damageArea(body.position.x, body.position.y, 1.6, 50, meteor);
      } else if (other?.userData?.kind === 'player') {
        const sm = other.userData.stickman;
        if (sm?.alive && sm.invuln <= 0) {
          sm.takeDamage(30, {
            attacker: null, weapon: 'meteor',
            kb: { x: body.velocity.x * 0.6, y: body.velocity.y * 0.6 + 4 },
            stun: 0.3,
          });
        }
      }
      meteor.life = 0;
    });
    this.meteors.push(meteor);
  }
  _destroyMeteor(m) {
    if (m.dead) return;
    m.dead = true;
    if (m.mesh?.parent) m.mesh.parent.remove(m.mesh);
    m.mesh?.geometry?.dispose();
    m.mesh?.material?.dispose();
    if (m.body) this.level.physics.remove(m.body);
    if (this.level.fx?.particles?.burst) {
      this.level.fx.particles.burst(m.body.position.x, m.body.position.y, 0, { count: 10, speed: 6, color: 0xff7733 });
    }
  }
  destroy() {
    for (const m of this.meteors) this._destroyMeteor(m);
    this.meteors.length = 0;
  }
}
```

- [ ] **Step 2: Wire into Level**

In `Level.js`, top:
```js
import { MeteorShower } from './space/MeteorShower.js';
```

In `_build()`, after planets are built:
```js
    if (this.meteorShowerCfg) this.meteorShower = new MeteorShower(this, this.meteorShowerCfg);
```

In `update(dt, players)`, near where hazards tick, add:
```js
    if (this.meteorShower) this.meteorShower.update(dt);
```

In `destroy()`:
```js
    if (this.meteorShower) { this.meteorShower.destroy(); this.meteorShower = null; }
```

- [ ] **Step 3: Verify**

```cmd
node --check "src/levels/space/MeteorShower.js"
node --check "src/levels/Level.js"
```

Preview eval — fast-forward 32 s of match time, then count meteors after a few seconds:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  // Skip the meteor activation gate.
  window.game.level.meteorShower.t = 30;
  window.game.level.meteorShower.nextShowerAt = 30;
  await new Promise(r=>setTimeout(r,300));
  return { active: window.game.level.meteorShower.meteors.length };
})()
```

EXPECT `active >= 1`.

- [ ] **Step 4: Commit**

```cmd
git add src/levels/space/MeteorShower.js src/levels/Level.js
git commit -m "feat(space): meteor showers gated to 30s match-mark"
```

---

## Task 10 — Background art (stars, nebula, gas giant)

**Files:**
- Modify: `src/levels/definitions.js` (the `space` entry's `background` array)

- [ ] **Step 1: Populate `background`**

Replace `background: [],` in the space level entry with:

```js
    background: [
      // Distant gas giant + halo (decorative; not gravity-active).
      bgSphere(-32, 22, 8, 0x2a4a8a, -18, { emissive: 0x102040, emissiveIntensity: 0.3 }),
      bgDisc(-32, 22, 11, 0x4070cc, -18.2, { emissiveIntensity: 0.18 }),
      // Nebula bands.
      bgGlow(0, 18, 50, 1.4, 0x4d4080, -16),
      bgGlow(8, 12, 32, 1.0, 0x803060, -16),
      // Stars (~60).
      ...(() => {
        const stars = [];
        const seeds = [
          [-40, 14], [-36, 26], [-30, -22], [-22, 4], [-18, 28], [-12, -28], [-8, 18],
          [-2, 30], [4, -20], [10, 24], [16, -10], [22, 30], [28, 8], [34, -16],
          [40, 22], [44, -4], [-44, -10], [-26, 20], [-14, 14], [-6, -12], [2, 12],
          [12, 30], [20, -28], [26, 18], [32, -8], [38, 14], [-38, 8], [-20, -16],
          [0, -8], [6, 26], [14, -22], [22, 12], [30, -28], [36, 20], [42, -22],
          [-42, 28], [-32, -2], [-24, 10], [-10, 22], [4, -28], [18, 6], [24, -10],
          [-46, -28], [-16, 32], [-4, 6], [10, -16], [20, 28], [34, 4], [46, 10],
          [-28, 32], [-12, -22], [12, 14], [26, -2], [40, -28], [-8, 10], [16, 28],
          [-2, 26], [22, -16], [38, 32], [-46, 14],
        ];
        for (const [x, y] of seeds) {
          stars.push(bgGlow(x, y, 0.18, 0.18, 0xffffff, -17));
        }
        return stars;
      })(),
    ],
```

- [ ] **Step 2: Verify**

```cmd
node --check "src/levels/definitions.js"
```

Reload preview, take a screenshot. Should show: dark space, stars scattered, nebula bands, big gas giant in upper-left.

- [ ] **Step 3: Commit**

```cmd
git add src/levels/definitions.js
git commit -m "feat(space): deep-space background mural — stars, nebula, gas giant"
```

---

## Task 11 — Multiplayer snapshot extension

**Files:**
- Modify: `src/Game.js` (`_snapshot` and `applySnapshot`)

- [ ] **Step 1: Locate `_snapshot` and add quaternion + wedge HP + meteors**

Find `_snapshot()`. After the existing `players` and `tiles` fields, add:

```js
    // Curved-gravity levels also ship player rotation, wedge HP, and meteors.
    if (this.level?.curvedGravity) {
      data.playersQ = this.players.map(p => p ? [p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w] : null);
      data.wedges = [];
      for (const planet of this.level.planets) {
        for (const w of planet.wedges) {
          if (w.hp < w.maxHp) data.wedges.push([planet.id, w.kind, w.idx, w.hp]);
        }
      }
      data.meteors = (this.level.meteorShower?.meteors ?? []).map((m, i) => ([
        i,
        Math.round(m.body.position.x * 100) / 100,
        Math.round(m.body.position.y * 100) / 100,
        Math.round(m.body.velocity.x * 100) / 100,
        Math.round(m.body.velocity.y * 100) / 100,
      ]));
    }
```

(`data` is the existing snapshot object — adapt to whatever local variable name the existing function uses.)

- [ ] **Step 2: Apply on the client**

Find `applySnapshot(snap)`. After existing player position application, add:

```js
    if (snap.playersQ) {
      for (let i = 0; i < snap.playersQ.length; i++) {
        const q = snap.playersQ[i];
        const p = this.players[i];
        if (!p || !q) continue;
        p.body.quaternion.set(q[0], q[1], q[2], q[3]);
      }
    }
    if (snap.wedges) {
      for (const [planetId, kind, idx, hp] of snap.wedges) {
        const planet = this.level.planets?.find(pp => pp.id === planetId);
        if (!planet) continue;
        const w = planet.wedges.find(ww => ww.kind === kind && ww.idx === idx);
        if (w && hp < w.hp) w.damage(w.hp - hp);
      }
    }
    // Meteors are non-authoritative for clients; the host's meteor sim is
    // re-rendered loosely. Skip for v1 — display-only via host events later.
```

- [ ] **Step 3: Verify**

```cmd
node --check "src/Game.js"
```

Run preview:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 0, levelId: 'space' });
  await new Promise(r=>setTimeout(r,400));
  const snap = window.game._snapshot();
  return {
    hasPlayersQ: Array.isArray(snap.playersQ),
    hasWedges: Array.isArray(snap.wedges),
    hasMeteors: Array.isArray(snap.meteors),
  };
})()
```

EXPECT `{ hasPlayersQ: true, hasWedges: true, hasMeteors: true }`.

- [ ] **Step 4: Commit**

```cmd
git add src/Game.js
git commit -m "feat(space): snapshot extension — player rotation + wedge HP + meteors"
```

---

## Task 12 — Final smoke + tuning checkpoint

**Files:**
- (none — run-only verification)

- [ ] **Step 1: Run a 10-second match smoke**

In preview:

```js
(async () => {
  window.game.startLocal({ character: 'bolt', name: 'P1', bots: 3, levelId: 'space' });
  await new Promise(r=>setTimeout(r,3000));
  return {
    fps: window.game._lastFps,
    planets: window.game.level.planets.length,
    alivePlayers: window.game.players.filter(p=>p?.alive).length,
    activeMeteors: window.game.level.meteorShower?.meteors.length ?? 0,
  };
})()
```

EXPECT `fps >= 70`, `planets: 6`, `alivePlayers: 4`, `activeMeteors: 0` (still pre-30s).

- [ ] **Step 2: Visual smoke**

Take a `preview_screenshot`. Check for:
- 6 planets visible, layered with crust + mantle + glowing core.
- Player capsule on surface, oriented feet-down to its planet.
- Stars + nebula in background.

- [ ] **Step 3: Hand off**

If both checks pass, the level is shippable for v1. Capture any tuning observations (rotation feel, gravity strength, meteor spawn cadence) for follow-up.

- [ ] **Step 4: Commit (no-op or tuning tweaks)**

If any tuning was applied:
```cmd
git add -A
git commit -m "tune(space): playtest adjustments"
```

If no changes, skip.

- [ ] **Step 5: Push to GitHub**

```cmd
git push
```

Railway auto-redeploys on push (if hooked). Otherwise `railway up`.

---

## Out of scope (deferred to future plans)

- Smarter bot AI on curved surfaces.
- Force-Push / Force-Choke directional remap for curved-gravity levels.
- Per-themed planets (lava aura, ice slip, mine explosions).
- Wormholes / cosmic events beyond meteors.
- Visible halo rings around each planet for player guidance (UX add-on).
- Snapshot-driven meteor render on clients (Task 11 punted client meteor sync — host-only for v1).

---

## Self-review notes

- Spec sections 1–10 each map to a task: gravity (Task 4), planet geometry (Tasks 2–3), player movement (Task 5), body rotation (Task 6), projectile arcs (Task 4), meteors (Task 9), camera (Task 7), kill bound (Task 8), background (Task 10), multiplayer (Task 11). ✓
- Method signatures used in later tasks match earlier definitions: `Planet.haloRadius`, `wedge.damage`, `wedge.destroy`, `_currentPlanet`, `_currentPlanetRef`, `level.killBound`, `level.meteorShower`. ✓
- No "TBD" / "implement later" / "similar to Task N" placeholders. ✓
- Task 7's stash of `this.camera._level` is admittedly a small smell — could be cleaned up later by giving `GameCamera` a proper `setLevel(level)` setter. Not a placeholder; just a callout.
