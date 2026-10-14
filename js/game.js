/* 장기 게임 화면 / 진행 */
(function () {
  'use strict';
  const J = window.Janggi, AI = window.JanggiAI, RK = window.Rank;
  const { K, A, E, H, R, C, P } = J;
  const $ = id => document.getElementById(id);

  const GLYPH = {
    cho: { [K]: '楚', [A]: '士', [E]: '象', [H]: '馬', [R]: '車', [C]: '包', [P]: '卒' },
    han: { [K]: '漢', [A]: '士', [E]: '象', [H]: '馬', [R]: '車', [C]: '包', [P]: '兵' }
  };
  const SIZE = { [K]: .96, [A]: .66, [E]: .84, [H]: .84, [R]: .84, [C]: .84, [P]: .66 };
  const MAX_PLY = 200;
  const TURN_MS = 15000; // 한 수 제한 시간
  const MARGIN = .72; // 보드 가장자리 여백 (칸 단위)

  // ---------- 상태 ----------
  let profile = RK.load();
  let myFormation = '마상마상';
  try { myFormation = localStorage.getItem('janggi.formation') || myFormation; } catch (e) {}
  if (!J.FORMATIONS[myFormation]) myFormation = '마상마상';

  const G = {
    board: null, turn: 0, colors: ['cho', 'han'], opp: null,
    ply: 0, passes: 0, over: true, busy: false, token: 0,
    selected: -1, legal: [], els: new Array(90).fill(null),
    last: null, captured: [[], []]
  };
  let cell = 60, margin = 43;
  let soundOn = true;
  try { soundOn = localStorage.getItem('janggi.sound') !== 'off'; } catch (e) {}

  // ---------- 화면 전환 ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    if (id === 'game') requestAnimationFrame(layout);
  }

  function badge(el, idx) {
    el.textContent = RK.rankName(idx);
    el.classList.toggle('dan', RK.isDan(idx));
  }

  // ---------- 로비 ----------
  function renderLobby() {
    const idx = RK.rankIndex(profile.rating);
    badge($('lobbyRankBadge'), idx);
    $('lobbyRating').textContent = profile.rating + '점';
    const pr = RK.progress(profile.rating);
    $('lobbyProgress').style.width = pr.pct + '%';
    $('lobbyProgressLabel').textContent = pr.toNext > 0
      ? `${RK.rankName(Math.min(26, idx + 1))}까지 ${pr.toNext}점` : '최고 등급 9단';
    $('recW').textContent = profile.wins;
    $('recL').textContent = profile.losses;
    $('recD').textContent = profile.draws;
    const total = profile.wins + profile.losses + profile.draws;
    $('recRate').textContent = total ? Math.round(profile.wins / total * 100) + '%' : '-';
    const box = $('formations');
    box.innerHTML = '';
    Object.keys(J.FORMATIONS).forEach(f => {
      const d = document.createElement('div');
      d.className = 'formation' + (f === myFormation ? ' active' : '');
      d.textContent = f;
      d.onclick = () => {
        myFormation = f;
        try { localStorage.setItem('janggi.formation', f); } catch (e) {}
        renderLobby();
      };
      box.appendChild(d);
    });
  }

  // ---------- 매칭 ----------
  let matchTimer = null;
  function startMatching() {
    Sound.unlock();
    show('matching');
    const idx = RK.rankIndex(profile.rating);
    $('matchMyRank').textContent = RK.rankName(idx);
    $('matchTitle').textContent = '상대를 찾는 중';
    $('matchSub').textContent = `${RK.rankName(Math.max(0, idx - 2))} ~ ${RK.rankName(Math.min(26, idx + 2))} 범위에서 찾고 있습니다`;
    let t = 0;
    $('matchTime').textContent = t;
    clearInterval(matchTimer);
    matchTimer = setInterval(() => {
      t++;
      $('matchTime').textContent = t;
      if (t >= 5) {
        clearInterval(matchTimer);
        // 5초 동안 사람 상대가 없으면 비슷한 등급의 AI와 매칭
        G.opp = RK.makeOpponent(profile.rating);
        $('matchTitle').textContent = '매칭 완료!';
        $('matchSub').textContent = '비슷한 등급의 AI 상대를 찾았습니다';
        Sound.match();
        setTimeout(showVersus, 700);
      }
    }, 1000);
  }

  function showVersus() {
    const meCho = Math.random() < .5;
    G.colors = meCho ? ['cho', 'han'] : ['han', 'cho'];
    const myIdx = RK.rankIndex(profile.rating);
    badge($('vsMeRank'), myIdx);
    badge($('vsOppRank'), G.opp.rankIdx);
    $('vsOppName').textContent = G.opp.name;
    $('vsOppAvatar').textContent = G.opp.avatar;
    $('vsMeColor').textContent = meCho ? '초 · 선수' : '한 · 후수 (덤 1.5)';
    $('vsOppColor').textContent = meCho ? '한 · 후수 (덤 1.5)' : '초 · 선수';
    show('versus');
    setTimeout(startGame, 2300);
  }

  // ---------- 게임 시작 ----------
  function startGame() {
    const forms = Object.keys(J.FORMATIONS);
    const aiForm = forms[(Math.random() * forms.length) | 0];
    G.board = J.initialBoard(myFormation, aiForm);
    G.turn = G.colors[0] === 'cho' ? 0 : 1;
    G.ply = 0; G.passes = 0; G.over = false; G.busy = false; G.token++;
    G.selected = -1; G.legal = []; G.last = null; G.captured = [[], []];
    G.hist = new Set([AI.posKey(G.board, G.turn)]);

    $('oppName').textContent = G.opp.name;
    $('oppAvatar').textContent = G.opp.avatar;
    badge($('oppRank'), G.opp.rankIdx);
    badge($('myRank'), RK.rankIndex(profile.rating));
    setChip($('myColor'), G.colors[0]);
    setChip($('oppColor'), G.colors[1]);
    stopClock();
    $('capTop').innerHTML = ''; $('capBottom').innerHTML = '';
    $('hints').innerHTML = ''; $('marks').innerHTML = '';

    show('game');
    layout();
    buildPieces(true);
    updateScores();
    setStatus(`${G.opp.name}(${RK.rankName(G.opp.rankIdx)})와의 대국 · ${G.colors[0] === 'cho' ? '초' : '한'}을 잡았습니다`);
    setTimeout(() => nextTurn(), 900);
  }

  function setChip(el, color) {
    el.textContent = color === 'cho' ? '초' : '한';
    el.className = 'color-chip ' + color;
  }

  // ---------- 보드 그리기 ----------
  function layout() {
    if (!$('game').classList.contains('active')) return;
    const narrow = window.innerWidth <= 900;
    const barH = narrow ? 52 : 62;
    const framePad = narrow ? 16 : 28;
    let availW, availH;
    const actionH = narrow ? 48 : 56;
    availW = window.innerWidth - (narrow ? 16 : 40) - framePad;
    availH = window.innerHeight - 20 - barH * 2 - actionH - 30 - framePad;
    cell = Math.floor(Math.max(28, Math.min(84, availW / (8 + 2 * MARGIN), availH / (9 + 2 * MARGIN))));
    margin = Math.round(cell * MARGIN);
    const board = $('board');
    board.style.setProperty('--cell', cell + 'px');
    board.style.width = (8 * cell + 2 * margin) + 'px';
    board.style.height = (9 * cell + 2 * margin) + 'px';
    drawBoard();
    // 기물 위치 즉시 갱신
    for (let i = 0; i < 90; i++) {
      const el = G.els[i];
      if (el) { el.style.transition = 'none'; place(el, i); void el.offsetWidth; el.style.transition = ''; }
    }
    renderMarks();
    if (G.selected >= 0) showHints(G.selected);
  }

  function px(i) { return [margin + (i % 9) * cell, margin + ((i / 9) | 0) * cell]; }
  function place(el, i) {
    const [x, y] = px(i);
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function drawBoard() {
    const cv = $('boardCanvas');
    const W = 8 * cell + 2 * margin, Hh = 9 * cell + 2 * margin;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = Hh * dpr;
    cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = mulberry32(20261014);

    // 바탕 나무색
    const g = ctx.createLinearGradient(0, 0, W, Hh);
    g.addColorStop(0, '#edc98f');
    g.addColorStop(.45, '#dfb170');
    g.addColorStop(1, '#e6bd80');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);

    // 옹이
    const knots = [
      { x: W * .22, y: Hh * .63, r: W * .05 },
      { x: W * .78, y: Hh * .24, r: W * .035 }
    ];
    // 결 무늬
    for (let n = 0; n < 170; n++) {
      const y0 = rnd() * Hh * 1.1 - Hh * .05;
      const amp = 2 + rnd() * 6, f = .004 + rnd() * .01, ph = rnd() * 6.28;
      const amp2 = rnd() * 2.5, f2 = .02 + rnd() * .03, ph2 = rnd() * 6.28;
      const dark = rnd();
      ctx.beginPath();
      for (let x = -4; x <= W + 4; x += 3) {
        let y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f2 + ph2) * amp2;
        for (const k of knots) {
          const dx = x - k.x, dy = y0 - k.y;
          const infl = Math.exp(-(dx * dx) / (k.r * k.r * 9)) * k.r * 1.6 * Math.exp(-(dy * dy) / (k.r * k.r * 16));
          y += dy >= 0 ? infl : -infl;
        }
        x === -4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = dark < .7
        ? `rgba(130, 72, 26, ${.07 + rnd() * .16})`
        : `rgba(255, 236, 200, ${.08 + rnd() * .12})`;
      ctx.lineWidth = .5 + rnd() * (dark < .15 ? 3.5 : 1.6);
      ctx.stroke();
    }
    for (const k of knots) {
      for (let r = k.r; r > 1; r -= 2.2 + rnd() * 2) {
        ctx.beginPath();
        ctx.ellipse(k.x, k.y, r * 1.9, r * .55, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(110, 60, 20, ${.08 + rnd() * .1})`;
        ctx.lineWidth = .8 + rnd();
        ctx.stroke();
      }
      const kg = ctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, k.r * .5);
      kg.addColorStop(0, 'rgba(90, 45, 15, .45)');
      kg.addColorStop(1, 'rgba(90, 45, 15, 0)');
      ctx.fillStyle = kg;
      ctx.beginPath(); ctx.ellipse(k.x, k.y, k.r * .9, k.r * .3, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 미세한 노이즈
    try {
      const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (rnd() - .5) * 14;
        d[i] += v; d[i + 1] += v; d[i + 2] += v;
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) { /* 일부 환경에서 실패해도 무시 */ }
    // 비네팅 + 광택
    const vg = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * .3, W / 2, Hh / 2, Math.max(W, Hh) * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(60, 25, 5, .35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, Hh);
    const sh = ctx.createLinearGradient(0, 0, W, Hh);
    sh.addColorStop(0, 'rgba(255,255,255,.16)');
    sh.addColorStop(.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, Hh);

    // 선
    const X = x => margin + x * cell, Y = y => margin + y * cell;
    ctx.lineCap = 'round';
    const lineColor = 'rgba(48, 24, 6, .82)';
    // 새김 효과: 밝은 선을 살짝 아래에
    function lines(color, off, w) {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath();
      for (let x = 0; x < 9; x++) { ctx.moveTo(X(x), Y(0) + off); ctx.lineTo(X(x), Y(9) + off); }
      for (let y = 0; y < 10; y++) { ctx.moveTo(X(0), Y(y) + off); ctx.lineTo(X(8), Y(y) + off); }
      for (const py of [0, 7]) {
        ctx.moveTo(X(3), Y(py) + off); ctx.lineTo(X(5), Y(py + 2) + off);
        ctx.moveTo(X(5), Y(py) + off); ctx.lineTo(X(3), Y(py + 2) + off);
      }
      ctx.stroke();
    }
    const lw = Math.max(1, cell * .024);
    lines('rgba(255, 240, 210, .35)', 1, lw);
    lines(lineColor, 0, lw);
    // 바깥 테두리
    ctx.strokeStyle = 'rgba(48, 24, 6, .9)';
    ctx.lineWidth = Math.max(2, cell * .05);
    ctx.strokeRect(X(0) - cell * .07, Y(0) - cell * .07, 8 * cell + cell * .14, 9 * cell + cell * .14);
  }

  // ---------- 기물 ----------
  function makePieceEl(p) {
    const t = J.typeOf(p), s = J.sideOf(p), color = G.colors[s];
    const el = document.createElement('div');
    el.className = `piece ${color}${s === 0 ? ' mine' : ''}`;
    el.style.setProperty('--sz', SIZE[t]);
    el.innerHTML = `<div class="edge"></div><div class="face"></div><div class="rim"></div><div class="inner"></div><div class="glyph">${GLYPH[color][t]}</div>`;
    return el;
  }

  function buildPieces(animate) {
    const layer = $('pieces');
    layer.innerHTML = '';
    G.els = new Array(90).fill(null);
    let n = 0;
    for (let i = 0; i < 90; i++) {
      const p = G.board[i];
      if (!p) continue;
      const el = makePieceEl(p);
      place(el, i);
      if (animate) { el.classList.add('appear'); el.style.animationDelay = (n++ * 25) + 'ms'; }
      el.addEventListener('click', ev => { ev.stopPropagation(); onPieceClick(el); });
      layer.appendChild(el);
      G.els[i] = el;
    }
  }

  function sqOf(el) { return G.els.indexOf(el); }

  // ---------- 입력 ----------
  function onPieceClick(el) {
    const i = sqOf(el);
    if (i < 0 || G.over || G.busy || G.turn !== 0) return;
    if (J.sideOf(G.board[i]) !== 0) { clearSelection(); return; }
    if (G.selected === i) { clearSelection(); return; }
    select(i);
  }

  function select(i) {
    clearSelection();
    const targets = G.legal.filter(m => (m >> 7) === i);
    if (!targets.length) { Sound.tick(); el(i).animate([{ filter: 'brightness(1)' }, { filter: 'brightness(.7)' }, { filter: 'brightness(1)' }], 250); return; }
    G.selected = i;
    el(i).classList.add('selected');
    showHints(i);
    Sound.tick();
  }
  function el(i) { return G.els[i]; }

  function showHints(i) {
    const box = $('hints');
    box.innerHTML = '';
    for (const m of G.legal) {
      if ((m >> 7) !== i) continue;
      const to = m & 127;
      const d = document.createElement('div');
      d.className = 'hint-dot' + (G.board[to] ? ' capture' : '');
      const [x, y] = px(to);
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.addEventListener('click', ev => { ev.stopPropagation(); playerMove(m); });
      box.appendChild(d);
    }
  }

  function clearSelection() {
    if (G.selected >= 0 && G.els[G.selected]) G.els[G.selected].classList.remove('selected');
    G.selected = -1;
    $('hints').innerHTML = '';
  }

  function playerMove(m) {
    if (G.over || G.busy || G.turn !== 0) return;
    clearSelection();
    doMove(m, 0);
  }

  // ---------- 수 진행 ----------
  function doMove(m, side) {
    const from = m >> 7, to = m & 127;
    const moving = G.els[from], victim = G.els[to];
    stopClock();
    const wasInCheck = J.inCheck(G.board, side);
    const cap = J.make(G.board, m);
    G.busy = true;
    G.ply++; G.passes = 0;
    G.last = [from, to];

    moving.classList.add('moving');
    G.els[to] = moving; G.els[from] = null;
    place(moving, to);
    const tok = G.token;
    setTimeout(() => {
      if (tok !== G.token) return;
      moving.classList.remove('moving');
      if (victim) {
        victim.classList.add('captured-out');
        victim.style.transform += ' scale(.3)';
        setTimeout(() => victim.remove(), 380);
        addCaptured(side, cap);
        Sound.capture();
      } else Sound.move();
      renderMarks();
      updateScores();
      afterMove(side, wasInCheck);
    }, 300);
  }

  function afterMove(side, wasInCheck) {
    const next = 1 - side;
    G.turn = next;
    G.hist.add(AI.posKey(G.board, next));
    const chk = J.inCheck(G.board, next);
    const moves = J.legalMoves(G.board, next);
    document.querySelectorAll('.piece.checked').forEach(e => e.classList.remove('checked'));
    if (chk) {
      const k = J.findKing(G.board, next);
      if (G.els[k]) G.els[k].classList.add('checked');
    }
    if (chk && moves.length === 0) {
      banner('외통!', G.colors[side] === 'cho' ? 'blue' : '', 'mate');
      Sound.wetong();
      fx('mate', J.findKing(G.board, next));
      return endGame(side === 0 ? 1 : 0, '외통수로 승부가 났습니다');
    }
    if (chk) {
      banner('장군!', G.colors[side] === 'cho' ? 'blue' : '', 'hit');
      Sound.janggun();
      fx('check', J.findKing(G.board, next));
    } else if (wasInCheck) {
      banner('멍군!', G.colors[side] === 'cho' ? 'blue' : '', 'hit');
      Sound.mungun();
      fx('defend', J.findKing(G.board, side));
    }
    if (G.ply >= MAX_PLY) return endByPoints(`${MAX_PLY}수 제한 · 점수 판정`);
    G.busy = false;
    nextTurn(moves);
  }

  function nextTurn(moves) {
    if (G.over) return;
    moves = moves || J.legalMoves(G.board, G.turn);
    updateTurnUI();
    startClock(G.turn);
    if (G.turn === 0) {
      G.legal = moves;
      if (!moves.length) {
        setStatus('둘 수 있는 수가 없어 한 수 쉽니다');
        setTimeout(() => doPass(0), 900);
        return;
      }
      setStatus(J.inCheck(G.board, 0) ? '장군을 받았습니다! 궁을 지키세요' : '내 차례입니다');
      $('btnPass').disabled = J.inCheck(G.board, 0);
    } else {
      G.legal = [];
      $('btnPass').disabled = true;
      aiTurn();
    }
  }

  function aiTurn() {
    const tok = G.token;
    G.busy = true;
    $('thinking').classList.add('on');
    setStatus(`${G.opp.name}이(가) 수를 생각하는 중…`);
    setTimeout(() => {
      if (tok !== G.token || G.over) return;
      const t0 = Date.now();
      const m = AI.chooseMove(G.board, 1, G.opp.rankIdx, G.hist);
      const wait = Math.max(0, 450 + Math.random() * 600 - (Date.now() - t0));
      setTimeout(() => {
        if (tok !== G.token || G.over) return;
        $('thinking').classList.remove('on');
        if (m == null) { doPass(1); return; }
        doMove(m, 1);
      }, wait);
    }, 80);
  }

  function doPass(side) {
    if (G.over) return;
    stopClock();
    G.passes++;
    G.ply++;
    G.last = null;
    renderMarks();
    banner('한 수 쉼', 'dark');
    if (G.passes >= 2) return endByPoints('양쪽 모두 한 수 쉼 · 점수 판정');
    G.turn = 1 - side;
    G.busy = false;
    clearSelection();
    setTimeout(() => nextTurn(), 600);
  }

  function score(side) {
    return J.material(G.board, side) + (G.colors[side] === 'han' ? 1.5 : 0);
  }

  function updateScores() {
    $('myScore').textContent = score(0) + '점';
    $('oppScore').textContent = score(1) + '점';
  }

  function updateTurnUI() {
    $('barBottom').classList.toggle('active', G.turn === 0 && !G.over);
    $('barTop').classList.toggle('active', G.turn === 1 && !G.over);
    $('myTurn').classList.toggle('on', G.turn === 0 && !G.over);
  }

  function renderMarks() {
    const box = $('marks');
    box.innerHTML = '';
    if (!G.last) return;
    const t = G.last[1];
    for (const [i, cls] of [[t, 'to']]) {
      const d = document.createElement('div');
      d.className = 'mark ' + cls;
      const [x, y] = px(i);
      d.style.left = x + 'px'; d.style.top = y + 'px';
      box.appendChild(d);
    }
  }

  function addCaptured(side, p) {
    const color = G.colors[1 - side], t = J.typeOf(p);
    G.captured[side].push(p);
    const d = document.createElement('div');
    d.className = 'mini ' + color;
    d.textContent = GLYPH[color][t];
    $(side === 0 ? 'capBottom' : 'capTop').appendChild(d);
  }

  // ---------- 한 수 15초 제한 ----------
  const clock = { side: -1, end: 0, timer: null, lastSec: 99 };
  function startClock(side) {
    stopClock();
    clock.side = side;
    clock.end = Date.now() + TURN_MS;
    clock.lastSec = 99;
    const tok = G.token;
    clock.timer = setInterval(() => tickClock(tok), 100);
    tickClock(tok);
  }
  function stopClock() {
    clearInterval(clock.timer);
    clock.timer = null; clock.side = -1;
    renderClock(0, TURN_MS, false);
    renderClock(1, TURN_MS, false);
  }
  function tickClock(tok) {
    if (tok !== G.token || G.over) { stopClock(); return; }
    const left = Math.max(0, clock.end - Date.now());
    renderClock(clock.side, left, true);
    const sec = Math.ceil(left / 1000);
    if (clock.side === 0 && sec <= 5 && sec > 0 && sec < clock.lastSec) Sound.tick();
    clock.lastSec = sec;
    if (left <= 0) {
      // 시간을 넘기면 지는 대신 합법 수 중 하나를 무작위로 대신 둔다
      const s = clock.side;
      stopClock();
      if (G.busy && s === 0) return; // 이미 수가 진행 중
      const moves = J.legalMoves(G.board, s);
      clearSelection();
      banner('시간 초과', 'dark');
      if (s === 0) setStatus('15초가 지나 아무 수나 자동으로 두었습니다');
      if (s === 1) { G.token++; $('thinking').classList.remove('on'); }
      if (!moves.length) { doPass(s); return; }
      doMove(moves[(Math.random() * moves.length) | 0], s);
    }
  }
  function renderClock(side, left, running) {
    const c = $(side === 0 ? 'clockBottom' : 'clockTop');
    const bar = $(side === 0 ? 'timeBottom' : 'timeTop');
    const warn = running && left <= 5000;
    c.textContent = Math.ceil(left / 1000);
    c.className = 'clock' + (running ? ' run' : '') + (warn ? ' warn' : '');
    bar.style.transform = `scaleX(${running ? left / TURN_MS : 0})`;
    bar.className = warn ? 'warn' : '';
  }

  function setStatus(t) { $('status').textContent = t; }

  let bannerTimer = null;
  function banner(text, cls, extra) {
    const b = $('banner');
    b.className = 'banner';
    void b.offsetWidth;
    b.textContent = text;
    b.className = 'banner show ' + (cls || '') + (extra ? ' ' + extra : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.className = 'banner'; }, extra ? 1900 : 1600);
  }

  // 장군/멍군/외통 화면 이펙트: 판 흔들림 + 섬광 + 궁 위치 충격파
  function fx(kind, sq) {
    const frame = $('boardFrame'), flash = $('flash');
    frame.classList.remove('shake', 'shake-soft', 'shake-big');
    flash.className = 'flash';
    void frame.offsetWidth;
    frame.classList.add(kind === 'mate' ? 'shake-big' : kind === 'check' ? 'shake' : 'shake-soft');
    flash.classList.add('on', kind);
    if (sq >= 0) {
      const [x, y] = px(sq);
      const rings = kind === 'mate' ? 3 : kind === 'check' ? 2 : 1;
      for (let r = 0; r < rings; r++) {
        const d = document.createElement('div');
        d.className = 'shock ' + kind;
        d.style.left = x + 'px'; d.style.top = y + 'px';
        d.style.animationDelay = (r * 140) + 'ms';
        $('board').appendChild(d);
        setTimeout(() => d.remove(), 1200 + r * 140);
      }
      const k = G.els[sq];
      if (k) { k.classList.remove('jolt'); void k.offsetWidth; k.classList.add('jolt'); }
    }
  }

  // ---------- 종료 ----------
  function endByPoints(reason) {
    const a = score(0), b = score(1);
    endGame(a > b ? 1 : a < b ? 0 : .5, `${reason} (${a} : ${b})`);
  }

  function endGame(result, reason) {
    if (G.over) return;
    G.over = true; G.busy = true;
    G.token++;
    stopClock();
    $('thinking').classList.remove('on');
    clearSelection();
    updateTurnUI();
    const beforeIdx = RK.rankIndex(profile.rating);
    const ch = RK.applyResult(profile, G.opp.rating, result);
    const afterIdx = RK.rankIndex(profile.rating);
    setStatus(result === 1 ? '승리했습니다!' : result === 0 ? '패배했습니다' : '무승부');
    setTimeout(() => {
      const title = $('resultTitle');
      title.textContent = result === 1 ? '승리' : result === 0 ? '패배' : '무승부';
      title.className = 'result-title ' + (result === 1 ? 'win' : result === 0 ? 'lose' : '');
      $('resultReason').textContent = reason;
      badge($('resultRank'), afterIdx);
      const delta = $('resultDelta');
      delta.textContent = (ch.delta >= 0 ? '+' : '') + ch.delta + '점  (' + ch.after + ')';
      delta.className = 'rating-change ' + (ch.delta >= 0 ? 'up' : 'down');
      const ru = $('resultRankUp');
      ru.className = 'rank-up';
      if (afterIdx > beforeIdx) { ru.textContent = `승급! ${RK.rankName(beforeIdx)} → ${RK.rankName(afterIdx)}`; ru.classList.add('on'); }
      else if (afterIdx < beforeIdx) { ru.textContent = `강등 ${RK.rankName(beforeIdx)} → ${RK.rankName(afterIdx)}`; }
      else ru.textContent = '';
      $('resultModal').classList.add('show');
      result === 1 ? Sound.win() : Sound.lose();
    }, result === 1 && reason.startsWith('외통') ? 1400 : 700);
  }

  // ---------- 소리 (WebAudio로 직접 합성) ----------
  const Sound = (() => {
    let ctx = null, out = null;
    function unlock() {
      if (!ctx) {
        try {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
          out = ctx.createDynamicsCompressor();
          out.threshold.value = -14; out.ratio.value = 6;
          out.connect(ctx.destination);
        } catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }
    function clack(vol, freq) {
      if (!soundOn || !ctx) return;
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * .08);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 2.5;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + .08);
      const og = ctx.createGain(); og.gain.setValueAtTime(vol * .5, t); og.gain.exponentialRampToValueAtTime(.001, t + .1);
      o.connect(og).connect(out); o.start(t); o.stop(t + .12);
    }
    function tone(notes, type) {
      if (!soundOn || !ctx) return;
      let t = ctx.currentTime;
      for (const [f, dur] of notes) {
        const o = ctx.createOscillator(); o.type = type || 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        o.connect(g).connect(out); o.start(t); o.stop(t + dur + .02);
        t += dur * .8;
      }
    }
    // 큰북: 낮은 음이 툭 떨어지며 울림
    function drum(t, f0, f1, dur, vol) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .7);
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + .05);
      noise(t, 900, .8, .09, vol * .7);
    }
    function noise(t, freq, q, dur, vol) {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f).connect(g).connect(out); src.start(t);
    }
    // 징: 비조화 배음이 길게 울림
    function gong(t, base, vol, dur) {
      [[1, 1], [2.76, .5], [5.4, .28], [8.93, .14], [1.5, .35]].forEach(([m, a]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + m; const lg = ctx.createGain(); lg.gain.value = base * m * .004;
        lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
        const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * a, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur / (1 + m * .25));
        o.connect(g).connect(out); o.start(t); o.stop(t + dur);
      });
    }
    // 나팔 같은 화음 한 방
    function stab(t, freqs, vol, dur) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      lp.connect(g).connect(out);
      freqs.forEach(f => {
        for (const det of [-8, 8]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
          o.connect(lp); o.start(t); o.stop(t + dur + .05);
        }
      });
    }
    function wood(t, f, vol) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .12);
      o.connect(g).connect(out); o.start(t); o.stop(t + .15);
      noise(t, f * 2.5, 6, .05, vol * .8);
    }
    function janggun() {
      if (!soundOn || !ctx) return;
      const t = ctx.currentTime + .01;
      // "장!" "군!" 두 번 내려치기
      drum(t, 170, 42, .55, 1.0); stab(t, [196, 294, 392], .22, .35);
      drum(t + .2, 190, 48, .6, 1.0); stab(t + .2, [233, 349, 466], .26, .5);
      gong(t + .2, 150, .28, 2.2);
      noise(t + .2, 4500, .5, .35, .25);
    }
    function mungun() {
      if (!soundOn || !ctx) return;
      const t = ctx.currentTime + .01;
      // 딱! 딱! 막아내는 나무 소리 + 올라가는 반짝임
      wood(t, 820, .9); wood(t + .12, 1040, .9);
      drum(t + .12, 120, 60, .35, .6);
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); const s = t + .22 + i * .055;
        g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.16, s + .01); g.gain.exponentialRampToValueAtTime(.0001, s + .35);
        o.connect(g).connect(out); o.start(s); o.stop(s + .4);
      });
    }
    function wetong() {
      if (!soundOn || !ctx) return;
      const t = ctx.currentTime + .01;
      // 북 연타 후 큰 징
      let at = t;
      for (let i = 0; i < 7; i++) { drum(at, 140 + i * 8, 45, .3, .55 + i * .06); at += .13 - i * .012; }
      drum(at + .05, 200, 35, 1.0, 1.2);
      stab(at + .05, [147, 220, 294, 370], .3, 1.0);
      gong(at + .05, 110, .4, 3.2);
      noise(at + .05, 3500, .4, .6, .3);
    }
    return {
      unlock, janggun, mungun, wetong,
      move: () => clack(.9, 1700),
      capture: () => { clack(1.3, 1300); setTimeout(() => clack(.6, 2200), 60); },
      tick: () => clack(.25, 2600),
      check: () => tone([[659, .14], [880, .22]], 'square'),
      match: () => tone([[523, .1], [659, .1], [784, .18]]),
      win: () => tone([[523, .12], [659, .12], [784, .12], [1047, .35]]),
      lose: () => tone([[392, .2], [330, .2], [262, .4]])
    };
  })();

  // ---------- 이벤트 ----------
  $('btnMatch').onclick = startMatching;
  $('btnCancelMatch').onclick = () => { clearInterval(matchTimer); show('lobby'); };
  $('btnPass').onclick = () => { if (!G.over && !G.busy && G.turn === 0 && !J.inCheck(G.board, 0)) { clearSelection(); doPass(0); } };
  $('btnResign').onclick = () => { if (!G.over) $('confirmModal').classList.add('show'); };
  $('btnConfirmNo').onclick = () => $('confirmModal').classList.remove('show');
  $('btnConfirmYes').onclick = () => { $('confirmModal').classList.remove('show'); endGame(0, '기권'); };
  $('btnAgain').onclick = () => { $('resultModal').classList.remove('show'); startMatching(); };
  $('btnLobby').onclick = () => { $('resultModal').classList.remove('show'); renderLobby(); show('lobby'); };
  $('btnReset').onclick = () => {
    if (!confirm('등급과 전적을 초기화할까요?')) return;
    profile = RK.defaults(); RK.save(profile); renderLobby();
  };
  function renderSoundBtn() { $('btnSound').textContent = soundOn ? '🔊' : '🔇'; }
  $('btnSound').onclick = () => {
    soundOn = !soundOn;
    try { localStorage.setItem('janggi.sound', soundOn ? 'on' : 'off'); } catch (e) {}
    renderSoundBtn(); Sound.unlock();
  };
  $('board').addEventListener('click', () => clearSelection());
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(layout, 80); });

  renderSoundBtn();
  renderLobby();

  // 테스트용 훅
  window.__janggi = { G, fx, Sound, banner, startGame: () => { G.opp = RK.makeOpponent(profile.rating); G.colors = ['cho', 'han']; startGame(); } };
})();
