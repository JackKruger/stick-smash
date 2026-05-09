import * as THREE from 'three';
import { damp, clamp } from '../util/math.js';

// Side-on chase camera. 2.5D plane (x,y), small z offset for depth.
export class GameCamera {
  constructor(camera) {
    this.cam = camera;
    this.target = new THREE.Vector3(0, 2, 0);
    this.center = new THREE.Vector3(0, 2, 0);
    this.shake = 0;
    this.shakeFreq = 30;
    this.zoom = 14;
    this.zoomTarget = 14;
    this.targets = [];
  }

  setTargets(arr) { this.targets = arr; }

  update(dt) {
    // Dynamic frame: average alive targets, expand zoom to fit.
    let cx = 0, cy = 0, n = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of this.targets) {
      if (!t || !t.alive) continue;
      const p = t.position;
      // Skip players who've been flung out of the playable area — keeps the
      // camera framed on the action instead of chasing someone into the sky.
      if (Math.abs(p.x) > 28 || p.y > 30 || p.y < -12) continue;
      cx += p.x; cy += p.y; n++;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    if (n > 0) {
      this.target.set(cx / n, cy / n + 1.2, 0);
      const spreadX = maxX - minX, spreadY = maxY - minY;
      const fitZoom = clamp(Math.max(spreadX * 0.7, spreadY * 1.2) + 10, 12, 28);
      this.zoomTarget = fitZoom;
    }

    this.center.x = damp(this.center.x, this.target.x, 0.0001, dt);
    this.center.y = damp(this.center.y, this.target.y, 0.0005, dt);
    this.zoom = damp(this.zoom, this.zoomTarget, 0.05, dt);
    // Hard clamp so the camera can never wander outside the playable area.
    this.center.x = clamp(this.center.x, -22, 22);
    this.center.y = clamp(this.center.y, -6, 24);

    let sx = 0, sy = 0;
    if (this.shake > 0.001) {
      const t = performance.now() * 0.001;
      sx = Math.sin(t * this.shakeFreq * 1.7) * this.shake;
      sy = Math.cos(t * this.shakeFreq * 1.1) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 6);
    }

    this.cam.position.set(this.center.x + sx, this.center.y + sy + 1, this.zoom);
    this.cam.lookAt(this.center.x + sx * 0.3, this.center.y + sy * 0.3, 0);
  }

  punch(amount = 0.3) { this.shake = Math.min(1.2, this.shake + amount); }
}
