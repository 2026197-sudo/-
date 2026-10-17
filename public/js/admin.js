/* 실적 입력 화면 (Netlify 배포용 · PIN 없음) */
(function () {
  'use strict';
  var K = window.KPI, esc = K.esc;
  var data = null;
  var STATES = [['actual', '실적'], ['pending', '측정 전'], ['missing', '미입력']];
  var WHO_KEY = 'kmcuKpiEditor';

  function msg(text, ok) {
    document.getElementById('msg').innerHTML = text ? '<div class="banner ' + (ok ? 'banner-ok' : 'banner-error') + '">' + esc(text) + '</div>' : '';
    if (text) document.getElementById('msg').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function shortTime(iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? K.clockText(d).replace(/:\d\d KST$/, '') : '—';
  }

  function fill() {
    var m = data.meta;
    ['title', 'badge', 'dataBasis', 'asOfDate'].forEach(function (k) {
      document.getElementById('m-' + k).value = m[k] || '';
    });
    var who = '';
    try { who = localStorage.getItem(WHO_KEY) || ''; } catch (e) {}
    document.getElementById('m-updatedBy').value = who;

    var html = '';
    data.indices.forEach(function (ix, i) {
      html += '<tr class="group-row"><td colspan="6">' + esc(ix.name) + '</td></tr>';
      ix.items.forEach(function (it, j) {
        var id = 'i' + i + '_' + j;
        html += '<tr><th scope="row" style="background:none;font-weight:500;color:var(--ink);white-space:normal"><label for="' + id + '-cur">' + esc(it.name) + ' <span class="dim small">(' + esc(it.unit) + ')</span></label></th>' +
          '<td class="r dim">' + K.fmt(it.targets.y2) + '</td>' +
          '<td><input class="cell-input num" id="' + id + '-cur" type="number" step="any" value="' + (it.current === null || it.current === undefined ? '' : esc(it.current)) + '"></td>' +
          '<td><select class="cell-select" id="' + id + '-st" aria-label="' + esc(it.name) + ' 상태">' +
          STATES.map(function (s) { return '<option value="' + s[0] + '"' + (it.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="cell-input wide" id="' + id + '-note" type="text" aria-label="' + esc(it.name) + ' 비고" value="' + esc(it.note) + '"></td>' +
          '<td><input class="cell-input wide" id="' + id + '-dept" type="text" aria-label="' + esc(it.name) + ' 관리부서" value="' + esc(it.dept) + '"></td></tr>';
      });
    });
    document.getElementById('rows').innerHTML = html;
    document.getElementById('updated').textContent = '최종 수정 ' + shortTime(m.updatedAt) + (m.updatedBy ? ' · ' + m.updatedBy : '');
  }

  function collect() {
    var next = JSON.parse(JSON.stringify(data));
    ['title', 'badge', 'dataBasis', 'asOfDate', 'updatedBy'].forEach(function (k) {
      next.meta[k] = document.getElementById('m-' + k).value.trim();
    });
    var bad = [];
    if (!next.meta.updatedBy) bad.push('입력자');
    next.indices.forEach(function (ix, i) {
      ix.items.forEach(function (it, j) {
        var id = 'i' + i + '_' + j;
        var raw = document.getElementById(id + '-cur').value.trim();
        var v = raw === '' ? null : Number(raw);
        if (raw !== '' && !isFinite(v)) bad.push(it.name);
        it.current = v;
        it.status = document.getElementById(id + '-st').value;
        if (it.status === 'actual' && v === null) bad.push(it.name + '(실적인데 값이 비어 있음)');
        it.note = document.getElementById(id + '-note').value.trim();
        it.dept = document.getElementById(id + '-dept').value.trim();
      });
    });
    return { next: next, bad: bad };
  }

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      });
  }

  function load() {
    return fetch('api/data', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) { data = d; fill(); });
  }

  function loadHistory() {
    var box = document.getElementById('history');
    return fetch('api/history', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (res) {
      var items = res.items || [];
      if (!items.length) { box.innerHTML = '<p class="dim">아직 저장 이력이 없습니다. 처음 저장하면 배포 시점의 기본 자료가 이력에 보관됩니다.</p>'; return; }
      box.innerHTML = items.slice(0, 30).map(function (h) {
        return '<div class="list-row"><span class="body"><span><b>' + esc(shortTime(h.updatedAt)) + '</b> 자료' +
          (h.updatedBy ? ' · ' + esc(h.updatedBy) : '') + '</span>' +
          '<span class="sub">' + esc(h.reason || '') + ' · 보관 ' + esc(shortTime(h.archivedAt)) + (h.title ? ' · ' + esc(h.title) : '') + '</span></span>' +
          '<button type="button" class="btn btn-sm" data-restore="' + esc(h.id) + '">이 시점으로 되돌리기</button></div>';
      }).join('') + (items.length > 30 ? '<p class="dim small" style="margin-top:8px">최근 30개만 표시합니다 (보관 ' + items.length + '개).</p>' : '');
    }).catch(function () {
      box.innerHTML = '<p class="dim">변경 이력을 불러오지 못했습니다.</p>';
    });
  }

  document.getElementById('editor').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!data) return;
    var c = collect();
    if (c.bad.length) { msg('확인이 필요한 값: ' + c.bad.join(', ')); return; }
    try { localStorage.setItem(WHO_KEY, c.next.meta.updatedBy); } catch (err) {}
    var btn = e.submitter || document.querySelector('#editor button[type=submit]');
    btn.disabled = true;
    post('api/data', c.next).then(function (res) {
      if (!res.ok) { msg('저장하지 못했습니다: ' + (res.body.error || res.status)); return; }
      msg('저장했습니다. 이전 자료는 변경 이력에 보관했습니다.', true);
      return Promise.all([load(), loadHistory()]);
    }).catch(function () { msg('저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'); })
      .then(function () { btn.disabled = false; });
  });

  document.getElementById('history').addEventListener('click', function (e) {
    var b = e.target.closest('[data-restore]');
    if (!b) return;
    var who = document.getElementById('m-updatedBy').value.trim();
    if (!window.confirm('이 시점의 자료로 되돌릴까요?\n지금 자료는 변경 이력에 보관되어 다시 되돌릴 수 있습니다.')) return;
    b.disabled = true;
    post('api/restore', { id: b.getAttribute('data-restore'), by: who }).then(function (res) {
      if (!res.ok) { msg('되돌리지 못했습니다: ' + (res.body.error || res.status)); b.disabled = false; return; }
      msg('선택한 시점의 자료로 되돌렸습니다.', true);
      return Promise.all([load(), loadHistory()]);
    }).catch(function () { msg('저장소에 연결할 수 없습니다.'); b.disabled = false; });
  });

  document.getElementById('histReload').addEventListener('click', loadHistory);

  document.getElementById('download').addEventListener('click', function () {
    if (!data) return;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kpi-data-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  K.initTheme();
  document.getElementById('themeToggle').addEventListener('click', K.toggleTheme);
  K.startClock();
  load().catch(function () { msg('저장소에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.'); });
  loadHistory();
})();
