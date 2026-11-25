/* 실적 입력 화면 (Netlify 배포용 · PIN 없음) */
(function () {
  'use strict';
  var K = window.KPI, esc = K.esc;
  var data = null;
  var STATES = [['actual', '실적'], ['pending', '측정 전'], ['missing', '미입력']];
  var WHO_KEY = 'kmcuKpiEditor';

  /* 대시보드 문구 목록 편집기 설정 */
  var LISTS = [
    { key: 'notes', title: '해석 시 유의사항 (직접 입력)', hint: '자동 항목 외에 꼭 알려야 할 해석상 주의점을 적습니다. 필요 없어지면 삭제하세요.',
      get: function (d) { return d.notes; }, set: function (d, v) { d.notes = v; }, done: false,
      fields: [{ k: 'title', label: '제목' }, { k: 'body', label: '내용', area: true }] },
    { key: 'events', title: '측정 기준일과 남은 일정 (직접 입력)', hint: '분기 기준일·측정기간 종료·측정 전 지표 일정은 자동으로 표시됩니다. 날짜가 지나면 끝난 일정으로 자동 이동하고, 연결 지표를 고르면 그 지표가 실적으로 입력될 때 자동 완료됩니다.',
      get: function (d) { return d.events; }, set: function (d, v) { d.events = v; }, done: true, link: true,
      fields: [{ k: 'date', label: '날짜', type: 'date' }, { k: 'name', label: '일정' }, { k: 'desc', label: '설명 · 담당' }] },
    { key: 'fixdata', title: '실적 파일 필수확인사항', hint: '엑셀 등 실적 자료에서 고쳐야 할 점입니다. 연결 지표를 고르면 그 지표가 실적으로 입력될 때 자동 완료됩니다.',
      get: function (d) { return d.fixes.data; }, set: function (d, v) { d.fixes.data = v; }, done: true, link: true,
      fields: [{ k: 'item', label: '확인사항' }, { k: 'owner', label: '담당 부서', narrow: true }] },
    { key: 'fixdoc', title: '정의서 정정 필요 사항', hint: '성과지표 정의서에서 정정할 내용입니다.',
      get: function (d) { return d.fixes.doc; }, set: function (d, v) { d.fixes.doc = v; }, done: true,
      fields: [{ k: 'item', label: '항목' }, { k: 'detail', label: '내용' }] }
  ];
  var work = {}; // 편집 중인 문구 목록 (저장 전)

  function itemOptions(selected) {
    var html = '';
    (data.indices || []).forEach(function (ix) {
      html += '<optgroup label="' + esc(ix.name) + '">';
      ix.items.forEach(function (it) {
        html += '<option value="' + esc(it.id) + '"' + (it.id === selected ? ' selected' : '') + '>' + esc(it.short || it.name) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function renderLists() {
    var html = '';
    LISTS.forEach(function (L) {
      var rows = work[L.key];
      html += '<div class="list-editor"><div class="le-head"><h3>' + esc(L.title) + '</h3>' +
        '<button type="button" class="btn btn-sm" data-add="' + L.key + '">+ 항목 추가</button></div>' +
        '<p class="dim small">' + esc(L.hint) + '</p>';
      if (!rows.length) {
        html += '<p class="dim small">항목이 없습니다.</p>';
      } else {
        html += '<div class="table-scroll"><table class="le-table"><thead><tr>' +
          L.fields.map(function (f) { return '<th scope="col">' + esc(f.label) + '</th>'; }).join('') +
          (L.link ? '<th scope="col">연결 지표</th>' : '') +
          (L.done ? '<th scope="col" class="c">완료</th>' : '') + '<th scope="col" class="c">삭제</th></tr></thead><tbody>';
        rows.forEach(function (row, i) {
          html += '<tr' + (row.done ? ' class="is-done"' : '') + '>';
          L.fields.forEach(function (f) {
            var id = 'L-' + L.key + '-' + i + '-' + f.k, v = row[f.k] === undefined || row[f.k] === null ? '' : row[f.k];
            var aria = ' aria-label="' + esc(L.title + ' ' + (i + 1) + '번 ' + f.label) + '"';
            html += '<td>' + (f.area
              ? '<textarea class="cell-input wide" rows="2" id="' + id + '"' + aria + '>' + esc(v) + '</textarea>'
              : '<input class="cell-input ' + (f.type === 'date' ? '' : f.narrow ? 'mid' : 'wide') + '" type="' + (f.type || 'text') + '" id="' + id + '"' + aria + ' value="' + esc(v) + '">') + '</td>';
          });
          if (L.link) {
            var autoDone = K.linkDone(row, data);
            html += '<td><select class="cell-select" id="L-' + L.key + '-' + i + '-link" aria-label="' + esc(L.title + ' ' + (i + 1) + '번 연결 지표') + '">' +
              '<option value="">연결 안 함</option>' + itemOptions(row.link) + '</select>' +
              (autoDone ? '<div class="small" style="color:var(--chip-ink);margin-top:4px">연결 지표 입력됨 · 자동 완료</div>' : '') + '</td>';
          }
          if (L.done) {
            html += '<td class="c"><input type="checkbox" class="le-check" id="L-' + L.key + '-' + i + '-done"' + (row.done ? ' checked' : '') +
              ' aria-label="' + esc(L.title + ' ' + (i + 1) + '번 완료') + '"></td>';
          }
          html += '<td class="c"><button type="button" class="btn btn-sm btn-icon" data-del="' + L.key + ':' + i + '" aria-label="' + esc(L.title + ' ' + (i + 1) + '번 삭제') + '">' +
            '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>';
        });
        html += '</tbody></table></div>';
      }
      html += '</div>';
    });
    document.getElementById('textEditors').innerHTML = html;
  }

  // 화면에 입력된 값을 편집 중 목록에 반영
  function syncLists() {
    LISTS.forEach(function (L) {
      work[L.key] = work[L.key].map(function (row, i) {
        var out = Object.assign({}, row);
        L.fields.forEach(function (f) {
          var el = document.getElementById('L-' + L.key + '-' + i + '-' + f.k);
          if (el) out[f.k] = el.value.trim();
        });
        if (L.done) {
          var c = document.getElementById('L-' + L.key + '-' + i + '-done');
          if (c) out.done = c.checked;
        }
        if (L.link) {
          var sel = document.getElementById('L-' + L.key + '-' + i + '-link');
          if (sel) { if (sel.value) out.link = sel.value; else delete out.link; }
        }
        return out;
      });
    });
  }

  function renderAutoPreview(d) {
    var box = document.getElementById('autoPreview');
    if (!box) return;
    var r = K.compute(d), auto = K.insights(r, K.elapsedRatio(d.meta));
    var html = '';
    if (auto.notes.length) {
      html += '<p class="small"><b>유의사항</b></p><ul>' + auto.notes.map(function (n) { return '<li>' + esc(n.title) + '</li>'; }).join('') + '</ul>';
    }
    if (auto.checks.length) {
      html += '<p class="small"><b>지표 자동 점검</b></p><ul>' + auto.checks.map(function (c) {
        return '<li><span class="status"><span class="mark mark-' + c.tag + '"></span>' + esc(c.label) + '</span> ' + esc(c.what) + ' <span class="dim">(' + esc(c.who) + ')</span></li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html || '<p class="dim small">현재 자동으로 표시할 항목이 없습니다.</p>';
  }

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
    LISTS.forEach(function (L) { work[L.key] = JSON.parse(JSON.stringify(L.get(data) || [])); });
    renderLists();
    renderAutoPreview(data);
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
    syncLists();
    LISTS.forEach(function (L) {
      var rows = work[L.key].filter(function (row) {
        return L.fields.some(function (f) { return row[f.k]; }); // 빈 줄은 저장하지 않음
      }).map(function (row) {
        var o = {};
        Object.keys(row).forEach(function (k) { o[k] = typeof row[k] === 'string' ? row[k].slice(0, 500) : row[k]; });
        if (L.done) o.done = !!row.done;
        return o;
      });
      L.set(next, rows);
    });
    next.meta.schema = 3;
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
    }).then(function (d) { data = K.normalize(d); fill(); });
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

  document.getElementById('textEditors').addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]');
    if (!add && !del) return;
    syncLists();
    if (add) {
      var key = add.getAttribute('data-add');
      work[key].push({});
      renderLists();
      var L = LISTS.filter(function (x) { return x.key === key; })[0];
      var first = document.getElementById('L-' + key + '-' + (work[key].length - 1) + '-' + L.fields[0].k);
      if (first) first.focus();
    } else {
      var parts = del.getAttribute('data-del').split(':');
      work[parts[0]].splice(Number(parts[1]), 1);
      renderLists();
    }
  });
  document.getElementById('textEditors').addEventListener('change', function (e) {
    if (e.target.classList.contains('le-check')) e.target.closest('tr').classList.toggle('is-done', e.target.checked);
  });
  // 수치·상태를 바꾸면 자동 항목 미리보기를 바로 갱신
  document.getElementById('rows').addEventListener('change', function () {
    if (data) renderAutoPreview(collect().next);
  });

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
