import { EditorState } from './EditorState.js';
import { exportLevelJs, exportLevelJson } from './levelExport.js';
import { validateLevel } from './levelValidate.js';
import {
  HAZARD_DEFAULTS,
  MATERIALS,
  PLAYTEST_KEY,
  colorToHex,
  hexToColor,
  makeBackground,
  makeHazard,
  makeTile,
  serializeLevel,
} from './schema.js';

const TOOL_META = [
  ['select', '↖', 'Select'],
  ['tile', '▦', 'Tile'],
  ['erase', '⌫', 'Erase'],
  ['spawns', '●', 'Player spawn'],
  ['weaponSpawns', '◆', 'Weapon spawn'],
  ['hazards', '⚠', 'Hazard'],
  ['background', '◌', 'Background'],
];

const TYPE_LISTS = new Set(['tiles', 'hazards', 'spawns', 'weaponSpawns', 'background']);

export class LevelEditor {
  constructor(root = document.body) {
    this.root = root;
    this.state = new EditorState();
    this.canvas = document.getElementById('editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this.view = { x: 0, y: 4.5, zoom: 34 };
    this.pointer = null;
    this.hover = null;
    this.toastTimer = 0;
    this.validation = validateLevel(this.state.level);
    this.needsRender = true;
    this.openDetails = new Set();

    this.bindDom();
    this.bindCanvas();
    this.state.addEventListener('change', () => {
      this.validation = validateLevel(this.state.level);
      this.renderUi();
      this.requestRender();
    });
    this.resize();
    this.renderUi();
    this.loop();
  }

  bindDom() {
    this.toolbar = document.getElementById('editor-toolbar');
    this.sidebar = document.getElementById('editor-sidebar');
    this.status = document.getElementById('editor-status');
    this.modal = document.getElementById('editor-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalText = document.getElementById('modal-text');

    this.toolbar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tool], [data-command]');
      if (!button) return;
      const tool = button.dataset.tool;
      const command = button.dataset.command;
      if (tool) {
        this.state.tool = tool;
        this.renderUi();
        this.requestRender();
      } else if (command) {
        this.runCommand(command);
      }
    });

    this.sidebar.addEventListener('change', event => this.handleInput(event));
    this.sidebar.addEventListener('click', event => {
      const button = event.target.closest('[data-command]');
      if (button) this.runCommand(button.dataset.command, event);
    });
    this.sidebar.addEventListener('toggle', event => {
      const detail = event.target?.dataset?.detail;
      if (!detail) return;
      if (event.target.open) this.openDetails.add(detail);
      else this.openDetails.delete(detail);
    }, true);

    this.modal.addEventListener('click', event => {
      const command = event.target.closest('[data-command]')?.dataset.command;
      if (!command) return;
      if (command === 'modal-close') this.closeModal();
      if (command === 'modal-copy') this.copyModalText();
      if (command === 'modal-import') this.importFromModal();
    });

