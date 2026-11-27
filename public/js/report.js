/* 요약보고서: 대시보드 자료를 분석 규칙에 따라 문장으로 자동 작성하고
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
    // 집중 관리: 주의·부진이거나 기간 경과율보다 뒤처진 지표 (부서별 현황과 같은 기준)
    var isWeak = function (i) { return i.band.key === 'red' || i.band.key === 'yellow' || (elapsed > 0 && i.prog < elapsed); };
    var good = measured.filter(function (i) { return !isWeak(i); });
    var weak = measured.filter(isWeak).sort(function (a, b) { return a.prog - b.prog; });
    var pending = items.filter(function (i) { return i.state === 'pending'; });
    var missing = items.filter(function (i) { return i.state === 'missing'; });
    var byProg = r.indices.slice().sort(function (a, b) { return b.prog - a.prog; });
    return { m: m, r: r, elapsed: elapsed, items: items, measured: measured, good: good, weak: weak,
      pending: pending, missing: missing, top: byProg[0], bottom: byProg[byProg.length - 1], now: now };
  }

  /* ---------- 보고서 작성: 결과보고 문체로 요약 ---------- */
  function chartSvg(indices) { // 혁신지수별 달성률 막대그래프
    var w = 360, h = 190, left = 34, bottom = 150, top = 26, bw = 46, gap = (w - left - 10 - bw * indices.length) / indices.length;
    var max = Math.max(100, Math.ceil(Math.max.apply(null, indices.map(function (ix) { return ix.prog || 0; })) / 20) * 20);
    var y = function (v) { return bottom - (bottom - top) * Math.min(v, max) / max; };
    var g = '';
    for (var t = 0; t <= max; t += max / 5) {
      g += '<line x1="' + left + '" x2="' + (w - 6) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="#D9D9D9" stroke-width="1"/>' +
        '<text x="' + (left - 6) + '" y="' + (y(t) + 4) + '" font-size="10" text-anchor="end" fill="#555">' + t.toFixed(1) + '</text>';
    }
    indices.forEach(function (ix, n) {
      var x = left + gap / 2 + n * (bw + gap), v = ix.prog || 0;
      g += '<rect x="' + x + '" y="' + y(v) + '" width="' + bw + '" height="' + (bottom - y(v)) + '" fill="#4472C4"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (y(v) - 5) + '" font-size="12" font-weight="700" text-anchor="middle" fill="#222">' + v.toFixed(1) + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (bottom + 16) + '" font-size="11" text-anchor="middle" fill="#222">' + esc(ix.name.replace(/혁신지수$/, '')) + '</text>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="혁신지수별 달성률"><text x="' + (w / 2) + '" y="16" font-size="15" font-weight="700" text-anchor="middle" fill="#404040">성과지표 달성률</text>' + g + '</svg>';
  }

  function build(data) {
    var now = new Date(), a = analyze(data, now), m = a.m, o = a.r.overall;
    var written = K.clockText(now).replace(/:\d\d KST$/, '');
    var year = String(m.periodStart || '').slice(0, 4);
    var q = K.quarterOf(m, m.asOfDate);
    var qLabel = q ? q.q + '분기' : '';
    var startMon = Number(String(m.periodStart || '').split('-')[1] || 3);
    var asMon = Number(String(m.asOfDate || '').split('-')[1] || 0);
    var asYear = String(m.asOfDate || '').slice(0, 4);
    var subject = '[혁신지원사업단] ' + year + '학년도 자율성과지표 ' + qLabel + ' 모니터링 요약';
    var el = K.elapsedRatio(m);
    var an = K.reportAnalysis(a.r, m, el);
    var summary = K.reportSummary(a.r, m);
    var period = year + '학년도 ' + qLabel + '(' + year + '년 ' + startMon + '월 ~ ' + (asYear && asYear !== year ? asYear + '년 ' : '') + asMon + '월 누적)';
    var sideNotes = [];
    sideNotes.push(asMon + '월 말 4개 핵심지표 평균 달성률(지수별 100% 상한)은 ' + pctS(o.prog) + '로, ' +
      (a.elapsed > 0 ? '기간 경과율(' + pctS(a.elapsed) + ') ' + (o.prog >= a.elapsed ? '이상으로 계획에 따라 추진되고 있음' : '대비 낮아 집중 관리가 필요함') : '\'' + o.band.label + '\' 수준임'));
    sideNotes.push(a.top.name + '(' + p1(a.top.prog) + ')' + josa(a.top.name, '이', '가') + ' 가장 높고, ' + a.bottom.name + '(' + p1(a.bottom.prog) + ')' + josa(a.bottom.name, '이', '가') + ' 가장 낮게 나타남');
    if (a.pending.length || a.missing.length) sideNotes.push('측정 전·미입력 지표 ' + (a.pending.length + a.missing.length) + '개가 포함된 잠정치로, 확정 실적 반영 시 달라질 수 있음');

    var h = '<div class="gd">';
    h += '<header class="gd-head"><img src="img/logo.png" alt="계명문화대학교"><div>' +
      '<h2 id="reportTitle">' + esc(year) + '학년도 자율성과지표 ' + esc(qLabel) + ' 모니터링 요약</h2>' +
      '<p class="gd-sub">모니터링 기간 ' + esc(period.replace(/^\d+학년도 \S+\(/, '').replace(/\)$/, '')) + ' · 자료 ' + esc(m.dataBasis) + ' · 작성 ' + esc(written) + '</p></div></header>';

    h += '<h3>1. 성과지표 달성률 현황</h3>';
    h += '<div class="gd-box"><div class="gd-chart">' + chartSvg(a.r.indices) + '</div><div class="gd-side">' +
      sideNotes.map(function (t) { return '<p>- ' + esc(t) + '</p>'; }).join('') + '</div></div>';
    h += '<p class="l3">- 성과지표 달성률 요약 : ' + esc(summary) + '</p>';

    h += '<h3>2. 세부성과지표 달성현황 분석</h3>';
    h += an.lines.map(function (t) { return '<p class="l4">○ ' + esc(t) + '</p>'; }).join('');

    h += '<h3>3. 세부성과지표 달성현황 <span>(' + esc(K.dotDate(m.asOfDate)) + ' 기준)</span></h3>';
    h += '<table class="gd-table"><thead><tr><th scope="col">혁신지수</th><th scope="col">세부성과지표</th><th scope="col">' + esc(year) + ' 목표</th><th scope="col">실적</th><th scope="col">달성률</th><th scope="col">관리부서</th></tr></thead><tbody>';
    a.r.indices.forEach(function (ix) {
      ix.items.forEach(function (it, k) {
        var rate = it.state === 'pending' ? '측정 전' : it.state === 'missing' ? '미입력' : pctS(it.prog);
        h += '<tr>' + (k === 0 ? '<th scope="rowgroup" rowspan="' + ix.items.length + '">' + esc(ix.name) + '<br><span>' + p1(ix.prog) + '%</span></th>' : '') +
          '<td>' + esc(it.name) + '</td><td class="r">' + esc(fmt(it.targets.y2)) + esc(it.unit) + '</td>' +
          '<td class="r">' + (it.current === null || it.current === undefined ? '-' : esc(fmt(it.current)) + esc(it.unit)) + '</td>' +
          '<td class="r' + (it.state === 'actual' && it.prog < 50 ? ' low' : '') + '">' + esc(rate) + '</td><td>' + esc(it.dept) + '</td></tr>';
      });
    });
    h += '</tbody></table>';
    h += '<p class="gd-note">성과관리 시스템 자료로 자동 작성한 요약입니다. 보고 전 수치와 문구를 확인해 주세요.</p>';
    h += '</div>';

    /* 메일·메신저용 텍스트 */
    var t = [];
    t.push(subject);
    t.push('자료 ' + m.dataBasis + ', 작성 ' + written);
    t.push('');
    t.push('1. 성과지표 달성률 현황');
    sideNotes.forEach(function (x) { t.push('  - ' + x); });
    t.push('  - 성과지표 달성률 요약 : ' + summary);
    t.push('');
    t.push('2. 세부성과지표 달성현황 분석');
    an.lines.forEach(function (x) { t.push('  ○ ' + x); });
    if (location.protocol !== 'file:') { t.push(''); t.push('성과관리 시스템: ' + location.origin + location.pathname.replace(/[^/]*$/, '')); }
    t.push('※ 성과관리 시스템 자료로 자동 작성한 요약입니다.');

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
      link.download = '성과지표_모니터링_요약_' + K.clockText(new Date()).slice(0, 10).replace(/\./g, '') + '.txt';
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
