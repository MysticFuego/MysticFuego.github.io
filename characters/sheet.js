/* ═══════════════════════════════════════════════════════════════════════
   sheet.js — the engine shared by every character sheet.

   Each sheet defines a SHEET config object BEFORE loading this file:

     <script>
     const SHEET = {
       prefix: 'anta_v1_',        // localStorage namespace
       hpMax: 42,
       shortRest: { keys: ['channelDivinity'], msg: 'Channel Divinity recharged.' },
       maxPrepared: 9,            // casters with a prepared list
       defaultPrepared: [...],    // starting prepared list until the player edits it
       domainSpells: [...],       // always-prepared spells (optional)
       extraHp: [...],            // companion HP boxes (optional)
       crit19: false,             // Champion improved crit (optional)
       rules: '2024'              // '2014' (default) or '2024' — a 2024 long
                                  // rest restores ALL Hit Dice, 2014 only half
     };
     </script>
     <script src="sheet.js"></script>

   Everything else is discovered from the markup: any .dots-row with an id
   and a data-key becomes a tracker, any .roll-btn becomes a die roll, and
   panels that aren't present are simply skipped.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* A top-level `const SHEET` is a script-scoped binding, not a window property,
   so read it by name and fall back to window for either declaration style. */
var CFG = (typeof SHEET !== 'undefined' && SHEET) || window.SHEET || {};
var PREFIX = CFG.prefix;
var HP_MAX = CFG.hpMax;

/* ── STORAGE ─────────────────────────────────────────────────────────── */
function save(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} }
function load(k, fallback) {
  try { var v = JSON.parse(localStorage.getItem(PREFIX + k)); return v === null ? fallback : v; }
  catch (e) { return fallback; }
}
var $ = function (id) { return document.getElementById(id); };

/* ── TABS ──────────────────────────────────────────────────────────────
   The bar sticks to the top of the screen on phones. Switching tabs while
   scrolled down jumps to the top of the new tab instead of leaving the
   player halfway down a page they have never seen, and the sheet reopens on
   the tab that was open last. */
function showTab(btn, scroll) {
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
  btn.classList.add('active');
  var pane = $('tab-' + btn.dataset.tab);
  if (pane) pane.classList.add('active');
  save('lastTab', btn.dataset.tab);
  var bar = document.querySelector('.tabs-bar');
  if (scroll && bar && pane) {
    /* Measured from the pane, not the bar: a stuck bar reports where it is
       stuck, not where it sits in the page. */
    var y = pane.getBoundingClientRect().top + window.pageYOffset - bar.offsetHeight - 10;
    if (window.pageYOffset > y) window.scrollTo(0, Math.max(0, y));
  }
  if (btn.scrollIntoView && btn.parentNode.scrollWidth > btn.parentNode.clientWidth) {
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { showTab(btn, true); });
});
(function restoreTab() {
  var last = load('lastTab', null);
  var btn = last && document.querySelector('.tab-btn[data-tab="' + last + '"]');
  if (btn) showTab(btn, false);
})();

/* ── DOT TRACKERS ────────────────────────────────────────────────────── */
function dotRows() {
  return Array.prototype.slice.call(document.querySelectorAll('.dots-row[id][data-key]'));
}
function isHitDice(el) { return (el.dataset.key || '').indexOf('hitDice') === 0; }

function makeDots(id) {
  var el = $(id);
  if (!el) return;
  var total = Number(el.dataset.total || 0);
  var key = el.dataset.key;
  var used = load(key, []);
  el.innerHTML = '';
  for (var i = 0; i < total; i++) {
    (function (i) {
      var btn = document.createElement('button');
      btn.className = 'dot';
      var isUsed = used.indexOf(i) >= 0;
      if (isUsed) {
        if (el.dataset.success === 'true') btn.classList.add('success');
        else if (el.dataset.fail === 'true') btn.classList.add('fail');
        else if (el.dataset.slot === 'true') btn.classList.add('slot-used');
        else if (el.dataset.fey === 'true') btn.classList.add('fey');
        else btn.classList.add('used');
      }
      btn.textContent = i + 1;
      btn.setAttribute('aria-pressed', isUsed ? 'true' : 'false');
      btn.setAttribute('aria-label', (el.dataset.label || key) + ' ' + (i + 1) + ', ' + (isUsed ? 'spent' : 'available'));
      btn.addEventListener('click', function () {
        var cur = load(key, []);
        var idx = cur.indexOf(i);
        if (idx >= 0) cur.splice(idx, 1); else cur.push(i);
        save(key, cur);
        makeDots(id);
      });
      el.appendChild(btn);
    })(i);
  }
  paintDotsCount(el, total, used.length);
}

/* "3 of 5 left" under each tracker, so nobody has to work out which colour
   means spent. Death saves count up, not down, so they get no counter. */
function paintDotsCount(el, total, spent) {
  if (!total || el.dataset.success === 'true' || el.dataset.fail === 'true') return;
  var c = el.nextElementSibling;
  if (!c || !c.classList.contains('dots-count')) {
    c = document.createElement('div');
    c.className = 'dots-count';
    el.insertAdjacentElement('afterend', c);
  }
  var left = Math.max(0, total - spent);
  c.textContent = left + ' of ' + total + ' left';
  c.classList.toggle('empty', left === 0);
}

