// In-game HUD: scoreboard, kill feed, weapon icon, center messages, FPS counter.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud-root');
    this.root.innerHTML = `
      <div id="hud">
        <div class="scoreboard"></div>
        <div class="fps"></div>
      </div>
      <div class="kill-feed"></div>
      <div class="weapon-icon" style="display:none"><div class="ico"></div><div class="name"></div><div class="ammo"></div></div>
      <div class="hp-bar" style="display:none"><div class="hp-fill"></div><div class="armor-fill"></div><div class="hp-text"></div></div>
      <div class="buffs"></div>
      <div class="dmg-flash"></div>
      <div class="time-vignette"></div>
      <div id="center-msg" style="display:none"></div>
    `;
    this.dmgFlashEl = this.root.querySelector('.dmg-flash');
    this.buffsEl = this.root.querySelector('.buffs');
    this.vignetteEl = this.root.querySelector('.time-vignette');
    this.hpEl = this.root.querySelector('.hp-bar');
    this.hpFill = this.root.querySelector('.hp-fill');
    this.armorFill = this.root.querySelector('.armor-fill');
    this.hpText = this.root.querySelector('.hp-text');
    this.scoreEl = this.root.querySelector('.scoreboard');
    this.fpsEl = this.root.querySelector('.fps');
    this.feedEl = this.root.querySelector('.kill-feed');
    this.weaponEl = this.root.querySelector('.weapon-icon');
    this.weaponIco = this.weaponEl.querySelector('.ico');
    this.weaponName = this.weaponEl.querySelector('.name');
    this.weaponAmmo = this.weaponEl.querySelector('.ammo');
    this.centerEl = this.root.querySelector('#center-msg');
  }

  toast(text, ms = 1200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.cssText = 'top:20%;font-size:18px;padding:8px 18px;animation:slideIn 0.2s;';
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => { el.style.opacity = 0; el.style.transition = 'opacity 0.3s'; }, ms - 300);
    setTimeout(() => el.remove(), ms);
  }

  damageFlash(amount) {
    if (!this.dmgFlashEl) return;
    const intensity = clamp(amount / 50, 0.15, 0.7);
    this.dmgFlashEl.style.opacity = intensity;
    if (this._dmgTimer) clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => { this.dmgFlashEl.style.opacity = 0; }, 220);
  }

  killFeed(line) {
    const el = document.createElement('div');
    el.className = 'kill-msg';
    el.textContent = line;
    this.feedEl.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  showCenter(big, small = '', ms = 2000) {
    this.centerEl.style.display = '';
    this.centerEl.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
    clearTimeout(this._centerHide);
    this._centerHide = setTimeout(() => { this.centerEl.style.display = 'none'; }, ms);
  }

  update() {
    // Scoreboard
    let html = '';
    for (const p of this.game.players) {
      if (!p) continue;
      const hex = (p.character.primary ?? 0xffffff).toString(16).padStart(6, '0');
      const dead = p.state === 'dead' ? 'dead' : '';
      html += `<div class="score-pill ${dead}" style="--c:#${hex}">
        <span class="dot"></span>
        <span>${p.name}</span>
        <span style="opacity:0.7">${p.score}</span>
        <span class="deaths">×${p.lives}</span>
      </div>`;
    }
    this.scoreEl.innerHTML = html;

    // Weapon
    const local = this.game.localPlayer;
    if (local && local.weapon) {
      this.weaponEl.style.display = '';
      this.weaponIco.textContent = local.weapon.icon || '⚔';
      this.weaponName.textContent = local.weapon.name;
      this.weaponAmmo.textContent = isFinite(local.weapon.ammo) ? `× ${local.weapon.ammo}` : '∞';
    } else if (local) {
      this.weaponEl.style.display = 'none';
    }

    // Active buffs
    if (local && local.alive && this.buffsEl) {
      const now = performance.now();
      const buffs = [
        { name: 'flight',  icon: '🪽', until: local.flightUntil,     col: '#9be8ff' },
        { name: 'invis',   icon: '👻', until: local.invisibleUntil, col: '#aaaaaa' },
        { name: 'time',    icon: '⏱', until: local.timeSlowUntil,  col: '#ff4d6d' },
        { name: 'super',   icon: '👊', until: local.superPunchUntil, col: '#ffcc33' },
        { name: 'speed',   icon: '⚡', until: local.speedBoostUntil, col: '#66e2a3' },
        { name: 'gum',     icon: '🟣', until: local.gumGumUntil,    col: '#c870ff' },
        { name: 'push',    icon: '🌀', until: local.forcePushUntil, col: '#77aaff' },
        { name: 'pull',    icon: '🧲', until: local.forcePullUntil, col: '#4dccff' },
        { name: 'lightng', icon: '⚡', until: local.forceLightningUntil, col: '#c870ff' },
        { name: 'choke',   icon: '👐', until: local.forceChokeUntil, col: '#ff4d6d' },
      ];
      let html = '';
      for (const b of buffs) {
        const left = (b.until || 0) - now;
        if (left <= 0) continue;
        const sec = (left / 1000).toFixed(1);
        html += `<div class="buff" style="border-color:${b.col};color:${b.col}"><span>${b.icon}</span><span>${sec}s</span></div>`;
      }
      this.buffsEl.innerHTML = html;
    }

    // Bullet-time vignette
    if (this.vignetteEl) {
      const owner = this.game.timeSlowOwner;
      const slow = owner?.alive && performance.now() < owner.timeSlowUntil;
      this.vignetteEl.style.opacity = slow ? '1' : '0';
    }

    // Health bar
    if (local && local.alive) {
      this.hpEl.style.display = '';
      const pct = Math.max(0, local.health) / local.maxHealth;
      this.hpFill.style.width = `${pct * 100}%`;
      const hue = pct > 0.5 ? 130 : pct > 0.25 ? 50 : 0;
      this.hpFill.style.background = `linear-gradient(180deg, hsl(${hue} 80% 60%), hsl(${hue} 70% 40%))`;
      const armorPct = local.armor / local.maxArmor;
      this.armorFill.style.width = `${armorPct * 100}%`;
      this.hpText.textContent = local.armor > 0
        ? `${Math.ceil(local.armor)} 🛡 ${Math.ceil(Math.max(0, local.health))} / ${local.maxHealth}`
        : `${Math.ceil(Math.max(0, local.health))} / ${local.maxHealth}`;
    } else if (this.hpEl) {
      this.hpEl.style.display = 'none';
    }

    if (this._fpsAcc == null) { this._fpsAcc = 0; this._fpsN = 0; }
  }

  setFPS(fps) {
    this.fpsEl.textContent = `${Math.round(fps)} FPS`;
  }

  destroy() {
    this.root.innerHTML = '';
  }
}
