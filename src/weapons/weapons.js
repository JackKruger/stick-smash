import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Weapon } from './Weapon.js';
import { Projectile } from './Projectile.js';
import { audio } from '../audio/Audio.js';
import { rand, TAU } from '../util/math.js';
import { COL_GROUPS } from '../physics/PhysicsWorld.js';

// === MELEE ===

export class Sword extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Katana';
    this.melee = true;
    this.icon = '⚔';
    this.fireDelay = 0.28;
    this.aimWeapon = false;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 12;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.04), new THREE.MeshStandardMaterial({ color: 0xddeeff, metalness: 0.8, roughness: 0.2 }));
    blade.position.x = 0.4;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x331a08 }));
    handle.position.x = -0.05;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.1), new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.7 }));
    guard.position.x = 0.05;
    grp.add(blade, handle, guard);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.22;
    this._swingDur = 0.22;
    this.hits.clear();
    audio.swing();
    player.attackTimer = 0.22;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.22;
      if (phase > 0.2 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.0;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 0.95 * 0.95) {
            p.takeDamage(30, {
              attacker: this.holder, weapon: 'sword',
              kb: { x: this.holder.facing * 14, y: 7 }, stun: 0.3,
            });
            this.hits.add(p.id);
            this.game.fx.particles.blood(p.position.x, p.position.y + 0.5, 0, this.holder.facing, 0.5);
            this.game.fx.camera.punch(0.18);
          }
        }
        this._reflectProjectiles(cx, cy, 1.1);
      }
    }
  }
}

export class Bat extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Bat';
    this.melee = true;
    this.icon = '🏏';
    this.fireDelay = 0.45;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 10;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x9a6a30 }));
    body.rotation.z = Math.PI / 2; body.position.x = 0.3;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    grip.rotation.z = Math.PI / 2; grip.position.x = -0.13;
    grp.add(body, grip);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.3; this._swingDur = 0.3; this.hits.clear(); audio.swing(); player.attackTimer = 0.3;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.3;
      if (phase > 0.3 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.1;
        const cy = this.holder.position.y + 0.15;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.0 * 1.0) {
            p.takeDamage(24, {
              attacker: this.holder, weapon: 'bat',
              kb: { x: this.holder.facing * 22, y: 12 }, stun: 0.4,
            });
            this.hits.add(p.id);
            audio.bonk();
            this.game.fx.camera.punch(0.45);
            this.game.hitStop(0.07);
          }
        }
        // Bat is the BEST projectile reflector — wider arc.
        this._reflectProjectiles(cx, cy, 1.4);
      }
    }
  }
}

// === MEDIEVAL ===

export class Longsword extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Longsword';
    this.melee = true;
    this.icon = '🗡';
    this.fireDelay = 0.36;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 18;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.04), new THREE.MeshStandardMaterial({ color: 0xddddee, metalness: 0.85, roughness: 0.18 }));
    blade.position.x = 0.6;
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.025, 0.045), new THREE.MeshStandardMaterial({ color: 0xb0b0c0, metalness: 0.5 }));
    fuller.position.x = 0.55;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.12), new THREE.MeshStandardMaterial({ color: 0x886633, metalness: 0.7 }));
    guard.position.x = 0.05;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x331a08 }));
    grip.rotation.z = Math.PI / 2; grip.position.x = -0.07;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb8a050, metalness: 0.8 }));
    pommel.position.x = -0.18;
    grp.add(blade, fuller, guard, grip, pommel);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.32; this._swingDur = 0.32; this.hits.clear();
    audio.swing(); audio.beep(420, 0.07, 'square', 0.15);
    player.attackTimer = 0.32;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.32;
      if (phase > 0.22 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.25;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.25 * 1.25) {
            p.takeDamage(42, {
              attacker: this.holder, weapon: 'longsword',
              kb: { x: this.holder.facing * 17, y: 8 }, stun: 0.35,
            });
            this.hits.add(p.id);
            this.game.fx.particles.blood(p.position.x, p.position.y + 0.5, 0, this.holder.facing, 0.5);
            this.game.fx.camera.punch(0.22);
          }
        }
        this._reflectProjectiles(cx, cy, 1.4);
      }
    }
  }
}

export class Mace extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Mace';
    this.melee = true;
    this.icon = '🔨';
    this.fireDelay = 0.5;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 16;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x331a08 }));
    handle.rotation.z = Math.PI / 2; handle.position.x = 0.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.7, roughness: 0.4 }));
    head.position.x = 0.55;
    // Spikes on the mace head
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5), new THREE.MeshStandardMaterial({ color: 0xa0a8b8, metalness: 0.85 }));
      sp.position.set(0.55 + Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0);
      sp.rotation.z = a - Math.PI / 2;
      grp.add(sp);
    }
    grp.add(handle, head);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.42; this._swingDur = 0.42; this.hits.clear();
    audio.bonk();
    player.attackTimer = 0.42;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.42;
      if (phase > 0.32 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.05;
        const cy = this.holder.position.y + 0.15;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 0.9 * 0.9) {
            p.takeDamage(40, {
              attacker: this.holder, weapon: 'mace',
              kb: { x: this.holder.facing * 26, y: 14 }, stun: 0.5,
            });
            this.hits.add(p.id);
            audio.bonk();
            this.game.fx.camera.punch(0.5);
            this.game.hitStop?.(0.09);
            this.game.fx.particles.burst(p.position.x, p.position.y, 0, { count: 18, speed: 8, color: 0xa0a8b8 });
          }
        }
        this._reflectProjectiles(cx, cy, 1.0);
      }
    }
  }
}

export class WarHammer extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'War Hammer';
    this.melee = true;
    this.icon = '⚒';
    this.fireDelay = 0.65;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 25;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a18 }));
    handle.rotation.z = Math.PI / 2; handle.position.x = 0.32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.22), new THREE.MeshStandardMaterial({ color: 0x606870, metalness: 0.65, roughness: 0.45 }));
    head.position.x = 0.78;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.8 }));
    claw.rotation.z = Math.PI / 2; claw.position.x = 0.97;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xb8a050, metalness: 0.7 }));
    cap.rotation.z = Math.PI / 2; cap.position.x = -0.13;
    grp.add(handle, head, claw, cap);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.55; this._swingDur = 0.55; this.hits.clear();
    audio.bonk(); audio.beep(120, 0.18, 'sine', 0.35);
    player.attackTimer = 0.55;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.55;
      if (phase > 0.4 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.15;
        const cy = this.holder.position.y + 0.15;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.05 * 1.05) {
            p.takeDamage(60, {
              attacker: this.holder, weapon: 'hammer',
              kb: { x: this.holder.facing * 32, y: 18 }, stun: 0.7,
            });
            this.hits.add(p.id);
            audio.bonk(); audio.bonk();
            this.game.fx.camera.punch(0.7);
            this.game.hitStop?.(0.14);
            this.game.fx.particles.burst(p.position.x, p.position.y, 0, { count: 24, speed: 10, color: 0xc0c0d0 });
            this.game.fx.particles.smokePuff(p.position.x, p.position.y, 0, 0x666677);
          }
        }
        this._reflectProjectiles(cx, cy, 1.2);
      }
    }
  }
}

