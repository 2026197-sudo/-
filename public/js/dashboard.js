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

  /* 도넛: 달성률 호 + 기준일 경과 눈금 */
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
    var aria = o.label + ': ' + (measured ? '달성률 ' + pct(o.prog) + ', ' + o.band.label : statusLabel(o.state)) +
      (o.elapsed !== null && o.elapsed !== undefined ? ', 기준일 기간 경과율 ' + pct(o.elapsed * 100) : '');
    var fs = o.size >= 160 ? 34 : o.size >= 110 ? 22 : 15;
    return '<div class="donut" style="width:' + o.size + 'px;height:' + o.size + 'px">' +
      '<svg viewBox="0 0 120 120" width="' + o.size + '" height="' + o.size + '" role="img" aria-label="' + esc(aria) + '"><title>' + esc(aria) + '</title>' +
      track + arc + tick + '</svg>' +
      '<div class="center"><span class="val" style="font-size:' + (measured ? fs : Math.max(13, fs - 6)) + 'px">' + esc(valText) + '</span>' +
      (o.cap ? '<span class="cap">' + esc(o.cap) + '</span>' : '') + '</div></div>';
  }

  function render(data) {
    K.normalize(data);
    window.KPI_CURRENT = data;
    var m = data.meta, r = K.compute(data), th = r.thresholds;
    var elapsed = K.elapsedRatio(m);
    var auto = K.insights(r, elapsed, data.meta);
    var asOf = K.dotDate(m.asOfDate);
    var html = '';

    var o = r.overall;
    var elPct = elapsed === null ? null : elapsed * 100;
    var depts = K.deptSummary(r, elapsed);
    var weak = depts.filter(function (g) { return g.level === 'red' || g.level === 'yellow' || g.level === 'behind'; });
    var need = depts.filter(function (g) { return g.level === 'missing'; });
    var prov = [];
    if (o.pending) prov.push('측정 전 ' + o.pending + '개');
    if (o.missing) prov.push('미입력 ' + o.missing + '개');

    /* 히어로 */
    html += '<section id="summary" class="pane" data-pane="summary" aria-labelledby="pageTitle"><div class="hero">' +
      '<div class="hero-main"><div class="hero-badges"><span class="pill-red">' + esc(m.badge) + '</span><span class="hero-sub">' + esc(m.program) + '</span></div>' +
      '<h1 id="pageTitle">' + esc(m.title) + '</h1>' +
      '<div class="chips"><span class="chip-solid">' + esc(asOf) + ' 기준 측정기간 ' + pct(elPct) + ' 경과</span>' +
      '<span class="chip-glass">자료: ' + esc(m.dataBasis) + '</span></div>' +
      (weak.length ? '<a class="hero-alert" href="#dept"><span class="mark mark-' + weak[0].level + '"></span>실적 확인필요 부서 ' + weak.length + '곳: ' +
        esc(weak.map(function (g) { return g.dept; }).join(', ')) + '</a>' : '') +
      '</div>' +
      '<div class="hero-side">' +
      donut({ size: 168, stroke: 11, prog: o.prog, state: 'actual', band: o.band, label: '4개 혁신지수 평균 달성률', elapsed: elapsed, hero: true, cap: '평균 달성률' }) +
      '<div class="hero-stats"><span class="cap">4개 혁신지수 평균 (지수별 100% 상한)</span>' +
      (o.lowest ? '<span>가장 낮은 지수 <strong>' + pct(o.lowest.prog) + '</strong> (' + esc(o.lowest.name.replace(/혁신지수$/, '')) + ')</span>' : '') +
      '<span>지수 평균 <strong>' + o.cur.toFixed(1) + '</strong> / 목표 ' + o.tgt.toFixed(1) + '</span>' +
      '<span>2025 평균 달성률 <strong>' + pct(m.y1AvgRate) + '</strong></span>' +
      '<span class="status-pill">' + mark('actual', o.band) + esc(o.band.label) + '</span>' +
      (prov.length ? '<span class="hero-warn">잠정치: ' + esc(prov.join(', ')) + ' 지표 포함</span>' : '') +
      '</div></div></div>';

    /* 범례 */
    html += '<div class="legend" role="note"><b>읽는 법</b>' +
      '<span class="status"><span class="mark mark-deep"></span>우수 ' + th[2] + '% 이상</span>' +
      '<span class="status"><span class="mark mark-green"></span>양호 ' + th[1] + '~' + th[2] + '%</span>' +
      '<span class="status"><span class="mark mark-yellow"></span>주의 ' + th[0] + '~' + th[1] + '%</span>' +
      '<span class="status"><span class="mark mark-red"></span>부진 ' + th[0] + '% 미만</span>' +
      '<span class="status"><span class="mark mark-pending"></span>측정 전</span>' +
      '<span class="status"><span class="mark mark-missing"></span>미입력</span>' +
      '<span class="status"><span class="tick"></span>눈금: ' + esc(asOf) + ' 기준 기간 경과율</span></div>';

    /* 혁신지수 카드 */
    html += '<div class="grid-4">';
    r.indices.forEach(function (ix) {
      var flags = [];
      ix.items.forEach(function (it) {
        if (it.state === 'pending') flags.push(it.short + ' 측정 전');
        if (it.state === 'missing') flags.push(it.short + ' 미입력');
      });
      html += '<article class="card index-card"><h3>' + esc(ix.name) + '</h3>' +
        donut({ size: 120, stroke: 12, prog: ix.prog, state: 'actual', band: ix.band, label: ix.name, elapsed: elapsed, cap: '달성률' }) +
        '<div class="index-meta"><span>지수 <strong>' + ix.cur.toFixed(1) + '</strong> / 목표 ' + ix.tgt.toFixed(1) + '</span>' +
        '<span>2025 달성률 ' + pct(ix.y1 && ix.y1.rate) + '</span>' +
        '<span class="status" style="justify-content:center">' + mark('actual', ix.band) + esc(ix.band.label) + '</span></div>' +
        (flags.length ? '<span class="flag">잠정치: ' + esc(flags.join(', ')) + '</span>' : '') +
        '</article>';
    });
    html += '</div></section>';

    /* 부서별 실적 현황 (확인이 필요한 부서를 먼저) */
    html += '<section id="dept" class="pane" data-pane="dept"><div class="sec-head"><div><h2>부서별 실적 현황</h2>' +
      '<div class="desc">확인 필요 기준: 달성률 60% 미만(주의, 부진) 또는 ' + esc(asOf) + ' 기준 기간 경과율(' + pct(elPct) + ') 미만</div></div>' +
      '<span class="status dim"><span class="mark mark-behind"></span>경과율 미달: 60% 이상이지만 기간 경과율보다 낮음</span></div>';
    html += '<div class="dept-summary" role="note">';
    if (weak.length) {
      html += '<b>실적 확인필요 부서</b> ' + weak.map(function (g) {
        var parts = [];
        if (g.red) parts.push('부진 ' + g.red);
        if (g.yellow) parts.push('주의 ' + g.yellow);
        if (g.behind) parts.push('경과율 미달 ' + g.behind);
        return '<a href="#dept-' + depts.indexOf(g) + '" class="dept-chip dept-chip-' + g.level + '"><span class="mark mark-' + g.level + '"></span>' + esc(g.dept) + ' <span class="dim">(' + parts.join(', ') + ')</span></a>';
      }).join('');
    } else {
      html += '<b>실적 확인이 필요한 부서가 없습니다.</b> 모든 부서의 측정 지표가 달성률 60% 이상이고 기간 경과율을 넘었습니다.';
    }
    if (need.length) html += '<span class="dept-need">미입력 지표가 있는 부서: ' + need.map(function (g) { return esc(g.dept); }).join(', ') + '</span>';
    html += '</div><div class="dept-grid">';
    depts.forEach(function (g, gi) {
      html += '<article class="card dept-card dept-' + g.level + '" id="dept-' + gi + '">' +
        '<div class="dept-head"><h3>' + esc(g.dept) + '</h3><span class="status dept-status">' +
        (g.level === 'good' ? '<span class="mark mark-green"></span>' : '<span class="mark mark-' + g.level + '"></span>') + esc(g.label) + '</span></div><ul>';
      g.items.slice().sort(function (a, b) {
        var pa = a.prog === null ? Infinity : a.prog, pb = b.prog === null ? Infinity : b.prog; return pa - pb;
      }).forEach(function (it) {
        var lag = elPct !== null && it.prog !== null && it.prog < elPct && it.prog >= 60;
        html += '<li><span class="status">' + (lag ? '<span class="mark mark-behind"></span>' : mark(it.state, it.band)) + '</span><span class="dept-item">' + esc(it.short || it.name) +
          (it.prog !== null && elPct !== null && it.prog < elPct ? ' <span class="dept-gap">경과율보다 ' + (elPct - it.prog).toFixed(1) + '%p 낮음</span>' : '') + '</span>' +
          '<span class="dept-val">' + (it.prog === null ? esc(statusLabel(it.state)) : pct(it.prog)) + '</span></li>';
      });
      html += '</ul></article>';
    });
    html += '</div></section>';

    /* 세부지표: 도넛 → 수치표 */
    html += '<section id="detail" class="pane" data-pane="detail"><div class="sec-head"><div><h2>세부지표 달성 현황</h2>' +
      '<div class="desc">2026 목표 대비 실적. 자료: ' + esc(m.dataBasis) + '</div></div></div>';
    html += '<div class="group-grid">';
    r.indices.forEach(function (ix) {
      html += '<div class="group-card"><h3>' + esc(ix.name) + '</h3><div class="mini-row">';
      ix.items.forEach(function (it) {
        html += '<div class="mini">' + donut({ size: 84, stroke: 14, prog: it.prog, state: it.state, band: it.band, label: it.name, elapsed: elapsed }) +
          '<span class="label">' + esc(it.short) + '</span></div>';
      });
      html += '</div></div>';
    });
    html += '</div>';

    html += '<div class="card table-card"><div class="table-scroll"><table><caption>세부지표 수치표</caption><thead><tr>' +
      '<th scope="col">세부지표</th><th scope="col" class="r">비중</th><th scope="col" class="r">2025 실적</th><th scope="col" class="r">2026 목표</th>' +
      '<th scope="col" class="r">현재값</th><th scope="col" class="r">달성률</th><th scope="col">상태</th><th scope="col">비고</th>' +
      '<th scope="col">관리부서</th><th scope="col" class="r">2027 목표</th></tr></thead><tbody>';
    r.indices.forEach(function (ix) {
      html += '<tr class="group-row"><td colspan="10"><span class="grp-name">' + esc(ix.name) + '</span>' +
        '<span class="grp-meta">지수 ' + ix.cur.toFixed(1) + ' / 목표 ' + ix.tgt.toFixed(1) + '</span><span class="grp-meta">달성률 ' + pct(ix.prog) + '</span></td></tr>';
      ix.items.forEach(function (it) {
        var cur = it.state === 'missing' ? '—' : fmt(it.current) + (it.state === 'pending' && K.num(it.current) !== null ? '*' : '');
        html += '<tr><th scope="row" style="background:none;font-weight:500;color:var(--ink);white-space:normal">' + esc(it.name) + ' <span class="dim small">(' + esc(it.unit) + ')</span></th>' +
          '<td class="r dim">' + esc(it.weight) + '%</td><td class="r dim">' + fmt(it.y1Actual) + '</td><td class="r dim">' + fmt(it.targets.y2) + '</td>' +
          '<td class="r strong">' + cur + '</td><td class="r strong">' + (it.prog === null ? statusLabel(it.state) : pct(it.prog)) + '</td>' +
          '<td><span class="status">' + mark(it.state, it.band) + esc(statusLabel(it.state, it.band)) + '</span></td>' +
          '<td class="small dim">' + esc(it.note) + '</td><td class="small dim">' + esc(it.dept) + '</td><td class="r dim">' + fmt(it.targets.y3) + '</td></tr>';
      });
    });
    html += '</tbody></table></div>' +
      '<p class="foot-note">* 측정 전 지표(학년도 말 조사, 사후검사)는 달성률을 계산하지 않으며, 입력된 값은 근거 확인 전 값으로 혁신지수 계산에만 포함됩니다. 미입력 지표는 0으로 계산됩니다.</p>' +
      '<p class="foot-note">계산 방법: 달성률은 2026 실적을 2026 목표로 나눈 값입니다. 혁신지수는 ' + esc(m.definitionBasis) + ' 산출식(실적 ÷ 2027 목표 × 반영비중)으로 계산하고, 평균 달성률은 4개 지수의 달성률을 각각 100%까지만 반영해 평균합니다.</p></div></section>';

    /* 유의사항(자동 + 직접 입력) + 일정 */
    html += '<section id="notes" class="pane two-col" data-pane="notes"><div class="panel flat"><h2>해석 시 유의사항</h2><ol>';
    auto.notes.forEach(function (n) {
      html += '<li><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span></li>';
    });
    data.notes.forEach(function (n) {
      if (!n || (!n.title && !n.body)) return;
      html += '<li><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span></li>';
    });
    if (!auto.notes.length && !data.notes.length) html += '<li class="dim">현재 특별한 유의사항이 없습니다.</li>';
    html += '</ol></div><div id="schedule" class="panel flat"><h2>측정 기준일과 남은 일정</h2><div>';
    var now = new Date();
    var sch = K.scheduleOf(data, r, now);
    sch.open.forEach(function (e) {
      var d = K.daysUntil(e.date, now), dd = '';
      if (d !== null) dd = d > 0 ? ' (D-' + d + ')' : ' (오늘)';
      html += '<div class="list-row"><span class="date">' + (e.date ? esc(K.dotDate(e.date)) : '[일정 확인]') + '</span>' +
        '<span class="body"><span>' + esc(e.name) + esc(dd) + '</span>' + (e.desc ? '<span class="sub">' + esc(e.desc) + '</span>' : '') + '</span>' +
        (e.owner ? '<span class="owner">' + esc(e.owner) + '</span>' : '') + '</div>';
    });
    if (!sch.open.length) html += '<p class="dim">남은 일정이 없습니다.</p>';
    html += doneList(sch.closed, function (e) {
      return '<span class="date">' + (e.date ? esc(K.dotDate(e.date)) : '—') + '</span><span class="body"><span>' + esc(e.name) + '</span></span>';
    }, '끝난 일정');
    html += '</div></div></section>';

    /* 필수확인사항: 자동 점검 + 직접 입력(완료 처리 가능) */
    html += '<section id="fix" class="pane fix-wrap" data-pane="fix"><div class="panel flat"><h2>지표 점검</h2><div class="desc">입력된 수치로 자동 점검한 결과입니다.</div><div>';
    auto.checks.forEach(function (c) {
      html += '<div class="list-row"><span class="body"><span><span class="status check-label"><span class="mark mark-' + c.tag + '"></span>' + esc(c.label) + '</span> ' + esc(c.what) + '</span></span>' +
        '<span class="owner">' + esc(c.who) + '</span></div>';
    });
    if (!auto.checks.length) html += '<p class="dim">점검이 필요한 지표가 없습니다.</p>';
    html += '</div></div><div class="two-col">';

    var fdOpen = [], fdDone = [];
    data.fixes.data.forEach(function (f) {
      if (!f || (!f.item && !f.owner)) return;
      if (f.done) fdDone.push(Object.assign({ why: '완료' }, f));
      else if (K.linkDone(f, data)) fdDone.push(Object.assign({ why: '자동 완료' }, f));
      else fdOpen.push(f);
    });
    html += '<div class="panel flat"><h2>실적 파일 필수확인사항</h2><div class="desc">분기 실적 엑셀 기준</div><div>';
    fdOpen.forEach(function (f) { html += '<div class="list-row"><span>' + esc(f.item) + '</span><span class="owner">' + esc(f.owner) + '</span></div>'; });
    if (!fdOpen.length) html += '<p class="dim">남은 확인사항이 없습니다.</p>';
    html += doneList(fdDone, function (f) { return '<span class="body"><span>' + esc(f.item) + '</span></span><span class="owner">' + esc(f.owner) + '</span>'; });

    var docOpen = data.fixes.doc.filter(function (f) { return f && !f.done; });
    var docDone = data.fixes.doc.filter(function (f) { return f && f.done; }).map(function (f) { return Object.assign({ why: '완료' }, f); });
    html += '</div></div><div class="panel flat"><h2>정의서 정정 필요 사항</h2><div class="desc">정의서 산출식 재계산 결과</div><div>';
    docOpen.forEach(function (f) { html += '<div class="list-row"><span class="body"><span style="font-weight:500">' + esc(f.item) + '</span><span class="sub">' + esc(f.detail) + '</span></span></div>'; });
    if (!docOpen.length) html += '<p class="dim">남은 정정 사항이 없습니다.</p>';
    html += doneList(docDone, function (f) { return '<span class="body"><span>' + esc(f.item) + '</span><span class="sub">' + esc(f.detail) + '</span></span>'; });
    html += '</div></div></div></section>';

    document.getElementById('app').innerHTML = html;
    showPane();
    var up = m.updatedAt ? new Date(m.updatedAt) : null;
    document.getElementById('updated').textContent = '최종 수정 ' + (up && !isNaN(up) ? K.clockText(up).replace(/:\d\d KST$/, '') : '—') + (m.updatedBy ? ' (' + m.updatedBy + ')' : '');
  }

  /* 완료 처리된 항목은 접어서 '완료 n건'으로 보여 줍니다 */
  function doneList(list, rowHtml, label) {
    if (!list.length) return '';
    return '<details class="done-list"><summary>' + (label || '완료') + ' ' + list.length + '건 보기</summary>' +
      list.map(function (x) {
        var why = x.why || '완료';
        return '<div class="list-row is-done">' + rowHtml(x) + '<span class="tag tag-done' + (why === '자동 완료' ? ' tag-autodone' : '') + '">' + esc(why) + '</span></div>';
      }).join('') + '</details>';
  }

  /* 메뉴(탭): 종합에는 시각화 대시보드만, 나머지는 메뉴를 눌렀을 때 하나씩 보입니다 */
  var PANES = ['summary', 'dept', 'detail', 'notes', 'fix'];
  function paneOf(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('dept-') === 0) return 'dept';
    if (h === 'schedule') return 'notes';
    return PANES.indexOf(h) >= 0 ? h : 'summary';
  }
  var shownPane = null;
  function showPane(fromNav) {
    var name = paneOf(location.hash);
    Array.prototype.forEach.call(document.querySelectorAll('#app .pane'), function (el) {
      el.hidden = el.getAttribute('data-pane') !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.nav a[href^="#"]'), function (a) {
      if (paneOf(a.getAttribute('href')) === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (fromNav) {
      var target = location.hash && document.getElementById(location.hash.slice(1));
      if (target && target.id.indexOf('dept-') === 0) target.scrollIntoView({ block: 'start' });
      else if (shownPane !== name) window.scrollTo(0, 0);
    }
    shownPane = name;
  }
  window.addEventListener('hashchange', function () { showPane(true); });

  var started = false;
  function load() {
    KPIAuth.api('api/data')
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (b) {
            throw new Error('HTTP ' + res.status + (b && b.error ? ' ' + b.error : ''));
          });
        }
        return res.json();
      })
      .then(function (data) {
        var stamp = data.meta && data.meta.updatedAt;
        if (stamp !== lastStamp) { lastStamp = stamp; render(data); }
      })
      .catch(function (err) {
        if (lastStamp === null) {
          document.getElementById('app').innerHTML = '<div class="banner banner-error">자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. <span class="small">(' + esc((err && err.message) || '연결 실패') + ')</span></div>';
        }
      });
  }

  K.initTheme();
  document.getElementById('themeToggle').addEventListener('click', K.toggleTheme);
  document.getElementById('year').textContent = new Date().getFullYear();
  K.startClock();
  KPIAuth.start(function () {
    if (started) return;
    started = true;
    load();
    setInterval(load, 60000);
  });
})();
