// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// kill feed and every overlay panel. It never touches the simulation; main.js
// pushes numbers in and reads button callbacks out. The buy menu is a real
// shop: prices, owned state and the player's credits, all live.
import { ARSENAL, GRENADE_PRICE } from './weapons.js';

const COPY = {
  start: { title: 'EMBER YARD', copy: 'Attack the yard. Plant the spike at Depot or Silo, or drop all four Slate defenders. Buy between rounds — stopping to aim pays.', action: 'Click to play' },
  paused: { title: 'EMBER YARD', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  roundEnd: { title: '', copy: '', action: 'Next round' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoEl = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEl = $('score-value');
  const roundEl = $('round-value');
  const feedEl = $('feed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const messageEl = $('message');
  const plantEl = $('plant');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const vignette = $('vignette');
  const buyEl = $('buy');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastWeapon = '';
  let messageTimer = 0;

  // Build the shop once: one button per gun plus the grenade.
  const buttons = {};
  for (const key of Object.keys(ARSENAL)) {
    const def = ARSENAL[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buy-item';
    btn.dataset.key = key;
    btn.innerHTML = `<b>${def.name}</b><span>${def.kind} · ${def.damage} dmg · ${def.mag} rnd</span><i>$${def.price}</i>`;
    btn.addEventListener('click', () => callbacks.buy(key));
    buyGrid.appendChild(btn);
    buttons[key] = btn;
  }
  const grenadeBtn = document.createElement('button');
  grenadeBtn.type = 'button';
  grenadeBtn.className = 'buy-item';
  grenadeBtn.innerHTML = `<b>Ember charge</b><span>grenade · throw with G · blast radius</span><i>$${GRENADE_PRICE}</i>`;
  grenadeBtn.addEventListener('click', () => callbacks.buy('grenade'));
  buyGrid.appendChild(grenadeBtn);
  buttons.grenade = grenadeBtn;

  play.addEventListener('click', () => callbacks.play());

  return {
    setAmmo(mag, reserve, name) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag; lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        ammoEl.classList.toggle('empty', mag === 0);
      }
      if (name !== lastWeapon) { lastWeapon = name; weaponName.textContent = name; }
    },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === lastHealth) return;
      lastHealth = v;
      healthNum.textContent = String(v);
      healthFill.style.width = `${v}%`;
      healthFill.classList.toggle('low', v <= 30);
    },
    setMoney(money) {
      const v = Math.round(money);
      if (v === lastMoney) return;
      lastMoney = v;
      moneyEl.textContent = `$${v}`;
      buyMoney.textContent = `$${v}`;
    },
    setTimer(text) {
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
    },
    setScore(wins, losses, round) {
      const text = `${wins} — ${losses}`;
      if (text !== lastScore) { lastScore = text; scoreEl.textContent = text; }
      roundEl.textContent = `ROUND ${round} / 9`;
    },
    setFeed(feed) {
      feedEl.innerHTML = feed.map((f) => `<div class="${f.good ? 'good' : 'bad'}">${f.text}</div>`).join('');
    },
    setSpread(spread) {
      const gap = Math.round(4 + spread * 260);
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    message(text, ms = 2600) {
      messageEl.textContent = text;
      messageEl.classList.add('on');
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => messageEl.classList.remove('on'), ms);
    },
    setPlant(label, progress) {
      if (label) {
        plantEl.hidden = false;
        plantLabel.textContent = label;
        plantFill.style.width = `${Math.round(progress * 100)}%`;
      } else plantEl.hidden = true;
    },
    showOverlay(mode, data) {
      let text = COPY[mode];
      if (mode === 'roundEnd') {
        text = {
          title: data.winner === 'ember' ? 'ROUND WON' : 'ROUND LOST',
          copy: data.reason,
          action: 'Next round',
        };
      } else if (mode === 'matchEnd') {
        text = {
          title: data.winner === 'ember' ? 'MATCH WON — EMBER TAKES THE YARD' : 'MATCH LOST — SLATE HOLDS THE YARD',
          copy: `Final score Ember ${data.wins} — ${data.losses} Slate. ${data.kills} eliminations, ${data.plants} plants.`,
          action: 'Play again',
        };
      }
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
    },
    hideOverlay() { overlay.hidden = true; },
    showBuy(money, owned, grenades) {
      buyEl.hidden = false;
      buyMoney.textContent = `$${Math.round(money)}`;
      for (const key of Object.keys(ARSENAL)) {
        const btn = buttons[key];
        const def = ARSENAL[key];
        btn.classList.toggle('owned', !!owned[key]);
        btn.classList.toggle('cant', !owned[key] && money < def.price);
        btn.querySelector('i').textContent = owned[key] ? 'OWNED' : `$${def.price}`;
      }
      grenadeBtn.querySelector('i').textContent = grenades > 0 ? `x${grenades} OWNED` : `$${GRENADE_PRICE}`;
    },
    hideBuy() { buyEl.hidden = true; },
    updateBuy(money, owned, grenades) { this.showBuy(money, owned, grenades); },
  };
}
