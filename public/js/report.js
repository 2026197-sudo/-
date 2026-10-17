/* AI 요약보고서: 대시보드 자료를 분석 규칙에 따라 문장으로 자동 작성하고
   팝업 표시 · 공유(메일/복사/기기 공유) · PDF 저장 · 출력을 처리합니다.
   외부 AI 서비스나 인터넷 연결 없이 동작합니다. */
(function () {
  'use strict';
  var K = window.KPI, esc = K.esc, fmt = K.fmt;

  function p1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function pctS(v) { return p1(v) + '%'; }
  function josa(word, a, b) { // 받침 유무에 따라 조사 선택 (은/는, 이/가 등)
    var last = String(word).replace(/[)\s]+$/, '').slice(-1);
    var code = last.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return /[0-9]$/.test(last) ? ('013678'.indexOf(last) >= 0 ? a : b) : b;
    return (code - 0xAC00) % 28 ? a : b;
  }

  /* ---------- 분석 ---------- */
  function analyze(data, now) {
    var m = data.meta, r = K.compute(data);
    var elapsed = (K.elapsedRatio(m) || 0) * 100;
    var items = [];
    r.indices.forEach(function (ix) { ix.items.forEach(function (it) { items.push(Object.assign({ index: ix.name }, it)); }); });
    var measured = items.filter(function (i) { return i.state === 'actual' && i.prog !== null; })
      .sort(function (a, b) { return b.prog - a.prog; });
    var good = measured.filter(function (i) { return i.band.key === 'deep' || i.band.key === 'green'; });
    var weak = measured.filter(function (i) { return i.band.key === 'red' || i.band.key === 'yellow'; })
      .sort(function (a, b) { return a.prog - b.prog; });
    var pending = items.filter(function (i) { return i.state === 'pending'; });
    var missing = items.filter(function (i) { return i.state === 'missing'; });
    var byProg = r.indices.slice().sort(function (a, b) { return b.prog - a.prog; });
    return { m: m, r: r, elapsed: elapsed, items: items, measured: measured, good: good, weak: weak,
      pending: pending, missing: missing, top: byProg[0], bottom: byProg[byProg.length - 1], now: now };
  }

  function overallSentences(a) {
    var o = a.r.overall, gap = o.prog - a.elapsed, s = [];
    s.push(a.m.dataBasis.replace(/\s*\(.*\)$/, '') + ' 기준 4개 혁신지수의 평균 진척률은 ' + pctS(o.prog) + '로 \'' + o.band.label + '\' 수준입니다.');
    if (a.elapsed > 0) {
      s.push(K.dotDate(a.m.asOfDate) + ' 기준 측정기간 경과율(' + pctS(a.elapsed) + ')보다 ' + p1(Math.abs(gap)) + '%p ' +
        (gap >= 0 ? '높아 전반적으로 계획 대비 순항 중입니다.' : '낮아 하반기 집중 관리가 필요합니다.'));
    }
    s.push('지수별로는 ' + a.top.name + '(' + pctS(a.top.prog) + ')' + josa(a.top.name, '이', '가') + ' 가장 높고, ' + a.bottom.name + '(' + pctS(a.bottom.prog) + ')' + josa(a.bottom.name, '이', '가') + ' 가장 낮습니다.');
    var bm = a.bottom.items.filter(function (i) { return i.state === 'missing'; });
    if (bm.length) s.push(a.bottom.name + josa(a.bottom.name, '은', '는') + ' ' + bm.map(function (i) { return i.name; }).join(', ') + josa(bm[bm.length - 1].name, '이', '가') + ' 미입력(0 처리)되어 실제보다 낮게 계산된 값입니다.');
    if (a.pending.length || a.missing.length) {
      s.push('측정 전 ' + a.pending.length + '개, 미입력 ' + a.missing.length + '개 지표가 포함된 잠정치이므로 확정 실적이 반영되면 결과가 달라질 수 있습니다.');
    }
    return s;
  }

  function actions(a) {
    var list = [];
    a.missing.forEach(function (i) { list.push({ who: i.dept, what: i.name + ' 자료 입력' + (i.note ? ' (' + i.note + ')' : '') }); });
    a.weak.filter(function (i) { return i.band.key === 'red'; }).forEach(function (i) {
      list.push({ who: i.dept, what: i.name + ' 실적 점검 및 하반기 추진 계획 확인 (현재 ' + pctS(i.prog) + ')' });
    });
    if (a.pending.length) {
      var depts = {};
      a.pending.forEach(function (i) { (depts[i.dept] = depts[i.dept] || []).push(i.short || i.name); });
      Object.keys(depts).forEach(function (d) { list.push({ who: d, what: depts[d].join(', ') + ' 측정 일정 확정 및 입력값 근거 확인' }); });
    }
    a.weak.filter(function (i) { return i.band.key === 'yellow' && i.prog < a.elapsed; }).forEach(function (i) {
      list.push({ who: i.dept, what: i.name + ' 기간 경과율 대비 부족분 점검 (현재 ' + pctS(i.prog) + ')' });
    });
    return list.slice(0, 6);
  }

  /* ---------- 보고서 작성 ---------- */
  function build(data) {
    var now = new Date(), a = analyze(data, now), m = a.m, o = a.r.overall;
    var written = K.clockText(now).replace(/:\d\d KST$/, '');
    var subject = '[' + m.university + ' AI 사업단] ' + m.title + ' 요약보고';
    var ov = overallSentences(a), acts = actions(a);
    var stateLabel = function (i) { return i.state === 'pending' ? '측정 전' : i.state === 'missing' ? '미입력' : i.band.label; };
    var markOf = function (i) { return '<span class="mark mark-' + (i.state === 'actual' ? i.band.key : i.state) + '"></span>'; };

    var h = '';
    h += '<header class="rp-head"><img src="img/logo.png" alt="계명문화대학교"><div><div class="rp-kicker">' + esc(m.unit) + ' · 자동 요약보고</div>' +
      '<h2 id="reportTitle">' + esc(m.title) + '</h2>' +
      '<div class="rp-meta">작성 ' + esc(written) + ' · 실적 ' + esc(m.dataBasis) + ' · 기준 ' + esc(m.definitionBasis) + '</div></div></header>';

    h += '<div class="rp-kpis">' +
      '<div><span>평균 진척률</span><b>' + pctS(o.prog) + '</b><em>' + markOf({ state: 'actual', band: o.band }) + esc(o.band.label) + '</em></div>' +
      '<div><span>지수 평균 (현재 / 목표)</span><b>' + p1(o.cur) + '</b><em>목표 ' + p1(o.tgt) + '</em></div>' +
      '<div><span>기간 경과율 (' + esc(K.dotDate(m.asOfDate)) + ')</span><b>' + pctS(a.elapsed) + '</b><em>' + (o.prog >= a.elapsed ? '진척률이 앞섬' : '진척률이 뒤처짐') + '</em></div>' +
      '<div><span>1차년도 평균달성도</span><b>' + pctS(m.y1AvgRate) + '</b><em>\'25 확정</em></div></div>';

    h += '<section><h3>1. 종합 판단</h3><p>' + ov.map(esc).join(' ') + '</p></section>';

    h += '<section><h3>2. 혁신지수별 현황</h3><table class="rp-table"><thead><tr><th scope="col">혁신지수</th><th scope="col">진척률</th><th scope="col" class="r">현재 / 목표</th><th scope="col">상태</th><th scope="col">비고</th></tr></thead><tbody>';
    a.r.indices.forEach(function (ix) {
      var notes = ix.items.filter(function (i) { return i.state !== 'actual' || (i.band && i.band.key === 'red'); })
        .map(function (i) { return (i.short || i.name) + ' ' + stateLabel(i); });
      h += '<tr><th scope="row">' + esc(ix.name) + '</th><td><div class="rp-bar"><i style="width:' + Math.min(ix.prog, 100).toFixed(1) + '%;background:var(--st-' + ix.band.key + ')"></i></div>' + pctS(ix.prog) + '</td>' +
        '<td class="r">' + p1(ix.cur) + ' / ' + p1(ix.tgt) + '</td><td><span class="status">' + markOf({ state: 'actual', band: ix.band }) + esc(ix.band.label) + '</span></td>' +
        '<td class="small">' + esc(notes.join(', ') || '—') + '</td></tr>';
    });
    h += '</tbody></table></section>';

    h += '<div class="rp-two"><section><h3>3. 잘 되고 있는 지표</h3>';
    h += a.good.length ? '<ul>' + a.good.map(function (i) {
      return '<li>' + markOf(i) + '<b>' + esc(i.name) + '</b> ' + pctS(i.prog) + ' <span class="dim">(' + fmt(i.current) + i.unit + ' / 목표 ' + fmt(i.targets.y2) + i.unit + (i.note ? ' · ' + esc(i.note) : '') + ')</span></li>';
    }).join('') + '</ul>' : '<p class="dim">해당 지표가 없습니다.</p>';
    h += '</section><section><h3>4. 집중 관리가 필요한 지표</h3>';
    h += a.weak.length ? '<ul>' + a.weak.map(function (i) {
      return '<li>' + markOf(i) + '<b>' + esc(i.name) + '</b> ' + pctS(i.prog) + ' <span class="dim">(' + esc(i.dept) + (i.note ? ' · ' + esc(i.note) : '') + ')</span></li>';
    }).join('') + '</ul>' : '<p class="dim">해당 지표가 없습니다.</p>';
    h += '</section></div>';

    h += '<section><h3>5. 자료 확인이 필요한 지표</h3>';
    var chk = a.missing.concat(a.pending);
    h += chk.length ? '<ul>' + chk.map(function (i) {
      return '<li>' + markOf(i) + '<b>' + esc(i.name) + '</b> ' + stateLabel(i) + ' <span class="dim">(' + esc(i.dept) + (i.note ? ' · ' + esc(i.note) : '') + ')</span></li>';
    }).join('') + '</ul>' : '<p class="dim">모든 지표가 실적으로 입력되어 있습니다.</p>';
    h += '</section>';

    h += '<section><h3>6. 다음 조치</h3>' + (acts.length ? '<ol>' + acts.map(function (x) {
      return '<li><span class="owner">' + esc(x.who) + '</span> ' + esc(x.what) + '</li>';
    }).join('') + '</ol>' : '<p class="dim">특별한 조치 사항이 없습니다.</p>') + '</section>';

    h += '<p class="rp-foot">이 요약은 대시보드 자료(정의서 산출식 적용)를 바탕으로 정해진 분석 규칙에 따라 자동 작성되었습니다. 보고 전 수치와 문구를 확인해 주세요.</p>';

    /* 메일·메신저용 텍스트 */
    var t = [];
    t.push(subject);
    t.push('(작성 ' + written + ' · 실적 ' + m.dataBasis + ')');
    t.push('');
    t.push('■ 종합: 평균 진척률 ' + pctS(o.prog) + '(' + o.band.label + ') · 지수 평균 ' + p1(o.cur) + ' / 목표 ' + p1(o.tgt) + ' · ' + K.dotDate(m.asOfDate) + ' 기준 기간 경과율 ' + pctS(a.elapsed));
    t.push('  ' + ov.slice(1).join(' '));
    t.push('');
    t.push('■ 지수별 진척률');
    a.r.indices.forEach(function (ix) { t.push('  - ' + ix.name + ' ' + pctS(ix.prog) + ' (' + ix.band.label + ')'); });
    if (a.good.length) { t.push(''); t.push('■ 잘 되고 있는 지표'); a.good.forEach(function (i) { t.push('  - ' + i.name + ' ' + pctS(i.prog)); }); }
    if (a.weak.length) { t.push(''); t.push('■ 집중 관리 필요'); a.weak.forEach(function (i) { t.push('  - ' + i.name + ' ' + pctS(i.prog) + ' (' + i.band.label + ', ' + i.dept + ')'); }); }
    if (chk.length) { t.push(''); t.push('■ 자료 확인 필요'); chk.forEach(function (i) { t.push('  - ' + i.name + ' ' + stateLabel(i) + ' (' + i.dept + ')'); }); }
    if (acts.length) { t.push(''); t.push('■ 다음 조치'); acts.forEach(function (x, n) { t.push('  ' + (n + 1) + '. [' + x.who + '] ' + x.what); }); }
    if (location.protocol !== 'file:') { t.push(''); t.push('대시보드: ' + location.origin + location.pathname.replace(/[^/]*$/, '')); }
    t.push('※ 대시보드 자료를 바탕으로 자동 작성된 요약입니다.');

    return { html: h, text: t.join('\n'), subject: subject };
  }

  /* ---------- 팝업 · 공유 · 출력 ---------- */
  var dlg, body, current = null;

  function toast(msg) {
    var el = document.getElementById('rpToast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.hidden = true; }, 3500);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) { // 내부망(http) 주소에서도 동작하는 방식
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      dlg.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      ok ? resolve() : reject();
    });
  }

  function open() {
    var data = window.KPI_CURRENT;
    if (!data) { alert('자료를 불러온 뒤 다시 눌러 주세요.'); return; }
    current = build(data);
    body.innerHTML = current.html;
    document.getElementById('shareMenu').hidden = true;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    body.scrollTop = 0;
  }
  function close() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function printReport(asPdf) {
    var area = document.getElementById('printArea');
    area.innerHTML = '<article class="report">' + body.innerHTML + '</article>';
    document.body.classList.add('print-report');
    if (asPdf) toast('인쇄 창의 대상(프린터)에서 "PDF로 저장"을 선택하세요.');
    setTimeout(function () { window.print(); }, asPdf ? 600 : 50);
  }
  window.addEventListener('afterprint', function () {
    document.body.classList.remove('print-report');
    document.getElementById('printArea').innerHTML = '';
  });

  function init() {
    dlg = document.getElementById('reportDialog');
    body = document.getElementById('reportBody');
    document.getElementById('reportBtn').addEventListener('click', open);
    document.getElementById('rpClose').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });

    var menu = document.getElementById('shareMenu'), shareBtn = document.getElementById('rpShare');
    shareBtn.addEventListener('click', function () {
      menu.hidden = !menu.hidden;
      shareBtn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      document.getElementById('rpNative').hidden = !navigator.share;
    });
    document.getElementById('rpMail').addEventListener('click', function () {
      // 메일 프로그램은 주소 길이 제한(약 2,000자)이 있어 본문 전체는 클립보드로 넘기고, 메일에는 핵심 한 줄과 안내를 넣습니다.
      var lines = current.text.split('\n');
      var shortBody = lines[0] + '\r\n' + lines[1] + '\r\n\r\n' + (lines[3] || '') +
        '\r\n\r\n(요약보고서 전체 내용이 복사되어 있습니다. 이 줄을 지우고 붙여넣기(Ctrl+V) 하세요.)';
      copyText(current.text).then(function () { toast('메일 창이 열립니다. 본문에 붙여넣기(Ctrl+V)하면 전체 요약이 들어갑니다.'); },
        function () { toast('메일 창이 열립니다. 전체 요약은 "메신저용 텍스트 복사"로 복사해 붙여넣어 주세요.'); });
      setTimeout(function () {
        location.href = 'mailto:?subject=' + encodeURIComponent(current.subject) + '&body=' + encodeURIComponent(shortBody);
      }, 150);
      menu.hidden = true;
    });
    document.getElementById('rpCopy').addEventListener('click', function () {
      copyText(current.text).then(function () { toast('요약을 복사했습니다. 메신저·메일 창에 붙여넣기(Ctrl+V) 하세요.'); },
        function () { toast('복사하지 못했습니다. 보고서 내용을 직접 선택해 복사해 주세요.'); });
      menu.hidden = true;
    });
    document.getElementById('rpNative').addEventListener('click', function () {
      navigator.share({ title: current.subject, text: current.text }).catch(function () {});
      menu.hidden = true;
    });
    document.getElementById('rpDownload').addEventListener('click', function () {
      var blob = new Blob(['﻿' + current.text.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '성과지표_요약보고_' + K.clockText(new Date()).slice(0, 10).replace(/\./g, '') + '.txt';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      menu.hidden = true;
    });
    document.getElementById('rpPdf').addEventListener('click', function () { printReport(true); });
    document.getElementById('rpPrint').addEventListener('click', function () { printReport(false); });
  }

  window.KPIReport = { build: build };
  if (document.getElementById('reportDialog')) init();
})();