export class Halberd extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Halberd';
    this.melee = true;
    this.icon = '⚔';
    this.fireDelay = 0.45;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 16;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a18 }));
    pole.rotation.z = Math.PI / 2; pole.position.x = 0.5;
    // Axe blade
    const axe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.04), new THREE.MeshStandardMaterial({ color: 0xddddee, metalness: 0.85, roughness: 0.2 }));
    axe.position.set(0.95, 0.18, 0);
    // Spike top
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 4), new THREE.MeshStandardMaterial({ color: 0xddddee, metalness: 0.85 }));
    spike.position.x = 1.35;
    spike.rotation.z = Math.PI / 2;
    // Hook
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0x808898, metalness: 0.85 }));
    hook.position.set(0.95, -0.16, 0);
    hook.rotation.z = Math.PI;
    grp.add(pole, axe, spike, hook);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.4; this._swingDur = 0.4; this.hits.clear();
    audio.swing();
    player.attackTimer = 0.4;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.4;
      if (phase > 0.28 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.5;
        const cy = this.holder.position.y + 0.25;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.4 * 1.4) {
            p.takeDamage(38, {
              attacker: this.holder, weapon: 'halberd',
              kb: { x: this.holder.facing * 15, y: 7 }, stun: 0.3,
            });
            this.hits.add(p.id);
            this.game.fx.particles.blood(p.position.x, p.position.y + 0.5, 0, this.holder.facing, 0.5);
            this.game.fx.camera.punch(0.25);
          }
        }
        this._reflectProjectiles(cx, cy, 1.6);
      }
    }
  }
}

// === RANGED ===

export class Pistol extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Pistol';
    this.icon = '🔫';
    this.fireDelay = 0.18;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 12;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.1), new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.6 }));
    body.position.x = 0.25;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    grip.position.set(0.05, -0.18, 0); grip.rotation.z = -0.2;
    grp.add(body, grip);
    this.mesh = grp;
  }
  fire(player) {
    const muzzleX = player.position.x + player.aimDir.x * 0.9;
    const muzzleY = player.position.y + 0.7 + player.aimDir.y * 0.4;
    const speed = 38;
    new Projectile(this.game, {
      x: muzzleX, y: muzzleY, vx: player.aimDir.x * speed, vy: player.aimDir.y * speed,
      damage: 20, owner: player, gravity: false, life: 1.6, radius: 0.08,
      color: 0xffcc33, emissive: 0xffaa00, tracer: true,
    });
    audio.shoot();
    const rec = player.grounded ? 0.5 : 1.4;
    player.body.velocity.x -= player.aimDir.x * rec;
    this.game.fx.particles.burst(muzzleX, muzzleY, 0, { count: 5, speed: 4, color: 0xffaa33 });
    this.game.fx.camera.punch(0.08);
  }
}

export class Shotgun extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Shotgun';
    this.icon = '💥';
    this.fireDelay = 0.6;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 4;
  }
  _buildMesh() {
    const g = new THREE.BoxGeometry(0.85, 0.16, 0.12);
    const m = new THREE.MeshStandardMaterial({ color: 0x553322, metalness: 0.5 });
    const main = new THREE.Mesh(g, m); main.position.x = 0.4;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 10), new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.7 }));
    barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.4; barrel.position.y = 0.05;
    const grp = new THREE.Group(); grp.add(main, barrel);
    this.mesh = grp;
  }
  fire(player) {
    const ax = player.aimDir.x, ay = player.aimDir.y;
    for (let i = 0; i < 7; i++) {
      const a = Math.atan2(ay, ax) + rand(-0.2, 0.2);
      const sp = rand(28, 36);
      new Projectile(this.game, {
        x: player.position.x + ax * 0.9, y: player.position.y + 0.7 + ay * 0.3,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        damage: 14, owner: player, gravity: false, life: 0.6, radius: 0.07,
        color: 0xffaa33, tracer: true,
      });
    }
    // Strong recoil — shotgun blast. Tame on ground, big in air.
    const rec = player.grounded ? 3 : 8;
    player.body.velocity.x -= ax * rec;
    if (!player.grounded) player.body.velocity.y -= ay * 4;
    audio.shoot(); audio.shoot();
    this.game.fx.particles.burst(player.position.x + ax, player.position.y + 0.7, 0, { count: 12, speed: 6, color: 0xff8833 });
    this.game.fx.camera.punch(0.3);
  }
}

export class Minigun extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Minigun';
    this.icon = '🧨';
    this.fireDelay = 0.05;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 60;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.18), new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.5 }));
    body.position.x = 0.35;
    const barrels = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.8 }));
    barrels.rotation.z = Math.PI / 2; barrels.position.x = 0.7;
    grp.add(body, barrels);
    this.mesh = grp;
  }
  fire(player) {
    const a = Math.atan2(player.aimDir.y, player.aimDir.x) + rand(-0.06, 0.06);
    new Projectile(this.game, {
      x: player.position.x + player.aimDir.x * 1, y: player.position.y + 0.7 + player.aimDir.y * 0.3,
      vx: Math.cos(a) * 42, vy: Math.sin(a) * 42, damage: 9, owner: player,
      gravity: false, life: 1.2, radius: 0.06, color: 0xffcc33, tracer: true,
    });
    const rec = player.grounded ? 0.15 : 0.45;
    player.body.velocity.x -= player.aimDir.x * rec;
    audio.shoot();
    this.game.fx.camera.punch(0.04);
  }
}

export class Bow extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Bow';
    this.icon = '🏹';
    this.fireDelay = 0.7;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 10;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6a3a18 }));
    arc.rotation.z = Math.PI / 2; arc.position.x = 0.1;
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.01, 0.01), new THREE.MeshStandardMaterial({ color: 0xddd8c8 }));
    string.position.x = 0.1;
    grp.add(arc, string);
    this.mesh = grp;
  }
  fire(player) {
    // Arrow with mild bullet drop — gravity on, scaled down so arc is gentle.
    const proj = new Projectile(this.game, {
      x: player.position.x + player.aimDir.x * 0.9, y: player.position.y + 0.7 + player.aimDir.y * 0.4,
      vx: player.aimDir.x * 32, vy: player.aimDir.y * 32, damage: 45, owner: player,
      gravity: true, gravityScale: 0.5, life: 2.2, radius: 0.06, color: 0xc8a85c, tracer: true,
      mesh: { geometry: new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), material: new THREE.MeshStandardMaterial({ color: 0xc8a85c }) },
    });
    // Spin so visual arrow aligns with velocity each frame
    proj._orientToVel = true;
    audio.shoot();
  }
}

// === EXPLOSIVES ===

export class Grenade extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Grenade';
    this.icon = '🧨';
    this.fireDelay = 0.5;
    this.aimWeapon = true;
    this.ammo = 3;
  }
  _buildMesh() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: 0x305030, roughness: 0.8 }));
    this.mesh = m;
  }
  fire(player) {
    const proj = new Projectile(this.game, {
      x: player.position.x + player.aimDir.x * 0.6, y: player.position.y + 0.7 + player.aimDir.y * 0.3,
      vx: player.aimDir.x * 18 + player.body.velocity.x * 0.5,
      vy: player.aimDir.y * 18 + 4,
      damage: 0, owner: player,
      gravity: true, life: 1.6, radius: 0.18,
      explosive: true, color: 0x305030,
      mesh: { geometry: new THREE.SphereGeometry(0.18, 12, 8), material: new THREE.MeshStandardMaterial({ color: 0x305030 }) },
    });
    proj.body.angularVelocity.set(0, 0, rand(-10, 10));
    audio.click();
  }
}

