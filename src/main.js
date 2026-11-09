import { createArena } from './arena.js';
import { DEFAULT_QUESTIONS, parseQuestions } from './questions.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const LETTERS = ['А', 'Б', 'В', 'Г'];
const KEYS = [['1', '2', '3', '4'], ['7', '8', '9', '0']];
const BASE_DMG = 20;
const COMBO_DMG = 25;
const STORAGE_KEY = 'bilim-battle-questions';

const arena = createArena($('scene'));
let muted = false;
const play = (name) => !muted && sfx[name]();

const game = {
  phase: 'menu', // menu | question | resolve | ko | over
  round: 0,
  pendingHits: 0,
  rounds: 5,
  secs: 30,
  timeLeft: 0,
  pool: [],
  players: [],
  timer: null,
};

// ---------- menu ----------
$('qtext').value = localStorage.getItem(STORAGE_KEY) || DEFAULT_QUESTIONS;
$('qreset').onclick = () => { $('qtext').value = DEFAULT_QUESTIONS; localStorage.removeItem(STORAGE_KEY); };
$('start').onclick = startGame;
$('again').onclick = startGame;
$('tomenu').onclick = () => { $('result').classList.add('hidden'); $('menu').classList.remove('hidden'); game.phase = 'menu'; };
$('mute').onclick = () => { muted = !muted; $('mute').textContent = muted ? '🔇' : '🔊'; };

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

function startGame() {
  let questions = parseQuestions($('qtext').value);
  if (questions.length < 2) {
    alert('Кемінде 2 сұрақ керек. Формат: Сұрақ | Дұрыс | Қате | Қате | Қате');
    return;
  }
  if ($('qtext').value.trim() !== DEFAULT_QUESTIONS.trim()) localStorage.setItem(STORAGE_KEY, $('qtext').value);

  game.rounds = +$('rounds').value;
  game.secs = +$('secs').value;
  const need = game.rounds * 2;
  game.pool = [];
  while (game.pool.length < need) game.pool.push(...shuffle(questions));

  game.players = [0, 1].map((i) => ({
    name: $(`in${i}`).value.trim() || `${i + 1}-ойыншы`,
    hp: 100, combo: 0, correct: 0, answered: false, q: null, history: [],
  }));
  game.round = 0;
  game.pendingHits = 0;
  clearTimeout(game.timer);
  arena.reset();

  $('menu').classList.add('hidden');
  $('result').classList.add('hidden');
  buildPanels();
  updateHud();
  nextRound();
}

