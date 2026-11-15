// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// killfeed, bomb status, buy menu and the overlays. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out. Every setter
// caches its last value and skips the DOM when nothing changed.
const COPY = {
  start: {
    title: 'AMBER YARD',
    copy: 'Five Cobalt against five Ember. Plant the bomb at A or B — or drop every Ember — and take the round. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'AMBER YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthNum = $('health-num');
  const healthBar = $('health-bar');
  const armourNum = $('armour-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const bombStatus = $('bomb-status');
  const bombBar = $('bomb-bar');
  const bombLabel = $('bomb-label');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const vignette = $('damage-vignette');
  const markerA = $('marker-a');
  const markerB = $('marker-b');
  const grenadeValue = $('grenade-value');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, armour) {
      setText(healthNum, 'hp', String(Math.ceil(hp)));
      setText(armourNum, 'armour', String(Math.ceil(armour)));
      if (last.hpBar !== hp) {
        last.hpBar = hp;
        healthBar.style.width = `${Math.max(0, hp)}%`;
        healthBar.classList.toggle('low', hp <= 30);
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(m) {
      setText(moneyValue, 'money', `$${m}`);
    },
    setGrenades(n) {
      setText(grenadeValue, 'nades', `◉ ${n}`);
    },
    setTimer(seconds, urgent) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      timerValue.classList.toggle('urgent', !!urgent);
    },
    setScore(cobalt, ember, round) {
      setText(scoreValue, 'score', `${cobalt} — ${ember}`);
      setText(roundValue, 'round', `ROUND ${round}`);
    },
    setAlive(cobalt, ember) {
      setText(aliveValue, 'alive', `⬢ ${cobalt}  ·  ⬡ ${ember}`);
    },
    setCrosshairGap(px) {
      const gap = Math.round(3 + px * 900);
      if (last.gap === gap) return;
      last.gap = gap;
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(severity) {
      vignette.style.opacity = String(Math.min(0.85, 0.25 + severity * 0.6));
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => {
        vignette.style.opacity = '0';
      }, 180);
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const k = document.createElement('span');
      k.className = killerTeam === 'cobalt' ? 'team-cobalt' : 'team-ember';
      k.textContent = killer;
      const sep = document.createElement('span');
      sep.className = 'feed-sep';
      sep.textContent = headshot ? ' ⌖ ' : ' » ';
      const v = document.createElement('span');
      v.className = killerTeam === 'cobalt' ? 'team-ember' : 'team-cobalt';
      v.textContent = victim;
      row.append(k, sep, v);
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 5000);
    },
    // status: 'carried' | 'planting' | 'planted' | 'defusing' | 'hidden'
    setBomb(status, progress, fuse) {
      if (last.bombStatus !== status) {
        last.bombStatus = status;
        bombStatus.hidden = status === 'hidden';
        bombLabel.textContent =
          status === 'carried' ? 'BOMB — take it to A or B, hold E to plant'
          : status === 'planting' ? 'PLANTING…'
          : status === 'planted' ? 'BOMB PLANTED'
          : status === 'defusing' ? 'DEFUSING…'
          : '';
        bombStatus.classList.toggle('planted', status === 'planted');
      }
      if (status === 'planting' || status === 'defusing') {
        bombBar.style.width = `${Math.round(progress * 100)}%`;
      } else if (status === 'planted') {
        bombBar.style.width = `${Math.max(0, (fuse / 35) * 100)}%`;
        setText(bombLabel, 'fuse', `BOMB PLANTED — ${Math.ceil(fuse)}s`);
      }
    },
    banner(title, sub, holdMs = 3200) {
      if (!title) {
        bannerEl.hidden = true;
        return;
      }
      bannerTitle.textContent = title;
      bannerSub.textContent = sub || '';
      bannerEl.hidden = false;
      clearTimeout(bannerTimer);
      if (holdMs > 0) bannerTimer = setTimeout(() => { bannerEl.hidden = true; }, holdMs);
    },
    showBuy(money, owned) {
      buyMenu.hidden = false;
      setText(moneyValue, 'money', `$${money}`);
      for (const item of buyMenu.querySelectorAll('[data-buy]')) {
        const kind = item.dataset.buy;
        item.classList.toggle('owned', !!owned[kind]);
      }
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    setSiteMarker(letter, x, y, visible) {
      const el = letter === 'A' ? markerA : markerB;
      if (!visible) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    },
    showOverlay(mode, data) {
      if (mode === 'matchEnd') {
        overlayTitle.textContent = data.won ? 'MATCH WON' : 'MATCH LOST';
        overlayCopy.textContent = `Cobalt ${data.cobalt} — ${data.ember} Ember. ${data.kills} eliminations, ${data.deaths} deaths.`;
        play.textContent = 'Play again';
      } else {
        const text = COPY[mode];
        overlayTitle.textContent = text.title;
        overlayCopy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-buy]');
        if (button) handler(button.dataset.buy);
      });
    },
  };
}