export class RPG extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'RPG';
    this.icon = '🚀';
    this.fireDelay = 1.2;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 1;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 }));
    tube.rotation.z = Math.PI / 2; tube.position.x = 0.4;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 0.85;
    grp.add(tube, tip);
    this.mesh = grp;
  }
  fire(player) {
    new Projectile(this.game, {
      x: player.position.x + player.aimDir.x * 0.9, y: player.position.y + 0.7 + player.aimDir.y * 0.3,
      vx: player.aimDir.x * 28, vy: player.aimDir.y * 28, damage: 0, owner: player,
      gravity: false, life: 2.2, radius: 0.15,
      explosive: true, explodeOnContact: true, color: 0xff4d6d, emissive: 0xaa0030,
      mesh: { geometry: new THREE.ConeGeometry(0.13, 0.5, 8).rotateZ(-Math.PI / 2), material: new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff4d6d, emissiveIntensity: 0.5 }) },
    });
    // RPG recoil — meaningful kick on ground, big in air for rocket-jumps.
    const rec = player.grounded ? 4 : 8;
    player.body.velocity.x -= player.aimDir.x * rec;
    if (!player.grounded) player.body.velocity.y -= player.aimDir.y * 5;
    audio.shoot(); audio.explode();
    this.game.fx.camera.punch(0.4);
  }
}

// === FUNNY ===

export class RubberChicken extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Chicken';
    this.melee = true;
    this.lungeSpeed = 9;
    this.icon = '🐔';
    this.fireDelay = 0.5;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 5;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffeecc }));
    body.scale.set(1.6, 1, 1); body.position.x = 0.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffeecc }));
    head.position.set(0.55, 0.18, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xff9933 }));
    beak.rotation.z = -Math.PI / 2; beak.position.set(0.7, 0.15, 0);
    const comb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
    comb.position.set(0.55, 0.3, 0);
    grp.add(body, head, beak, comb);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.4; this._swingDur = 0.4; this.hits.clear();
    [880, 660, 990, 770].forEach((f, i) => setTimeout(() => audio.beep(f, 0.06, 'square', 0.25), i * 60));
    player.attackTimer = 0.4;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.4;
      // visual wiggle
      this.mesh.rotation.z += Math.sin(phase * 30) * 0.4 * dt;
      if (phase > 0.2 && phase < 0.7) {
        const cx = this.holder.position.x + this.holder.facing * 0.9;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 0.9 * 0.9) {
            // huge knockback, low damage — comedy weapon
            p.takeDamage(2, {
              attacker: this.holder, weapon: 'chicken',
              kb: { x: this.holder.facing * 30, y: 18 }, stun: 0.5,
            });
            this.hits.add(p.id);
            this.game.fx.particles.burst(p.position.x, p.position.y, 0, { count: 16, speed: 7, color: 0xffeecc });
          }
        }
        this._reflectProjectiles(cx, cy, 1.0);
      }
    }
  }
}

export class Boomerang extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Boomerang';
    this.icon = '🪃';
    this.fireDelay = 0.8;
    this.aimWeapon = true;
    this.ammo = 5;
  }
  _buildMesh() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(0.3, 0.4, 0.6, 0); shape.quadraticCurveTo(0.3, 0.1, 0, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    g.translate(-0.3, 0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc88240 }));
  }
  fire(player) {
    const ax = player.aimDir.x, ay = player.aimDir.y;
    const proj = new Projectile(this.game, {
      x: player.position.x + ax * 0.6, y: player.position.y + 0.7 + ay * 0.3,
      vx: ax * 26, vy: ay * 26, damage: 26, owner: player,
      gravity: false, life: 1.6, radius: 0.1, color: 0xc88240,
      mesh: { geometry: new THREE.TorusGeometry(0.18, 0.04, 6, 12, Math.PI), material: new THREE.MeshStandardMaterial({ color: 0xc88240 }) },
    });
    proj.body.angularVelocity.set(0, 25, 0);
    audio.swing();
  }
}

export class FishSlap extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Trout';
    this.melee = true;
    this.lungeSpeed = 10;
    this.icon = '🐟';
    this.fireDelay = 0.35;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 6;
  }
  _buildMesh() {
    const g = new THREE.SphereGeometry(0.18, 10, 8);
    g.scale(2.2, 1, 0.6);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5a7aaa, metalness: 0.4, roughness: 0.5 }));
    m.position.x = 0.3;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x405066 }));
    tail.rotation.z = Math.PI / 2; tail.position.x = -0.05;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    eye.position.set(0.6, 0.05, 0.1);
    const grp = new THREE.Group(); grp.add(m, tail, eye);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.25; this._swingDur = 0.25; this.hits.clear();
    audio.swing();
    player.attackTimer = 0.25;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.25;
      if (phase > 0.3 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 0.95;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 0.9 * 0.9) {
            p.takeDamage(10, {
              attacker: this.holder, weapon: 'fish',
              kb: { x: this.holder.facing * 16, y: 9 }, stun: 0.35,
            });
            this.hits.add(p.id);
            audio.beep(220, 0.08, 'sine', 0.2);
            this.game.fx.particles.burst(p.position.x, p.position.y + 0.5, 0, { count: 8, speed: 4, color: 0x6a8acc });
          }
        }
        this._reflectProjectiles(cx, cy, 0.95);
      }
    }
  }
}

// === POWER-UPS ===

export class HealthPack {
  constructor(game) {
    this.game = game;
    this.kind = 'pickup-health';
    this.icon = '❤';
    const grp = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x440000 }));
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.41), new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff4d6d, emissiveIntensity: 0.5 }));
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.41), new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff4d6d, emissiveIntensity: 0.5 }));
    grp.add(box, cross1, cross2);
    this.mesh = grp;
    this.life = 30;
  }
  spawnAt(x, y, z = 0) {
    this.game.scene.add(this.mesh);
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  worldTick(dt) {
    this.mesh.position.set(this.x, this.y + Math.sin(performance.now() * 0.003) * 0.1, this.z);
    this.mesh.rotation.y += dt * 1.5;
    this.life -= dt;
    if (this.life <= 0) this.destroy();
  }
  tryPickup(player) {
    if (player.health >= player.maxHealth) return false;
    const dx = player.position.x - this.x, dy = player.position.y - this.y;
    if (dx * dx + dy * dy < 0.7 * 0.7) {
      player.health = Math.min(player.maxHealth, player.health + 50);
      audio.pickup();
      this.game.fx.particles.burst(this.x, this.y, 0, { count: 12, color: 0xff4d6d });
      this.destroy();
      return true;
    }
    return false;
  }
  destroy() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.dead = true;
  }
}

export class SpeedBoost {
  constructor(game) {
    this.game = game;
    this.kind = 'pickup-speed';
    this.icon = '⚡';
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0x66e2a3, emissive: 0x66e2a3, emissiveIntensity: 0.7 }));
    this.mesh = m;
    this.life = 30;
  }
  spawnAt(x, y, z = 0) { this.game.scene.add(this.mesh); this.x = x; this.y = y; this.z = z; return this; }
  worldTick(dt) {
    this.mesh.position.set(this.x, this.y + Math.sin(performance.now() * 0.003) * 0.1, this.z);
    this.mesh.rotation.y += dt * 2;
    this.life -= dt;
    if (this.life <= 0) this.destroy();
  }
  tryPickup(player) {
    const dx = player.position.x - this.x, dy = player.position.y - this.y;
    if (dx * dx + dy * dy < 0.7 * 0.7) {
      player.speedBoostUntil = performance.now() + 6000;
      audio.pickup();
      this.game.fx.particles.burst(this.x, this.y, 0, { count: 12, color: 0x66e2a3 });
      this.destroy();
      return true;
    }
    return false;
  }
  destroy() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.dead = true; }
}

