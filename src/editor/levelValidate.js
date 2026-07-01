import { SPAWN_HALF_H, SPAWN_RADIUS, hasGroundBelow as solverHasGroundBelow } from '../levels/spawnSolver.js';
import { serializeLevel } from './schema.js';

export function validateLevel(level) {
  const def = serializeLevel(level);
  const issues = [];
  const tileMap = buildTileMap(def.tiles);
  const world = { tiles: tileMap, hazards: def.hazards, killBound: def.killBound };

  if (!def.id) error(issues, 'Level id is required.');
  if (!def.name) error(issues, 'Level name is required.');
  if (!def.tiles.length && !def.curvedGravity) warn(issues, 'No tiles are present.');
  if (def.spawns.length < 2) error(issues, 'Add at least two player spawns.');
  if (def.weaponSpawns.length < 1) error(issues, 'Add at least one weapon spawn.');

  validateTiles(def, issues);
  validateHazards(def, issues);
  validateSpawns(def, issues, world, 'player', def.spawns);
  validateSpawns(def, issues, world, 'weapon', def.weaponSpawns);
  validateLevelSafety(def, issues);

  return {
    ok: !issues.some(i => i.severity === 'error'),
    issues,
  };
}

export function buildTileMap(tiles = []) {
  const map = new Map();
  for (const tile of tiles) {
    if ((tile.shape && tile.shape !== 'box') || tile.dynamic) continue;
    const w = tile.w ?? 1;
    const h = tile.h ?? 1;
    const x0 = Math.ceil(tile.x - w / 2);
    const x1 = Math.floor(tile.x + w / 2);
    const y0 = Math.ceil(tile.y - h / 2);
    const y1 = Math.floor(tile.y + h / 2);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) map.set(`${x},${y}`, tile);
    }
  }
  return map;
}

function validateTiles(def, issues) {
  const seen = new Map();
  for (const tile of def.tiles) {
    if (!Number.isFinite(tile.x) || !Number.isFinite(tile.y)) error(issues, 'Tile has invalid coordinates.', tile);
    if ((tile.w ?? 1) <= 0 || (tile.h ?? 1) <= 0 || (tile.d ?? 1) <= 0) error(issues, 'Tile dimensions must be greater than zero.', tile);
    if ((tile.hp ?? 1) <= 0 && !tile.indestructible) warn(issues, 'Tile HP should be greater than zero.', tile);
    const key = `${tile.x},${tile.y}`;
    const prev = seen.get(key);
    if (prev && (tile.shape || 'box') === 'box' && (prev.shape || 'box') === 'box') {
      warn(issues, `Multiple box tiles share ${key}.`, tile);
    }
    seen.set(key, tile);
  }
}

function validateHazards(def, issues) {
  for (const hazard of def.hazards) {
    if (!['lava', 'spike', 'saw', 'pendulum'].includes(hazard.kind)) {
      warn(issues, `Unknown hazard kind "${hazard.kind}".`, hazard);
      continue;
    }
    if (!Number.isFinite(hazard.x) || !Number.isFinite(hazard.y)) error(issues, 'Hazard has invalid coordinates.', hazard);
    if (hazard.kind === 'lava' && ((hazard.w ?? 0) <= 0 || (hazard.h ?? 0) <= 0)) error(issues, 'Lava needs positive width and height.', hazard);
    if (hazard.kind === 'spike' && (hazard.w ?? 0) <= 0) error(issues, 'Spike width must be greater than zero.', hazard);
    if (hazard.kind === 'saw' && ((hazard.radius ?? 0.55) <= 0 || (hazard.w ?? 0) <= 0)) error(issues, 'Saw radius and patrol width must be greater than zero.', hazard);
    if (hazard.kind === 'pendulum' && (hazard.length ?? 0) <= 0) error(issues, 'Pendulum length must be greater than zero.', hazard);
  }
}

function validateSpawns(def, issues, world, label, points) {
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      error(issues, `${capitalize(label)} spawn has invalid coordinates.`, point);
      continue;
    }
    if (spawnOverlapsTile(def.tiles, point)) error(issues, `${capitalize(label)} spawn overlaps terrain.`, point);
    if (spawnOverlapsStaticHazard(def.hazards, point)) error(issues, `${capitalize(label)} spawn overlaps lava or spikes.`, point);
    if (!def.curvedGravity && !solverHasGroundBelow(world, point.x, point.y, 16)) {
      warn(issues, `${capitalize(label)} spawn has no ground within drop range.`, point);
    }
  }
}

function validateLevelSafety(def, issues) {
  const hasKillHazard = def.hazards.some(h => h.kind === 'lava' && (h.dps ?? 0) >= 50);
  if (!hasKillHazard && !def.killBound && !def.curvedGravity) {
    warn(issues, 'No strong kill hazard or kill bounds are configured.');
  }

  const floorYs = [...new Set(def.tiles.filter(t => (t.shape || 'box') === 'box').map(t => Math.round(t.y)))].sort((a, b) => a - b);
  for (let i = 1; i < floorYs.length; i++) {
    const gap = floorYs[i] - floorYs[i - 1];
    if (gap > 0 && gap < 3) {
      warn(issues, `Vertical tier gap ${floorYs[i - 1]} to ${floorYs[i]} is under 3 units.`);
      break;
    }
  }
}

function spawnOverlapsTile(tiles, sp) {
  for (const tile of tiles) {
    if (tile.dynamic) continue;
    const shape = tile.shape || 'box';
    if (shape !== 'box') continue;
    const w = tile.w ?? 1;
    const h = tile.h ?? 1;
    const capLeft = sp.x - SPAWN_RADIUS;
    const capRight = sp.x + SPAWN_RADIUS;
    const capBottom = sp.y - SPAWN_HALF_H;
    const capTop = sp.y + SPAWN_HALF_H;
    const left = tile.x - w / 2;
    const right = tile.x + w / 2;
    const bottom = tile.y - h / 2;
    const top = tile.y + h / 2;
    if (capRight <= left || capLeft >= right || capTop <= bottom || capBottom >= top) continue;
    if (capBottom < top - 0.3) return true;
  }
  return false;
}

function spawnOverlapsStaticHazard(hazards, sp) {
  for (const h of hazards) {
    if (h.kind !== 'lava' && h.kind !== 'spike') continue;
    const hw = (h.w ?? 1) / 2 + SPAWN_RADIUS;
    const hh = (h.h ?? 0.4) / 2 + SPAWN_HALF_H;
    const hy = h.kind === 'spike' ? h.y + (h.pointDown ? -0.3 : 0.25) : h.y;
    if (Math.abs(sp.x - h.x) < hw && Math.abs(sp.y - hy) < hh) return true;
  }
  return false;
}

function error(issues, message, target = null) {
  issues.push({ severity: 'error', message, targetId: target?._editorId || null });
}

function warn(issues, message, target = null) {
  issues.push({ severity: 'warning', message, targetId: target?._editorId || null });
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