/* One line of instructions above the first tracker panel. */
(function addDotsLegend() {
  var first = document.querySelector('.tracker-grid') || document.querySelector('.dots-row[data-key]');
  var panel = first && first.closest('.panel');
  var title = panel && panel.querySelector('.panel-title');
  if (!title) return;
  var d = document.createElement('div');
  d.className = 'dots-legend';
  d.textContent = 'Tap a box when you use it, tap again to undo. ' +
                  'The count under each tracker is what you have left; rests refill them.';
  title.insertAdjacentElement('afterend', d);
})();
function refreshDots() { dotRows().forEach(function (el) { makeDots(el.id); }); }

/* ── HIT POINTS ──────────────────────────────────────────────────────── */
function updateHp() {
  var el = $('hpCurrent');
  if (!el) return;
  var val = Number(el.value);
  el.classList.remove('hp-warn', 'hp-danger');
  var dp = $('deathSavePanel');
  if (val === 0) {
    el.classList.add('hp-danger');
    if (dp) dp.style.display = '';
  } else {
    if (dp) dp.style.display = 'none';
    if (val <= Math.floor(HP_MAX * 0.25)) el.classList.add('hp-danger');
    else if (val <= Math.floor(HP_MAX * 0.5)) el.classList.add('hp-warn');
  }
  var pill = $('hpPill');
  if (pill) pill.textContent = val + '/' + HP_MAX;
}

function bindInput(id, key) {
  var el = $(id); if (!el) return;
  el.value = load(key, el.value);
  el.addEventListener('input', function () {
    save(key, el.value);
    if (id === 'hpCurrent') updateHp();
  });
}
function bindText(id, key) {
  var el = $(id); if (!el) return;
  el.value = load(key, '');
  el.addEventListener('input', function () { save(key, el.value); });
}

function setHp(v) {
  var el = $('hpCurrent'); if (!el) return;
  el.value = Math.max(0, Math.min(HP_MAX, v));
  save('hpCurrent', el.value);
  updateHp();
}
function setTempHp(v) {
  var el = $('hpTemp'); if (!el) return;
  el.value = Math.max(0, v);
  save('hpTemp', el.value);
}

/* Damage drains temporary hit points first, then real HP (PHB p.198). */
function applyDamage(amt) {
  var tempEl = $('hpTemp');
  var temp = tempEl ? Number(tempEl.value) || 0 : 0;
  var absorbed = Math.min(temp, amt);
  if (absorbed > 0) setTempHp(temp - absorbed);
  var rest = amt - absorbed;
  if (rest > 0) setHp(Number($('hpCurrent').value) - rest);
  else updateHp();
  return { absorbed: absorbed, toHp: rest };
}

/* ── INSPIRATION ─────────────────────────────────────────────────────── */
(function () {
  var pill = $('inspirationPill'), val = $('inspirationVal');
  if (!pill || !val) return;
  var on = load('inspiration', false);
  function draw() { val.textContent = on ? '✦ ON' : 'Off'; pill.classList.toggle('on', on); }
  draw();
  pill.addEventListener('click', function () { on = !on; save('inspiration', on); draw(); });
})();

/* ── CONCENTRATION ───────────────────────────────────────────────────── */
var Conc = (function () {
  var toggle = $('concToggle'), dot = $('concDot'), label = $('concLabel'), body = $('concBody');
  if (!toggle) return { active: function () { return false; }, drop: function () {} };
  var on = load('concActive', false);
  function draw() {
    toggle.classList.toggle('active', on);
    if (dot) dot.classList.toggle('on', on);
    if (body) body.classList.toggle('open', on);
    if (label) label.textContent = on ? 'Concentrating' : 'Not Concentrating';
  }
  draw();
  toggle.addEventListener('click', function () { on = !on; save('concActive', on); draw(); });
  bindText('concSpell', 'concSpell');
  bindText('concNotes', 'concNotes');
  function clear() {
    on = false;
    save('concActive', false); save('concSpell', ''); save('concNotes', '');
    if ($('concSpell')) $('concSpell').value = '';
    if ($('concNotes')) $('concNotes').value = '';
    draw();
  }
  var btn = $('clearConcBtn');
  if (btn) btn.addEventListener('click', clear);
  return {
    active: function () { return on; },
    spell: function () { return ($('concSpell') && $('concSpell').value) || 'your spell'; },
    drop: clear
  };
})();

/* ── ROLL MODE: advantage / disadvantage / critical ───────────────────
   Session-only on purpose: it resets to Normal on every page load so a
   forgotten "advantage" can never silently follow you into a later roll. */
var Mode = { adv: 0, crit: false };   // adv: 1 advantage, -1 disadvantage