export class ArmorPlate {
  constructor(game) {
    this.game = game;
    this.kind = 'pickup-armor';
    this.icon = '🛡';
    const grp = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.18), new THREE.MeshStandardMaterial({ color: 0xa0a8b8, metalness: 0.7, roughness: 0.4 }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.19), new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffcc33, emissiveIntensity: 0.4 }));
    grp.add(plate, stripe);
    this.mesh = grp;
    this.life = 30;
  }
  spawnAt(x, y, z = 0) { this.game.scene.add(this.mesh); this.x = x; this.y = y; this.z = z; return this; }
  worldTick(dt) {
    this.mesh.position.set(this.x, this.y + Math.sin(performance.now() * 0.003) * 0.1, this.z);
    this.mesh.rotation.y += dt * 1.5;
    this.life -= dt;
    if (this.life <= 0) this.destroy();
  }
  tryPickup(player) {
    if (player.armor >= player.maxArmor) return false;
    const dx = player.position.x - this.x, dy = player.position.y - this.y;
    if (dx * dx + dy * dy < 0.7 * 0.7) {
      player.armor = Math.min(player.maxArmor, player.armor + 30);
      audio.pickup();
      this.game.fx.particles.burst(this.x, this.y, 0, { count: 12, color: 0xa0a8b8 });
      this.destroy();
      return true;
    }
    return false;
  }
  destroy() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.dead = true; }
}

export class Shield {
  constructor(game) {
    this.game = game;
    this.kind = 'pickup-shield';
    this.icon = '🛡';
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: 0x4d9fff, emissive: 0x4d9fff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }));
    this.mesh = m;
    this.life = 30;
  }
  spawnAt(x, y, z = 0) { this.game.scene.add(this.mesh); this.x = x; this.y = y; this.z = z; return this; }
  worldTick(dt) {
    this.mesh.position.set(this.x, this.y + Math.sin(performance.now() * 0.003) * 0.1, this.z);
    this.mesh.rotation.y += dt * 1.5;
    this.life -= dt;
    if (this.life <= 0) this.destroy();
  }
  tryPickup(player) {
    const dx = player.position.x - this.x, dy = player.position.y - this.y;
    if (dx * dx + dy * dy < 0.7 * 0.7) {
      player.invuln = Math.max(player.invuln, 5);
      audio.pickup();
      this.game.fx.particles.burst(this.x, this.y, 0, { count: 16, color: 0x4d9fff });
      this.destroy();
      return true;
    }
    return false;
  }
  destroy() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.dead = true; }
}

// === SUPER WEAPONS — rare, dramatic ===

// === LIGHTSABER ===

const SABER_COLORS = [0x4d9fff, 0x66e2a3, 0xff4d6d, 0xb24dff, 0xffcc33];

export class Lightsaber extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Lightsaber';
    this.melee = true;
    this.lungeSpeed = 14;
    this.icon = '⚔';
    this.fireDelay = 0.22;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 22;
    this.bladeColor = SABER_COLORS[Math.floor(Math.random() * SABER_COLORS.length)];
    if (this._blade) this._blade.material.color.setHex(this.bladeColor);
    if (this._blade) this._blade.material.emissive.setHex(this.bladeColor);
    this._thrownProj = null;
    this._thrownCooldown = 0;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const c = 0x4d9fff;
    const bladeGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.06, 0.95, 4, 8)
      : new THREE.BoxGeometry(0.10, 0.95, 0.10);
    const blade = new THREE.Mesh(
      bladeGeo,
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, transparent: true, opacity: 0.92 }),
    );
    blade.rotation.z = Math.PI / 2;
    blade.position.x = 0.5;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.85, roughness: 0.3 }));
    hilt.rotation.z = Math.PI / 2; hilt.position.x = -0.05;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 6, 12), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 }));
    ring.rotation.y = Math.PI / 2; ring.position.x = 0.05;
    grp.add(blade, hilt, ring);
    this.mesh = grp;
    this._blade = blade;
  }
  fire(player) {
    if (this._thrownProj) return; // can't swing while saber is thrown
    this.swingTimer = 0.25; this._swingDur = 0.25; this.hits.clear();
    audio.swing(); audio.beep(880, 0.06, 'sine', 0.2);
    player.attackTimer = 0.25;
  }
  altFire(player) {
    // Saber Throw — fly out, return.
    if (this._thrownProj || this._thrownCooldown > 0) return;
    this._thrownCooldown = 1.0;
    const ax = player.aimDir.x, ay = player.aimDir.y;
    const owner = player;
    const game = this.game;
    const blade = this;
    this.mesh.visible = false; // saber leaves the hand visually
    const proj = new Projectile(this.game, {
      x: player.position.x + ax * 0.6, y: player.position.y + 0.6 + ay * 0.3,
      vx: ax * 28, vy: ay * 28, damage: 36, owner: player,
      gravity: false, life: 2.0, radius: 0.1,
      color: this.bladeColor, emissive: this.bladeColor,
      mesh: { geometry: new THREE.BoxGeometry(0.95, 0.10, 0.10), material: new THREE.MeshStandardMaterial({ color: this.bladeColor, emissive: this.bladeColor, emissiveIntensity: 2 }) },
    });
    proj.body.angularVelocity.set(0, 0, 30);
    this._thrownProj = proj;
    let t = 0;
    const orig = proj.update.bind(proj);
    proj.update = (dt) => {
      t += dt;
      if (!proj.dead && owner.alive) {
        const dx = owner.position.x - proj.body.position.x;
        const dy = (owner.position.y + 0.65) - proj.body.position.y;
        const d = Math.hypot(dx, dy);
        const homing = Math.min(1, t * 1.2);
        if (homing > 0) {
          const f = 80 * dt * homing;
          proj.body.velocity.x += (dx / Math.max(0.1, d)) * f;
          proj.body.velocity.y += (dy / Math.max(0.1, d)) * f;
        }
        if (t > 0.4 && d < 0.9) {
          // Caught — restore saber to hand.
          blade._thrownProj = null;
          blade.mesh.visible = true;
          proj.destroy();
        }
      }
      orig(dt);
    };
    audio.sweep(1500, 600, 0.25, 'sine', 0.25);
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this._thrownCooldown > 0) this._thrownCooldown -= dt;
    // If thrown projectile died (timed out / hit something), restore mesh.
    if (this._thrownProj && this._thrownProj.dead) {
      this._thrownProj = null;
      this.mesh.visible = true;
    }
    if (this._blade) this._blade.material.emissiveIntensity = 1.8 + Math.sin(performance.now() * 0.025) * 0.4;
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.25;
      if (phase > 0.18 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.05;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.1 * 1.1) {
            p.takeDamage(48, {
              attacker: this.holder, weapon: 'saber',
              kb: { x: this.holder.facing * 16, y: 8 }, stun: 0.3,
            });
            this.hits.add(p.id);
            this.game.fx.particles.burst(p.position.x, p.position.y + 0.4, 0, { count: 12, speed: 6, color: this.bladeColor });
            this.game.fx.camera.punch(0.2);
            audio.beep(660, 0.06, 'square', 0.25);
          }
        }
        this._reflectProjectiles(cx, cy, 1.2);
      }
    }
  }
}

