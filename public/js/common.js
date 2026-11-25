/* 공통 유틸: 계산(정의서 산출식), 서식, 테마, 시간 */
(function (root) {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function fmt(v, digits) {
    var n = num(v);
    if (n === null) return '—';
    if (Number.isInteger(n)) return n.toLocaleString('ko-KR');
    return n.toLocaleString('ko-KR', { maximumFractionDigits: digits === undefined ? 2 : digits });
  }

  function pct(v, digits) {
    var n = num(v);
    return n === null ? '—' : n.toFixed(digits === undefined ? 1 : digits) + '%';
  }

  /* 상태
     actual  : 실적 확정(또는 집계 중) 값 → 진척률 계산
     pending : 측정 전(학년도 말 조사 등) → 진척률 미산출, 값은 지수 계산에 포함(엑셀과 동일)
     missing : 미입력 → 지수 계산에 0으로 포함 */
  function itemValueForIndex(it) {
    if (it.status === 'missing') return 0;
    var v = num(it.current);
    return v === null ? 0 : v;
  }

  // 정의서 산출식: Σ (값 ÷ 3차년도 목표 × 100 × 반영비중)
  function indexOf(items, pick) {
    var sum = 0;
    items.forEach(function (it) {
      var t3 = num(it.targets && it.targets.y3);
      if (!t3) return;
      var v = pick(it);
      sum += ((v || 0) / t3) * 100 * (num(it.weight) / 100);
    });
    return sum;
  }

  function band(prog, th) {
    var t = th || [30, 60, 90];
    if (prog >= t[2]) return { key: 'deep', label: '우수' };
    if (prog >= t[1]) return { key: 'green', label: '양호' };
    if (prog >= t[0]) return { key: 'yellow', label: '주의' };
    return { key: 'red', label: '부진' };
  }

  function compute(data) {
    var th = (data.meta && data.meta.thresholds) || [30, 60, 90];
    var pendingCount = 0, missingCount = 0;
    var indices = data.indices.map(function (ix) {
      var items = ix.items.map(function (it) {
        var v = num(it.current);
        var t2 = num(it.targets && it.targets.y2);
        var status = it.status;
        if (status === 'actual' && v === null) status = 'missing';
        var out = Object.assign({}, it, { state: status, prog: null, band: null });
        if (status === 'actual' && t2) {
          out.prog = (v / t2) * 100;
          out.band = band(out.prog, th);
        }
        if (status === 'pending') pendingCount++;
        if (status === 'missing') missingCount++;
        return out;
      });
      var cur = indexOf(ix.items, itemValueForIndex);
      var tgt = indexOf(ix.items, function (it) { return num(it.targets.y2); });
      var prog = tgt ? (cur / tgt) * 100 : null;
      return Object.assign({}, ix, {
        items: items,
        cur: cur,
        tgt: tgt,
        prog: prog,
        band: prog === null ? null : band(prog, th),
        provisional: items.some(function (i) { return i.state !== 'actual'; })
      });
    });
    var n = indices.length || 1;
    var avg = function (key) { return indices.reduce(function (s, i) { return s + (i[key] || 0); }, 0) / n; };
    var overallProg = avg('prog');
    return {
      indices: indices,
      overall: {
        prog: overallProg,
        cur: avg('cur'),
        tgt: avg('tgt'),
        band: band(overallProg, th),
        pending: pendingCount,
        missing: missingCount
      },
      thresholds: th
    };
  }

  /* 날짜: 모든 계산은 한국 표준시(KST) 기준 */
  function kstParts(d) {
    var k = new Date(d.getTime() + 9 * 3600000);
    return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes(), s: k.getUTCSeconds(), wd: k.getUTCDay() };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function clockText(d) {
    var p = kstParts(d);
    return p.y + '.' + pad(p.m) + '.' + pad(p.d) + ' (' + DAYS[p.wd] + ') ' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s) + ' KST';
  }
  function ymdToUtc(s) { // 'YYYY-MM-DD' → UTC ms of that calendar day
    var a = String(s || '').split('-').map(Number);
    return a.length === 3 && a[0] ? Date.UTC(a[0], a[1] - 1, a[2]) : null;
  }
  function dotDate(s) {
    var a = String(s || '').split('-');
    return a.length === 3 ? a[0] + '.' + a[1] + '.' + a[2] : '';
  }
  // 측정기간 중 기준일까지 경과 비율 (기준일 당일 포함)
  function elapsedRatio(meta) {
    var s = ymdToUtc(meta.periodStart), e = ymdToUtc(meta.periodEnd), a = ymdToUtc(meta.asOfDate);
    if (s === null || e === null || a === null) return null;
    var total = (e - s) / 86400000 + 1;
    var done = (a - s) / 86400000 + 1;
    return Math.max(0, Math.min(1, done / total));
  }
  function daysUntil(ymd, now) {
    var t = ymdToUtc(ymd);
    if (t === null) return null;
    var p = kstParts(now);
    return Math.round((t - Date.UTC(p.y, p.m - 1, p.d)) / 86400000);
  }

  /* 테마 */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('kmcuKpiTheme'); } catch (e) {}
    var dark = saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(dark);
  }
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
      var lbl = btn.querySelector('.theme-label');
      if (lbl) lbl.textContent = dark ? '라이트 모드' : '다크 모드';
      btn.querySelector('.icon-sun').style.display = dark ? '' : 'none';
      btn.querySelector('.icon-moon').style.display = dark ? 'none' : '';
    }
  }
  function toggleTheme() {
    var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    try { localStorage.setItem('kmcuKpiTheme', dark ? 'dark' : 'light'); } catch (e) {}
    applyTheme(dark);
  }
  function startClock() {
    var el = document.getElementById('clock');
    if (!el) return;
    var tick = function () {
      var now = new Date();
      el.textContent = clockText(now);
      el.setAttribute('datetime', now.toISOString());
    };
    tick();
    setInterval(tick, 1000);
  }

  /* 자료 정리: 문구 목록이 없거나 예전 형식이면 맞춰 줍니다.
     예전 자료의 고정 유의사항 중 지금은 자동으로 만들어지는 항목은 뺍니다(중복 방지). */
  var LEGACY_AUTO_NOTES = [
    '점수형 지표의 비율은 진척률이 아닙니다',
    '유지율 미입력은 0으로 계산됩니다',
    '유지율 0은 미달이 아니라 미입력입니다'
  ];
  function normalize(d) {
    d.meta = d.meta || {};
    if (!Array.isArray(d.notes)) d.notes = [];
    if (!Array.isArray(d.events)) d.events = [];
    if (!d.fixes || typeof d.fixes !== 'object' || Array.isArray(d.fixes)) d.fixes = {};
    if (!Array.isArray(d.fixes.data)) d.fixes.data = [];
    if (!Array.isArray(d.fixes.doc)) d.fixes.doc = [];
    if (!(Number(d.meta.schema) >= 2)) {
      d.notes = d.notes.filter(function (n) { return !n || LEGACY_AUTO_NOTES.indexOf(n.title) < 0; });
      d.meta.schema = 2;
    }
    return d;
  }

  function josa(word, a, b) { // 받침 유무로 조사 선택 (이/가, 은/는)
    var c = String(word).replace(/[)\s]+$/, '').slice(-1).charCodeAt(0);
    return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b;
  }

  /* 지표 상태로 자동 유의사항과 자동 점검 목록을 만듭니다.
     값을 입력하거나 상태를 바꾸면 다음 화면부터 바로 바뀝니다. */
  function insights(r, elapsedRatioValue) {
    var el = elapsedRatioValue === null || elapsedRatioValue === undefined ? null : elapsedRatioValue * 100;
    var notes = [], checks = [];
    var pending = [], missing = [], red = [], lagging = [];
    r.indices.forEach(function (ix) {
      ix.items.forEach(function (it) {
        var x = { it: it, ix: ix };
        if (it.state === 'pending') pending.push(x);
        else if (it.state === 'missing') missing.push(x);
        else if (it.band && it.band.key === 'red') red.push(x);
        else if (it.band && it.band.key === 'yellow' && el !== null && it.prog < el) lagging.push(x);
      });
    });

    missing.forEach(function (x) {
      var it = x.it;
      notes.push({
        title: (it.short || it.name) + ' 미입력은 0으로 계산됩니다',
        body: '반영비중 ' + it.weight + '%라 값이 입력되면 ' + x.ix.name + josa(x.ix.name, '이', '가') + ' 크게 달라집니다.' + (it.note ? ' (' + it.note + ')' : '')
      });
      checks.push({ tag: 'missing', label: '미입력', who: it.dept, what: it.name + ' 자료 입력' + (it.note ? ' · ' + it.note : '') });
    });

    if (pending.length) {
      var lines = pending.map(function (x) {
        var it = x.it, cur = num(it.current), prev = num(it.y1Actual), s = it.short || it.name;
        if (cur === null) return s;
        var t = s + ' 입력값 ' + fmt(cur) + it.unit;
        if (prev !== null && it.unit === '점') {
          var diff = Math.round((cur - prev) * 100) / 100;
          t += '(작년 ' + fmt(prev) + it.unit + ' 대비 ' + (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmt(Math.abs(diff)) + it.unit + ')';
        }
        return t;
      });
      notes.push({
        title: '측정 전 지표 ' + pending.length + '개는 진척률을 계산하지 않습니다',
        body: lines.join(', ') + '. 입력된 값은 근거 확인 전 값으로 혁신지수 계산에만 포함되며, 점수형 지표의 비율은 진척률이 아닙니다.'
      });
      var byDept = {};
      pending.forEach(function (x) { (byDept[x.it.dept] = byDept[x.it.dept] || []).push(x.it.short || x.it.name); });
      Object.keys(byDept).forEach(function (dept) {
        checks.push({ tag: 'pending', label: '측정 전', who: dept, what: byDept[dept].join(', ') + ' 측정 일정 확정 및 입력값 근거 확인' });
      });
    }

    red.forEach(function (x) {
      var it = x.it;
      notes.push({
        title: (it.short || it.name) + ' 진척률이 ' + it.prog.toFixed(1) + '%로 부진합니다',
        body: (el !== null ? '기간 경과율(' + el.toFixed(1) + '%)보다 ' + (el - it.prog).toFixed(1) + '%p 낮습니다. ' : '') + (it.note ? it.note : '')
      });
      checks.push({ tag: 'red', label: '부진', who: it.dept, what: it.name + ' 실적 점검 및 추진 계획 확인 (현재 ' + it.prog.toFixed(1) + '%)' });
    });
    lagging.forEach(function (x) {
      var it = x.it;
      checks.push({ tag: 'yellow', label: '주의', who: it.dept, what: it.name + ' 기간 경과율 대비 부족분 점검 (현재 ' + it.prog.toFixed(1) + '%, 경과율 ' + el.toFixed(1) + '%)' });
    });

    return { notes: notes, checks: checks };
  }

  root.KPI = {
    esc: esc, num: num, fmt: fmt, pct: pct, band: band, compute: compute,
    clockText: clockText, dotDate: dotDate, elapsedRatio: elapsedRatio, daysUntil: daysUntil,
    initTheme: initTheme, toggleTheme: toggleTheme, startClock: startClock,
    normalize: normalize, insights: insights, josa: josa
  };
})(typeof window !== 'undefined' ? window : globalThis);