(function buildRollControls() {
  var log = $('rollLog');
  if (!log) return;
  var panel = log.closest ? log.closest('.panel') : null;
  var title = panel && panel.querySelector('.panel-title');
  if (!title) return;

  var bar = document.createElement('div');
  bar.className = 'roll-mode-bar';
  bar.innerHTML =
    '<div class="roll-mode-group" role="group" aria-label="Roll mode">' +
      '<button class="roll-mode-btn on" data-adv="0">Normal</button>' +
      '<button class="roll-mode-btn adv" data-adv="1">Advantage</button>' +
      '<button class="roll-mode-btn dis" data-adv="-1">Disadvantage</button>' +
    '</div>' +
    '<button class="roll-mode-btn crit-btn" id="critToggle" aria-pressed="false" ' +
      'title="Doubles the dice on your next damage roll">Crit ×2</button>';
  title.insertAdjacentElement('afterend', bar);

  bar.querySelectorAll('[data-adv]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Mode.adv = Number(btn.dataset.adv);
      bar.querySelectorAll('[data-adv]').forEach(function (b) {
        b.classList.toggle('on', b === btn);
      });
    });
  });
  var crit = $('critToggle');
  crit.addEventListener('click', function () {
    Mode.crit = !Mode.crit;
    crit.classList.toggle('on', Mode.crit);
    crit.setAttribute('aria-pressed', Mode.crit ? 'true' : 'false');
    paintDamageButtons();
  });
})();

function setCrit(on) {
  Mode.crit = on;
  var c = $('critToggle');
  if (c) { c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  paintDamageButtons();
}
function paintDamageButtons() {
  document.querySelectorAll('.dmg-roll-btn').forEach(function (b) {
    b.classList.toggle('crit', Mode.crit);
    b.textContent = Mode.crit ? '🎲 crit dmg' : '🎲 dmg';
  });
}

/* ── TOAST ───────────────────────────────────────────────────────────────
   On a phone the roll log sits in a different panel from the weapons and
   spells, usually off screen. Every roll therefore also pops up at the
   bottom of the screen; tap it to dismiss. The stat pills reuse it too. */
var Toast = (function () {
  var el = document.createElement('div');
  el.className = 'sheet-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  var timer;
  function hide() { el.classList.remove('show'); }
  el.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('a'))) hide(); });
  return {
    show: function (html, ms) {
      el.innerHTML = html;
      el.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(hide, ms || 4500);
    }
  };
})();

/* The roll log lives for the browser tab (sessionStorage), so popping out to
   5e.tools and back, or the phone reloading the page, keeps it. */
var LOG_KEY = PREFIX + 'rollLog';
(function restoreLog() {
  var log = $('rollLog'); if (!log) return;
  try { var html = sessionStorage.getItem(LOG_KEY); if (html) log.innerHTML = html; } catch (e) {}
})();

function logEntry(label, detail, total, cls, mark) {
  var log = $('rollLog'); if (!log) return;
  var empty = log.querySelector('.roll-log-empty');
  if (empty) empty.remove();
  var div = document.createElement('div');
  div.className = 'roll-entry';
  div.innerHTML =
    '<div><div class="roll-entry-label">' + label + '</div>' +
    '<div class="roll-entry-detail">' + detail + '</div></div>' +
    '<div class="roll-entry-total' + (cls || '') + '">' + total + (mark || '') + '</div>' +
    '<div class="roll-entry-time">' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>';
  log.insertBefore(div, log.firstChild);
  while (log.children.length > 12) log.removeChild(log.lastChild);
  try { sessionStorage.setItem(LOG_KEY, log.innerHTML); } catch (e) {}
  Toast.show('<div class="toast-roll"><div><div class="roll-entry-label">' + label + '</div>' +
             '<div class="roll-entry-detail">' + detail + '</div></div>' +
             '<div class="roll-entry-total' + (cls || '') + '">' + total + (mark || '') + '</div></div>');
}

/* ── d20 ATTACK / CHECK ROLLS ────────────────────────────────────────── */
function d20() { return Math.floor(Math.random() * 20) + 1; }

function addRoll(label, bonus, advOverride, isAttack) {
  var adv = advOverride === undefined ? Mode.adv : advOverride;
  var a = d20(), b = adv ? d20() : null;
  var die = b === null ? a : (adv > 0 ? Math.max(a, b) : Math.min(a, b));
  var total = die + bonus;
  var crit = die === 20 || (CFG.crit19 && die === 19);
  var fumble = die === 1;
  var cls = die === 20 ? ' nat20' : (CFG.crit19 && die === 19) ? ' nat19' : fumble ? ' nat1' : '';
  var mark = crit ? ' 🎉' : fumble ? ' 💀' : '';
  var bonusStr = bonus >= 0 ? '+' + bonus : '' + bonus;

  var dice;
  if (b === null) {
    dice = 'd20 (' + a + ')';
  } else {
    var kept = adv > 0 ? Math.max(a, b) : Math.min(a, b);
    var used = false;
    dice = 'd20 ' + (adv > 0 ? 'adv' : 'dis') + ' (' + [a, b].map(function (v) {
      if (v === kept && !used) { used = true; return '<strong>' + v + '</strong>'; }
      return '<s>' + v + '</s>';
    }).join(', ') + ')';
  }
  logEntry(label + (adv > 0 ? ' — advantage' : adv < 0 ? ' — disadvantage' : ''),
           dice + ' ' + bonusStr, total, cls, mark);
  /* Only an attack roll can crit. A natural 20 on a skill check or save is
     just a good roll, so it must not arm the damage multiplier. */
  if (crit && isAttack) setCrit(true);
}

