/* 장기 규칙 엔진
 * 보드: 9열(x 0..8) x 10행(y 0..9), 칸 번호 i = y*9 + x
 * 기물 코드: side*8 + type  (side 0 = 아래/플레이어, 1 = 위/상대)
 */
(function (global) {
  'use strict';

  const K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7; // 궁 사 상 마 차 포 졸
  const POINTS = [0, 0, 3, 3, 5, 13, 7, 2];               // 점수 계산용 (궁 제외)
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ALL8 = ORTH.concat(DIAG);

  const sideOf = p => p >> 3;
  const typeOf = p => p & 7;
  const inBoard = (x, y) => x >= 0 && x <= 8 && y >= 0 && y <= 9;
  const inPalace = (x, y) => x >= 3 && x <= 5 && (y <= 2 || y >= 7) && y >= 0 && y <= 9;
  const isCenter = (x, y) => x === 4 && (y === 1 || y === 8);

  // 궁성 대각선을 따라 한 칸 이동이 가능한가
  function palaceDiag(x1, y1, x2, y2) {
    if (!inPalace(x1, y1) || !inPalace(x2, y2)) return false;
    if ((y1 <= 2) !== (y2 <= 2)) return false;
    return isCenter(x1, y1) || isCenter(x2, y2);
  }

  function push(b, s, out, from, x, y) {
    if (!inBoard(x, y)) return;
    const to = y * 9 + x, t = b[to];
    if (t && sideOf(t) === s) return;
    out.push((from << 7) | to);
  }

  // 의사 합법수 (자기 궁이 잡히는지 검사하지 않음)
  function genPseudo(b, s, out) {
    out = out || [];
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (!p || sideOf(p) !== s) continue;
      const x = i % 9, y = (i / 9) | 0;
      switch (typeOf(p)) {
        case K: case A: {
          for (const [dx, dy] of ALL8) {
            const nx = x + dx, ny = y + dy;
            if (nx < 3 || nx > 5) continue;
            if (s === 0 ? (ny < 7 || ny > 9) : (ny < 0 || ny > 2)) continue;
            if (dx && dy && !palaceDiag(x, y, nx, ny)) continue;
            push(b, s, out, i, nx, ny);
          }
          break;
        }
        case R: {
          for (const [dx, dy] of ORTH) {
            let nx = x + dx, ny = y + dy;
            while (inBoard(nx, ny)) {
              const t = b[ny * 9 + nx];
              if (!t) out.push((i << 7) | (ny * 9 + nx));
              else { if (sideOf(t) !== s) out.push((i << 7) | (ny * 9 + nx)); break; }
              nx += dx; ny += dy;
            }
          }
          if (inPalace(x, y)) {
            for (const [dx, dy] of DIAG) {
              let cx = x, cy = y;
              for (;;) {
                const nx = cx + dx, ny = cy + dy;
                if (!palaceDiag(cx, cy, nx, ny)) break;
                const t = b[ny * 9 + nx];
                if (!t) out.push((i << 7) | (ny * 9 + nx));
                else { if (sideOf(t) !== s) out.push((i << 7) | (ny * 9 + nx)); break; }
                cx = nx; cy = ny;
              }
            }
          }
          break;
        }
        case C: {
          for (const [dx, dy] of ORTH) {
            let nx = x + dx, ny = y + dy;
            while (inBoard(nx, ny) && !b[ny * 9 + nx]) { nx += dx; ny += dy; }
            if (!inBoard(nx, ny)) continue;
            if (typeOf(b[ny * 9 + nx]) === C) continue; // 포는 포를 넘지 못함
            nx += dx; ny += dy;
            while (inBoard(nx, ny)) {
              const t = b[ny * 9 + nx];
              if (!t) out.push((i << 7) | (ny * 9 + nx));
              else {
                if (sideOf(t) !== s && typeOf(t) !== C) out.push((i << 7) | (ny * 9 + nx));
                break;
              }
              nx += dx; ny += dy;
            }
          }
          if (inPalace(x, y) && !isCenter(x, y)) {
            for (const [dx, dy] of DIAG) {
              const mx = x + dx, my = y + dy;
              if (!palaceDiag(x, y, mx, my)) continue;
              const sc = b[my * 9 + mx];
              if (!sc || typeOf(sc) === C) continue;
              const nx = mx + dx, ny = my + dy;
              if (!palaceDiag(mx, my, nx, ny)) continue;
              const t = b[ny * 9 + nx];
              if (!t || (sideOf(t) !== s && typeOf(t) !== C)) out.push((i << 7) | (ny * 9 + nx));
            }
          }
          break;
        }
        case H: case E: {
          const steps = typeOf(p) === H ? 1 : 2;
          for (const [dx, dy] of ORTH) {
            const x1 = x + dx, y1 = y + dy;
            if (!inBoard(x1, y1) || b[y1 * 9 + x1]) continue;
            const diags = dx ? [[dx, 1], [dx, -1]] : [[1, dy], [-1, dy]];
            for (const [ex, ey] of diags) {
              let cx = x1, cy = y1, ok = true;
              for (let k = 1; k < steps; k++) {
                cx += ex; cy += ey;
                if (!inBoard(cx, cy) || b[cy * 9 + cx]) { ok = false; break; }
              }
              if (ok) push(b, s, out, i, cx + ex, cy + ey);
            }
          }
          break;
        }
        case P: {
          const f = s === 0 ? -1 : 1;
          push(b, s, out, i, x, y + f);
          push(b, s, out, i, x - 1, y);
          push(b, s, out, i, x + 1, y);
          for (const dx of [-1, 1]) {
            if (palaceDiag(x, y, x + dx, y + f)) push(b, s, out, i, x + dx, y + f);
          }
          break;
        }
      }
    }
    return out;
  }

  function findKing(b, s) {
    const k = s * 8 + K;
    for (let i = 0; i < 90; i++) if (b[i] === k) return i;
    return -1;
  }

  function attacked(b, sq, bySide) {
    const ms = genPseudo(b, bySide);
    for (let j = 0; j < ms.length; j++) if ((ms[j] & 127) === sq) return true;
    return false;
  }

  function inCheck(b, s) {
    const k = findKing(b, s);
    return k < 0 || attacked(b, k, 1 - s);
  }

  function make(b, m) {
    const from = m >> 7, to = m & 127, cap = b[to];
    b[to] = b[from]; b[from] = 0;
    return cap;
  }
  function unmake(b, m, cap) {
    const from = m >> 7, to = m & 127;
    b[from] = b[to]; b[to] = cap;
  }

  function legalMoves(b, s) {
    const res = [];
    for (const m of genPseudo(b, s)) {
      const cap = make(b, m);
      if (!inCheck(b, s)) res.push(m);
      unmake(b, m, cap);
    }
    return res;
  }

  // 상차림: 왼쪽부터 (1,2,6,7열)
  const FORMATIONS = {
    '마상마상': [H, E, H, E],
    '상마상마': [E, H, E, H],
    '마상상마': [H, E, E, H],
    '상마마상': [E, H, H, E]
  };

  // bottomForm / topForm 은 각 플레이어 자신의 시점에서 본 상차림
  function initialBoard(bottomForm, topForm) {
    const b = new Int8Array(90);
    const put = (x, y, s, t) => { b[y * 9 + x] = s * 8 + t; };
    const fb = FORMATIONS[bottomForm] || FORMATIONS['마상마상'];
    const ft = FORMATIONS[topForm] || FORMATIONS['마상마상'];
    const cols = [1, 2, 6, 7];
    // 아래
    put(0, 9, 0, R); put(8, 9, 0, R); put(3, 9, 0, A); put(5, 9, 0, A); put(4, 8, 0, K);
    cols.forEach((c, j) => put(c, 9, 0, fb[j]));
    put(1, 7, 0, C); put(7, 7, 0, C);
    for (const x of [0, 2, 4, 6, 8]) put(x, 6, 0, P);
    // 위 (상대 시점의 왼쪽 = 화면 오른쪽)
    put(0, 0, 1, R); put(8, 0, 1, R); put(3, 0, 1, A); put(5, 0, 1, A); put(4, 1, 1, K);
    cols.forEach((c, j) => put(8 - c, 0, 1, ft[j]));
    put(1, 2, 1, C); put(7, 2, 1, C);
    for (const x of [0, 2, 4, 6, 8]) put(x, 3, 1, P);
    return b;
  }

  // 남은 기물 점수 (한은 덤 1.5)
  function material(b, s) {
    let sum = 0;
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (p && sideOf(p) === s) sum += POINTS[typeOf(p)];
    }
    return sum;
  }

  global.Janggi = {
    K, A, E, H, R, C, P, POINTS, FORMATIONS,
    sideOf, typeOf, inPalace, isCenter,
    genPseudo, legalMoves, inCheck, findKing, make, unmake, initialBoard, material
  };
})(typeof window !== 'undefined' ? window : globalThis);
