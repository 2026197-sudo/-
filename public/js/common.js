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
     actual  : 실적 확정(또는 집계 중) 값 → 달성률 계산
     pending : 측정 전(학년도 말 조사 등) → 달성률 미산출, 값은 지수 계산에 포함(엑셀과 동일)
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
    // 평균 달성률: 초과 달성한 지수가 부진한 지수를 가리지 않도록 지수별 100%까지만 반영
    var overallProg = indices.reduce(function (s, i) { return s + Math.min(i.prog || 0, 100); }, 0) / n;
    var lowest = indices.slice().sort(function (a, b) { return (a.prog || 0) - (b.prog || 0); })[0] || null;
    return {
      indices: indices,
      overall: {
        prog: overallProg,
        progRaw: avg('prog'),
        lowest: lowest,
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
    }
    if (!(Number(d.meta.schema) >= 3)) {
      // 분기 기준일·측정기간 종료는 이제 자동 일정으로 표시되므로 같은 내용의 직접 입력 일정은 뺍니다
      d.events = d.events.filter(function (e) {
        var n = (e && e.name) || '';
        return !(/실적 집계 마감/.test(n) || /분기 실적.*수합/.test(n) || /^수요자 만족도 조사/.test(n));
      });
      // 예전 자료의 항목 중 지표와 바로 이어지는 것은 연결해 둡니다 (해당 지표가 실적으로 입력되면 자동 완료)
      d.events.forEach(function (e) { if (e && !e.link && /^재학인원 기준일/.test(e.name || '')) e.link = 's2'; });
      d.fixes.data.forEach(function (f) {
        if (!f || f.link) return;
        if (/^유지율 계 수식/.test(f.item || '')) f.link = 's2';
        else if (/^교육만족도 73점/.test(f.item || '')) f.link = 'f3';
      });
    }
    // 형식 번호와 상관없이 표시(meta.y1Source)가 없으면 한 번 적용합니다
    if (d.meta.y1Source !== Y1_SOURCE) {
      applyY1Update(d);
      d.meta.y1Source = Y1_SOURCE;
      // 2025 달성값을 엑셀 현황 기준으로 확정했으므로, 2025 실적에 관한 정의서 정정 사항은 뺍니다
      d.fixes.doc = d.fixes.doc.filter(function (f) { return !(f && /^학생지원 1차 실적 산출식의 유지율/.test(f.item || '')); });
      d.fixes.doc.forEach(function (f) {
        if (f && /^반올림 기준 통일/.test(f.item || '') && f.detail) f.detail = f.detail.replace(/\s*·\s*사회적책무 달성도 120\.1\/120\.2\s*/, '');
      });
    }
    // 용어 통일: 직접 입력한 유의사항에 남은 '진척률'을 '달성률'로
    d.notes.forEach(function (n) {
      if (!n) return;
      if (typeof n.title === 'string') n.title = n.title.replace(/진척률/g, '달성률');
      if (typeof n.body === 'string') n.body = n.body.replace(/진척률/g, '달성률');
    });
    d.meta.schema = SCHEMA;
    return d;
  }

  /* 2025(1차년도) 달성값: 2026 자율성과지표 현황 엑셀 기준으로 갱신 (한 번만 적용) */
  var SCHEMA = 5;
  var Y1_SOURCE = '2026 자율성과지표 현황 엑셀';
  var Y1_2025 = {
    items: { f1: 5, f2: 65, f3: 82.3, s1: 595, s2: 91.2, g1: 1240, g2: 927, g3: 0.3, r1: 0.2, r2: 125, r3: 33 },
    indices: { future: 88.0, student: 100.5, glocal: 103.4, social: 100.8 }
  };
  function applyY1Update(d) {
    var rates = [];
    (d.indices || []).forEach(function (ix) {
      (ix.items || []).forEach(function (it) {
        if (Object.prototype.hasOwnProperty.call(Y1_2025.items, it.id)) it.y1Actual = Y1_2025.items[it.id];
      });
      var a = Y1_2025.indices[ix.id];
      if (a !== undefined) {
        ix.y1 = ix.y1 || {};
        ix.y1.actual = a;
        if (num(ix.y1.target)) ix.y1.rate = Math.round(a / ix.y1.target * 1000) / 10;
      }
      if (ix.y1 && num(ix.y1.rate) !== null) rates.push(Number(ix.y1.rate));
    });
    if (rates.length) d.meta.y1AvgRate = Math.round(rates.reduce(function (x, y) { return x + y; }, 0) / rates.length * 10) / 10;
  }

  /* 지표 연결: 항목에 연결한 지표가 '실적'으로 입력되면 자동 완료 */
  function findItem(d, id) {
    var found = null;
    (d.indices || []).forEach(function (ix) { (ix.items || []).forEach(function (it) { if (it.id === id) found = it; }); });
    return found;
  }
  function linkDone(entry, d) {
    if (!entry || !entry.link) return false;
    var it = findItem(d, entry.link);
    return !!(it && it.status === 'actual' && num(it.current) !== null);
  }

  /* 분기 계산: 측정기간 시작월부터 3개월씩 (예: 3~5월 1분기, 6~8월 2분기, 9~11월 3분기, 12~2월 4분기) */
  function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1~12
  function ymd(y, m, dd) { return y + '-' + pad(m) + '-' + pad(dd); }
  function addMonths(y, m, k) { var t = y * 12 + (m - 1) + k; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
  function quarterOf(meta, dateStr) {
    var s = String(meta.periodStart || '').split('-').map(Number), a = String(dateStr || '').split('-').map(Number);
    if (s.length < 2 || a.length < 2 || !s[0] || !a[0]) return null;
    var off = (a[0] * 12 + a[1]) - (s[0] * 12 + s[1]);
    var q = Math.floor(off / 3);
    if (q < 0 || q > 3) return null;
    var first = addMonths(s[0], s[1], q * 3), last = addMonths(s[0], s[1], q * 3 + 2);
    return { q: q + 1, m1: first.m, m3: last.m, end: ymd(last.y, last.m, lastDay(last.y, last.m)) };
  }

  /* 자동 일정: 다음 분기 실적 기준일, 측정기간 종료, 측정 전 지표의 측정 일정 */
  function autoEvents(d, r) {
    var m = d.meta, list = [];
    var cur = quarterOf(m, m.asOfDate), next = null;
    if (cur && cur.q < 4) {
      var s = String(m.periodStart).split('-').map(Number);
      var nf = addMonths(s[0], s[1], cur.q * 3), nl = addMonths(s[0], s[1], cur.q * 3 + 2);
      next = { q: cur.q + 1, m1: nf.m, m3: nl.m, end: ymd(nl.y, nl.m, lastDay(nl.y, nl.m)) };
    }
    if (next) {
      var isEnd = next.end === m.periodEnd;
      list.push({ date: next.end, auto: true, owner: '각 관리부서',
        name: next.q + '분기 실적(' + next.m1 + '~' + next.m3 + '월) 기준일 · 부서 실적값 입력' + (isEnd ? ', 측정기간 종료' : ''),
        desc: '분기 마지막 날 기준으로 각 부서가 [실적 입력]에서 실적값 입력' });
      if (isEnd) return addPending(list);
    }
    if (m.periodEnd) list.push({ date: m.periodEnd, auto: true, owner: '기획팀', name: '측정기간 종료', desc: '연차 실적 집계 마감' });
    return addPending(list);

    function addPending(arr) {
      var byDept = {};
      r.indices.forEach(function (ix) { ix.items.forEach(function (it) {
        if (it.state === 'pending') (byDept[it.dept] = byDept[it.dept] || []).push(it.short || it.name);
      }); });
      Object.keys(byDept).forEach(function (dept) {
        arr.push({ date: '', auto: true, owner: dept, name: byDept[dept].join(', ') + ' 측정', desc: '측정 결과 입력 대기' });
      });
      return arr;
    }
  }

  /* 분기 실적 입력 알림: 분기 마지막 날 3일 전부터 종료 후 14일까지,
     실적 기준일(asOfDate)이 아직 그 분기로 바뀌지 않았으면 알림을 띄웁니다. */
  var ALARM_BEFORE = 3, ALARM_AFTER = 14;
  function inputAlarm(d, now) {
    var m = d.meta || {}, s = String(m.periodStart || '').split('-').map(Number);
    if (s.length < 2 || !s[0]) return null;
    for (var q = 0; q < 4; q++) {
      var f = addMonths(s[0], s[1], q * 3), l = addMonths(s[0], s[1], q * 3 + 2);
      var end = ymd(l.y, l.m, lastDay(l.y, l.m));
      var days = daysUntil(end, now);
      if (days === null || days > ALARM_BEFORE || days < -ALARM_AFTER) continue;
      if (String(m.asOfDate || '') >= end) return null; // 이미 이 분기 실적으로 바뀜
      return { q: q + 1, m1: f.m, m3: l.m, end: end, days: days, last: end === m.periodEnd };
    }
    return null;
  }

  /* 일정 정리: 남은 일정(날짜순)과 끝난 일정(완료·자동 완료·지난 일정) */
  function scheduleOf(d, r, now) {
    var open = [], closed = [];
    autoEvents(d, r).forEach(function (e) {
      var dd = daysUntil(e.date, now);
      if (dd !== null && dd < 0) closed.push(Object.assign({ why: '지난 일정' }, e)); else open.push(e);
    });
    (d.events || []).forEach(function (e) {
      if (!e || (!e.name && !e.desc)) return;
      var dd = daysUntil(e.date, now);
      if (e.done) closed.push(Object.assign({ why: '완료' }, e));
      else if (linkDone(e, d)) closed.push(Object.assign({ why: '자동 완료' }, e));
      else if (dd !== null && dd < 0) closed.push(Object.assign({ why: '지난 일정' }, e));
      else open.push(e);
    });
    var key = function (e) { var t = ymdToUtc(e.date); return t === null ? Infinity : t; };
    open.sort(function (a, b) { return key(a) - key(b); });
    closed.sort(function (a, b) { return key(b) - key(a); });
    return { open: open, closed: closed };
  }

  function josa(word, a, b) { // 받침 유무로 조사 선택 (이/가, 은/는)
    var c = String(word).replace(/[)\s]+$/, '').slice(-1).charCodeAt(0);
    return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b;
  }

  /* ---------- 결과보고(모니터링 및 분석 결과보고 기안) 문구 ----------
     IR센터 분기 결과보고에 쓰는 표현을 지표별로 정리했습니다. 실적·상태가 바뀌면
     요약보고서, 유의사항, 필수확인사항 문구가 이 표현으로 자동 작성됩니다.
     {Y} 는 측정기간 시작 연도(학년도)로 바뀝니다. */
  var BASIS = {
    f2: { final: true, when: '2학기 해당 교과목 운영 실적을 반영하여 최종 실적값이 산출되는 지표로, 2학기 교과목 운영 종료 후 최종 실적을 반영할 예정',
          todo: '2학기 교과목 운영 종료 후 최종 실적 반영', short: '2학기 교과목 운영 종료 후 최종 실적이 반영됩니다' },
    f3: { when: '2학기 수요자만족도조사가 끝난 후 값이 도출됨에 따라', todo: '2학기 수요자만족도조사 종료 후 실적 입력',
          short: '2학기 수요자만족도조사 후 확정됩니다' },
    s2: { when: '{Y}. 10. 1. 기준 정보공시 자료를 통해 값이 도출되는 지표로', todo: '{Y}. 10. 1. 기준 정보공시 자료로 실적 입력',
          short: '{Y}. 10. 1. 기준 정보공시 자료로 확정됩니다' },
    g3: { when: "'{Y}-2 대학핵심역량진단'이 끝난 후 값이 도출됨에 따라", todo: "'{Y}-2 대학핵심역량진단' 종료 후 실적 입력",
          short: '{Y}-2 대학핵심역량진단 후 확정됩니다' },
    r1: { when: "'{Y}-2 대학핵심역량진단'이 끝난 후 값이 도출됨에 따라", todo: "'{Y}-2 대학핵심역량진단' 종료 후 실적 입력",
          short: '{Y}-2 대학핵심역량진단 후 확정됩니다' }
  };
  var EXTERNAL = ['g2', 'r2', 'r3']; // 외부 연계 기반 지표 (열린평생직업교육, 인적·물적 자원 공유·협력, 성과 공유·확산)
  var LOW = 50; // 결과보고의 '낮은 달성률' 기준

  function itemName(it) { return String(it.name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(); }
  function quote(it) { var n = itemName(it); return "'" + n + "'" + josa(n, '은', '는'); }
  function basisOf(it, meta) {
    var b = BASIS[it.id];
    if (!b) return null;
    var y = String((meta && meta.periodStart) || '').slice(0, 4) || String(new Date().getFullYear());
    var fill = function (t) { return String(t || '').replace(/\{Y\}/g, y); };
    return { final: !!b.final, when: fill(b.when), todo: fill(b.todo), short: fill(b.short) };
  }
  /* 측정 전·미입력 지표의 입력 상태 문구: 목표의 90% 안팎이면 '90% 수준을 입력함' */
  function inputPhrase(it) {
    var cur = num(it.current), tgt = num(it.targets && it.targets.y2);
    if (it.state === 'missing' || cur === null) return '현재는 실적값을 미기재함';
    if (tgt) {
      var ratio = cur / tgt * 100;
      if (ratio >= 85 && ratio <= 95) return '90% 수준을 입력함';
      return '목표의 ' + ratio.toFixed(0) + '% 수준(' + fmt(cur) + it.unit + ')을 잠정 입력함';
    }
    return fmt(cur) + it.unit + '을 잠정 입력함';
  }

  /* 결과보고 '세부성과지표 달성현황 분석'의 ○ 문장들 */
  function reportAnalysis(r, meta, elapsedRatioValue) {
    var el = elapsedRatioValue === null || elapsedRatioValue === undefined ? null : elapsedRatioValue * 100;
    var all = [];
    r.indices.forEach(function (ix) { ix.items.forEach(function (it) { all.push(it); }); });
    var measured = all.filter(function (it) { return it.state === 'actual' && it.prog !== null; });
    var low = measured.filter(function (it) { return it.prog < LOW; }).sort(function (a, b) { return a.prog - b.prog; });
    var weak = measured.filter(function (it) { return it.prog < 60 || (el !== null && it.prog < el); });
    var lines = [];

    if (measured.length) {
      var onTrack = measured.filter(function (it) { return el === null || it.prog >= el; }).length;
      lines.push('사업추진에 따른 실적이 반영되어 측정 지표 ' + measured.length + '개 중 ' + onTrack + '개가 ' +
        (el !== null ? '기간 경과율(' + el.toFixed(1) + '%) 이상의 달성률을 보임' : '계획에 따라 추진되고 있음'));
    }
    if (low.length) {
      lines.push((measured.length ? '반면 ' : '') + low.map(function (it) { return itemName(it) + '(' + it.prog.toFixed(1) + '%)'; }).join(', ') +
        ' 지표는 ' + LOW + '% 미만의 낮은 달성률을 보여 지속적인 관리가 필요함');
    } else if (measured.length) {
      lines.push('측정된 모든 지표가 ' + LOW + '% 이상의 달성률을 보이고 있음');
    }
    all.forEach(function (it) {
      var b = basisOf(it, meta);
      if (it.state === 'actual') {
        if (b && b.final && it.prog !== null && it.prog < 100) lines.push(quote(it) + ' ' + b.when);
        return;
      }
      if (b && !b.final) lines.push(quote(it) + ' ' + b.when + (/지표로$/.test(b.when) ? ', ' : ' ') + inputPhrase(it));
      else lines.push(quote(it) + ' 측정 전 지표로, 값이 도출된 후 최종 실적을 반영할 예정' + (it.state === 'missing' ? '이며 현재는 실적값을 미기재함' : ''));
    });
    var ext = all.filter(function (it) { return EXTERNAL.indexOf(it.id) >= 0 && it.state === 'actual' && it.prog !== null && (it.prog < 60 || (el !== null && it.prog < el)); });
    if (ext.length) {
      lines.push(ext.map(itemName).join(', ') + ' 등 외부 연계 기반 지표에서 개선 필요성이 확인됨에 따라, 향후 관련 프로그램의 참여 확대와 운영 전략 보완이 필요할 것으로 판단됨');
    }
    if (weak.length) lines.push('일부 지표의 낮은 달성률을 보완하기 위해 미추진·추진 중인 사업의 이행상황을 지속적으로 점검하고 참여 독려를 강화할 필요가 있음');
    var q = quarterOf(meta || {}, meta && meta.asOfDate);
    if (q && q.q < 4) lines.push('향후 ' + (q.q + 1) + '분기에는 ' + (q.q + 1 >= 3 ? '2학기 ' : '') + '사업 추진 실적을 적극 반영하여 세부성과지표 달성률 90% 이상을 목표로 사업을 운영');
    else if (q) lines.push('연차 최종 실적 집계 시 측정 전 지표의 확정값을 반영하여 세부성과지표 달성률을 최종 점검할 예정');
    return { lines: lines, low: low, weak: weak, ext: ext };
  }

  /* 결과보고 '성과지표 달성률 요약' 문장 */
  function reportSummary(r, meta) {
    var a = String((meta && meta.asOfDate) || '').split('-');
    var mon = a.length > 1 ? Number(a[1]) + '월' : '현재';
    return mon + ' 기준 ' + r.indices.length + '개 핵심지표 달성률은 ' +
      r.indices.map(function (ix) { return ix.name + ' ' + (ix.prog === null ? '-' : ix.prog.toFixed(1)); }).join(', ') + '로 나타남';
  }

  /* 지표 상태로 자동 유의사항과 자동 점검 목록을 만듭니다.
     값을 입력하거나 상태를 바꾸면 다음 화면부터 바로 바뀝니다.
     문구는 IR센터 분기 결과보고의 표현을 따릅니다. */
  function insights(r, elapsedRatioValue, meta) {
    var el = elapsedRatioValue === null || elapsedRatioValue === undefined ? null : elapsedRatioValue * 100;
    var notes = [], checks = [];
    var an = reportAnalysis(r, meta || {}, elapsedRatioValue);
    var pending = [], missing = [], red = [], lagging = [], finals = [];
    r.indices.forEach(function (ix) {
      ix.items.forEach(function (it) {
        var x = { it: it, ix: ix };
        if (it.state === 'pending') pending.push(x);
        else if (it.state === 'missing') missing.push(x);
        else {
          var b = basisOf(it, meta);
          if (b && b.final && it.prog !== null && it.prog < 100) finals.push(x);
          if (it.band && it.band.key === 'red') red.push(x);
          else if (it.band && it.band.key === 'yellow' && el !== null && it.prog < el) lagging.push(x);
        }
      });
    });

    if (an.low.length) {
      notes.push({
        title: LOW + '% 미만 지표 ' + an.low.length + '개는 지속적인 관리가 필요합니다',
        body: an.low.map(function (it) { return itemName(it) + '(' + it.prog.toFixed(1) + '%)'; }).join(', ') +
          ' 지표는 ' + LOW + '% 미만의 낮은 달성률을 보여 지속적인 관리가 필요함.'
      });
    }
    missing.concat(pending).forEach(function (x) {
      var it = x.it, b = basisOf(it, meta);
      notes.push({
        title: (function (n) { return n + (b ? josa(n, '은', '는') + ' ' + b.short : (it.state === 'missing' ? ' 미입력은 0으로 계산됩니다' : josa(n, '은', '는') + ' 측정 전 지표입니다')); })(it.short || itemName(it)),
        body: (b && !b.final ? quote(it) + ' ' + b.when + (/지표로$/.test(b.when) ? ', ' : ' ') + inputPhrase(it) + '. ' : '') +
          (it.state === 'missing' ? '미입력 값은 0으로 계산되어 ' + x.ix.name + josa(x.ix.name, '이', '가') + ' 실제보다 낮게 나타남(반영비중 ' + it.weight + '%).' :
            '입력값은 확정 전 값으로 혁신지수 계산에만 포함되며 달성률은 계산하지 않음.')
      });
      checks.push({ tag: it.state, label: it.state === 'missing' ? '미입력' : '측정 전', who: it.dept,
        what: (b ? b.todo.replace(/ 실적 입력$/, '') + ' ' + itemName(it) + ' 실적 입력' : itemName(it) + (it.state === 'missing' ? ' 자료 입력' : ' 측정 일정 확정 및 입력값 근거 확인')) + (it.note ? ' (' + it.note + ')' : '') });
    });
    finals.forEach(function (x) {
      var it = x.it, b = basisOf(it, meta);
      var nm = it.short || itemName(it);
      notes.push({ title: nm + josa(nm, '은', '는') + ' ' + b.short, body: quote(it) + ' ' + b.when + '.' });
      checks.push({ tag: 'pending', label: '최종 반영', who: it.dept, what: b.todo + ' (' + itemName(it) + ', 현재 ' + it.prog.toFixed(1) + '%)' });
    });
    if (an.ext.length) {
      notes.push({ title: '외부 연계 기반 지표의 개선이 필요합니다',
        body: an.ext.map(function (it) { return itemName(it) + '(' + it.prog.toFixed(1) + '%)'; }).join(', ') +
          ' 등 외부 연계 기반 지표에서 개선 필요성이 확인됨에 따라, 향후 관련 프로그램의 참여 확대와 운영 전략 보완이 필요할 것으로 판단됨.' });
    }
    red.forEach(function (x) {
      var it = x.it;
      if (finals.some(function (f) { return f.it === it; })) return;
      checks.push({ tag: 'red', label: '부진', who: it.dept, what: itemName(it) + ' 미추진·추진 중인 사업의 이행상황 점검 및 참여 독려 강화 (현재 ' + it.prog.toFixed(1) + '%)' });
    });
    lagging.forEach(function (x) {
      var it = x.it;
      checks.push({ tag: 'yellow', label: '주의', who: it.dept, what: itemName(it) + ' 기간 경과율 대비 부족분 점검 (현재 ' + it.prog.toFixed(1) + '%, 경과율 ' + el.toFixed(1) + '%)' });
    });
    an.ext.forEach(function (it) {
      if (it.band && (it.band.key === 'red' || (it.band.key === 'yellow' && el !== null && it.prog < el))) return;
      checks.push({ tag: 'yellow', label: '외부 연계', who: it.dept, what: itemName(it) + ' 관련 프로그램 참여 확대 및 운영 전략 보완 (현재 ' + it.prog.toFixed(1) + '%)' });
    });

    return { notes: notes, checks: checks };
  }

  /* 관리부서별 실적: 부진(30% 미만) → 주의(30~60%) → 경과율 미달(기간 경과율보다 낮음) → 입력 필요 → 양호 순 */
  function deptSummary(r, elapsedRatioValue) {
    var el = elapsedRatioValue === null || elapsedRatioValue === undefined ? null : elapsedRatioValue * 100;
    var map = {};
    r.indices.forEach(function (ix) {
      ix.items.forEach(function (it) {
        String(it.dept || '').split(/\s*[,·\/]\s*/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (d) {
          (map[d] = map[d] || { dept: d, items: [], red: 0, yellow: 0, behind: 0, missing: 0, pending: 0, good: 0 }).items.push(it);
        });
      });
    });
    var list = Object.keys(map).map(function (k) {
      var g = map[k];
      g.items.forEach(function (it) {
        if (it.state === 'missing') g.missing++;
        else if (it.state === 'pending') g.pending++;
        else if (it.band && it.band.key === 'red') g.red++;
        else if (it.band && it.band.key === 'yellow') g.yellow++;
        else if (el !== null && it.prog !== null && it.prog < el) g.behind++;
        else g.good++;
      });
      g.level = g.red ? 'red' : g.yellow ? 'yellow' : g.behind ? 'behind' : g.missing ? 'missing' : 'good';
      g.label = (g.red || g.yellow || g.behind) ? '확인 필요' : g.missing ? '미입력' : g.pending && !g.good ? '측정 전' : '양호';
      var measured = g.items.filter(function (it) { return it.prog !== null; });
      g.minProg = measured.length ? Math.min.apply(null, measured.map(function (it) { return it.prog; })) : Infinity;
      return g;
    });
    var order = { red: 0, yellow: 1, behind: 2, missing: 3, good: 4 };
    list.sort(function (a, b) { return order[a.level] - order[b.level] || a.minProg - b.minProg || a.dept.localeCompare(b.dept, 'ko'); });
    return list;
  }

  root.KPI = {
    esc: esc, num: num, fmt: fmt, pct: pct, band: band, compute: compute,
    clockText: clockText, dotDate: dotDate, elapsedRatio: elapsedRatio, daysUntil: daysUntil,
    initTheme: initTheme, toggleTheme: toggleTheme, startClock: startClock,
    normalize: normalize, insights: insights, josa: josa, reportAnalysis: reportAnalysis, reportSummary: reportSummary,
    linkDone: linkDone, findItem: findItem, scheduleOf: scheduleOf, inputAlarm: inputAlarm, quarterOf: quarterOf, SCHEMA: SCHEMA, deptSummary: deptSummary
  };
})(typeof window !== 'undefined' ? window : globalThis);
