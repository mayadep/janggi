/* 급수/단수 등급제
 * 내부 점수(레이팅) 800 = 18급, 50점마다 한 등급, 1700 = 1단, 2100 = 9단
 */
(function (global) {
  'use strict';
  const KEY = 'janggi.profile.v1';
  const BASE = 800, STEP = 50, MAX_IDX = 26;

  function rankIndex(rating) {
    return Math.max(0, Math.min(MAX_IDX, Math.floor((rating - BASE) / STEP)));
  }
  function rankName(idx) {
    return idx < 18 ? (18 - idx) + '급' : (idx - 17) + '단';
  }
  function isDan(idx) { return idx >= 18; }

  function defaults() { return { rating: BASE, wins: 0, losses: 0, draws: 0 }; }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* 저장소를 못 쓰는 환경 */ }
    return defaults();
  }
  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ }
  }

  // Elo 방식. result: 1 승, 0.5 무, 0 패
  function applyResult(profile, oppRating, result) {
    const expected = 1 / (1 + Math.pow(10, (oppRating - profile.rating) / 400));
    const games = profile.wins + profile.losses + profile.draws;
    const k = games < 10 ? 48 : 32; // 초반에는 빨리 제자리를 찾도록
    let delta = Math.round(k * (result - expected));
    if (result === 1 && delta < 4) delta = 4;
    const before = profile.rating;
    profile.rating = Math.max(BASE - STEP + 1, Math.min(BASE + STEP * (MAX_IDX + 1) - 1, before + delta));
    if (result === 1) profile.wins++; else if (result === 0) profile.losses++; else profile.draws++;
    save(profile);
    return { delta: profile.rating - before, before, after: profile.rating };
  }

  const NAMES = ['궁성지기', '포병대장', '차돌이', '마상고수', '외통수', '면상장군', '한량선비', '초보탈출',
    '장기왕', '박포장', '청룡차', '백마탄객', '상다리', '졸병일호', '대국수', '고목나무', '바둑이아빠',
    '한수만', '양차대장', '궁뒤사', '노을포', '먹장군', '돌직구', '수읽기달인'];
  const AVATARS = ['🐯', '🐉', '🦅', '🐻', '🦊', '🐺', '🦁', '🐲', '🐼', '🦉', '🐗', '🐢'];

  // 비슷한 등급의 AI 상대 생성 (±2등급 이내)
  function makeOpponent(rating) {
    const r = Math.max(BASE, Math.min(BASE + STEP * MAX_IDX + STEP - 1,
      rating + Math.round((Math.random() * 2 - 1) * STEP * 2)));
    return {
      name: NAMES[(Math.random() * NAMES.length) | 0],
      avatar: AVATARS[(Math.random() * AVATARS.length) | 0],
      rating: r,
      rankIdx: rankIndex(r)
    };
  }

  function progress(rating) {
    const idx = rankIndex(rating);
    if (idx >= MAX_IDX) return { pct: 100, toNext: 0 };
    const start = BASE + idx * STEP;
    const into = Math.max(0, rating - start);
    return { pct: Math.round(into / STEP * 100), toNext: start + STEP - rating };
  }

  global.Rank = { rankIndex, rankName, isDan, load, save, defaults, applyResult, makeOpponent, progress, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