    addEventListener('keydown', event => this.handleKey(event));
    addEventListener('resize', () => this.resize());
  }

  bindCanvas() {
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
    this.canvas.addEventListener('pointerup', event => this.pointerUp(event));
    this.canvas.addEventListener('pointercancel', event => this.pointerUp(event));
    this.canvas.addEventListener('wheel', event => this.wheel(event), { passive: false });
  }

  renderUi() {
    this.renderToolbar();
    this.renderSidebar();
    this.renderStatus();
  }

  renderToolbar() {
    this.toolbar.innerHTML = `
      <div class="tool-group">
        ${TOOL_META.map(([tool, icon, label]) => `
          <button class="icon-btn ${this.state.tool === tool ? 'active' : ''}" data-tool="${tool}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</button>
        `).join('')}
      </div>
      <div class="tool-group">
        <button class="icon-btn" data-command="undo" title="Undo" aria-label="Undo">↶</button>
        <button class="icon-btn" data-command="redo" title="Redo" aria-label="Redo">↷</button>
      </div>
      <div class="tool-group grow">
        <button class="text-btn" data-command="save">Save</button>
        <button class="text-btn" data-command="playtest">Playtest</button>
        <button class="text-btn" data-command="export-js">Export</button>
      </div>
    `;
  }

  renderSidebar() {
    const level = this.state.level;
    const selected = this.state.selectedObject();
    this.sidebar.innerHTML = `
      <section class="editor-section">
        <div class="section-title">Level</div>
        <label>Map
          <select data-field="level-load">
            ${this.state.allLevels().map(item => `<option value="${item.id}" ${item.id === level.id ? 'selected' : ''}>${escapeHtml(item.name)} ${item._source === 'custom' ? '•' : ''}</option>`).join('')}
          </select>
        </label>
        <div class="two">
          <label>ID <input data-level-field="id" type="text" value="${escapeAttr(level.id)}"></label>
          <label>Name <input data-level-field="name" type="text" value="${escapeAttr(level.name)}"></label>
        </div>
        <div class="two">
          <label>Sky <input data-level-field="bgColor" type="color" value="${colorToHex(level.bgColor)}"></label>
          <label>Gravity <input data-level-field="gravity" type="number" step="0.5" value="${level.gravity ?? -17}"></label>
        </div>
        ${this.renderLevelAdvanced(level)}
        <div class="button-strip">
          <button class="mini-btn" data-command="new">New</button>
          <button class="mini-btn" data-command="duplicate">Duplicate</button>
          <button class="mini-btn" data-command="import">Import</button>
          <button class="mini-btn danger" data-command="delete-custom">Delete</button>
        </div>
      </section>
      ${this.renderBrushSection()}
      ${selected ? this.renderInspector(selected) : this.renderEmptyInspector()}
      ${this.renderProblems()}
    `;
  }

  renderBrushSection() {
    const material = this.state.tileSettings.material;
    return `
      <section class="editor-section">
        <div class="section-title">Brush</div>
        <label>Material
          <select data-setting="material">
            ${Object.entries(MATERIALS).map(([id, data]) => `<option value="${id}" ${id === material ? 'selected' : ''}>${data.label}</option>`).join('')}
          </select>
        </label>
        <div class="two">
          <label>Width <input data-setting="w" type="number" min="0.2" step="0.1" value="${this.state.tileSettings.w}"></label>
          <label>Height <input data-setting="h" type="number" min="0.2" step="0.1" value="${this.state.tileSettings.h}"></label>
        </div>
        <label>Hazard
          <select data-setting="hazardKind">
            ${Object.keys(HAZARD_DEFAULTS).map(kind => `<option value="${kind}" ${kind === this.state.hazardKind ? 'selected' : ''}>${kind}</option>`).join('')}
          </select>
        </label>
        <label>Backdrop
          <select data-setting="backgroundKind">
            ${['box', 'sphere', 'disc', 'chain'].map(kind => `<option value="${kind}" ${kind === this.state.backgroundKind ? 'selected' : ''}>${kind}</option>`).join('')}
          </select>
        </label>
        <label class="check"><input data-setting="gridSnap" type="checkbox" ${this.state.gridSnap ? 'checked' : ''}> Snap</label>
      </section>
    `;
  }

  renderEmptyInspector() {
    return `
      <section class="editor-section">
        <div class="section-title">Inspector</div>
        <div class="empty-state">No selection</div>
      </section>
    `;
  }

  renderLevelAdvanced(level) {
    return `
      <details class="advanced" data-detail="level-advanced" ${this.openDetails.has('level-advanced') ? 'open' : ''}>
        <summary>Advanced level fields</summary>
        <label class="check"><input data-level-toggle="killBound" type="checkbox" ${level.killBound ? 'checked' : ''}> Kill bounds</label>
        ${level.killBound ? `<div class="two">
          <label>Bound X <input data-level-path="killBound.x" type="number" step="1" value="${level.killBound.x ?? 32}"></label>
          <label>Bound Y <input data-level-path="killBound.y" type="number" step="1" value="${level.killBound.y ?? 24}"></label>
        </div>` : ''}
        <label class="check"><input data-level-toggle="cameraClamp" type="checkbox" ${level.cameraClamp ? 'checked' : ''}> Camera clamp</label>
        ${level.cameraClamp ? `
          <div class="two">
            <label>Cam X min <input data-level-path="cameraClamp.x.0" type="number" step="1" value="${level.cameraClamp.x?.[0] ?? -30}"></label>
            <label>Cam X max <input data-level-path="cameraClamp.x.1" type="number" step="1" value="${level.cameraClamp.x?.[1] ?? 30}"></label>
          </div>
          <div class="two">
            <label>Cam Y min <input data-level-path="cameraClamp.y.0" type="number" step="1" value="${level.cameraClamp.y?.[0] ?? -20}"></label>
            <label>Cam Y max <input data-level-path="cameraClamp.y.1" type="number" step="1" value="${level.cameraClamp.y?.[1] ?? 24}"></label>
          </div>
          <div class="two">
            <label>Zoom min <input data-level-path="cameraClamp.zoom.0" type="number" step="1" value="${level.cameraClamp.zoom?.[0] ?? 12}"></label>
            <label>Zoom max <input data-level-path="cameraClamp.zoom.1" type="number" step="1" value="${level.cameraClamp.zoom?.[1] ?? 28}"></label>
          </div>
        ` : ''}
        <label class="check"><input data-level-toggle="stationBounds" type="checkbox" ${level.stationBounds ? 'checked' : ''}> Station bounds</label>
        ${level.stationBounds ? `<div class="two">
          <label>Station X0 <input data-level-path="stationBounds.x0" type="number" step="1" value="${level.stationBounds.x0 ?? -17}"></label>
          <label>Station X1 <input data-level-path="stationBounds.x1" type="number" step="1" value="${level.stationBounds.x1 ?? 17}"></label>
        </div>` : ''}
        <label class="check"><input data-level-toggle="meteorShower" type="checkbox" ${level.meteorShower ? 'checked' : ''}> Meteor shower</label>
        ${level.meteorShower ? `
          <label>Activate after <input data-level-path="meteorShower.activateAfter" type="number" step="1" value="${level.meteorShower.activateAfter ?? 20}"></label>
          <div class="two">
            <label>Interval min <input data-level-path="meteorShower.interval.0" type="number" step="1" value="${level.meteorShower.interval?.[0] ?? 6}"></label>
            <label>Interval max <input data-level-path="meteorShower.interval.1" type="number" step="1" value="${level.meteorShower.interval?.[1] ?? 11}"></label>
          </div>
          <div class="two">
            <label>Per min <input data-level-path="meteorShower.perShower.0" type="number" step="1" value="${level.meteorShower.perShower?.[0] ?? 1}"></label>
            <label>Per max <input data-level-path="meteorShower.perShower.1" type="number" step="1" value="${level.meteorShower.perShower?.[1] ?? 3}"></label>
          </div>
        ` : ''}
      </details>
    `;
  }

  renderInspector(selected) {
    const { type, item } = selected;
    const common = `
      <div class="two">
        <label>X <input data-object-field="x" type="number" step="0.1" value="${item.x ?? 0}"></label>
        <label>Y <input data-object-field="y" type="number" step="0.1" value="${item.y ?? 0}"></label>
      </div>
    `;
    let body = common;
    if (type === 'tiles') body += this.renderTileInspector(item);
    if (type === 'hazards') body += this.renderHazardInspector(item);
    if (type === 'background') body += this.renderBackgroundInspector(item);
    if (type === 'spawns' || type === 'weaponSpawns') body += `<div class="field-note">${type === 'spawns' ? 'Player spawn' : 'Weapon spawn'}</div>`;
    return `
      <section class="editor-section">
        <div class="section-title">Inspector</div>
        ${body}
        <div class="button-strip"><button class="mini-btn danger" data-command="delete-selected">Delete</button></div>
      </section>
    `;
  }

  renderTileInspector(item) {
    return `
      <label>Material
        <select data-object-field="material">
          ${Object.entries(MATERIALS).map(([id, data]) => `<option value="${id}" ${id === item.material ? 'selected' : ''}>${data.label}</option>`).join('')}
        </select>
      </label>
      <label>Shape
        <select data-object-field="shape">
          ${['box', 'sphere', 'cylinder'].map(shape => `<option value="${shape}" ${(item.shape || 'box') === shape ? 'selected' : ''}>${shape}</option>`).join('')}
        </select>
      </label>
      <div class="two">
        <label>W <input data-object-field="w" type="number" min="0.1" step="0.1" value="${item.w ?? 1}"></label>
        <label>H <input data-object-field="h" type="number" min="0.1" step="0.1" value="${item.h ?? 1}"></label>
      </div>
      <div class="two">
        <label>D <input data-object-field="d" type="number" min="0.1" step="0.1" value="${item.d ?? 1}"></label>
        <label>Radius <input data-object-field="radius" type="number" min="0.1" step="0.1" value="${item.radius ?? ''}"></label>
      </div>
      <div class="two">
        <label>HP <input data-object-field="hp" type="number" min="1" step="1" value="${item.hp ?? 30}"></label>
        <label>Color <input data-object-field="color" type="color" value="${colorToHex(item.color)}"></label>
      </div>
      <label class="check"><input data-object-field="dynamic" type="checkbox" ${item.dynamic ? 'checked' : ''}> Dynamic</label>
      <label class="check"><input data-object-field="indestructible" type="checkbox" ${item.indestructible ? 'checked' : ''}> Indestructible</label>
      ${this.renderTileAdvanced(item)}
    `;
  }

  renderTileAdvanced(item) {
    return `
      <details class="advanced" data-detail="tile-advanced" ${this.openDetails.has('tile-advanced') ? 'open' : ''}>
        <summary>Advanced tile fields</summary>
        <div class="two">
          <label>Mass <input data-object-field="tileMass" type="number" step="0.5" value="${item.tileMass ?? ''}"></label>
          <label>Rotation <input data-object-field="rotZ" type="number" step="0.05" value="${item.rotZ ?? ''}"></label>
        </div>
        <div class="two">
          <label>Emissive <input data-object-field="emissive" type="color" value="${colorToHex(item.emissive ?? 0)}"></label>
          <label>Glow <input data-object-field="emissiveIntensity" type="number" step="0.1" value="${item.emissiveIntensity ?? 0}"></label>
        </div>
        <label class="check"><input data-object-toggle="move" type="checkbox" ${item.move ? 'checked' : ''}> Moving platform</label>
        ${item.move ? `
          <label>Axis
            <select data-object-path="move.axis">
              ${['y', 'x'].map(axis => `<option value="${axis}" ${(item.move.axis ?? 'y') === axis ? 'selected' : ''}>${axis}</option>`).join('')}
            </select>
          </label>
          <div class="two">
            <label>From <input data-object-path="move.from" type="number" step="0.1" value="${item.move.from ?? item.y - 3}"></label>
            <label>To <input data-object-path="move.to" type="number" step="0.1" value="${item.move.to ?? item.y + 3}"></label>
          </div>
          <div class="two">
            <label>Speed <input data-object-path="move.speed" type="number" step="0.1" value="${item.move.speed ?? 1}"></label>
            <label>Phase <input data-object-path="move.phase" type="number" step="0.1" value="${item.move.phase ?? 0}"></label>
          </div>
        ` : ''}
        <label class="check"><input data-object-toggle="suspend" type="checkbox" ${item.suspend ? 'checked' : ''}> Chain-suspended</label>
        ${item.suspend ? `
          <div class="three">
            <label>Anchor Y <input data-object-path="suspend.y" type="number" step="0.5" value="${item.suspend.y ?? item.y + 5}"></label>
            <label>Segments <input data-object-path="suspend.segs" type="number" step="1" min="2" value="${item.suspend.segs ?? 5}"></label>
            <label>HP <input data-object-path="suspend.hp" type="number" step="1" min="1" value="${item.suspend.hp ?? 22}"></label>
          </div>
        ` : ''}
        <label class="check"><input data-object-field="breach" type="checkbox" ${item.breach ? 'checked' : ''}> Vacuum breach on break</label>
        <label class="check"><input data-object-field="icicle" type="checkbox" ${item.icicle ? 'checked' : ''}> Falling icicle on break</label>
        <label>Parent tile key <input data-object-field="parentTileKey" type="text" value="${escapeAttr(item.parentTileKey ?? '')}" placeholder="x,y"></label>
      </details>
    `;
  }

  renderHazardInspector(item) {
    const extra = {
      lava: ['w', 'h', 'dps'],
      spike: ['w'],
      saw: ['w', 'radius'],
      pendulum: ['length', 'amplitude', 'speed', 'phase'],
    }[item.kind] || [];
    return `
      <label>Kind
        <select data-object-field="kind">
          ${Object.keys(HAZARD_DEFAULTS).map(kind => `<option value="${kind}" ${kind === item.kind ? 'selected' : ''}>${kind}</option>`).join('')}
        </select>
      </label>
      <div class="two">
        ${extra.map(key => `<label>${labelFor(key)} <input data-object-field="${key}" type="number" step="0.1" value="${item[key] ?? HAZARD_DEFAULTS[item.kind]?.[key] ?? 0}"></label>`).join('')}
      </div>
      ${item.kind === 'spike' ? `<label class="check"><input data-object-field="pointDown" type="checkbox" ${item.pointDown ? 'checked' : ''}> Point down</label>` : ''}
      <details class="advanced" data-detail="hazard-advanced" ${this.openDetails.has('hazard-advanced') ? 'open' : ''}>
        <summary>Advanced hazard fields</summary>
        <label>Color <input data-object-field="color" type="color" value="${colorToHex(item.color ?? (item.kind === 'lava' ? 0xff4400 : 0xddddee))}"></label>
        ${item.kind === 'lava' ? `
          <label class="check"><input data-object-field="buoyant" type="checkbox" ${item.buoyant ? 'checked' : ''}> Buoyant liquid</label>
          <label class="check"><input data-object-toggle="rise" type="checkbox" ${item.rise ? 'checked' : ''}> Rising cycle</label>
          ${item.rise ? `
            <div class="three">
              <label>Height <input data-object-path="rise.height" type="number" step="0.5" value="${item.rise.height ?? 4}"></label>
              <label>Period <input data-object-path="rise.period" type="number" step="0.5" value="${item.rise.period ?? 10}"></label>
              <label>Phase <input data-object-path="rise.phase" type="number" step="0.1" value="${item.rise.phase ?? 0}"></label>
            </div>
          ` : ''}
        ` : ''}
        ${item.kind === 'pendulum' ? `
          <div class="three">
            <label>Chain HP <input data-object-field="chainHp" type="number" step="1" value="${item.chainHp ?? 22}"></label>
            <label>Tip HP <input data-object-field="tipHp" type="number" step="1" value="${item.tipHp ?? 999}"></label>
            <label>Drive <input data-object-field="driveForce" type="number" step="1" value="${item.driveForce ?? 18}"></label>
          </div>
        ` : ''}
      </details>
    `;
  }

  renderBackgroundInspector(item) {
    const isChain = item.type === 'chain';
    return `
      <div class="two">
        <label>Z <input data-object-field="z" type="number" step="0.5" value="${item.z ?? -10}"></label>
        <label>Color <input data-object-field="color" type="color" value="${colorToHex(item.color ?? 0x22283a)}"></label>
      </div>
      ${isChain ? `<label>Length <input data-object-field="length" type="number" min="1" step="0.5" value="${item.length ?? 5}"></label>` : `
        <div class="two">
          <label>W/R <input data-object-field="${item.shape === 'sphere' || item.shape === 'circle' ? 'radius' : 'w'}" type="number" min="0.1" step="0.1" value="${item.radius ?? item.w ?? 2}"></label>
          <label>H <input data-object-field="h" type="number" min="0.1" step="0.1" value="${item.h ?? 2}"></label>
        </div>
      `}
    `;
  }

  renderProblems() {
    const issues = this.validation.issues;
    return `
      <section class="editor-section">
        <div class="section-title">Checks</div>
        ${issues.length ? `
          <div class="issues">
            ${issues.slice(0, 8).map(issue => `<button class="issue ${issue.severity}" data-command="focus-issue" data-target-id="${issue.targetId || ''}">${escapeHtml(issue.message)}</button>`).join('')}
            ${issues.length > 8 ? `<div class="field-note">${issues.length - 8} more</div>` : ''}
          </div>
        ` : `<div class="ok-state">No problems</div>`}
      </section>
    `;
  }

  renderStatus() {
    const errors = this.validation.issues.filter(i => i.severity === 'error').length;
    const warnings = this.validation.issues.filter(i => i.severity === 'warning').length;
    const selected = this.state.selectedObject();
    this.status.textContent = `${this.state.level.name} · ${this.state.level.tiles.length} tiles · ${errors} errors · ${warnings} warnings${selected ? ` · ${selected.type}` : ''}`;
  }

  handleInput(event) {
    const el = event.target;
    if (el.dataset.field === 'level-load') {
      const level = this.state.allLevels().find(item => item.id === el.value);
      if (level) this.state.loadLevel(level);
      return;
    }
    if (el.dataset.levelField) {
      const field = el.dataset.levelField;
      this.state.mutate(level => {
        level[field] = readInputValue(el, field);
      });
      return;
    }
    if (el.dataset.levelPath) {
      const path = parsePath(el.dataset.levelPath);
      this.state.mutate(level => setPath(level, path, readInputValue(el, path[path.length - 1])));
      return;
    }
    if (el.dataset.levelToggle) {
      const field = el.dataset.levelToggle;
      this.state.mutate(level => {
        if (el.checked) level[field] = defaultLevelAdvanced(field);
        else delete level[field];
      });
      return;
    }
    if (el.dataset.setting) {
      const setting = el.dataset.setting;
      if (setting === 'hazardKind') this.state.hazardKind = el.value;
      else if (setting === 'backgroundKind') this.state.backgroundKind = el.value;
      else if (setting === 'gridSnap') this.state.gridSnap = el.checked;
      else this.state.tileSettings[setting] = readInputValue(el, setting);
      this.renderUi();
      return;
    }
    if (el.dataset.objectField) {
      const selected = this.state.selectedObject();
      if (!selected) return;
      const field = el.dataset.objectField;
      this.state.mutate(() => {
        const value = readInputValue(el, field);
        if (value === undefined || value === '' || (el.type === 'checkbox' && value === false)) delete selected.item[field];
        else selected.item[field] = value;
        if (selected.type === 'tiles' && field === 'material') {
          const mat = MATERIALS[selected.item.material] || MATERIALS.stone;
          selected.item.color = mat.color;
          selected.item.hp = selected.item.hp || mat.hp;
        }
        if (selected.type === 'hazards' && field === 'kind') {
          const keep = { _editorId: selected.item._editorId, x: selected.item.x, y: selected.item.y };
          Object.assign(selected.item, HAZARD_DEFAULTS[selected.item.kind]);
          Object.assign(selected.item, keep);
        }
      });
      return;
    }
    if (el.dataset.objectPath) {
      const selected = this.state.selectedObject();
      if (!selected) return;
      const path = parsePath(el.dataset.objectPath);
      this.state.mutate(() => setPath(selected.item, path, readInputValue(el, path[path.length - 1])));
      return;
    }
    if (el.dataset.objectToggle) {
      const selected = this.state.selectedObject();
      if (!selected) return;
      const field = el.dataset.objectToggle;
      this.state.mutate(() => {
        if (el.checked) selected.item[field] = defaultObjectAdvanced(field, selected.item);
        else delete selected.item[field];
      });
    }
  }

  runCommand(command, event = null) {
    if (command === 'undo') this.state.undo();
    else if (command === 'redo') this.state.redo();
    else if (command === 'save') { this.state.saveCurrent(); this.toast('Saved'); }
    else if (command === 'new') this.state.newLevel();
    else if (command === 'duplicate') this.state.duplicateCurrent();
    else if (command === 'delete-selected') this.state.deleteSelected();
    else if (command === 'delete-custom') this.state.deleteCurrentCustom();
    else if (command === 'export-js') this.openModal('Export', exportLevelJs(this.state.level), { importMode: false });
    else if (command === 'export-json') this.openModal('Export JSON', exportLevelJson(this.state.level), { importMode: false });
    else if (command === 'import') this.openModal('Import', '', { importMode: true });
    else if (command === 'playtest') this.playtest();
    else if (command === 'focus-issue') {
      const id = event?.target?.closest('[data-target-id]')?.dataset?.targetId;
      if (id) this.focusObject(id);
    }
  }

  handleKey(event) {
    if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.state.redo();
      else this.state.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.state.redo();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.state.deleteSelected();
      return;
    }
    const tool = {
      v: 'select',
      b: 'tile',
      e: 'erase',
      p: 'spawns',
      w: 'weaponSpawns',
      h: 'hazards',
      g: 'background',
    }[event.key.toLowerCase()];
    if (tool) {
      this.state.tool = tool;
      this.renderUi();
      this.requestRender();
    }
  }

  pointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    const world = this.screenToWorld(event.clientX, event.clientY);
    const resize = this.hitResizeHandle(event.clientX, event.clientY);
    const hit = this.hitTest(event.clientX, event.clientY);
    const pan = event.button === 1 || event.button === 2 || event.altKey;
    this.pointer = {
      id: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      lastClient: { x: event.clientX, y: event.clientY },
      startWorld: world,
      changed: false,
      mode: pan ? 'pan' : this.state.tool,
      hit,
    };

    if (pan) return;
    if (this.state.tool === 'select') {
      if (resize) {
        this.pointer.mode = 'resize';
        this.pointer.resize = resize;
        this.pointer.startBounds = this.getResizeBounds(resize.selected.type, resize.selected.item);
        this.pointer.startItem = { ...resize.selected.item };
      } else if (hit) {
        this.state.select(hit.type, hit.item._editorId);
        this.pointer.mode = 'move';
        this.pointer.offset = { x: hit.item.x - world.x, y: hit.item.y - world.y };
      } else {
        this.state.select(null, null);
      }
    } else if (this.state.tool === 'tile') {
      this.paintTile(world);
    } else if (this.state.tool === 'erase') {
      this.eraseAt(event.clientX, event.clientY, world);
    } else if (TYPE_LISTS.has(this.state.tool)) {
      this.placeObject(this.state.tool, world);
    }
  }

  pointerMove(event) {
    const world = this.screenToWorld(event.clientX, event.clientY);
    this.hover = this.hitTest(event.clientX, event.clientY);
    if (!this.pointer) {
      this.requestRender();
      return;
    }
    const dx = event.clientX - this.pointer.lastClient.x;
    const dy = event.clientY - this.pointer.lastClient.y;
    this.pointer.lastClient = { x: event.clientX, y: event.clientY };

    if (this.pointer.mode === 'pan') {
      this.view.x -= dx / this.view.zoom;
      this.view.y += dy / this.view.zoom;
      this.requestRender();
      return;
    }
    if (this.pointer.mode === 'move') {
      const selected = this.state.selectedObject();
      if (!selected) return;
      const p = this.snapPoint({ x: world.x + this.pointer.offset.x, y: world.y + this.pointer.offset.y }, selected.type);
      this.state.mutate(() => {
        selected.item.x = p.x;
        selected.item.y = p.y;
      }, { history: false });
      this.pointer.changed = true;
    } else if (this.pointer.mode === 'resize') {
      const selected = this.state.selectedObject();
      if (!selected) return;
      this.state.mutate(() => this.applyResize(selected, this.pointer.resize.handle, world), { history: false });
      this.pointer.changed = true;
    } else if (this.pointer.mode === 'tile') {
      this.paintTile(world);
    } else if (this.pointer.mode === 'erase') {
      this.eraseAt(event.clientX, event.clientY, world);
    }
  }

  pointerUp(event) {
    if (this.pointer?.changed) this.state.pushHistory();
    this.pointer = null;
    try { this.canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  wheel(event) {
    event.preventDefault();
    const before = this.screenToWorld(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.001);
    this.view.zoom = clamp(this.view.zoom * factor, 12, 90);
    const after = this.screenToWorld(event.clientX, event.clientY);
    this.view.x += before.x - after.x;
    this.view.y += before.y - after.y;
    this.requestRender();
  }

  paintTile(world) {
    const p = this.snapPoint(world, 'tiles');
    this.state.mutate(level => {
      const existing = level.tiles.find(tile => Math.abs(tile.x - p.x) < 0.001 && Math.abs(tile.y - p.y) < 0.001);
      const tile = makeTile(p.x, p.y, this.state.tileSettings);
      if (existing) Object.assign(existing, tile, { _editorId: existing._editorId });
      else level.tiles.push(tile);
      this.state.select('tiles', existing?._editorId || tile._editorId);
    }, { history: false });
    this.pointer.changed = true;
  }

  eraseAt(clientX, clientY, world) {
    const hit = this.hitTest(clientX, clientY);
    const p = this.snapPoint(world, 'tiles');
    this.state.mutate(level => {
      if (hit) {
        level[hit.type] = level[hit.type].filter(item => item._editorId !== hit.item._editorId);
      } else {
        level.tiles = level.tiles.filter(tile => Math.abs(tile.x - p.x) > 0.001 || Math.abs(tile.y - p.y) > 0.001);
      }
      this.state.selected = null;
    }, { history: false });
    this.pointer.changed = true;
  }

  placeObject(type, world) {
    const p = this.snapPoint(world, type);
    this.state.mutate(level => {
      let item;
      if (type === 'spawns' || type === 'weaponSpawns') item = { _editorId: `p${Date.now()}`, x: p.x, y: p.y };
      if (type === 'hazards') item = makeHazard(this.state.hazardKind, p.x, p.y);
      if (type === 'background') item = makeBackground(this.state.backgroundKind, p.x, p.y);
      if (!item) return;
      level[type].push(item);
      this.state.select(type, item._editorId);
    });
  }

  hitTest(clientX, clientY) {
    const world = this.screenToWorld(clientX, clientY);
    const pointRadius = 12 / this.view.zoom;
    for (const type of ['spawns', 'weaponSpawns']) {
      for (let i = this.state.level[type].length - 1; i >= 0; i--) {
        const item = this.state.level[type][i];
        if (Math.hypot(item.x - world.x, item.y - world.y) <= pointRadius) return { type, item };
      }
    }
    for (let i = this.state.level.hazards.length - 1; i >= 0; i--) {
      const item = this.state.level.hazards[i];
      if (pointInHazard(world, item)) return { type: 'hazards', item };
    }
    for (let i = this.state.level.tiles.length - 1; i >= 0; i--) {
      const item = this.state.level.tiles[i];
      if (pointInTile(world, item)) return { type: 'tiles', item };
    }
    for (let i = this.state.level.background.length - 1; i >= 0; i--) {
      const item = this.state.level.background[i];
      if (pointInBackground(world, item)) return { type: 'background', item };
    }
    return null;
  }

  hitResizeHandle(clientX, clientY) {
    const selected = this.state.selectedObject();
    if (!selected) return null;
    const handles = this.getResizeHandles(selected.type, selected.item);
    const radius = 8;
    for (const handle of handles) {
      const p = this.worldToScreen(handle.x, handle.y);
      if (Math.abs(clientX - p.x) <= radius && Math.abs(clientY - p.y) <= radius) {
        return { selected, handle: handle.name };
      }
    }
    return null;
  }

  getResizeBounds(type, item) {
    if (type === 'tiles') {
      if (item.shape === 'sphere') {
        const r = item.radius ?? Math.min(item.w ?? 1, item.h ?? 1) / 2;
        return { x: item.x, y: item.y, w: r * 2, h: r * 2, mode: 'circle' };
      }
      return { x: item.x, y: item.y, w: item.w ?? 1, h: item.h ?? 1, mode: 'rect' };
    }
    if (type === 'hazards') {
      if (item.kind === 'saw') return { x: item.x, y: item.y, w: (item.radius ?? 0.55) * 2, h: (item.radius ?? 0.55) * 2, mode: 'circle' };
      if (item.kind === 'pendulum') return { x: item.x, y: item.y - (item.length ?? 4) / 2, w: 1, h: item.length ?? 4, mode: 'vertical' };
      return { x: item.x, y: item.y, w: item.w ?? 1, h: item.h ?? 0.8, mode: item.kind === 'spike' ? 'horizontal' : 'rect' };
    }
    if (type === 'background') {
      if (item.type === 'chain') return { x: item.x, y: item.y - (item.length ?? 5) / 2, w: 0.6, h: item.length ?? 5, mode: 'vertical' };
      if (item.shape === 'sphere' || item.shape === 'circle') return { x: item.x, y: item.y, w: (item.radius ?? 1) * 2, h: (item.radius ?? 1) * 2, mode: 'circle' };
      return { x: item.x, y: item.y, w: item.w ?? 4, h: item.h ?? 4, mode: 'rect' };
    }
    return null;
  }

  getResizeHandles(type, item) {
    const b = this.getResizeBounds(type, item);
    if (!b) return [];
    const left = b.x - b.w / 2, right = b.x + b.w / 2;
    const top = b.y + b.h / 2, bottom = b.y - b.h / 2;
    if (b.mode === 'horizontal') return [{ name: 'w', x: left, y: b.y }, { name: 'e', x: right, y: b.y }];
    if (b.mode === 'vertical') return [{ name: 's', x: b.x, y: bottom }];
    return [
      { name: 'nw', x: left, y: top },
      { name: 'ne', x: right, y: top },
      { name: 'se', x: right, y: bottom },
      { name: 'sw', x: left, y: bottom },
    ];
  }

  applyResize(selected, handle, world) {
    const { type, item } = selected;
    const start = this.pointer.startBounds;
    if (!start) return;
    const left0 = start.x - start.w / 2;
    const right0 = start.x + start.w / 2;
    const top0 = start.y + start.h / 2;
    const bottom0 = start.y - start.h / 2;
    let left = left0, right = right0, top = top0, bottom = bottom0;
    if (handle.includes('w')) left = world.x;
    if (handle.includes('e')) right = world.x;
    if (handle.includes('n')) top = world.y;
    if (handle.includes('s')) bottom = world.y;
    if (handle === 'w') right = right0;
    if (handle === 'e') left = left0;
    if (handle === 's') top = top0;

    if (this.state.gridSnap) {
      left = Math.round(left); right = Math.round(right); top = Math.round(top); bottom = Math.round(bottom);
    } else {
      left = round(left, 2); right = round(right, 2); top = round(top, 2); bottom = round(bottom, 2);
    }
    if (right < left) [left, right] = [right, left];
    if (top < bottom) [top, bottom] = [bottom, top];
    const w = Math.max(0.2, right - left);
    const h = Math.max(0.2, top - bottom);
    const cx = round((left + right) / 2, 3);
    const cy = round((top + bottom) / 2, 3);

    if (type === 'tiles') {
      if (item.shape === 'sphere') {
        item.x = cx; item.y = cy; item.radius = round(Math.max(w, h) / 2, 3);
        item.w = round(item.radius * 2, 3); item.h = round(item.radius * 2, 3);
      } else {
        item.x = cx; item.y = cy; item.w = round(w, 3); item.h = round(h, 3);
      }
    } else if (type === 'hazards') {
      if (item.kind === 'saw') {
        item.x = cx; item.y = cy; item.radius = round(Math.max(w, h) / 2, 3);
      } else if (item.kind === 'pendulum') {
        item.length = round(Math.max(0.5, item.y - bottom), 3);
      } else if (item.kind === 'spike') {
        item.x = cx; item.w = round(w, 3);
      } else {
        item.x = cx; item.y = cy; item.w = round(w, 3); item.h = round(h, 3);
      }
    } else if (type === 'background') {
      if (item.type === 'chain') {
        item.length = round(Math.max(0.5, item.y - bottom), 3);
      } else if (item.shape === 'sphere' || item.shape === 'circle') {
        item.x = cx; item.y = cy; item.radius = round(Math.max(w, h) / 2, 3);
      } else {
        item.x = cx; item.y = cy; item.w = round(w, 3); item.h = round(h, 3);
      }
    }
  }

  focusObject(id) {
    const found = this.state.findById(id);
    if (!found) return;
    this.state.select(found.type, id);
    this.view.x = found.item.x ?? 0;
    this.view.y = found.item.y ?? 0;
    this.requestRender();
  }

  playtest() {
    const result = validateLevel(this.state.level);
    if (!result.ok) {
      this.toast('Fix errors before playtest');
      return;
    }
    localStorage.setItem(PLAYTEST_KEY, JSON.stringify(serializeLevel(this.state.level)));
    open('index.html?playtestLevel=1&dev=1', '_blank', 'noopener');
  }

  openModal(title, text, { importMode }) {
    this.modalTitle.textContent = title;
    this.modalText.value = text;
    this.modal.classList.add('open');
    this.modal.dataset.importMode = importMode ? '1' : '0';
    this.modal.querySelector('[data-command="modal-import"]').hidden = !importMode;
    this.modal.querySelector('[data-command="modal-copy"]').hidden = importMode;
    this.modalText.focus();
    if (!importMode) this.modalText.select();
  }

  closeModal() {
    this.modal.classList.remove('open');
  }

  async copyModalText() {
    try {
      await navigator.clipboard.writeText(this.modalText.value);
      this.toast('Copied');
    } catch (_) {
      this.modalText.select();
      document.execCommand('copy');
      this.toast('Copied');
    }
  }

  importFromModal() {
    try {
      this.state.importLevel(this.modalText.value);
      this.closeModal();
      this.toast('Imported');
    } catch (err) {
      this.toast(err?.message || 'Import failed');
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.requestRender();
  }

  requestRender() {
    this.needsRender = true;
  }

  loop() {
    if (this.needsRender) {
      this.needsRender = false;
      this.renderCanvas();
    }
    requestAnimationFrame(() => this.loop());
  }

  renderCanvas() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = colorToHex(this.state.level.bgColor);
    ctx.fillRect(0, 0, rect.width, rect.height);
    this.drawGrid(ctx, rect);
    this.drawBackground(ctx);
    this.drawTiles(ctx);
    this.drawHazards(ctx);
    this.drawPoints(ctx, this.state.level.weaponSpawns, '#7ce3ff', '◆');
    this.drawPoints(ctx, this.state.level.spawns, '#ffd24d', '●');
    this.drawSelection(ctx);
  }

  drawGrid(ctx, rect) {
    const step = this.view.zoom;
    const left = this.screenToWorld(0, 0).x;
    const right = this.screenToWorld(rect.width, 0).x;
    const bottom = this.screenToWorld(0, rect.height).y;
    const top = this.screenToWorld(0, 0).y;
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = Math.floor(left); x <= Math.ceil(right); x++) {
      const p = this.worldToScreen(x, 0);
      ctx.strokeStyle = x === 0 ? 'rgba(255,255,255,0.28)' : step < 18 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.075)';
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, rect.height);
      ctx.stroke();
    }
    for (let y = Math.floor(bottom); y <= Math.ceil(top); y++) {
      const p = this.worldToScreen(0, y);
      ctx.strokeStyle = y === 0 ? 'rgba(255,255,255,0.28)' : step < 18 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.075)';
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(rect.width, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBackground(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (const item of this.state.level.background) {
      const p = this.worldToScreen(item.x, item.y);
      ctx.fillStyle = colorToHex(item.color ?? 0x22283a);
      if (item.type === 'chain') {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, this.worldToScreen(item.x, item.y - (item.length ?? 5)).y);
        ctx.stroke();
      } else if (item.shape === 'sphere' || item.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (item.radius ?? 1) * this.view.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.fillWorldRect(ctx, item.x, item.y, item.w ?? 4, item.h ?? 4, ctx.fillStyle);
      }
    }
    ctx.restore();
  }

  drawTiles(ctx) {
    for (const tile of this.state.level.tiles) {
      const color = colorToHex(tile.color ?? MATERIALS[tile.material]?.color ?? 0x7a808c);
      if (tile.shape === 'sphere') {
        const p = this.worldToScreen(tile.x, tile.y);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (tile.radius ?? 0.5) * this.view.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.fillWorldRect(ctx, tile.x, tile.y, tile.w ?? 1, tile.h ?? 1, color);
      }
      if (tile.dynamic) {
        const p = this.worldToScreen(tile.x, tile.y);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
    }
  }

  drawHazards(ctx) {
    for (const hazard of this.state.level.hazards) {
      if (hazard.kind === 'lava') {
        this.fillWorldRect(ctx, hazard.x, hazard.y, hazard.w ?? 1, hazard.h ?? 0.4, colorToHex(hazard.color ?? 0xff4a1c));
      } else if (hazard.kind === 'spike') {
        this.drawSpike(ctx, hazard);
      } else if (hazard.kind === 'saw') {
        const p = this.worldToScreen(hazard.x, hazard.y);
        ctx.fillStyle = '#d7dde8';
        ctx.strokeStyle = '#3c4450';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (hazard.radius ?? 0.55) * this.view.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const half = (hazard.w ?? 1) / 2;
        const a = this.worldToScreen(hazard.x - half, hazard.y);
        const b = this.worldToScreen(hazard.x + half, hazard.y);
        ctx.strokeStyle = 'rgba(215,221,232,0.35)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (hazard.kind === 'pendulum') {
        const a = this.worldToScreen(hazard.x, hazard.y);
        const b = this.worldToScreen(hazard.x, hazard.y - (hazard.length ?? 4));
        ctx.strokeStyle = '#abb2c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#d7dde8';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 0.45 * this.view.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawSpike(ctx, hazard) {
    const count = Math.max(1, Math.round((hazard.w ?? 1) / 0.35));
    const baseY = hazard.y;
    const left = hazard.x - (hazard.w ?? 1) / 2;
    ctx.fillStyle = colorToHex(hazard.color ?? (hazard.pointDown ? 0xcde6ff : 0xddddee));
    for (let i = 0; i < count; i++) {
      const x = left + ((i + 0.5) / count) * (hazard.w ?? 1);
      const p0 = this.worldToScreen(x - 0.15, baseY);
      const p1 = this.worldToScreen(x + 0.15, baseY);
      const tip = this.worldToScreen(x, baseY + (hazard.pointDown ? -0.55 : 0.55));
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawPoints(ctx, points, color, glyph) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 16px system-ui, sans-serif';
    for (const point of points) {
      const p = this.worldToScreen(point.x, point.y);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(glyph, p.x, p.y + 1);
    }
    ctx.restore();
  }

  drawSelection(ctx) {
    if (this.state.tool !== 'select') return;
    const selected = this.state.selectedObject();
    if (!selected) return;
    const item = selected.item;
    ctx.save();
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const bounds = this.getResizeBounds(selected.type, item);
    if (bounds) this.strokeWorldRect(ctx, bounds.x, bounds.y, bounds.w, bounds.h);
    else {
      const p = this.worldToScreen(item.x, item.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.drawResizeHandles(ctx, selected.type, item);
    ctx.restore();
  }

  drawResizeHandles(ctx, type, item) {
    const handles = this.getResizeHandles(type, item);
    if (!handles.length) return;
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd24d';
    ctx.strokeStyle = '#15120a';
    ctx.lineWidth = 2;
    for (const handle of handles) {
      const p = this.worldToScreen(handle.x, handle.y);
      ctx.beginPath();
      ctx.rect(p.x - 5, p.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
  }

  strokeHazard(ctx, item) {
    if (item.kind === 'pendulum') this.strokeWorldRect(ctx, item.x, item.y - (item.length ?? 4) / 2, 1, item.length ?? 4);
    else this.strokeWorldRect(ctx, item.x, item.y, item.w ?? ((item.radius ?? 1) * 2), item.h ?? ((item.radius ?? 1) * 2));
  }

  strokeBackground(ctx, item) {
    if (item.type === 'chain') this.strokeWorldRect(ctx, item.x, item.y - (item.length ?? 5) / 2, 0.6, item.length ?? 5);
    else this.strokeWorldRect(ctx, item.x, item.y, item.w ?? ((item.radius ?? 1) * 2), item.h ?? ((item.radius ?? 1) * 2));
  }

  fillWorldRect(ctx, x, y, w, h, color) {
    const p = this.worldToScreen(x - w / 2, y + h / 2);
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, w * this.view.zoom, h * this.view.zoom);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, w * this.view.zoom, h * this.view.zoom);
  }

  strokeWorldRect(ctx, x, y, w, h) {
    const p = this.worldToScreen(x - w / 2, y + h / 2);
    ctx.strokeRect(p.x, p.y, w * this.view.zoom, h * this.view.zoom);
  }

  worldToScreen(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.width / 2 + (x - this.view.x) * this.view.zoom,
      y: rect.height * 0.58 - (y - this.view.y) * this.view.zoom,
    };
  }

  screenToWorld(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: this.view.x + (x - rect.width / 2) / this.view.zoom,
      y: this.view.y - (y - rect.height * 0.58) / this.view.zoom,
    };
  }

  snapPoint(point, type) {
    if (!this.state.gridSnap) return { x: round(point.x, 2), y: round(point.y, 2) };
    if (type === 'tiles') return { x: Math.round(point.x), y: Math.round(point.y) };
    return { x: round(point.x * 2) / 2, y: round(point.y * 2) / 2 };
  }

  toast(message) {
    this.status.textContent = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.renderStatus(), 1400);
  }
}

function pointInTile(point, tile) {
  if (tile.shape === 'sphere') return Math.hypot(point.x - tile.x, point.y - tile.y) <= (tile.radius ?? 0.5);
  return Math.abs(point.x - tile.x) <= (tile.w ?? 1) / 2 && Math.abs(point.y - tile.y) <= (tile.h ?? 1) / 2;
}

function pointInHazard(point, hazard) {
  if (hazard.kind === 'pendulum') {
    const minY = hazard.y - (hazard.length ?? 4) - 0.6;
    return Math.abs(point.x - hazard.x) <= 0.8 && point.y <= hazard.y + 0.4 && point.y >= minY;
  }
  const w = hazard.kind === 'saw' ? (hazard.radius ?? 0.55) * 2 : hazard.w ?? 1;
  const h = hazard.kind === 'saw' ? (hazard.radius ?? 0.55) * 2 : hazard.h ?? 0.8;
  return Math.abs(point.x - hazard.x) <= w / 2 && Math.abs(point.y - hazard.y) <= h / 2;
}

function pointInBackground(point, bg) {
  if (bg.type === 'chain') return Math.abs(point.x - bg.x) <= 0.4 && point.y <= bg.y && point.y >= bg.y - (bg.length ?? 5);
  if (bg.shape === 'sphere' || bg.shape === 'circle') return Math.hypot(point.x - bg.x, point.y - bg.y) <= (bg.radius ?? 1);
  return Math.abs(point.x - bg.x) <= (bg.w ?? 4) / 2 && Math.abs(point.y - bg.y) <= (bg.h ?? 4) / 2;
}

function readInputValue(el, field) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'color' || field === 'bgColor' || field === 'color') return hexToColor(el.value);
  if (el.type === 'number') return el.value === '' ? undefined : Number(el.value);
  return el.value;
}

function parsePath(path) {
  return String(path).split('.').map(part => /^\d+$/.test(part) ? Number(part) : part);
}

function setPath(target, path, value) {
  let cur = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    if (cur[key] == null) cur[key] = typeof nextKey === 'number' ? [] : {};
    cur = cur[key];
  }
  const last = path[path.length - 1];
  if (value === undefined || value === '') delete cur[last];
  else cur[last] = value;
}

function defaultLevelAdvanced(field) {
  if (field === 'killBound') return { x: 32, y: 24 };
  if (field === 'cameraClamp') return { x: [-30, 30], y: [-20, 24], zoom: [12, 28] };
  if (field === 'stationBounds') return { x0: -17, x1: 17 };
  if (field === 'meteorShower') return { activateAfter: 20, interval: [6, 11], perShower: [1, 3] };
  return {};
}

function defaultObjectAdvanced(field, item) {
  if (field === 'move') {
    const axis = 'y';
    return { axis, from: (item.y ?? 0) - 3, to: (item.y ?? 0) + 3, speed: 1, phase: 0 };
  }
  if (field === 'suspend') return { y: (item.y ?? 0) + 5, segs: 5, hp: 22 };
  if (field === 'rise') return { height: 4, period: 10, phase: 0 };
  return {};
}

function labelFor(key) {
  return key.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, m => m.toUpperCase());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}