export class FlameSword extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Flame Sword';
    this.melee = true;
    this.lungeSpeed = 13;
    this.icon = '🔥';
    this.fireDelay = 0.3;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 20;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.09, 0.05), new THREE.MeshStandardMaterial({ color: 0xff8833, emissive: 0xff5500, emissiveIntensity: 1.5 }));
    blade.position.x = 0.45;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x331a08 }));
    handle.position.x = -0.05;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400 }));
    guard.position.x = 0.05;
    grp.add(blade, handle, guard);
    this.mesh = grp;
    this._blade = blade;
  }
  fire(player) {
    this.swingTimer = 0.28; this._swingDur = 0.28; this.hits.clear();
    audio.swing(); audio.beep(180, 0.15, 'sawtooth', 0.25);
    player.attackTimer = 0.28;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this._blade) this._blade.material.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.02) * 0.4;
    if (this.holder) {
      // Trail flame particles from blade tip while held
      if (Math.random() < dt * 8) {
        this.game.fx.particles.spark.spawn({
          x: this.mesh.position.x + Math.cos(this.mesh.rotation.z) * 0.4,
          y: this.mesh.position.y + Math.sin(this.mesh.rotation.z) * 0.4,
          z: 0, vx: rand(-1, 1), vy: rand(0.5, 2),
          life: 0.4, size: 0.18, color: rand() < 0.5 ? 0xffaa33 : 0xff5500,
          gravity: -2, drag: 0.7, shrink: 1,
        });
      }
    }
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.28;
      if (phase > 0.2 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.05;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.1 * 1.1) {
            p.takeDamage(40, {
              attacker: this.holder, weapon: 'flame',
              kb: { x: this.holder.facing * 18, y: 9 }, stun: 0.35,
            });
            // Burn DoT — apply via repeated small ticks
            p._burnUntil = performance.now() + 2500;
            p._burnSrc = this.holder;
            this.hits.add(p.id);
            this.game.fx.particles.burst(p.position.x, p.position.y + 0.4, 0, { count: 14, speed: 5, color: 0xff5500 });
            this.game.fx.camera.punch(0.25);
            this.game.hitStop(0.04);
          }
        }
        this._reflectProjectiles(cx, cy, 1.2);
      }
    }
  }
}

export class IceSword extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Ice Sword';
    this.melee = true;
    this.lungeSpeed = 13;
    this.icon = '❄';
    this.fireDelay = 0.3;
    this.swingTimer = 0;
    this.hits = new Set();
    this.tileSwingDmg = 20;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.09, 0.05), new THREE.MeshStandardMaterial({ color: 0x9bdcff, emissive: 0x4d9fff, emissiveIntensity: 1.0, metalness: 0.4, transparent: true, opacity: 0.85 }));
    blade.position.x = 0.45;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x182040 }));
    handle.position.x = -0.05;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x4d9fff, emissive: 0x4d9fff }));
    guard.position.x = 0.05;
    grp.add(blade, handle, guard);
    this.mesh = grp;
  }
  fire(player) {
    this.swingTimer = 0.28; this._swingDur = 0.28; this.hits.clear();
    audio.swing(); audio.beep(880, 0.12, 'sine', 0.2);
    player.attackTimer = 0.28;
  }
  worldTick(dt) {
    super.worldTick(dt);
    if (this.swingTimer > 0 && this.holder) {
      this.swingTimer -= dt;
      const phase = 1 - this.swingTimer / 0.28;
      if (phase > 0.2 && phase < 0.85) {
        const cx = this.holder.position.x + this.holder.facing * 1.05;
        const cy = this.holder.position.y + 0.2;
        for (const p of this.game.players) {
          if (!p || p === this.holder || !p.alive || p.invuln > 0) continue;
          if (this.hits.has(p.id)) continue;
          const dx = p.position.x - cx, dy = p.position.y - cy;
          if (dx * dx + dy * dy < 1.1 * 1.1) {
            p.takeDamage(30, {
              attacker: this.holder, weapon: 'ice',
              kb: { x: this.holder.facing * 8, y: 5 }, stun: 1.2,
            });
            p._frozenUntil = performance.now() + 1500;
            this.hits.add(p.id);
            this.game.fx.particles.burst(p.position.x, p.position.y + 0.4, 0, { count: 18, speed: 5, color: 0x9bdcff });
            this.game.fx.camera.punch(0.2);
          }
        }
        this._reflectProjectiles(cx, cy, 1.2);
      }
    }
  }
}

