export const STORAGE_KEY = 'sticksmash.editor.levels';
export const ACTIVE_KEY = 'sticksmash.editor.activeLevel';
export const PLAYTEST_KEY = 'sticksmash.editor.playtestLevel';

export const MATERIALS = {
  stone: { label: 'Stone', color: 0x7a808c, hp: 60 },
  wood: { label: 'Wood', color: 0xa86a3a, hp: 24 },
  metal: { label: 'Metal', color: 0x6a7080, hp: 100 },
  ice: { label: 'Ice', color: 0xbce8ff, hp: 38 },
  bouncy: { label: 'Bouncy', color: 0x88e8b8, hp: 40 },
  dirt: { label: 'Dirt', color: 0x8a5530, hp: 45 },
};

export const HAZARD_DEFAULTS = {
  lava: { kind: 'lava', x: 0, y: -5, w: 36, h: 1.4, dps: 50 },
  spike: { kind: 'spike', x: 0, y: 1, w: 2.4 },
  saw: { kind: 'saw', x: 0, y: 1, w: 8, radius: 0.75 },
  pendulum: { kind: 'pendulum', x: 0, y: 12, length: 4, amplitude: Math.PI / 3, speed: 1.2 },
};

export const BACKGROUND_DEFAULTS = {
  box: { x: 0, y: 6, z: -10, w: 6, h: 2, color: 0x22283a },
  sphere: { shape: 'sphere', x: 0, y: 10, z: -11, radius: 2, color: 0x506080 },
  disc: { shape: 'circle', x: 0, y: 10, z: -11, radius: 2, color: 0x80d8ff, emissiveIntensity: 0.6 },
  chain: { type: 'chain', x: 0, y: 12, z: -6, length: 5 },
};

let nextEditorId = 1;

export function freshEditorId(prefix = 'o') {
  return `${prefix}${nextEditorId++}`;
}

export function clonePlain(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createBlankLevel() {
  return normalizeLevel({
    id: 'custom-level',
    name: 'Custom Level',
    bgColor: 0x10121a,
    gravity: -17,
    tiles: [
      ...range(-8, 8).map(x => ({ x, y: 0, material: 'stone', hp: 60, color: MATERIALS.stone.color })),
      ...range(-3, 3).map(x => ({ x, y: 4, material: 'wood', hp: 24, color: MATERIALS.wood.color })),
    ],
    hazards: [{ kind: 'lava', x: 0, y: -5, w: 40, h: 1.4, dps: 50 }],
    spawns: [{ x: -6, y: 2 }, { x: 6, y: 2 }, { x: 0, y: 6 }],
    weaponSpawns: [{ x: 0, y: 5 }, { x: -5, y: 1 }, { x: 5, y: 1 }],
    background: [],
  });
}

export function normalizeLevel(input) {
  const src = clonePlain(input || {});
  const id = sanitizeId(src.id || src.name || 'custom-level');
  const level = {
    id,
    name: String(src.name || titleFromId(id)),
    bgColor: numberColor(src.bgColor, 0x10121a),
    gravity: finiteOr(src.gravity, -17),
    tiles: Array.isArray(src.tiles) ? src.tiles.map(normalizeTile) : [],
    hazards: Array.isArray(src.hazards) ? src.hazards.map(normalizeHazard) : [],
    spawns: Array.isArray(src.spawns) ? src.spawns.map(normalizePoint) : [{ x: 0, y: 3 }],
    weaponSpawns: Array.isArray(src.weaponSpawns) ? src.weaponSpawns.map(normalizePoint) : [{ x: 0, y: 4 }],
    background: Array.isArray(src.background) ? src.background.map(normalizeBackground) : [],
  };
  if (src.killBound) level.killBound = { x: finiteOr(src.killBound.x, 32), y: finiteOr(src.killBound.y, 24) };
  if (src.cameraClamp) level.cameraClamp = clonePlain(src.cameraClamp);
  if (src.curvedGravity) level.curvedGravity = true;
  if (src.planets) level.planets = clonePlain(src.planets);
  if (src.stationBounds) level.stationBounds = clonePlain(src.stationBounds);
  if (src.meteorShower) level.meteorShower = clonePlain(src.meteorShower);
  assignEditorIds(level);
  return level;
}

export function serializeLevel(level) {
  const src = normalizeLevel(level);
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (key.startsWith('_')) continue;
    if (Array.isArray(value)) out[key] = value.map(stripTransient);
    else out[key] = stripTransient(value);
  }
  return out;
}

export function duplicateLevel(level) {
  const copy = normalizeLevel(level);
  copy.id = uniqueCustomId(copy.id);
  copy.name = `${copy.name} Copy`;
  assignEditorIds(copy, true);
  return copy;
}

export function materialDefaults(material) {
  return MATERIALS[material] || MATERIALS.stone;
}

export function makeTile(x, y, options = {}) {
  const material = options.material || 'stone';
  const mat = materialDefaults(material);
  return normalizeTile({
    x, y,
    material,
    hp: options.hp ?? mat.hp,
    color: options.color ?? mat.color,
    shape: options.shape || 'box',
    w: options.w ?? 1,
    h: options.h ?? 1,
    d: options.d ?? 1,
    dynamic: !!options.dynamic,
    indestructible: !!options.indestructible,
  });
}

