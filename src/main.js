// Boot. Rapier WASM init must happen before Game is constructed.
import { initRapier } from './physics/cannon-shim.js';
import { isDevMode } from './util/devMode.js';

// Dev test harness (~760 lines of window.__weaponTest helpers) loads ONLY in
// dev mode (?dev, or localStorage dev=1), so production never ships it.
function loadDevHarness() {
  let stored = null;
  try { stored = localStorage.getItem('dev'); } catch (_) { /* storage blocked */ }
  if (isDevMode(location.search, stored)) {
    import('./util/__weaponDebug.js').catch((e) => console.warn('[dev] harness failed to load', e));
  }
}

async function boot() {
  loadDevHarness();
  try {
    await initRapier();
  } catch (err) {
    document.getElementById('loading').textContent = 'Physics engine failed to load: ' + (err?.message || err);
    return;
  }
  const { Game } = await import('./Game.js');
  window.game = new Game();

  document.getElementById('game').addEventListener('contextmenu', (e) => e.preventDefault());
  bootPlaytest(window.game);

  function checkOrientation() {
    if (window.innerHeight > window.innerWidth && matchMedia('(pointer: coarse)').matches) {
      document.body.classList.add('portrait');
    } else {
      document.body.classList.remove('portrait');
    }
  }
  addEventListener('resize', checkOrientation);
  addEventListener('orientationchange', checkOrientation);
  checkOrientation();
}

function bootPlaytest(game) {
  const params = new URLSearchParams(location.search);
  if (!params.has('playtestLevel')) return;
  let levelDef = null;
  try {
    const raw = localStorage.getItem('sticksmash.editor.playtestLevel');
    levelDef = raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[editor] failed to load playtest level', err);
  }
  if (!levelDef) {
    document.getElementById('loading').textContent = 'No editor playtest level found.';
    return;
  }
  requestAnimationFrame(() => {
    game.startLocal({
      character: 'bolt',
      name: 'Editor',
      bots: 2,
      levelId: levelDef.id || 'editor-level',
      levelDef,
    });
  });
}

boot();
