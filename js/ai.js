/* 장기 AI: 알파-베타 + 정지 탐색 + 반복 심화
 * 등급(0=18급 ~ 26=9단)에 따라 탐색 깊이, 시간, 실수 확률을 조절
 */
(function (global) {
  'use strict';
  const J = global.Janggi;
  const { K, A, E, H, R, C, P } = J;
  const VAL = [0, 0, 300, 300, 520, 1300, 700, 200];
  const MATE = 100000;

  let nodes = 0, deadline = 0, stopped = false;
  class Timeout extends Error {}

  function pieceBonus(t, s, x, y) {
    const adv = s === 0 ? 9 - y : y; // 자기 진영에서 얼마나 전진했나
    switch (t) {
      case P: {
        let v = adv > 3 ? (adv - 3) * 12 : 0;
        if (J.inPalace(x, y) && adv >= 7) v += 30;
        return v - Math.abs(x - 4) * 2;
      }
      case H: return 20 - Math.abs(x - 4) * 6 - (adv === 0 ? 15 : 0);
      case E: return 10 - Math.abs(x - 4) * 3;
      case C: return adv >= 1 && adv <= 3 ? 10 : 0;
      case R: return adv >= 5 ? 15 : 0;
      case A: return J.isCenter(x, y) ? 0 : (adv === 0 ? 4 : 0);
      case K: return J.isCenter(x, y) ? 15 : 0;
    }
    return 0;
  }

  function evaluate(b, s) {
    let score = 0, mat0 = 0, mat1 = 0, k0 = -1, k1 = -1;
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p & 7, ps = p >> 3;
      if (t === K) { if (ps) k1 = i; else k0 = i; }
      else if (ps) mat1 += VAL[t]; else mat0 += VAL[t];
      const v = VAL[t] + pieceBonus(t, ps, i % 9, (i / 9) | 0);
      score += ps === 0 ? v : -v;
    }
    // 마무리 평가: 기물이 크게 앞서면 공격 기물을 상대 궁 가까이로 몰아붙인다
    const diff = mat0 - mat1;
    if (Math.abs(diff) >= 600 && k0 >= 0 && k1 >= 0) {
      const win = diff > 0 ? 0 : 1, kk = win === 0 ? k1 : k0;
      const kx = kk % 9, ky = (kk / 9) | 0;
      let press = 0;
      for (let i = 0; i < 90; i++) {
        const p = b[i];
        if (!p || (p >> 3) !== win) continue;
        const t = p & 7;
        if (t === K || t === A || t === E) continue;
        const d = Math.abs(i % 9 - kx) + Math.abs(((i / 9) | 0) - ky);
        press += (12 - d) * (t === R ? 6 : 4);
      }
      // 상대 궁이 움직일 수 있는 칸이 적을수록 좋음
      let free = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = kx + dx, ny = ky + dy;
        if (nx >= 3 && nx <= 5 && (win === 0 ? ny >= 0 && ny <= 2 : ny >= 7 && ny <= 9)) {
          const q = b[ny * 9 + nx];
          if (!q || (q >> 3) === win) free++;
        }
      }
      press += (4 - free) * 25;
      score += win === 0 ? press : -press;
    }
    return s === 0 ? score : -score;
  }

  function order(b, moves, first) {
    const scored = moves.map(m => {
      const cap = b[m & 127];
      let k = cap ? VAL[cap & 7] * 10 - VAL[b[m >> 7] & 7] + 100000 : 0;
      if (m === first) k = 1e9;
      return [k, m];
    });
    scored.sort((a, c) => c[0] - a[0]);
    return scored.map(x => x[1]);
  }

  function tick() {
    if ((++nodes & 1023) === 0 && deadline && Date.now() > deadline) { stopped = true; throw new Timeout(); }
  }

  function qsearch(b, s, alpha, beta, ply, qd) {
    tick();
    const all = J.genPseudo(b, s);
    for (const m of all) if ((b[m & 127] & 7) === K) return MATE - ply;
    // 장군을 받고 있으면 가만히 있을 수 없으므로 모든 수를 본다 (외통 탐지)
    const checked = qd < 4 && J.inCheck(b, s);
    let best = -MATE + ply;
    if (!checked) {
      const stand = evaluate(b, s);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
      if (qd >= 6) return stand;
    }
    const moves = checked ? all : all.filter(m => b[m & 127]);
    for (const m of order(b, moves, 0)) {
      const cap = J.make(b, m);
      const sc = -qsearch(b, 1 - s, -beta, -alpha, ply + 1, qd + 1);
      J.unmake(b, m, cap);
      if (sc > best) best = sc;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return best;
  }

  function search(b, s, depth, alpha, beta, ply) {
    if (depth <= 0) return qsearch(b, s, alpha, beta, ply, 0);
    tick();
    const moves = J.genPseudo(b, s);
    for (const m of moves) if ((b[m & 127] & 7) === K) return MATE - ply;
    let best = -MATE + ply;
    for (const m of order(b, moves, 0)) {
      const cap = J.make(b, m);
      const sc = -search(b, 1 - s, depth - 1, -beta, -alpha, ply + 1);
      J.unmake(b, m, cap);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    // 둘 수 있는 수가 전부 궁을 내주는데 장군 상태가 아니면 외통이 아니라 '한 수 쉼'이다
    if (best === -(MATE - ply - 1) && !J.inCheck(b, s)) {
      return -search(b, 1 - s, depth - 1, -beta, -alpha, ply + 1);
    }
    return best;
  }

  // 등급 인덱스 -> AI 설정
  function levelConfig(idx) {
    if (idx <= 3) return { depth: 1, noise: 260, time: 600 };
    if (idx <= 7) return { depth: 2, noise: 160, time: 900 };
    if (idx <= 11) return { depth: 2, noise: 70, time: 1000 };
    if (idx <= 15) return { depth: 3, noise: 30, time: 1500 };
    if (idx <= 19) return { depth: 3, noise: 0, time: 1800 };
    if (idx <= 23) return { depth: 4, noise: 0, time: 2600 };
    return { depth: 5, noise: 0, time: 4000 };
  }

  // history: 이미 나왔던 국면(키 문자열) 집합. 이기고 있을 때 같은 국면 반복을 피한다
  function posKey(b, s) { return s + ':' + b.join(','); }

  function repeatPenalty(b, m, s, history, sc) {
    if (!history || sc <= 100 || sc > MATE / 2) return 0;
    const cap = J.make(b, m);
    const k = posKey(b, 1 - s);
    J.unmake(b, m, cap);
    return history.has(k) ? 80 : 0;
  }

  function chooseMove(board, s, rankIdx, history) {
    const b = Int8Array.from(board);
    const cfg = Object.assign({}, levelConfig(rankIdx));
    // 크게 이기고 있으면 더 깊게 읽어서 외통까지 마무리한다
    let mine = 0, theirs = 0;
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (p && (p & 7) !== K) { if ((p >> 3) === s) mine += VAL[p & 7]; else theirs += VAL[p & 7]; }
    }
    if (mine - theirs >= 600) {
      cfg.depth = Math.max(cfg.depth + 1, 3);
      cfg.time = Math.max(cfg.time, 2000);
      cfg.noise = Math.min(cfg.noise, 25);
    }
    const legal = J.legalMoves(b, s);
    if (!legal.length) return null;
    if (legal.length === 1) return legal[0];
    nodes = 0; stopped = false;
    deadline = Date.now() + cfg.time;

    if (cfg.noise > 0) {
      // 약한 AI: 모든 수를 전체 창으로 평가 후 잡음을 섞어 선택
      let scores = legal.map(m => [m, 0]);
      for (let d = 1; d <= cfg.depth; d++) {
        try {
          const next = scores.map(([m]) => {
            const cap = J.make(b, m);
            const sc = -search(b, 1 - s, d - 1, -MATE, MATE, 1);
            J.unmake(b, m, cap);
            return [m, sc];
          });
          scores = next;
        } catch (e) { if (!(e instanceof Timeout)) throw e; break; }
      }
      const top = Math.max(...scores.map(x => x[1]));
      // 크게 이기고 있으면 실수를 줄여 마무리한다
      const noise = top > 600 ? Math.min(cfg.noise, 25) : cfg.noise;
      let bestM = scores[0][0], bestV = -Infinity;
      for (const [m, sc0] of scores) {
        const sc = sc0 - repeatPenalty(b, m, s, history, sc0);
        const v = sc + (sc0 > MATE / 2 ? 1e6 + sc0 : 0) + Math.random() * noise;
        if (v > bestV) { bestV = v; bestM = m; }
      }
      return bestM;
    }

    let bestMove = order(b, legal, 0)[0];
    for (let d = 1; d <= cfg.depth; d++) {
      let alpha = -MATE - 1, curBest = bestMove;
      const ties = [];
      try {
        for (const m of order(b, legal, bestMove)) {
          const cap = J.make(b, m);
          let sc = -search(b, 1 - s, d - 1, -MATE - 1, -alpha + 1, 1);
          J.unmake(b, m, cap);
          sc -= repeatPenalty(b, m, s, history, sc);
          if (sc > alpha) { alpha = sc; curBest = m; ties.length = 0; ties.push(m); }
          else if (sc === alpha) ties.push(m);
        }
      } catch (e) {
        if (!(e instanceof Timeout)) throw e;
        break;
      }
      // 같은 점수의 수가 여러 개면 무작위로 (매 판 같은 수만 두지 않도록)
      bestMove = ties.length > 1 ? ties[(Math.random() * ties.length) | 0] : curBest;
      if (alpha > MATE / 2) break;
    }
    return bestMove;
  }

  global.JanggiAI = { chooseMove, evaluate, levelConfig, posKey };
})(typeof window !== 'undefined' ? window : globalThis);