// =============================================================================
// KAMEHAMEHA — anime-faithful charge → release.
// Lifecycle:
//   1. tryFire (trigger press): start CHARGE phase. Player aim is locked,
//      movement frozen, a small energy orb appears between the hands.
//   2. CHARGE (~1.6s): orb grows + brightens, audio rises in pitch, particle
//      wisps stream INTO the orb, camera tremors with charge progress.
//   3. RELEASE (instant): big bang, screen shake, ring-burst particles, heavy
//      backward recoil — player gets visibly slammed back as the beam fires.
//   4. FIRE (~1.4s): wide multi-stream beam. Center lane is a fat high-damage
//      core; two outer lanes are thinner wisps for thickness. Continuous
//      recoil push and frequent screen shakes throughout.
//   5. END: dispose orb meshes, decrement ammo, drop the now-empty technique.
//
// Aim is locked at the moment of charge start so the technique commits the
// shooter to one direction (canonically Goku doesn't track during the move).
// ============================================================================
export class Kamehameha extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Kamehameha';
    this.icon = '☄';
    // Long base cooldown so the trigger can't re-fire while a charge cycle
    // is in progress. The cycle itself takes ~3s (charge + fire + grace).
    this.fireDelay = 4.0;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 1;

    this.charging = false;
    this.firing = false;
    this.chargeT = 0;
    this.chargeDur = 1.6;
    this.fireT = 0;
    this.fireDur = 1.4;
    this._beamAccum = 0;
    this._lockedAim = null;
    this._chargeMesh = null;
    this._haloMesh = null;
  }
  _buildMesh() {
    // Idle pickup mesh — small inert orb the carrier holds.
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x4dccff, emissiveIntensity: 1.4 }),
    );
    this.mesh = m;
  }

  // Defer ammo decrement to release-end so the weapon survives the charge.
  // Without this, ammo=1 would destroy the weapon mid-charge after fire().
  tryFire(player) {
    if (this.cooldown > 0) return;
    if (this.charging || this.firing) return;
    this.cooldown = this.fireDelay;
    this.fire(player);
    // Note: ammo is NOT decremented here. _endFire handles it.
  }

  fire(player) {
    this.charging = true;
    this.chargeT = 0;
    // Lock aim at charge start — the move commits the shooter.
    this._lockedAim = { x: player.aimDir.x, y: player.aimDir.y };
    // Lock player movement + attack input for the full cycle.
    const lockMs = (this.chargeDur + this.fireDur + 0.1) * 1000;
    player._frozenUntil = performance.now() + lockMs;
    player.attackTimer = (this.chargeDur + this.fireDur) * 1.05;
    // Energy orb at the hands.
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xeaffff, emissive: 0x66ccff, emissiveIntensity: 3.0,
      transparent: true, opacity: 0.95,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), orbMat);
    this.game.scene.add(orb);
    this._chargeMesh = orb;
    // Outer halo for additive bloom feel.
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x44aaff, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.4, depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), haloMat);
    this.game.scene.add(halo);
    this._haloMesh = halo;
    // Rising hum building toward release.
    audio.sweep(120, 700, this.chargeDur, 'sawtooth', 0.3);
    this.game.fx.camera.punch(0.10);
  }

  worldTick(dt) {
    super.worldTick(dt);
    // If the holder vanished mid-cycle (death, drop) abort cleanly.
    if ((this.charging || this.firing) && (!this.holder || !this.holder.alive)) {
      this._endFire();
      return;
    }
    if (!this.holder) return;
    const p = this.holder;
    const ax = this._lockedAim?.x ?? p.aimDir.x;
    const ay = this._lockedAim?.y ?? p.aimDir.y;
    const handX = p.position.x + ax * 0.85;
    const handY = p.position.y + 0.55 + ay * 0.4;

    if (this.charging) {
      this.chargeT += dt;
      const t = Math.min(1, this.chargeT / this.chargeDur);
      // Grow orb 0.4 → 2.8 scale; emissive ramps up.
      const s = 0.4 + 2.4 * t;
      if (this._chargeMesh) {
        this._chargeMesh.position.set(handX, handY, 0);
        this._chargeMesh.scale.setScalar(s);
        this._chargeMesh.material.emissiveIntensity = 3 + t * 5;
      }
      if (this._haloMesh) {
        this._haloMesh.position.set(handX, handY, 0);
        this._haloMesh.scale.setScalar(s * 1.4 + Math.sin(performance.now() * 0.02) * 0.12 * t);
        this._haloMesh.material.opacity = 0.3 + 0.5 * t;
      }
      // Energy wisps streaming INTO the orb — anime convergence effect.
      const wispRate = 0.5 + t * 0.7;
      if (Math.random() < wispRate) {
        const a = rand(0, TAU);
        const r = 1.0 + Math.random() * 1.2;
        this.game.fx.particles.spark.spawn({
          x: handX + Math.cos(a) * r,
          y: handY + Math.sin(a) * r,
          z: 0,
          vx: -Math.cos(a) * r * 4.5,
          vy: -Math.sin(a) * r * 4.5,
          life: 0.35, size: 0.16,
          color: t < 0.5 ? 0x66ccff : 0xaaffff,
          gravity: 0, drag: 0.4, shrink: 0.8,
        });
      }
      // Tremor ramps with charge.
      if (Math.random() < t * 0.35) this.game.fx.camera.punch(0.05 * t);
      // Pin player flat to ground if they're standing.
      if (p.grounded) {
        p.body.velocity.x = 0;
        if (p.body.velocity.y < 0) p.body.velocity.y = 0;
      }
      if (this.chargeT >= this.chargeDur) this._beginRelease(p);
      return;
    }

    if (this.firing) {
      this.fireT += dt;
      const t = Math.min(1, this.fireT / this.fireDur);
      // Beam pacing — emit waves at fixed cadence regardless of frame rate.
      this._beamAccum += dt;
      while (this._beamAccum >= 0.025) {
        this._beamAccum -= 0.025;
        const ox = p.position.x + ax * 1.1;
        const oy = p.position.y + 0.6 + ay * 0.4;
        const perpX = -ay, perpY = ax;
        // 3 lanes — fat core + thinner outer wisps for visual thickness.
        for (let lane = -1; lane <= 1; lane++) {
          const offset = lane * 0.32;
          const isCore = lane === 0;
          new Projectile(this.game, {
            x: ox + perpX * offset, y: oy + perpY * offset,
            vx: ax * 80, vy: ay * 80,
            damage: isCore ? 22 : 11,
            owner: p, gravity: false, life: 0.5, radius: isCore ? 0.42 : 0.22,
            color: 0xeaffff, emissive: 0x66ccff, tracer: true,
            mesh: {
              geometry: new THREE.SphereGeometry(isCore ? 0.44 : 0.24, 12, 10),
              material: new THREE.MeshStandardMaterial({
                color: 0xeaffff, emissive: 0x66ccff, emissiveIntensity: 3.0,
              }),
            },
          });
        }
      }
      // Continuous recoil — visibly slides the player back during the beam.
      p.body.velocity.x -= ax * 0.6;
      if (!p.grounded) p.body.velocity.y -= ay * 0.4;
      // Charge orb fades out as beam fires.
      if (this._chargeMesh) {
        const fade = 1 - t;
        this._chargeMesh.position.set(handX, handY, 0);
        this._chargeMesh.scale.setScalar(2.8 * fade + 0.4);
        this._chargeMesh.material.opacity = 0.95 * fade;
        if (this._haloMesh) {
          this._haloMesh.position.set(handX, handY, 0);
          this._haloMesh.scale.setScalar(3.6 * fade + 0.6);
          this._haloMesh.material.opacity = 0.5 * fade;
        }
      }
      // Frequent shake throughout the beam.
      if (Math.random() < 0.35) this.game.fx.camera.punch(0.16);
      if (this.fireT >= this.fireDur) this._endFire();
    }
  }

  _beginRelease(player) {
    this.charging = false;
    this.firing = true;
    this.fireT = 0;
    this._beamAccum = 0;
    // Big bang — multiple audio layers + heavy shake + hit-stop.
    audio.sweep(1400, 60, 1.2, 'sawtooth', 0.6);
    audio.sweep(220, 60, 1.0, 'sawtooth', 0.4);
    audio.explode();
    this.game.fx.camera.punch(1.0);
    this.game.hitStop(0.12);
    const ax = this._lockedAim.x, ay = this._lockedAim.y;
    // Heavy backward yeet — shooter visibly slammed back at the moment of release.
    if (player.grounded) player.body.velocity.x -= ax * 8;
    else { player.body.velocity.x -= ax * 14; player.body.velocity.y -= ay * 8; }
    // Ring of energy bursting outward at the release point.
    const handX = player.position.x + ax * 0.85;
    const handY = player.position.y + 0.55 + ay * 0.4;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      this.game.fx.particles.spark.spawn({
        x: handX, y: handY, z: 0,
        vx: Math.cos(a) * 16, vy: Math.sin(a) * 16,
        life: 0.6, size: 0.3, color: 0xaaeeff,
        gravity: 0, drag: 0.6, shrink: 1,
      });
    }
  }

  _endFire() {
    this.charging = false;
    this.firing = false;
    if (this._chargeMesh) {
      if (this._chargeMesh.parent) this._chargeMesh.parent.remove(this._chargeMesh);
      this._chargeMesh.geometry.dispose();
      this._chargeMesh.material.dispose();
      this._chargeMesh = null;
    }
    if (this._haloMesh) {
      if (this._haloMesh.parent) this._haloMesh.parent.remove(this._haloMesh);
      this._haloMesh.geometry.dispose();
      this._haloMesh.material.dispose();
      this._haloMesh = null;
    }
    this._lockedAim = null;
    // Now decrement ammo (deferred from tryFire). With ammo=1, this drops
    // the weapon — the technique is single-use per pickup.
    this.ammo--;
    if (this.ammo <= 0 && this.holder) {
      const h = this.holder;
      h.weapon = null;
      this.destroy();
    }
  }

  destroy() {
    // Ensure orb meshes are gone even if destroy() is called before _endFire.
    if (this._chargeMesh) {
      if (this._chargeMesh.parent) this._chargeMesh.parent.remove(this._chargeMesh);
      this._chargeMesh = null;
    }
    if (this._haloMesh) {
      if (this._haloMesh.parent) this._haloMesh.parent.remove(this._haloMesh);
      this._haloMesh = null;
    }
    super.destroy();
  }
}