// ---------- panels ----------
function buildPanels() {
  $('panels').innerHTML = game.players.map((p, i) => `
    <div class="panel p${i}" id="panel${i}">
      <header><span class="who">${escapeHtml(p.name)}</span><div class="timer"><i></i></div><span class="secs">${game.secs}</span></header>
      <div class="q"></div>
      <div class="opts">${LETTERS.map((l, k) => `<button class="opt" data-p="${i}" data-k="${k}"><span class="l">${l}</span><span class="t"></span></button>`).join('')}</div>
      <div class="keys">Пернелер: ${KEYS[i].join(' ')}</div>
    </div>`).join('');
  $('panels').querySelectorAll('.opt').forEach((b) => {
    b.onclick = () => answer(+b.dataset.p, +b.dataset.k);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderQuestion(i) {
  const p = game.players[i];
  const panel = $(`panel${i}`);
  panel.querySelector('.q').textContent = p.q.q;
  panel.querySelectorAll('.opt').forEach((b, k) => {
    b.className = 'opt';
    b.disabled = false;
    b.querySelector('.t').textContent = p.q.options[k] ?? '';
    b.style.visibility = p.q.options[k] ? '' : 'hidden';
  });
}

function showAnswer(i, chosen) {
  const p = game.players[i];
  $(`panel${i}`).querySelectorAll('.opt').forEach((b, k) => {
    b.disabled = true;
    if (k === p.q.correctIdx) b.classList.add('right');
    else if (k === chosen) b.classList.add('wrong');
    else b.classList.add('dim');
  });
}

// ---------- flow ----------
function nextRound() {
  game.round++;
  for (const [i, p] of game.players.entries()) {
    const src = game.pool[(game.round - 1) * 2 + i];
    const options = shuffle([src.correct, ...src.wrong]);
    p.q = { q: src.q, options, correctIdx: options.indexOf(src.correct) };
    p.answered = false;
    renderQuestion(i);
  }
  game.timeLeft = game.secs;
  game.phase = 'question';
  $('round').textContent = `РАУНД ${game.round} / ${game.rounds}`;
  banner(`РАУНД ${game.round}`);
}

function answer(i, k) {
  const p = game.players[i];
  if (game.phase !== 'question' || p.answered || k >= p.q.options.length) return;
  p.answered = true;
  showAnswer(i, k);
  if (k === p.q.correctIdx) {
    p.combo++;
    p.correct++;
    p.history.push('ok');
    play('correct');
    const dmg = p.combo >= 3 ? COMBO_DMG : BASE_DMG;
    if (p.combo >= 2) floatText(i, `КОМБО x${p.combo}`, 'combo', 3.6);
    setTimeout(() => play('cast'), 100);
    game.pendingHits++;
    arena.attack(i, () => {
      game.pendingHits--;
      applyDamage(1 - i, dmg);
      if (game.pendingHits === 0 && game.phase === 'resolve') scheduleAdvance(1500);
    }, p.combo >= 3 ? 1.5 : 1);
  } else {
    p.combo = 0;
    p.history.push('bad');
    play('wrong');
  }
  updateHud();
  if (game.players.every((pl) => pl.answered)) endRound();
}

function timeout() {
  for (const [i, p] of game.players.entries()) {
    if (p.answered) continue;
    p.answered = true;
    p.combo = 0;
    p.history.push('bad');
    showAnswer(i, -1);
  }
  play('wrong');
  updateHud();
  endRound();
}

// Advance only once every attack of the round has landed: on slow PCs the
// animation can outlast a fixed timer and the final hit's damage would be lost.
function endRound() {
  game.phase = 'resolve';
  if (game.pendingHits === 0) scheduleAdvance(2400);
}

function scheduleAdvance(delay) {
  clearTimeout(game.timer);
  game.timer = setTimeout(() => {
    if (game.phase !== 'resolve') return;
    if (game.round >= game.rounds) finish();
    else nextRound();
  }, delay);
}

function applyDamage(i, dmg) {
  const p = game.players[i];
  if (game.phase === 'over' || p.hp <= 0) return;
  p.hp = Math.max(0, p.hp - dmg);
  play('boom');
  floatText(i, `-${dmg}`, 'dmg', 2.6);
  updateHud();
  if (p.hp === 0) {
    arena.ko(i);
    game.phase = 'ko';
    clearTimeout(game.timer);
    game.timer = setTimeout(finish, 1800);
    setTimeout(() => banner('НОКАУТ!'), 400);
  }
}

function finish() {
  game.phase = 'over';
  clearTimeout(game.timer);
  const [a, b] = game.players;
  const winner = a.hp === b.hp ? null : a.hp > b.hp ? a : b;
  $('winner').textContent = winner ? `${winner.name} жеңді!` : 'Тең ойын!';
  document.querySelector('.crown').textContent = winner ? '🏆' : '🤝';
  $('stats').innerHTML = game.players.map((p, i) => `
    <div><b style="color:${i ? '#ff7aa8' : '#ffd257'}">${escapeHtml(p.name)}</b>
    ❤️ ${p.hp} &nbsp; ✅ ${p.correct} / ${p.history.length}</div>`).join('');
  play('win');
  setTimeout(() => $('result').classList.remove('hidden'), 600);
}

// ---------- hud ----------
function updateHud() {
  for (const [i, p] of game.players.entries()) {
    $(`name${i}`).textContent = p.name;
    $(`hpnum${i}`).textContent = p.hp;
    const bar = $(`hp${i}`);
    bar.style.width = `${p.hp}%`;
    bar.classList.toggle('low', p.hp <= 30);
    const pips = [...p.history, ...Array(Math.max(0, game.rounds - p.history.length)).fill('')];
    $(`pips${i}`).innerHTML = pips.map((c) => `<span class="${c}"></span>`).join('');
  }
}

function floatText(i, text, cls, y) {
  const { x, y: sy } = arena.screenPos(i, y);
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${sy}px`;
  $('fx').append(el);
  setTimeout(() => el.remove(), 1700);
}

function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  KEYS.forEach((keys, i) => {
    const k = keys.indexOf(e.key);
    if (k >= 0) answer(i, k);
  });
});

// ---------- loop ----------
let last = performance.now();
let lastTick = 0;
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (game.phase === 'question') {
    game.timeLeft = Math.max(0, game.timeLeft - dt);
    const s = Math.ceil(game.timeLeft);
    if (s <= 5 && s !== lastTick && s > 0) { lastTick = s; play('tick'); }
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.querySelector('.timer i').style.width = `${(game.timeLeft / game.secs) * 100}%`;
      const secs = panel.querySelector('.secs');
      secs.textContent = s;
      secs.classList.toggle('warn', s <= 5);
    });
    if (game.timeLeft <= 0) timeout();
  }
  arena.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Panels change height after the first render; keep the WebGL canvas in sync.
new ResizeObserver(() => arena.resize()).observe($('stage'));

// Demo panels behind the menu so the arena doesn't look empty.
game.players = [0, 1].map((i) => ({ name: $(`in${i}`).value, hp: 100, combo: 0, history: [], q: { q: '', options: [] } }));
buildPanels();
updateHud();