document.querySelectorAll('.roll-btn').forEach(function (btn) {
  var isAttack = !!btn.closest('.weapon-card') ||
                 /attack/i.test(btn.dataset.label || '');
  btn.addEventListener('click', function (e) {
    var override;
    if (e.shiftKey) override = 1;
    else if (e.altKey) override = -1;
    addRoll(btn.dataset.label, Number(btn.dataset.bonus || 0), override, isAttack);
  });
});

/* ── DAMAGE ROLLS ─────────────────────────────────────────────────────
   Buttons are generated from the damage text already on each card, so
   character files need no extra markup. Only text that STARTS with dice
   notation gets a button — "1d6 + 4 piercing" does, "+2 AC to target"
   does not. */
var DICE_RE = /^\s*\+?\s*(\d+)d(\d+)\s*(?:([+−-])\s*(\d+))?/;

function parseDice(text) {
  var m = DICE_RE.exec((text || '').replace(/−/g, '-'));
  if (!m) return null;
  var mod = m[4] ? Number(m[4]) : 0;
  if (m[3] === '-') mod = -mod;
  return { n: Number(m[1]), faces: Number(m[2]), mod: mod };
}

function rollDamage(label, spec, isCrit) {
  var n = isCrit ? spec.n * 2 : spec.n;      // a crit doubles the dice, not the modifier
  var rolls = [], sum = 0;
  for (var i = 0; i < n; i++) { var r = Math.floor(Math.random() * spec.faces) + 1; rolls.push(r); sum += r; }
  var total = sum + spec.mod;
  var modStr = spec.mod ? (spec.mod > 0 ? ' + ' + spec.mod : ' − ' + Math.abs(spec.mod)) : '';
  logEntry(label + (isCrit ? ' — CRIT damage' : ' — damage'),
           n + 'd' + spec.faces + modStr + ' → (' + rolls.join(', ') + ')' + modStr,
           total, isCrit ? ' crit-dmg' : ' dmg', '');
  if (isCrit) setCrit(false);                // a crit applies once
}

function attachDamageButtons() {
  var targets = [];
  document.querySelectorAll('.weapon-card').forEach(function (card) {
    var name = card.querySelector('.weapon-name');
    var el = card.querySelector('.weapon-dmg');
    if (!el) {
      /* Some cards (Sneak Attack, and other riders) style their damage line
         inline instead of using .weapon-dmg — take the first line that reads
         as dice notation. */
      el = Array.prototype.slice.call(card.querySelectorAll('div')).filter(function (d) {
        return !d.children.length && DICE_RE.test(d.textContent.replace(/−/g, '-'));
      })[0];
    }
    if (el) targets.push([card, el, name ? name.textContent.trim() : 'Damage']);
  });
  document.querySelectorAll('.sneak-card').forEach(function (card) {
    var el = card.querySelector('.sneak-dice');
    if (el) targets.push([card, el, 'Sneak Attack']);
  });
  document.querySelectorAll('#spellGrid .spell-card').forEach(function (card) {
    var el = card.querySelector('.spell-dmg');
    var name = card.querySelector('.spell-card-name');
    if (el) targets.push([card, el, name ? name.textContent.trim() : 'Damage']);
  });

  targets.forEach(function (t) {
    var card = t[0], el = t[1], name = t[2];
    if (card.querySelector('.dmg-roll-btn')) return;
    var spec = parseDice(el.textContent);
    if (!spec) return;
    var btn = document.createElement('button');
    btn.className = 'dmg-roll-btn';
    btn.textContent = '🎲 dmg';
    btn.title = 'Roll ' + spec.n + 'd' + spec.faces + ' damage';
    btn.dataset.dmgLabel = name;
    btn.dataset.dmgN = spec.n;
    btn.dataset.dmgFaces = spec.faces;
    btn.dataset.dmgMod = spec.mod;
    el.appendChild(document.createTextNode(' '));
    el.appendChild(btn);
  });
}

/* Delegated so cloned cards (the prepared-spell list) work without rebinding. */
document.addEventListener('click', function (e) {
  var btn = e.target.closest && e.target.closest('.dmg-roll-btn');
  if (!btn) return;
  e.stopPropagation();
  rollDamage(btn.dataset.dmgLabel,
             { n: Number(btn.dataset.dmgN), faces: Number(btn.dataset.dmgFaces), mod: Number(btn.dataset.dmgMod) },
             e.shiftKey || Mode.crit);
});

/* ── RESTS ───────────────────────────────────────────────────────────── */
function resetExtraHp() {
  (CFG.extraHp || []).forEach(function (spec) {
    var el = $(spec.id); if (!el) return;
    el.value = String(spec.max);
    save(spec.id, el.value);
    paintExtraHp(spec);
  });
}
function paintExtraHp(spec) {
  var el = $(spec.id); if (!el) return;
  var v = Number(el.value);
  var warn = spec.warnAt != null ? spec.warnAt : Math.floor(spec.max * 0.25);
  var c = v === 0 ? 'var(--danger)' : v <= warn ? 'var(--warn)' : '';
  el.style.color = c; el.style.borderColor = c;
}
(CFG.extraHp || []).forEach(function (spec) {
  var el = $(spec.id); if (!el) return;
  el.value = load(spec.id, String(spec.max));
  paintExtraHp(spec);
  el.addEventListener('input', function () { save(spec.id, el.value); paintExtraHp(spec); });
});

