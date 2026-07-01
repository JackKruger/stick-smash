import { LEVELS } from '../levels/definitions.js';
import {
  ACTIVE_KEY,
  STORAGE_KEY,
  clonePlain,
  createBlankLevel,
  duplicateLevel,
  normalizeLevel,
  serializeLevel,
} from './schema.js';

const HISTORY_LIMIT = 80;

export class EditorState extends EventTarget {
  constructor() {
    super();
    this.stockLevels = LEVELS.map(level => normalizeLevel(level));
    this.customLevels = loadCustomLevels();
    this.level = createBlankLevel();
    this.selected = null;
    this.tool = 'select';
    this.tileSettings = { material: 'stone', shape: 'box', w: 1, h: 1, dynamic: false, indestructible: false };
    this.hazardKind = 'lava';
    this.backgroundKind = 'box';
    this.gridSnap = true;
    this.history = [];
    this.historyIndex = -1;

    const activeId = safeStorageGet(ACTIVE_KEY);
    const initial = [...this.customLevels, ...this.stockLevels].find(level => level.id === activeId)
      || this.customLevels[0]
      || this.stockLevels[0]
      || this.level;
    this.loadLevel(initial, { pushHistory: true });
  }

  allLevels() {
    return [
      ...this.customLevels.map(level => ({ ...level, _source: 'custom' })),
      ...this.stockLevels.map(level => ({ ...level, _source: 'stock' })),
    ];
  }

  loadLevel(level, { pushHistory = true } = {}) {
    this.level = normalizeLevel(level);
    this.selected = null;
    safeStorageSet(ACTIVE_KEY, this.level.id);
    if (pushHistory) this.resetHistory();
    this.emit();
  }

  newLevel() {
    this.loadLevel(createBlankLevel());
  }

  duplicateCurrent() {
    this.loadLevel(duplicateLevel(this.level));
    this.saveCurrent();
  }

  mutate(fn, { history = true } = {}) {
    fn(this.level);
    this.level = normalizeLevel(this.level);
    if (this.selected) {
      this.selected = this.findById(this.selected.id) ? this.selected : null;
    }
    if (history) this.pushHistory();
    this.emit();
  }

  select(type, id) {
    this.selected = type && id ? { type, id } : null;
    this.emit();
  }

  selectedObject() {
    if (!this.selected) return null;
    return this.findById(this.selected.id);
  }

  findById(id) {
    for (const type of ['tiles', 'hazards', 'spawns', 'weaponSpawns', 'background']) {
      const item = this.level[type].find(entry => entry._editorId === id);
      if (item) return { type, item };
    }
    return null;
  }

  deleteSelected() {
    if (!this.selected) return;
    const { type, id } = this.selected;
    this.mutate(level => {
      level[type] = level[type].filter(item => item._editorId !== id);
      this.selected = null;
    });
  }

  resetHistory() {
    this.history = [this.snapshot()];
    this.historyIndex = 0;
  }

  pushHistory() {
    const snap = this.snapshot();
    const prev = this.history[this.historyIndex];
    if (prev === snap) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.restore(this.history[this.historyIndex]);
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.restore(this.history[this.historyIndex]);
  }

  snapshot() {
    return JSON.stringify(serializeLevel(this.level));
  }

  restore(snapshot) {
    this.level = normalizeLevel(JSON.parse(snapshot));
    this.selected = null;
    this.emit();
  }

  saveCurrent() {
    const saved = serializeLevel(this.level);
    const idx = this.customLevels.findIndex(level => level.id === saved.id);
    if (idx >= 0) this.customLevels[idx] = normalizeLevel(saved);
    else this.customLevels.unshift(normalizeLevel(saved));
    safeStorageSet(STORAGE_KEY, JSON.stringify(this.customLevels.map(serializeLevel)));
    safeStorageSet(ACTIVE_KEY, saved.id);
    this.emit();
  }

  deleteCurrentCustom() {
    const id = this.level.id;
    this.customLevels = this.customLevels.filter(level => level.id !== id);
    safeStorageSet(STORAGE_KEY, JSON.stringify(this.customLevels.map(serializeLevel)));
    const next = this.customLevels[0] || this.stockLevels[0] || createBlankLevel();
    this.loadLevel(next);
  }

  importLevel(raw) {
    const parsed = parseLevelText(raw);
    this.loadLevel(normalizeLevel(parsed));
    this.saveCurrent();
  }

  emit() {
    this.dispatchEvent(new Event('change'));
  }
}

function loadCustomLevels() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeLevel) : [];
  } catch (err) {
    console.warn('[editor] failed to load custom levels', err);
    return [];
  }
}

function parseLevelText(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Import is empty.');
  try {
    return JSON.parse(text);
  } catch (_) {
    const cleaned = text
      .replace(/^export\s+const\s+\w+\s*=\s*/m, '')
      .replace(/^const\s+\w+\s*=\s*/m, '')
      .replace(/;\s*$/m, '');
    return Function(`"use strict"; return (${cleaned});`)();
  }
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