export class Nuke extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Nuke';
    this.icon = '☢';
    this.fireDelay = 1.0;
    this.aimWeapon = true;
    this.ammo = 1;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7 }));
    tube.rotation.z = Math.PI / 2; tube.position.x = 0.25;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 0.6 }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 0.55;
    grp.add(tube, tip);
    this.mesh = grp;
  }
  fire(player) {
    const ax = player.aimDir.x, ay = player.aimDir.y;
    const proj = new Projectile(this.game, {
      x: player.position.x + ax * 1.0, y: player.position.y + 0.7 + ay * 0.4,
      vx: ax * 22, vy: ay * 22, damage: 0, owner: player,
      gravity: false, life: 4, radius: 0.25,
      explosive: true, explodeOnContact: true, color: 0xff4400, emissive: 0xff8800,
      mesh: { geometry: new THREE.ConeGeometry(0.18, 0.6, 10).rotateZ(-Math.PI / 2), material: new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1 }) },
    });
    // Override explode to be MASSIVE
    const game = this.game;
    proj.explode = function () {
      if (this.dead) return;
      const x = this.body.position.x, y = this.body.position.y;
      // Three concentric particle bursts
      for (let i = 0; i < 60; i++) {
        const a = rand(0, Math.PI * 2);
        game.fx.particles.spark.spawn({
          x, y, z: 0, vx: Math.cos(a) * rand(8, 22), vy: Math.sin(a) * rand(8, 22) + 5,
          life: rand(0.6, 1.2), size: rand(0.15, 0.4), color: rand() < 0.5 ? 0xffaa33 : 0xff4400,
          gravity: -10, drag: 0.6, shrink: 1,
        });
      }
      game.fx.particles.smokePuff(x, y, 0, 0x222222);
      for (let i = 0; i < 20; i++) game.fx.particles.smokePuff(x + rand(-3, 3), y + rand(0, 5), 0, 0x444444);
      game.fx.camera.punch(1.2);
      game.hitStop(0.18);
      audio.explode(); audio.explode(); audio.sweep(60, 20, 0.8, 'sawtooth', 0.5);
      const radius = 9;
      for (const p of game.players) {
        if (!p || !p.alive || p.invuln > 0) continue;
        const dx = p.position.x - x, dy = p.position.y - y;
        const d = Math.hypot(dx, dy);
        if (d < radius) {
          const f = 1 - d / radius;
          const nx = dx / Math.max(0.01, d), ny = dy / Math.max(0.01, d);
          p.takeDamage(120 * f, {
            attacker: this.owner, weapon: 'nuke',
            kb: { x: nx * 35 * f, y: 18 + ny * 18 * f }, stun: 0.7 * f,
          });
        }
      }
      game.level.damageArea(x, y, radius, 200, this);
      this.destroy();
    };
    audio.shoot();
    if (player.grounded) player.body.velocity.x -= ax * 4;
    else { player.body.velocity.x -= ax * 8; player.body.velocity.y -= ay * 6; }
  }
}

export class LightningStaff extends Weapon {
  constructor(game) {
    super(game);
    this.name = 'Lightning';
    this.icon = '⚡';
    this.fireDelay = 0.6;
    this.aimWeapon = true;
    this.poseRight = 'aim';
    this.ammo = 6;
  }
  _buildMesh() {
    const grp = new THREE.Group();
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x442266 }));
    staff.rotation.z = Math.PI / 2; staff.position.x = 0.4;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xeeccff, emissive: 0xb24dff, emissiveIntensity: 1.6 }));
    orb.position.x = 0.85;
    grp.add(staff, orb);
    this.mesh = grp;
  }
  fire(player) {
    // Chain to up-to-3 nearest enemies in a line.
    audio.sweep(2000, 200, 0.2, 'square', 0.3);
    audio.noise(0.15, 0.3, 6000);
    const start = { x: player.position.x + player.aimDir.x * 0.8, y: player.position.y + 0.65 };
    const hit = new Set();
    let prev = start;
    const game = this.game;
    for (let i = 0; i < 3; i++) {
      // Find nearest player not hit, in front.
      let best = null, bestD2 = 12 * 12;
      for (const p of game.players) {
        if (!p || p === player || !p.alive || p.invuln > 0) continue;
        if (hit.has(p.id)) continue;
        const dx = p.position.x - prev.x, dy = p.position.y - prev.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = p; }
      }
      if (!best) break;
      hit.add(best.id);
      // Visual bolt: line of small spheres
      const segs = 8;
      for (let s = 0; s < segs; s++) {
        const t = s / (segs - 1);
        const x = prev.x + (best.position.x - prev.x) * t + rand(-0.15, 0.15);
        const y = prev.y + (best.position.y + 0.4 - prev.y) * t + rand(-0.15, 0.15);
        game.fx.particles.spark.spawn({
          x, y, z: 0, vx: 0, vy: 0, life: 0.18, size: 0.12, color: 0xeeccff, gravity: 0, drag: 0.9, shrink: 1,
        });
      }
      best.takeDamage(22 - i * 4, {
        attacker: player, weapon: 'lightning',
        kb: { x: (best.position.x - prev.x) * 1.2, y: 4 }, stun: 0.25,
      });
      prev = { x: best.position.x, y: best.position.y };
    }
    game.fx.camera.punch(0.2);
  }
}

// === SUPERPOWER PICKUPS ===

class SuperPickup {
  constructor(game, opts) {
    this.game = game;
    this.kind = opts.kind;
    this.icon = opts.icon;
    this.color = opts.color;
    this.duration = opts.duration ?? 5000;
    this.apply = opts.apply;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 1 }));
    this.mesh = m;
    this.life = 30;
  }
  spawnAt(x, y, z = 0) { this.game.scene.add(this.mesh); this.x = x; this.y = y; this.z = z; return this; }
  worldTick(dt) {
    this.mesh.position.set(this.x, this.y + Math.sin(performance.now() * 0.003) * 0.15, this.z);
    this.mesh.rotation.y += dt * 2;
    this.mesh.rotation.x += dt * 1.3;
    this.life -= dt;
    if (this.life <= 0) this.destroy();
  }
  tryPickup(player) {
    const dx = player.position.x - this.x, dy = player.position.y - this.y;
    if (dx * dx + dy * dy < 0.7 * 0.7) {
      this.apply(player, this.duration);
      audio.pickup();
      audio.beep(1320, 0.18, 'square', 0.3);
      this.game.fx.particles.burst(this.x, this.y, 0, { count: 22, speed: 8, color: this.color });
      if (player.isLocal && this.game.hud) this.game.hud.showCenter(this.kind.toUpperCase(), '', 1200);
      this.destroy();
      return true;
    }
    return false;
  }
  destroy() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.dead = true; }
}

export class FlightPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Flight', icon: '🪽', color: 0x9be8ff, duration: 6000,
    apply: (p, d) => { p.flightUntil = performance.now() + d; },
  }); }
}
export class InvisibilityPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Invisibility', icon: '👻', color: 0xaaaaaa, duration: 5000,
    apply: (p, d) => { p.invisibleUntil = performance.now() + d; },
  }); }
}
export class TimeSlowPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Bullet Time', icon: '⏱', color: 0xff4d6d, duration: 4000,
    apply: (p, d) => { p.timeSlowUntil = performance.now() + d; if (p.game) p.game.timeSlowOwner = p; },
  }); }
}
export class SuperPunchPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Super Punch', icon: '👊', color: 0xffcc33, duration: 7000,
    apply: (p, d) => { p.superPunchUntil = performance.now() + d; },
  }); }
}