var longBtn = $('longRestBtn');
if (longBtn) longBtn.addEventListener('click', function () {
  var rows = dotRows();
  var hd = rows.filter(isHitDice);

  /* Everything except hit dice comes back in full. */
  rows.filter(function (el) { return !isHitDice(el); })
      .forEach(function (el) { save(el.dataset.key, []); });

  /* Hit dice: 2014 rules regain HALF your total, minimum 1 (PHB 2014 p.186);
     2024 rules regain them all (PHB 2024, Long Rest). */
  var totalHd = hd.reduce(function (n, el) { return n + Number(el.dataset.total || 0); }, 0);
  var allHd = CFG.rules === '2024';
  var regainTotal = allHd ? totalHd : Math.max(1, Math.floor(totalHd / 2));
  var regain = regainTotal;
  hd.forEach(function (el) {
    var used = load(el.dataset.key, []).slice().sort(function (a, b) { return b - a; });
    while (regain > 0 && used.length) { used.shift(); regain--; }
    save(el.dataset.key, used);
  });

  setHp(HP_MAX);
  setTempHp(0);
  resetExtraHp();
  Conc.drop();
  refreshDots();

  var spent = hd.reduce(function (n, el) { return n + load(el.dataset.key, []).length; }, 0);
  if (totalHd) {
    alert('Long Rest: HP restored to full, all resources recharged.\n' +
          'Hit Dice: regained ' + (allHd ? 'all of them' : 'half your total') +
          ' (' + regainTotal + ' of ' + totalHd + ') — ' +
          spent + ' still spent.');
  }
});

var shortBtn = $('shortRestBtn');
if (shortBtn) shortBtn.addEventListener('click', function () {
  ((CFG.shortRest && CFG.shortRest.keys) || []).forEach(function (k) { save(k, []); });
  refreshDots();
  if (CFG.shortRest && CFG.shortRest.msg) alert('Short Rest: ' + CFG.shortRest.msg);
});

var clearDeath = $('clearDeathBtn');
if (clearDeath) clearDeath.addEventListener('click', function () {
  save('deathSuccess', []); save('deathFail', []);
  makeDots('deathSuccessDots'); makeDots('deathFailDots');
});

var clearAll = $('clearSessionBtn');
if (clearAll) clearAll.addEventListener('click', function () {
  if (!confirm('Clear all saved tracking data?')) return;
  Object.keys(localStorage).forEach(function (k) {
    if (k.indexOf(PREFIX) === 0) localStorage.removeItem(k);
  });
  location.reload();
});

/* ── SPELL SEARCH ────────────────────────────────────────────────────── */
var search = $('spellSearch');
if (search) search.addEventListener('input', function () {
  var q = this.value.toLowerCase().trim();
  document.querySelectorAll('#spellGrid .spell-card, #spellGrid .spell-level-header').forEach(function (el) {
    if (el.classList.contains('spell-level-header')) el.style.display = q ? 'none' : '';
    else el.style.display = !q || (el.dataset.name || '').indexOf(q) >= 0 ? '' : 'none';
  });
});

/* ── ALWAYS-PREPARED (DOMAIN / SUBCLASS) SPELLS ──────────────────────── */
function buildDomainSection() {
  var list = $('domainList');
  if (!list || !CFG.domainSpells) return;
  var LABEL = { domain: 'Domain', ritual: 'Ritual', conc: 'Conc', always: 'Always',
                bsmiths: 'Battle Smith', chron: 'Chronurgy', shadow: 'Shadow', prepared: 'Prepared' };
  Object.keys(CFG.badgeLabels || {}).forEach(function (k) { LABEL[k] = CFG.badgeLabels[k]; });
  var metaLabel = CFG.domainMetaLabel || 'Note';
  list.innerHTML = '';
  CFG.domainSpells.forEach(function (sp) {
    var div = document.createElement('div');
    div.className = 'spell-card';
    div.style.borderLeft = '3px solid var(--sheet-accent)';
    div.innerHTML =
      '<div class="spell-card-header">' +
        '<div class="spell-card-name"><a href="' + sp.link + '">' +
          sp.name.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + '</a></div>' +
        '<span style="font-size:10px;color:var(--muted);padding:2px 6px;border:1px solid var(--line2);border-radius:6px;">L' + sp.level + '</span>' +
      '</div>' +
      '<div class="spell-badges">' +
        sp.badges.map(function (b) { return '<span class="sbadge ' + b + '">' + (LABEL[b] || b) + '</span>'; }).join('') +
      '</div>' +
      '<div class="spell-meta">' +
        '<div class="spell-meta-item">Action <span>' + sp.action + '</span></div>' +
        '<div class="spell-meta-item">Range <span>' + sp.range + '</span></div>' +
        '<div class="spell-meta-item">Duration <span>' + sp.duration + '</span></div>' +
        '<div class="spell-meta-item">' + metaLabel + ' <span>' + sp.note + '</span></div>' +
      '</div>';
    list.appendChild(div);
  });
}