export function makeHazard(kind, x, y) {
  const base = clonePlain(HAZARD_DEFAULTS[kind] || HAZARD_DEFAULTS.lava);
  base.x = x;
  base.y = y;
  return normalizeHazard(base);
}

export function makeBackground(kind, x, y) {
  const base = clonePlain(BACKGROUND_DEFAULTS[kind] || BACKGROUND_DEFAULTS.box);
  base.x = x;
  base.y = y;
  return normalizeBackground(base);
}

export function colorToHex(value) {
  const n = numberColor(value, 0);
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function hexToColor(value, fallback = 0xffffff) {
  if (typeof value === 'number') return numberColor(value, fallback);
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return parseInt(text.slice(1), 16);
  if (/^0x[0-9a-f]{1,6}$/i.test(text)) return parseInt(text.slice(2), 16);
  return fallback;
}

function normalizeTile(tile) {
  const material = tile.material || 'stone';
  const mat = materialDefaults(material);
  const out = {
    _editorId: tile._editorId || freshEditorId('t'),
    x: finiteOr(tile.x, 0),
    y: finiteOr(tile.y, 0),
    material,
    hp: finiteOr(tile.hp, mat.hp),
    color: numberColor(tile.color, mat.color),
  };
  copyIf(out, tile, 'shape');
  copyIf(out, tile, 'w', 1);
  copyIf(out, tile, 'h', 1);
  copyIf(out, tile, 'd', 1);
  copyTruthy(out, tile, 'dynamic');
  copyTruthy(out, tile, 'indestructible');
  copyTruthy(out, tile, 'emissive');
  copyIf(out, tile, 'emissiveIntensity');
  copyIf(out, tile, 'radius');
  copyIf(out, tile, 'tileMass');
  copyIf(out, tile, 'rotZ');
  copyDeepIf(out, tile, 'suspend');
  copyDeepIf(out, tile, 'chainAnchor');
  copyDeepIf(out, tile, 'move');
  copyDeepIf(out, tile, 'breach');
  copyDeepIf(out, tile, 'icicle');
  copyIf(out, tile, 'parentTileKey');
  return out;
}

function normalizeHazard(hazard) {
  const kind = hazard.kind || 'lava';
  const base = HAZARD_DEFAULTS[kind] || HAZARD_DEFAULTS.lava;
  const out = { _editorId: hazard._editorId || freshEditorId('h'), kind };
  for (const [key, value] of Object.entries({ ...base, ...hazard })) {
    if (key === '_editorId') continue;
    if (key === 'kind') out.kind = value;
    else if (key === 'color') out.color = numberColor(value, base.color ?? 0xff4400);
    else if (typeof value === 'number') out[key] = finiteOr(value, base[key] ?? 0);
    else out[key] = clonePlain(value);
  }
  return out;
}

function normalizePoint(point) {
  return {
    _editorId: point._editorId || freshEditorId('p'),
    x: finiteOr(point.x, 0),
    y: finiteOr(point.y, 3),
  };
}

function normalizeBackground(bg) {
  const out = { _editorId: bg._editorId || freshEditorId('b') };
  for (const [key, value] of Object.entries(bg || {})) {
    if (key === '_editorId') continue;
    if (key === 'color' || key === 'emissive') out[key] = numberColor(value, key === 'color' ? 0x22283a : 0);
    else if (typeof value === 'number') out[key] = finiteOr(value, 0);
    else out[key] = clonePlain(value);
  }
  if (!('x' in out)) out.x = 0;
  if (!('y' in out)) out.y = 0;
  if (!('z' in out)) out.z = -10;
  return out;
}

function assignEditorIds(level, force = false) {
  for (const listName of ['tiles', 'hazards', 'spawns', 'weaponSpawns', 'background']) {
    for (const item of level[listName] || []) {
      if (force || !item._editorId) item._editorId = freshEditorId(listName[0]);
    }
  }
}

function stripTransient(value) {
  if (Array.isArray(value)) return value.map(stripTransient);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key.startsWith('_')) continue;
    if (inner === undefined || inner === null) continue;
    if (Array.isArray(inner) && inner.length === 0) continue;
    out[key] = stripTransient(inner);
  }
  return out;
}

function sanitizeId(value) {
  const id = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'custom-level';
}

function uniqueCustomId(id) {
  return `${sanitizeId(id)}-${Math.floor(Date.now() % 100000)}`;
}

function titleFromId(id) {
  return id.split('-').filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ') || 'Custom Level';
}

function range(from, to) {
  const out = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numberColor(value, fallback) {
  if (typeof value === 'string') return hexToColor(value, fallback);
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.round(n))) : fallback;
}

function copyIf(out, source, key, implicitDefault = undefined) {
  if (!(key in source)) return;
  if (implicitDefault !== undefined && source[key] === implicitDefault) return;
  out[key] = source[key];
}

function copyTruthy(out, source, key) {
  if (source[key]) out[key] = source[key];
}

function copyDeepIf(out, source, key) {
  if (source[key] !== undefined && source[key] !== null) out[key] = clonePlain(source[key]);
}
