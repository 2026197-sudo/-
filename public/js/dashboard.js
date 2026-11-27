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

  /* 분기 실적 입력 알림 */
  function alarmTitle(a) {
    var when = a.days > 0 ? 'D-' + a.days : a.days === 0 ? '오늘 마감 기준일' : '분기 종료 ' + (-a.days) + '일 지남';
    return a.q + '분기 실적값 입력 (' + when + ')';
  }
  function alarmBox(a) {
    var s = (window.KPIAuth && KPIAuth.session && KPIAuth.session()) || null, u = s && s.user;
    var period = a.q + '분기(' + a.m1 + '~' + a.m3 + '월)';
    var lead = a.days > 0 ? K.dotDate(a.end) + '이 ' + period + ' 마지막 날입니다(D-' + a.days + ').'
      : a.days === 0 ? '오늘(' + K.dotDate(a.end) + ')은 ' + period + ' 마지막 날입니다.'
      : period + '이 ' + K.dotDate(a.end) + '에 끝났습니다(' + (-a.days) + '일 지남).';
    var who = u && !u.admin && u.dept ? '<b>' + esc(u.dept) + '</b> 관리 지표의 ' : '각 관리부서는 담당 지표의 ';
    return '<div class="alarm" role="alert"><span class="alarm-dot" aria-hidden="true"></span><div><b>' + esc(alarmTitle(a)) + '</b>' +
      '<p>' + esc(lead) + ' ' + who + period + ' 실적값을 <a href="admin.html">실적 입력</a>에서 입력해 주세요.' +
      (u && u.admin ? ' 입력이 끝나면 기본 정보의 실적 기준일을 ' + esc(K.dotDate(a.end)) + '로 바꾸면 알림이 사라집니다.' : '') + '</p></div></div>';
  }

  function render(data) {
    K.normalize(data);
    window.KPI_CURRENT = data;
    var m = data.meta, r = K.compute(data), th = r.thresholds;
    var elapsed = K.elapsedRatio(m);
    var auto = K.insights(r, elapsed, data.meta);
    var asOf = K.dotDate(m.asOfDate);
    var html = '';

    var now = new Date();
    var alarm = K.inputAlarm(data, now);
    var o = r.overall;
    var elPct = elapsed === null ? null : elapsed * 100;
    var depts = K.deptSummary(r, elapsed);
    var weak = depts.filter(function (g) { return g.level === 'red' || g.level === 'yellow' || g.level === 'behind'; });
    var need = depts.filter(function (g) { return g.level === 'missing'; });
    var prov = [];
    if (o.pending) prov.push('측정 전 ' + o.pending + '개');
    if (o.missing) prov.push('미입력 ' + o.missing + '개');

    /* 머리: 제목과 기준 정보 (왼쪽) · 평균 달성률 (오른쪽) */
    html += '<section id="summary" class="pane" data-pane="summary" aria-labelledby="pageTitle"><div class="hero">' +
      '<div class="hero-main"><p class="hero-kicker">' + esc(m.badge) + ' · ' + esc(m.program) + '</p>' +
      '<h1 id="pageTitle">' + esc(m.title) + '</h1>' +
      '<p class="hero-line">' + esc(asOf) + ' 기준, 측정기간 ' + pct(elPct) + ' 경과 · 자료 ' + esc(m.dataBasis) + '</p>' +
      (weak.length ? '<a class="hero-alert" href="#dept"><span class="mark mark-' + weak[0].level + '"></span>실적 확인필요 부서 ' + weak.length + '곳 · ' +
        esc(weak.map(function (g) { return g.dept; }).join(', ')) + '</a>' : '') +
      (alarm ? '<a class="hero-alarm" href="#schedule"><span class="alarm-dot" aria-hidden="true"></span>' + esc(alarmTitle(alarm)) + '</a>' : '') +
      '</div>' +
      '<div class="hero-side">' +
      donut({ size: 150, stroke: 12, prog: o.prog, state: 'actual', band: o.band, label: '4개 혁신지수 평균 달성률', elapsed: elapsed, cap: '평균 달성률' }) +
      '<dl class="hero-stats">' +
      '<div><dt>판정</dt><dd><span class="status">' + mark('actual', o.band) + esc(o.band.label) + '</span></dd></div>' +
      (o.lowest ? '<div><dt>가장 낮은 지수</dt><dd>' + esc(o.lowest.name.replace(/혁신지수$/, '')) + ' <b>' + pct(o.lowest.prog) + '</b></dd></div>' : '') +
      '<div><dt>지수 평균</dt><dd><b>' + o.cur.toFixed(1) + '</b> / 목표 ' + o.tgt.toFixed(1) + '</dd></div>' +
      '<div><dt>2025 평균 달성률</dt><dd><b>' + pct(m.y1AvgRate) + '</b></dd></div>' +
      '</dl></div></div>' +
      (prov.length ? '<p class="hero-warn">평균 달성률은 4개 지수를 각각 100%까지만 반영한 값이며, ' + esc(prov.join(', ')) + ' 지표가 포함된 잠정치입니다.</p>' : '');

    /* 혁신지수: 한 판에 4칸 */
    html += '<div class="index-row">';
    r.indices.forEach(function (ix) {
      var flags = [];
      ix.items.forEach(function (it) {
        if (it.state === 'pending') flags.push(it.short + ' 측정 전');
        if (it.state === 'missing') flags.push(it.short + ' 미입력');
      });
      html += '<article class="index-card"><div class="index-head"><h3>' + esc(ix.name) + '</h3>' +
        '<span class="status">' + mark('actual', ix.band) + esc(ix.band.label) + '</span></div>' +
        '<div class="index-body">' + donut({ size: 104, stroke: 11, prog: ix.prog, state: 'actual', band: ix.band, label: ix.name, elapsed: elapsed, cap: '달성률' }) +
        '<dl class="index-meta"><div><dt>지수</dt><dd><b>' + ix.cur.toFixed(1) + '</b> / ' + ix.tgt.toFixed(1) + '</dd></div>' +
        '<div><dt>2025 달성률</dt><dd>' + pct(ix.y1 && ix.y1.rate) + '</dd></div></dl></div>' +
        (flags.length ? '<p class="flag">' + esc(flags.join(', ')) + '</p>' : '') +
        '</article>';
    });
    html += '</div>';

    /* 범례 */
    html += '<p class="legend" role="note">' +
      '<span class="status"><span class="mark mark-deep"></span>우수 ' + th[2] + '% 이상</span>' +
      '<span class="status"><span class="mark mark-green"></span>양호 ' + th[1] + '~' + th[2] + '%</span>' +
      '<span class="status"><span class="mark mark-yellow"></span>주의 ' + th[0] + '~' + th[1] + '%</span>' +
      '<span class="status"><span class="mark mark-red"></span>부진 ' + th[0] + '% 미만</span>' +
      '<span class="status"><span class="mark mark-pending"></span>측정 전</span>' +
      '<span class="status"><span class="mark mark-missing"></span>미입력</span>' +
      '<span class="status"><span class="tick"></span>눈금은 ' + esc(asOf) + ' 기준 기간 경과율</span></p></section>';

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
    html += '</div>';

    /* 부서별 실적 입력 현황 */
    var ist = K.inputStatus(data, r, now);
    if (ist) {
      var doneN = ist.list.filter(function (g) { return g.level === 'done'; }).length;
      html += '<div class="input-status"><div class="input-head"><h3>' + ist.q + '분기(' + ist.m1 + '~' + ist.m3 + '월) 실적 입력 현황</h3>' +
        '<span class="desc">' + esc(K.dotDate(ist.since)) + ' 이후 각 부서 담당자가 직접 저장한 기준(관리자 수정 제외) · ' + ist.list.length + '개 부서 중 ' + doneN + '개 입력 완료</span></div><ul>';
      ist.list.forEach(function (g) {
        var lab = g.level === 'done' ? '입력 완료' : g.level === 'part' ? '일부 입력' : '미입력';
        var missing = g.items.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
        html += '<li class="in-' + g.level + '"><span class="in-dot" aria-hidden="true"></span><span class="in-dept">' + esc(g.dept) + '</span>' +
          '<span class="in-state">' + lab + ' <span class="dim">' + g.done + '/' + g.items.length + '</span></span>' +
          '<span class="in-last dim">' + (g.last ? '최근 ' + esc(K.clockText(new Date(g.last)).slice(0, 10)) + (g.by ? ' · ' + esc(g.by) : '') : '담당자 입력 기록 없음') +
          (missing.length && g.level === 'part' ? ' · 남은 지표: ' + esc(missing.join(', ')) : '') + '</span></li>';
      });
      html += '</ul></div>';
    }
    html += '<div class="dept-grid">';
    // 카드는 관리 지표가 많은 부서부터 (같으면 확인 필요 → 이름 순)
    var LV = { red: 0, yellow: 1, behind: 2, missing: 3, good: 4 };
    depts.slice().sort(function (a, b) {
      return b.items.length - a.items.length || LV[a.level] - LV[b.level] || a.dept.localeCompare(b.dept, 'ko');
    }).forEach(function (g) {
      var gi = depts.indexOf(g);
      html += '<article class="card dept-card dept-' + g.level + '" id="dept-' + gi + '">' +
        '<div class="dept-head"><h3>' + esc(g.dept) + ' <span class="dept-count">' + g.items.length + '개 지표</span></h3><span class="status dept-status">' +
        (g.label === '측정 전' ? '<span class="mark mark-pending"></span>' : g.level === 'good' ? '<span class="mark mark-green"></span>' : '<span class="mark mark-' + g.level + '"></span>') + esc(g.label) + '</span></div><ul>';
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

    /* 세부지표: 혁신지수별 묶음 → 지표마다 달성률 막대·주요 수치 → 세부운영지수 표(담당·문서번호) */
    html += '<section id="detail" class="pane" data-pane="detail"><div class="sec-head"><div><h2>세부지표 달성 현황</h2>' +
      '<div class="desc">2026 목표 대비 실적 · 자료 ' + esc(m.dataBasis) + ' · 막대의 세로선은 ' + esc(asOf) + ' 기준 기간 경과율(' + pct(elPct) + ')</div></div></div>';
    var cell = function (v, unit) { return v === null || v === undefined || v === '' ? '<span class="dim">—</span>' : esc(fmt(v)) + '<small>' + esc(unit) + '</small>'; };
    r.indices.forEach(function (ix) {
      html += '<article class="ix-block"><header class="ix-head"><h3>' + esc(ix.name) + '</h3>' +
        '<span class="status">' + mark('actual', ix.band) + '달성률 <b>' + pct(ix.prog) + '</b></span>' +
        '<span class="dim">지수 ' + ix.cur.toFixed(1) + ' / 목표 ' + ix.tgt.toFixed(1) + ' · 2025 달성률 ' + pct(ix.y1 && ix.y1.rate) + '</span></header>';
      ix.items.forEach(function (it) {
        var w = it.prog === null ? 0 : Math.min(it.prog, 100);
        var color = it.state === 'actual' && it.band ? 'var(--st-' + it.band.key + ')' : 'var(--none)';
        var curTxt = it.state === 'missing' ? null : it.current;
        html += '<div class="kpi-row"><div class="kpi-top">' +
          '<div class="kpi-name"><b>' + esc(it.name) + '</b> <span class="dim">(' + esc(it.unit) + ', 반영비중 ' + esc(it.weight) + '%)</span></div>' +
          '<span class="status">' + mark(it.state, it.band) + esc(statusLabel(it.state, it.band)) + '</span></div>' +
          '<div class="kpi-bar-wrap"><div class="kpi-bar" role="img" aria-label="' + esc(it.name) + ' 달성률 ' + (it.prog === null ? statusLabel(it.state) : pct(it.prog)) + '">' +
          '<i style="width:' + w.toFixed(1) + '%;background:' + color + '"></i>' + (elPct !== null ? '<em style="left:' + Math.min(elPct, 100).toFixed(1) + '%"></em>' : '') + '</div>' +
          '<span class="kpi-rate">' + (it.prog === null ? esc(statusLabel(it.state)) : pct(it.prog)) + '</span></div>' +
          '<dl class="kpi-nums"><div><dt>현재값</dt><dd class="strong">' + cell(curTxt, it.unit) + (it.state === 'pending' && K.num(it.current) !== null ? '<small> (잠정)</small>' : '') + '</dd></div>' +
          '<div><dt>2026 목표</dt><dd>' + cell(it.targets.y2, it.unit) + '</dd></div>' +
          '<div><dt>2025 실적</dt><dd>' + cell(it.y1Actual, it.unit) + '</dd></div>' +
          '<div><dt>2027 목표</dt><dd>' + cell(it.targets.y3, it.unit) + '</dd></div>' +
          '<div><dt>관리부서</dt><dd class="txt">' + esc(it.dept) + (it.owner ? ' · ' + esc(it.owner) : '') + '</dd></div></dl>';
        if (it.note) html += '<p class="kpi-meta"><span><b>비고 (문서번호·증빙)</b> ' + esc(it.note) + '</span></p>';
        if ((it.subs || []).length) {
          html += '<div class="table-scroll"><table class="sub-table"><thead><tr><th scope="col">세부운영지수</th><th scope="col" class="r">현재값</th><th scope="col">부서</th><th scope="col">담당</th><th scope="col">비고 (문서번호·증빙)</th></tr></thead><tbody>';
          it.subs.forEach(function (sb) {
            html += '<tr><th scope="row">' + esc(sb.name) + '</th><td class="r strong">' + (sb.value === null || sb.value === undefined ? '<span class="dim">미입력</span>' : esc(fmt(sb.value))) + '</td>' +
              '<td>' + esc(sb.dept) + '</td><td>' + esc(sb.owner || '') + '</td><td class="ev">' + esc(sb.note || '') + '</td></tr>';
          });
          html += '</tbody><tfoot><tr><th scope="row">' + (it.calc === 'ratio' ? '유지율 (B ÷ A × 100)' : '계') + '</th><td class="r strong">' + cell(it.current, it.unit) + '</td><td colspan="3"></td></tr></tfoot></table></div>';
        }
        html += '</div>';
      });
      html += '</article>';
    });
    html += '<p class="foot-note">달성률은 2026 실적을 2026 목표로 나눈 값입니다. 혁신지수는 ' + esc(m.definitionBasis) + ' 산출식(실적 ÷ 2027 목표 × 반영비중)으로 계산하고, 평균 달성률은 4개 지수의 달성률을 각각 100%까지만 반영해 평균합니다. ' +
      '측정 전 지표는 달성률을 계산하지 않으며 입력값은 혁신지수 계산에만 포함됩니다. 미입력 지표는 0으로 계산됩니다. 세부운영지수가 있는 지표의 현재값은 세부값의 합계(재학생 수 유지율은 B ÷ A × 100)로 자동 계산됩니다.</p></section>';

    /* 확인사항·일정: 지표별 확인사항(자동, 지표당 한 줄) + 해석 참고(직접 입력) + 일정 + 실적 파일·정의서 확인 */
    var fdOpen = [], fdDone = [], fdByItem = {};
    data.fixes.data.forEach(function (f) {
      if (!f || (!f.item && !f.owner)) return;
      if (f.done) fdDone.push(Object.assign({ why: '완료' }, f));
      else if (K.linkDone(f, data)) fdDone.push(Object.assign({ why: '자동 완료' }, f));
      else if (f.link && auto.items.some(function (e) { return e.id === f.link; })) (fdByItem[f.link] = fdByItem[f.link] || []).push(f); // 같은 지표 줄에 합침
      else fdOpen.push(f);
    });

    html += '<section id="notes" class="pane" data-pane="notes"><div class="two-col">';
    html += '<div class="panel flat"><h2>지표별 확인사항</h2><div class="desc">입력된 수치로 자동 작성합니다. 지표 하나에 한 줄씩, 확인할 내용과 할 일을 함께 적었습니다.</div><div>';
    auto.items.forEach(function (e) {
      var extra = (fdByItem[e.id] || []).map(function (f) { return '<span class="sub todo">실적 파일: ' + esc(f.item) + '</span>'; }).join('');
      html += '<div class="list-row check-row"><span class="body">' +
        '<span><span class="status check-label"><span class="mark mark-' + e.tag + '"></span>' + esc(e.label) + '</span> <b>' + esc(e.title) + '</b></span>' +
        '<span class="sub">' + esc(e.body) + '</span>' +
        '<span class="sub todo">할 일: ' + esc(e.todo) + (e.note ? ' · ' + esc(e.note) : '') + '</span>' + extra +
        '</span><span class="owner">' + esc(e.who) + '</span></div>';
    });
    if (!auto.items.length) html += '<p class="dim">확인이 필요한 지표가 없습니다.</p>';
    var manual = data.notes.filter(function (n) { return n && (n.title || n.body); });
    if (manual.length) {
      html += '<h3 class="sub-head">해석 참고</h3>';
      manual.forEach(function (n) {
        html += '<div class="list-row"><span class="body"><span style="font-weight:600">' + esc(n.title) + '</span><span class="sub">' + esc(n.body) + '</span></span></div>';
      });
    }
    html += '</div></div><div id="schedule" class="panel flat"><h2>일정</h2><div>';
    var sch = K.scheduleOf(data, r, now);
    if (alarm) html += alarmBox(alarm, true);
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
    html += '</div></div></div>';

    html += '<div class="two-col fix-wrap">';
    html += '<div class="panel flat"><h2>실적 파일 확인사항</h2><div class="desc">분기 실적 엑셀 정리 (지표와 연결된 항목은 위 지표별 확인사항에 함께 표시)</div><div>';
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
    var navNotes = document.querySelector('.nav a[href="#notes"]');
    if (navNotes) navNotes.classList.toggle('has-alarm', !!alarm);
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
  var PANES = ['summary', 'dept', 'detail', 'notes'];
  function paneOf(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('dept-') === 0) return 'dept';
    if (h === 'schedule' || h === 'fix') return 'notes';
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