/* ── PREPARED SPELLS ─────────────────────────────────────────────────── */
var PREP_KEY = 'preparedSpells';
/* Until the player changes anything, start from the spells the character
   sheet in Foundry had prepared (CFG.defaultPrepared). */
function loadPrepared() {
  var v = load(PREP_KEY, null);
  if (v === null) v = CFG.defaultPrepared || [];
  return Array.isArray(v) ? v.slice() : [];
}
function savePrepared(l) { save(PREP_KEY, l); }

function buildPreparedSection() {
  var list = $('preparedList'); if (!list) return;
  var prepared = loadPrepared();
  var empty = $('preparedEmpty'), count = $('preparedCount');
  var max = CFG.maxPrepared;
  if (count) {
    count.textContent = prepared.length + ' / ' + max;
    count.style.color = prepared.length > max ? 'var(--danger)'
                      : prepared.length === max ? 'var(--warn)'
                      : 'var(--sheet-accent)';
  }
  list.innerHTML = '';
  if (!prepared.length) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  prepared.forEach(function (name) {
    var src = document.querySelector('#spellGrid .spell-card[data-name="' + name + '"]');
    if (!src) return;
    var clone = src.cloneNode(true);
    var btn = clone.querySelector('.prep-toggle');
    if (btn) {
      btn.textContent = '✕';
      btn.classList.add('on');
      btn.title = 'Remove from prepared';
      btn.addEventListener('click', function (e) { e.stopPropagation(); togglePrepared(name); });
    }
    list.appendChild(clone);
  });
}
function togglePrepared(name) {
  var card = document.querySelector('#spellGrid .spell-card[data-name="' + name + '"]');
  if (card && card.dataset.level === '0') return;   // cantrips are always known
  var prepared = loadPrepared();
  var i = prepared.indexOf(name);
  if (i >= 0) prepared.splice(i, 1); else prepared.push(name);
  savePrepared(prepared);
  refreshPreparedUI();
}
function refreshPreparedUI() {
  var prepared = loadPrepared();
  document.querySelectorAll('#spellGrid .prep-toggle').forEach(function (btn) {
    var on = prepared.indexOf(btn.dataset.spell) >= 0;
    btn.classList.toggle('on', on);
    btn.textContent = on ? '✦ on' : '✦';
    btn.title = on ? 'Remove from prepared' : 'Add to prepared';
  });
  buildPreparedSection();
  markUnprepared();
}

/* ── ACTIONS: FLAG SPELLS THAT ARE NOT PREPARED ──────────────────────────
   The Combat tab lists the spells worth casting, but a prepared caster can
   only cast what is prepared today. Anything else is dimmed and tagged, and
   the tag disappears as soon as the spell is prepared on the Spells tab.
   A spell counts as castable when it is a cantrip, always prepared (domain,
   subclass, or a card with no prepare toggle) or in the prepared list. */
