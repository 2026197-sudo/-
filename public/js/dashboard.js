/* 대시보드 렌더링: /api/data 를 읽어 그리고, 1분마다 새 자료가 있는지 확인합니다. */
(function () {
  'use strict';
  var K = window.KPI, esc = K.esc, fmt = K.fmt, pct = K.pct;
  var C = 2 * Math.PI * 50;
  var lastStamp = null;

  var COLOR = { deep: 'var(--st-deep)', green: 'var(--st-green)', yellow: 'var(--st-yellow)', red: 'var(--st-red)' };

  function mark(state, band) {
    if (state === 'pending') return '<span class="mark mark-pending"></span>';
    if (state === 'missing') return '<span class="mark mark-missing"></span>';
    return band ? '<span class="mark mark-' + band.key + '"></span>' : '';
  }
  function statusLabel(state, band) {
    if (state === 'pending') return '측정 전';
    if (state === 'missing') return '미입력';
    return band ? band.label : '—';
  }

  /* 도넛: 진척률 호 + 기준일 경과 눈금 */
  function donut(o) {
    // o: size, stroke, prog, state, band, label, elapsed, hero, big, cap
    var p = o.prog === null || o.prog === undefined ? null : o.prog / 100;
    var measured = o.state === 'actual' && p !== null;
    var arc = '';
    if (measured && p > 0) {
      var full = p >= 1;
      var len = Math.min(p, 1) * C;
      var color = o.hero ? '#FFFFFF' : COLOR[o.band.key];
      arc = '<circle cx="60" cy="60" r="50" fill="none" stroke-width="' + o.stroke + '" stroke-linecap="' + (full ? 'butt' : 'round') +
        '" transform="rotate(-90 60 60)" stroke-dasharray="' + (full ? C + ' 0' : len.toFixed(2) + ' ' + C.toFixed(2)) + '" style="stroke:' + color + '"/>';
    }
    var track = '<circle cx="60" cy="60" r="50" fill="none" stroke-width="' + o.stroke + '" style="stroke:' +
      (o.hero ? 'rgba(255,255,255,.18)' : 'var(--track)') + '"' + (measured ? '' : ' stroke-dasharray="7 5"') + '/>';
    var tick = '';
    if (o.elapsed !== null && o.elapsed !== undefined) {
      var a = o.elapsed * 2 * Math.PI - Math.PI / 2;
      var r1 = 50 - o.stroke / 2 - 4, r2 = 50 + o.stroke / 2 + 4;
      tick = '<line x1="' + (60 + r1 * Math.cos(a)).toFixed(2) + '" y1="' + (60 + r1 * Math.sin(a)).toFixed(2) +
        '" x2="' + (60 + r2 * Math.cos(a)).toFixed(2) + '" y2="' + (60 + r2 * Math.sin(a)).toFixed(2) +
        '" stroke-width="' + (o.size > 140 ? 3 : 3.5) + '" stroke-linecap="round" style="stroke:' + (o.hero ? '#FF8A90' : 'var(--heading)') + '"/>';
    }
    var valText = measured ? pct(o.prog) : statusLabel(o.state);
    var aria = o.label + ': ' + (measured ? '진척률 ' + pct(o.prog) + ', ' + o.band.label : statusLabel(o.state)) +
      (o.elapsed !== null && o.elapsed !== undefined ? ', 기준일 기간 경과율 ' + pct(o.elapsed * 100) : '');
    var fs = o.size >= 160 ? 34 : o.size >= 110 ? 22 : 15;
    return '<div class="donut" style="width:' + o.size + 'px;height:' + o.size + 'px">' +
      '<svg viewBox="0 0 120 120" width="' + o.size + '" height="' + o.size + '" role="img" aria-label="' + esc(aria) + '"><title>' + esc(aria) + '</title>' +
      track + arc + tick + '</svg>' +
      '<div class="center"><span class="val" style="font-size:' + (measured ? fs : Math.max(13, fs - 6)) + 'px">' + esc(valText) + '</span>' +
      (o.cap ? '<span class="cap">' + esc(o.cap) + '</span>' : '') + '</div></div>';
  }

  function render(data) {
    window.KPI_CURRENT = data;
    var m = data.meta, r = K.compute(data), th = r.thresholds;
    var elapsed = K.elapsedRatio(m);
    var asOf = K.dotDate(m.asOfDate);
    var html = '';

    /* 히어로 */
    html += '<section id="summary" aria-labelledby="pageTitle"><div class="hero">' +
      '<div class="hero-main"><div class="hero-badges"><span class="pill-red">' + esc(m.badge) + '</span><span class="hero-sub">' + esc(m.program) + '</span></div>' +
      '<h1 id="pageTitle">' + esc(m.title) + '</h1>' +
      '<p>진척률은 세부지표 실적을 2차년도 목표로 나눈 값이며, 혁신지수는 정의서 산출식(실적 ÷ 3차년도 목표 × 반영비중)으로 계산합니다.</p>' +
      '<div class="chips"><span class="chip-glass">측정기간 ' + esc(K.dotDate(m.periodStart)) + ' – ' + esc(K.dotDate(m.periodEnd)) + '</span>' +
      '<span class="chip-solid">' + esc(asOf) + ' 기준 기간 경과율 ' + pct(elapsed * 100) + '</span>' +
      '<span class="chip-glass">실적: ' + esc(m.dataBasis) + '</span><span class="chip-glass">기준: ' + esc(m.definitionBasis) + '</span></div></div>' +
      '<div class="hero-side">' +
      donut({ size: 168, stroke: 11, prog: r.overall.prog, state: 'actual', band: r.overall.band, label: '전체 자율성과지표 평균', elapsed: elapsed, hero: true, cap: '평균 진척률' }) +
      '<div class="hero-stats"><span class="cap">전체 자율성과지표 (4개 지수 각 25%)</span>' +
      '<span>현재 지수 평균 <strong>' + r.overall.cur.toFixed(1) + '</strong> / 목표 ' + r.overall.tgt.toFixed(1) + '</span>' +
      '<span>1차년도 평균달성도 <strong>' + pct(m.y1AvgRate) + '</strong></span>' +
      '<span class="status-pill">' + mark('actual', r.overall.band) + esc(r.overall.band.label) + '</span>' +
      ((r.overall.pending || r.overall.missing) ? '<span class="hero-warn">잠정치: 측정 전 ' + r.overall.pending + '개 · 미입력 ' + r.overall.missing + '개 지표 포함</span>' : '') +
      '</div></div></div></section>';

    /* 범례 */
    html += '<div class="legend" role="note"><b>읽는 법</b>' +
      '<span class="status"><span class="mark mark-deep"></span>우수 ' + th[2] + '% 이상</span>' +
      '<span class="status"><span class="mark mark-green"></span>양호 ' + th[1] + '~' + th[2] + '%</span>' +
      '<span class="status"><span class="mark mark-yellow"></span>주의 ' + th[0] + '~' + th[1] + '%</span>' +
      '<span class="status"><span class="mark mark-red"></span>부진 ' + th[0] + '% 미만</span>' +
      '<span class="status"><span class="mark mark-pending"></span>측정 전</span>' +
      '<span class="status"><span class="mark mark-missing"></span>미입력</span>' +
      '<span class="status"><span class="tick"></span>눈금 = ' + esc(asOf) + ' 기준 기간 경과율(참고)</span></div>';

    /* 혁신지수 카드 */
    html += '<div class="grid-4">';
    r.indices.forEach(function (ix) {
      var flags = [];
      ix.items.forEach(function (it) {
        if (it.state === 'pending') flags.push(it.short + ' 측정 전');
        if (it.state === 'missing') flags.push(it.short + ' 미입력');
      });
      html += '<article class="card index-card"><h3>' + esc(ix.name) + '</h3>' +
        donut({ size: 120, stroke: 12, prog: ix.prog, state: 'actual', band: ix.band, label: ix.name, elapsed: elapsed, cap: '진척률' }) +
        '<div class="index-meta"><span>현재 <strong>' + ix.cur.toFixed(1) + '</strong> / 목표 ' + ix.tgt.toFixed(1) + '</span>' +
        '<span>1차년도 달성도 ' + pct(ix.y1 && ix.y1.rate) + '</span>' +
        '<span class="status" style="justify-content:center">' + mark('actual', ix.band) + esc(ix.band.label) + '</span></div>' +
        (flags.length ? '<span class="flag">잠정치 · ' + esc(flags.join(', ')) + '</span>' : '') +
        '</article>';
    });
    html += '</div>';

    /* 세부지표: 도넛 → 수치표 */
    html += '<section id="detail"><div class="sec-head"><div><h2>세부지표 진척 현황</h2>' +
      '<div class="desc">2차년도 목표 대비 실적 · 출처: ' + esc(m.dataBasis) + '</div></div></div>';
    html += '<div class="group-grid">';
    r.indices.forEach(function (ix) {
      html += '<article class="card group-card"><h3>' + esc(ix.name) + '</h3><div class="mini-row">';
      ix.items.forEach(function (it) {
        html += '<div class="mini">' + donut({ size: 84, stroke: 14, prog: it.prog, state: it.state, band: it.band, label: it.name, elapsed: elapsed }) +
          '<span class="label">' + esc(it.short) + '</span></div>';
      });
      html += '</div></article>';
    });
    html += '</div>';

    html += '<div class="card table-card"><div class="table-scroll"><table><caption>세부지표 수치표</caption><thead><tr>' +
      '<th scope="col">세부지표</th><th scope="col" class="r">비중</th><th scope="col" class="r">\'25 실적</th><th scope="col" class="r">\'26 목표</th>' +
      '<th scope="col" class="r">현재값</th><th scope="col" class="r">진척률</th><th scope="col">상태</th><th scope="col">비고</th>' +
      '<th scope="col">관리부서</th><th scope="col" class="r">\'27 목표</th></tr></thead><tbody>';
    r.indices.forEach(function (ix) {
      html += '<tr class="group-row"><td colspan="10">' + esc(ix.name) + ' · 현재 ' + ix.cur.toFixed(1) + ' / 목표 ' + ix.tgt.toFixed(1) + ' · 진척률 ' + pct(ix.prog) + '</td></tr>';
      ix.items.forEach(function (it) {
        var cur = it.state === 'missing' ? '—' : fmt(it.current) + (it.state === 'pending' && K.num(it.current) !== null ? '*' : '');
        html += '<tr><th scope="row" style="background:none;font-weight:500;color:var(--ink);white-space:normal">' + esc(it.name) + ' <span class="dim small">(' + esc(it.unit) + ')</span></th>' +
          '<td class="r dim">' + esc(it.weight) + '%</td><td class="r dim">' + fmt(it.y1Actual) + '</td><td class="r dim">' + fmt(it.targets.y2) + '</td>' +
          '<td class="r strong">' + cur + '</td><td class="r strong">' + (it.prog === null ? statusLabel(it.state) : pct(it.prog)) + '</td>' +
          '<td><span class="status">' + mark(it.state, it.band) + esc(statusLabel(it.state, it.band)) + '</span></td>' +
          '<td class="small dim">' + esc(it.note) + '</td><td class="small dim">' + esc(it.dept) + '</td><td class="r dim">' + fmt(it.targets.y3) + '</td></tr>';
      });
    });
    html += '</tbody></table></div><p class="foot-note">* 측정 전 지표(학년도 말 조사·사후검사)는 진척률을 계산하지 않으며, 입력된 값은 근거 확인 전 값으로 혁신지수 계산에만 포함됩니다. 미입력 지표는 0으로 계산됩니다.</p></div></section>';

    /* 유의사항 + 일정 */
    html += '<div class="two-col"><section id="notes" class="card panel"><h2>해석 시 유의사항</h2><ol>';
    (data.notes || []).forEach(function (n) { html += '<li><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span></li>'; });
    html += '</ol></section><section id="schedule" class="card panel"><h2>측정 기준일과 남은 일정</h2><div>';
    var now = new Date();
    (data.events || []).forEach(function (e) {
      var d = K.daysUntil(e.date, now), dd = '';
      if (d !== null) dd = d > 0 ? ' (D-' + d + ')' : d === 0 ? ' (오늘)' : ' (지남)';
      html += '<div class="list-row"><span class="date">' + (e.date ? esc(K.dotDate(e.date)) : '[일정 확인]') + '</span>' +
        '<span class="body"><span>' + esc(e.name) + esc(dd) + '</span><span class="sub">' + esc(e.desc) + '</span></span></div>';
    });
    html += '</div></section></div>';

    /* 정리 필요 */
    var fx = data.fixes || {};
    html += '<section id="fix" class="two-col"><div class="card panel"><h2>실적 파일 정리 필요 사항</h2><div class="desc">분기 실적 엑셀 기준</div><div>';
    (fx.data || []).forEach(function (f) { html += '<div class="list-row"><span>' + esc(f.item) + '</span><span class="owner">' + esc(f.owner) + '</span></div>'; });
    html += '</div></div><div class="card panel"><h2>정의서 정정 필요 사항</h2><div class="desc">정의서 산출식 재계산 결과</div><div>';
    (fx.doc || []).forEach(function (f) { html += '<div class="list-row"><span class="body"><span style="font-weight:500">' + esc(f.item) + '</span><span class="sub">' + esc(f.detail) + '</span></span></div>'; });
    html += '</div></div></section>';

    document.getElementById('app').innerHTML = html;
    var up = m.updatedAt ? new Date(m.updatedAt) : null;
    document.getElementById('updated').textContent = '최종 수정 ' + (up && !isNaN(up) ? K.clockText(up).replace(/:\d\d KST$/, '') : '—') + (m.updatedBy ? ' · ' + m.updatedBy : '');
  }

  function banner(html, kind) {
    var bar = document.createElement('div');
    bar.className = 'banner ' + (kind || 'banner-ok');
    bar.innerHTML = html;
    var app = document.getElementById('app');
    app.insertBefore(bar, app.firstChild);
  }

  /* 저장소(API)에 연결하지 못하면 배포 시 함께 올린 기본 자료(data.json)를 읽기 전용으로 표시 */
  function loadFallback() {
    fetch('data.json', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (data) {
        lastStamp = 'fallback';
        render(data);
        banner('<b>읽기 전용</b> · 저장소에 연결하지 못해 배포 시점의 기본 자료를 보여 주고 있습니다. 잠시 후 새로고침해 주세요.', 'banner-error');
      })
      .catch(function () {
        document.getElementById('app').innerHTML = '<div class="banner banner-error">자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>';
      });
  }

  function load() {
    fetch('api/data', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (data) {
        var stamp = data.meta && data.meta.updatedAt;
        if (stamp !== lastStamp) { lastStamp = stamp; render(data); }
      })
      .catch(function () {
        if (lastStamp === null) loadFallback();
      });
  }

  K.initTheme();
  document.getElementById('themeToggle').addEventListener('click', K.toggleTheme);
  document.getElementById('year').textContent = new Date().getFullYear();
  K.startClock();
  load();
  setInterval(load, 60000);
})();