export class GumGumFruit {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Gum-Gum', icon: '🟣', color: 0xc870ff, duration: 8000,
    apply: (p, d) => { p.gumGumUntil = performance.now() + d; },
  }); }
}

// ===== FORCE POWERS — special key triggers ability while pickup active =====
export class ForcePushPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Force Push', icon: '🌀', color: 0x77aaff, duration: 8000,
    apply: (p, d) => { p.forcePushUntil = performance.now() + d; },
  }); }
}
export class ForcePullPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Force Pull', icon: '🧲', color: 0x4dccff, duration: 8000,
    apply: (p, d) => { p.forcePullUntil = performance.now() + d; },
  }); }
}
export class ForceLightningPower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Force Lightning', icon: '⚡', color: 0xc870ff, duration: 7000,
    apply: (p, d) => { p.forceLightningUntil = performance.now() + d; },
  }); }
}
export class ForceChokePower {
  constructor(game) { return new SuperPickup(game, {
    kind: 'Force Choke', icon: '👐', color: 0xff4d6d, duration: 7000,
    apply: (p, d) => { p.forceChokeUntil = performance.now() + d; },
  }); }
}

// Catalog of all weapons and weighted pool for spawns.
export const WEAPON_CLASSES = [
  Sword, Bat, Pistol, Shotgun, Minigun, Bow, Grenade, RPG, RubberChicken, Boomerang, FishSlap,
  FlameSword, IceSword, Kamehameha, Nuke, LightningStaff, Lightsaber,
  Longsword, Mace, WarHammer, Halberd,
];
export const PICKUP_CLASSES = [
  HealthPack, ArmorPlate, SpeedBoost, Shield,
  FlightPower, InvisibilityPower, TimeSlowPower, SuperPunchPower, GumGumFruit,
  ForcePushPower, ForcePullPower, ForceLightningPower, ForceChokePower,
];

// Spawn table — every entry tagged with a stable `id` (used for the
// player-facing toggle UI's localStorage keys), a `label` (display text),
// and a `cat` (group bucket for the weapon-toggle settings panel).
export const SPAWN_TABLE = [
  // melee
  { cls: Sword,         w: 12,  id: 'sword',        label: 'Katana',        cat: 'melee' },
  { cls: Bat,           w: 10,  id: 'bat',          label: 'Bat',           cat: 'melee' },
  { cls: Longsword,     w: 10,  id: 'longsword',    label: 'Longsword',     cat: 'melee' },
  { cls: Mace,          w: 9,   id: 'mace',         label: 'Mace',          cat: 'melee' },
  { cls: WarHammer,     w: 6,   id: 'warhammer',    label: 'War Hammer',    cat: 'melee' },
  { cls: Halberd,       w: 8,   id: 'halberd',      label: 'Halberd',       cat: 'melee' },
  // ranged
  { cls: Pistol,        w: 16,  id: 'pistol',       label: 'Pistol',        cat: 'ranged' },
  { cls: Shotgun,       w: 10,  id: 'shotgun',      label: 'Shotgun',       cat: 'ranged' },
  { cls: Minigun,       w: 6,   id: 'minigun',      label: 'Minigun',       cat: 'ranged' },
  { cls: Bow,           w: 8,   id: 'bow',          label: 'Bow',           cat: 'ranged' },
  { cls: Grenade,       w: 8,   id: 'grenade',      label: 'Grenade',       cat: 'ranged' },
  { cls: RPG,           w: 4,   id: 'rpg',          label: 'RPG',           cat: 'ranged' },
  // joke
  { cls: RubberChicken, w: 2,   id: 'chicken',      label: 'Rubber Chicken',cat: 'joke' },
  { cls: Boomerang,     w: 5,   id: 'boomerang',    label: 'Boomerang',     cat: 'joke' },
  { cls: FishSlap,      w: 2,   id: 'trout',        label: 'Trout',         cat: 'joke' },
  // super
  { cls: FlameSword,    w: 4,   id: 'flamesword',   label: 'Flame Sword',   cat: 'super' },
  { cls: IceSword,      w: 4,   id: 'icesword',     label: 'Ice Sword',     cat: 'super' },
  { cls: LightningStaff,w: 3,   id: 'lightning',    label: 'Lightning',     cat: 'super' },
  { cls: Kamehameha,    w: 2,   id: 'kamehameha',   label: 'Kamehameha',    cat: 'super' },
  { cls: Nuke,          w: 1.5, id: 'nuke',         label: 'Nuke',          cat: 'super' },
  { cls: Lightsaber,    w: 5,   id: 'lightsaber',   label: 'Lightsaber',    cat: 'super' },
  // pickups
  { cls: HealthPack,    w: 8,   id: 'healthpack',   label: 'Health Pack',   cat: 'pickup' },
  { cls: ArmorPlate,    w: 6,   id: 'armor',        label: 'Armor',         cat: 'pickup' },
  { cls: SpeedBoost,    w: 6,   id: 'speed',        label: 'Speed Boost',   cat: 'pickup' },
  { cls: Shield,        w: 5,   id: 'shield',       label: 'Shield',        cat: 'pickup' },
  // powers
  { cls: FlightPower,       w: 5, id: 'flight',     label: 'Flight',        cat: 'power' },
  { cls: InvisibilityPower, w: 5, id: 'invis',      label: 'Invisibility',  cat: 'power' },
  { cls: TimeSlowPower,     w: 4, id: 'timeslow',   label: 'Time Slow',     cat: 'power' },
  { cls: SuperPunchPower,   w: 5, id: 'superpunch', label: 'Super Punch',   cat: 'power' },
  { cls: GumGumFruit,       w: 4, id: 'gumgum',     label: 'Gum-Gum',       cat: 'power' },
  { cls: ForcePushPower,    w: 5, id: 'forcepush', label: 'Force Push',    cat: 'power' },
  { cls: ForcePullPower,    w: 5, id: 'forcepull', label: 'Force Pull',    cat: 'power' },
  { cls: ForceLightningPower,w: 4,id: 'forcelight',label: 'Force Lightning', cat: 'power' },
  { cls: ForceChokePower,   w: 4, id: 'forcechoke',label: 'Force Choke',   cat: 'power' },
];

// Module-level enabled set. `null` means "all enabled" — the default. The
// weapon-toggle settings panel writes the disabled-set to localStorage and
// calls setEnabledWeapons() on boot. pickRandomSpawn filters by this set
// before doing the weighted draw.
let _disabledIds = new Set();
export function setDisabledWeapons(ids) { _disabledIds = new Set(ids || []); }
export function getDisabledWeapons() { return new Set(_disabledIds); }

export function pickRandomSpawn() {
  // Filter disabled before computing weights so weight sums stay correct.
  const pool = SPAWN_TABLE.filter(e => !_disabledIds.has(e.id));
  // Fallback: if the user disabled literally every spawn, return Pistol so
  // the match still gets weapons (better than spawning nothing forever).
  if (!pool.length) return Pistol;
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= e.w; if (r <= 0) return e.cls; }
  return pool[0].cls;
}