function spellKeyFromHref(href) {
  var m = /spells\.html#([^_]+)_/.exec(href || '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]).toLowerCase().trim(); } catch (e) { return m[1].toLowerCase(); }
}
function markUnprepared() {
  if (!CFG.maxPrepared || !$('spellGrid')) return;
  var prepared = loadPrepared();
  var always = (CFG.domainSpells || []).map(function (d) { return (d.name || '').toLowerCase(); });
  document.querySelectorAll('.action-card li').forEach(function (li) {
    var a = li.querySelector('a[href*="spells.html#"]');
    if (!a) return;
    var key = spellKeyFromHref(a.getAttribute('href'));
    var card = key && document.querySelector('#spellGrid .spell-card[data-name="' + key.replace(/"/g, '') + '"]');
    if (!card) return;                                  // not on this sheet's list
    var castable = card.dataset.level === '0' || card.dataset.domain === 'true' ||
                   !card.querySelector('.prep-toggle') || prepared.indexOf(key) >= 0 ||
                   always.indexOf(key) >= 0;
    li.classList.toggle('not-prepared', !castable);
    var tag = li.querySelector('.np-tag');
    if (!castable && !tag) {
      tag = document.createElement('span');
      tag.className = 'np-tag';
      tag.textContent = 'not prepared';
      li.appendChild(tag);
    } else if (castable && tag) {
      tag.remove();
    }
  });
}
document.querySelectorAll('#spellGrid .prep-toggle').forEach(function (btn) {
  btn.addEventListener('click', function (e) { e.stopPropagation(); togglePrepared(btn.dataset.spell); });
});

/* ── DAMAGE / HEAL BUTTONS ───────────────────────────────────────────── */
function adjustAmount() {
  var el = $('hpAdjust');
  var n = el ? Number(el.value) : 0;
  return (!n || n < 1) ? 0 : n;
}
var dmgBtn = $('dmgBtn');
if (dmgBtn) dmgBtn.addEventListener('click', function () {
  var amt = adjustAmount(); if (!amt) return;
  var r = applyDamage(amt);

  /* Concentration check, using the damage that actually landed. */
  if (Conc.active() && r.toHp > 0) {
    var dc = Math.max(10, Math.floor(r.toHp / 2));
    if (Number($('hpCurrent').value) === 0) {
      Conc.drop();
      alert('You dropped to 0 HP — concentration on ' + Conc.spell() + ' ends.');
    } else {
      alert('Concentration check: CON save DC ' + dc + ' to keep ' + Conc.spell() + '.');
    }
  }
});
var healBtn = $('healBtn');
if (healBtn) healBtn.addEventListener('click', function () {
  var amt = adjustAmount(); if (!amt) return;
  setHp(Number($('hpCurrent').value) + amt);
});

/* ── 5e.TOOLS LINKS ───────────────────────────────────────────────────────
   Rules text stays on 5e.tools rather than being copied onto the sheet.
   Open it in a new tab so the sheet (HP typed in, roll log, roll mode) is
   still there when the player comes back, and mark every link with an arrow
   so it is obvious on a touch screen that the name can be tapped. */
function markRulesLinks() {
  document.querySelectorAll('a[href^="https://5e.tools"]').forEach(function (a) {
    a.target = '_blank';
    a.rel = 'noopener';
    a.classList.add('rules-link');
  });
}

/* ── STAT PILLS ──────────────────────────────────────────────────────────
   Phones never show hover tooltips, so a tap on a pill shows the full name,
   the breakdown that used to hide in its title (e.g. how AC adds up) and, on
   2024 sheets, a link to that rule in the 2024 glossary on 5e.tools. 2014
   sheets get no glossary link, because that glossary is the 2024 text. */
var PILL_INFO = {
  'HP': ['Hit Points', 'hit points'],
  'AC': ['Armor Class', 'armor class'],
  'Initiative': ['Initiative', 'initiative'],
  'Speed': ['Speed', 'speed'],
  'Prof.': ['Proficiency Bonus', 'proficiency'],
  'Spell DC': ['Spell Save DC', 'spellcasting'],
  'Spell Atk': ['Spell Attack Bonus', 'spell attack'],
  'Passive Perc': ['Passive Perception', 'passive perception'],
  'Passive Ins': ['Passive Insight', 'passive perception'],
  'Crit Range': ['Critical Hit Range', 'critical hit'],
  'Sneak Atk': ['Sneak Attack', null]
};
function glossaryUrl(key) {
  return 'https://5e.tools/variantrules.html#' + encodeURIComponent(key) + '_xphb';
}
function escHtml(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function bindStatPills() {
  document.querySelectorAll('.stat-pill').forEach(function (pill) {
    if (pill.id === 'inspirationPill') return;          // a tap toggles it
    var labelEl = pill.querySelector('.sp-label'), valEl = pill.querySelector('.sp-val');
    if (!labelEl || !valEl) return;
    var label = labelEl.textContent.trim();
    var info = PILL_INFO[label] || [label, null];
    var note = valEl.getAttribute('title') || pill.getAttribute('title') || '';
    var link = CFG.rules === '2024' && info[1];
    if (!note && !link && info[0] === label) return;    // nothing to add
    pill.classList.add('has-info');
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    function show() {
      var html = '<div class="toast-info"><strong>' + escHtml(info[0]) + ': ' +
                 escHtml(valEl.textContent.trim()) + '</strong>';
      if (note) html += '<div>' + escHtml(note) + '</div>';
      if (link) html += '<a class="rules-link" target="_blank" rel="noopener" href="' + glossaryUrl(link) +
                        '">Rules: ' + link.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + '</a>';
      Toast.show(html + '</div>', 7000);
    }
    pill.addEventListener('click', show);
    pill.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); }
    });
  });
}

/* ── COMMON ROLLS: NO DUPLICATE WEAPONS ──────────────────────────────────
   Weapons already have a to-hit button on their card in the Weapons panel,
   right next to the damage button. Showing them again in Common Rolls just
   makes a long list longer on a phone, so they are dropped there. */
function dedupeCommonRolls() {
  var weaponLabels = {};
  document.querySelectorAll('.weapon-card .roll-btn').forEach(function (b) {
    weaponLabels[(b.dataset.label || '').toLowerCase()] = true;
  });
  document.querySelectorAll('.roll-buttons .roll-btn').forEach(function (b) {
    if (weaponLabels[(b.dataset.label || '').toLowerCase()]) b.remove();
  });
}

/* ── THIS TURN ───────────────────────────────────────────────────────────
   Action / Bonus Action / Reaction / Movement chips at the top of the Combat
   tab. Tap one when you use it; "New turn" clears them. Also hosts the
   keep-the-screen-on switch, since phones dim mid-fight. */
var TURN_PARTS = [['action', 'Action'], ['bonus', 'Bonus'], ['reaction', 'Reaction'], ['move', 'Move']];
function buildTurnStrip() {
  var pane = $('tab-combat');
  if (!pane || $('turnStrip')) return;
  var strip = document.createElement('div');
  strip.className = 'panel turn-strip';
  strip.id = 'turnStrip';
  strip.innerHTML =
    '<div class="turn-head"><span class="turn-title">This turn</span>' +
    '<button class="turn-reset" type="button">↻ New turn</button></div>' +
    '<div class="turn-chips">' + TURN_PARTS.map(function (t) {
      return '<button class="turn-chip" type="button" data-turn="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>';
    }).join('') + '</div>';
  pane.insertBefore(strip, pane.firstChild);

  var used = load('turnUsed', {});
  function draw() {
    strip.querySelectorAll('.turn-chip').forEach(function (c) {
      var on = !!used[c.dataset.turn];
      c.classList.toggle('used', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  strip.addEventListener('click', function (e) {
    var chip = e.target.closest('.turn-chip');
    if (chip) { used[chip.dataset.turn] = !used[chip.dataset.turn]; save('turnUsed', used); draw(); }
    if (e.target.closest('.turn-reset')) { used = {}; save('turnUsed', used); draw(); }
  });
  draw();

  /* Keep the screen awake (Screen Wake Lock API: Chrome on Android, Safari
     on iOS 16.4+). Hidden where unsupported. The lock is dropped whenever the
     page is hidden, so it is taken again when the player comes back. */
  if (!('wakeLock' in navigator)) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'turn-reset wake-btn';
  strip.querySelector('.turn-head').insertBefore(btn, strip.querySelector('.turn-reset'));
  var want = load('wakeLock', false), lock = null;
  function paint() { btn.textContent = lock ? '☀ Screen stays on' : '☾ Screen may sleep'; btn.classList.toggle('on', !!lock); }
  function take() {
    navigator.wakeLock.request('screen').then(function (l) {
      lock = l; paint();
      l.addEventListener('release', function () { lock = null; paint(); });
    }).catch(function () { lock = null; paint(); });
  }
  btn.addEventListener('click', function () {
    want = !lock; save('wakeLock', want);
    if (want) take(); else if (lock) lock.release();
  });
  document.addEventListener('visibilitychange', function () {
    if (want && !lock && document.visibilityState === 'visible') take();
  });
  paint();
  if (want) take();
}

/* ── ROLL MODE REMINDER ──────────────────────────────────────────────────
   Advantage, disadvantage and crit are set in Common Rolls, which is usually
   off screen on a phone. While any of them is on, a chip floats in the
   corner so it is never forgotten; tap it to go back to a normal roll. */
var modeChip;
function buildModeChip() {
  if (!$('rollLog')) return;
  modeChip = document.createElement('button');
  modeChip.type = 'button';
  modeChip.className = 'mode-chip';
  document.body.appendChild(modeChip);
  modeChip.addEventListener('click', function () {
    var normal = document.querySelector('.roll-mode-btn[data-adv="0"]');
    if (normal) normal.click();
    if (Mode.crit) setCrit(false);
    paintModeChip();
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.roll-mode-btn, .roll-btn, .dmg-roll-btn')) setTimeout(paintModeChip, 0);
  });
  paintModeChip();
}
function paintModeChip() {
  if (!modeChip) return;
  var parts = [];
  if (Mode.adv > 0) parts.push('Advantage');
  if (Mode.adv < 0) parts.push('Disadvantage');
  if (Mode.crit) parts.push('Crit');
  modeChip.textContent = parts.join(' + ') + ' on  ✕';
  modeChip.className = 'mode-chip' + (parts.length ? ' show' : '') +
                       (Mode.adv > 0 ? ' adv' : Mode.adv < 0 ? ' dis' : '') + (Mode.crit ? ' crit' : '');
}

/* ── FIRST-VISIT HELP ────────────────────────────────────────────────────
   A short how-to above the tabs, shown until "Got it" is tapped. Shared by
   every sheet on the device, so a player only dismisses it once. */
var HELP_KEY = 'mfsheets_help_dismissed_v1';
function buildHelpCard() {
  var tabs = document.querySelector('.tabs-bar');
  if (!tabs) return;
  try { if (localStorage.getItem(HELP_KEY)) return; } catch (e) {}
  var card = document.createElement('div');
  card.className = 'panel help-card';
  card.innerHTML =
    '<div class="panel-title">👋 How this sheet works</div>' +
    '<ul>' +
      '<li>Names with <span class="rules-link-sample">↗</span> open the full rules on 5e.tools in a new tab.</li>' +
      '<li>Tap a stat with ⓘ to see what it means.</li>' +
      '<li>Tap the boxes in Trackers as you spend things. Rest buttons refill them.</li>' +
      '<li>Roll buttons roll for you. Set Advantage or Disadvantage in Common Rolls first.</li>' +
      '<li>Everything you change is saved on this phone automatically.</li>' +
    '</ul>' +
    '<button class="btn help-ok" type="button">Got it</button>';
  tabs.parentNode.insertBefore(card, tabs);
  card.querySelector('.help-ok').addEventListener('click', function () {
    try { localStorage.setItem(HELP_KEY, '1'); } catch (e) {}
    card.remove();
  });
}

/* Number fields get the number pad on phones instead of the full keyboard. */
function numericKeyboards() {
  document.querySelectorAll('input[type="number"]').forEach(function (el) {
    if (!el.hasAttribute('inputmode')) el.setAttribute('inputmode', 'numeric');
  });
}

/* ── INIT ────────────────────────────────────────────────────────────── */
refreshDots();
bindInput('hpCurrent', 'hpCurrent');
bindInput('hpTemp', 'hpTemp');
updateHp();
buildDomainSection();
markRulesLinks();        // before the prepared list clones any cards
attachDamageButtons();
refreshPreparedUI();
bindStatPills();
dedupeCommonRolls();
buildTurnStrip();
buildModeChip();
buildHelpCard();
numericKeyboards();

})();
