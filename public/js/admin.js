/* 실적 입력 화면: 담당자는 본인 부서 지표만, 관리자는 전체를 고칩니다. */
(function () {
  'use strict';
  var K = window.KPI, esc = K.esc;
  var data = null;
  var STATES = [['actual', '실적'], ['pending', '측정 전'], ['missing', '미입력']];
  var DEPT_KEY = 'kmcuKpiDept';
  var orig = null; // 불러온 시점의 자료 (내 변경분 계산용)
  var me = null;   // 로그인한 사람 { id, name, dept, admin }
  function mine(dept) { return me.admin || splitDepts(dept).indexOf(me.dept) >= 0; }

  /* ---------- 관리부서 필터 ---------- */
  function splitDepts(s) { return String(s || '').split(/\s*[,·\/]\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function fillDeptFilter() {
    var sel = document.getElementById('deptFilter'), set = {};
    if (!me.admin) {
      sel.innerHTML = '<option value="' + esc(me.dept) + '">' + esc(me.dept) + '</option>';
      sel.disabled = true;
      applyDeptFilter();
      return;
    }
    data.indices.forEach(function (ix) { ix.items.forEach(function (it) { splitDepts(it.dept).forEach(function (d) { set[d] = true; }); }); });
    var saved = sel.value;
    if (!saved) { try { saved = localStorage.getItem(DEPT_KEY) || ''; } catch (e) {} }
    var names = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    sel.innerHTML = '<option value="">전체 부서</option>' + names.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === saved ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
    applyDeptFilter();
  }
  function applyDeptFilter() {
    var dept = document.getElementById('deptFilter').value, shown = 0, total = 0;
    var rows = document.querySelectorAll('#rows tr');
    var group = null, groupVisible = false;
    var flush = function () { if (group) group.hidden = !groupVisible; };
    Array.prototype.forEach.call(rows, function (tr) {
      if (tr.classList.contains('group-row')) { flush(); group = tr; groupVisible = false; return; }
      total++;
      var ok = !dept || splitDepts(tr.getAttribute('data-dept')).indexOf(dept) >= 0;
      tr.hidden = !ok;
      if (ok) { shown++; groupVisible = true; }
    });
    flush();
    document.getElementById('deptHint').textContent = !me.admin
      ? me.dept + ' 관리 지표 ' + shown + '개입니다. 다른 부서 지표는 해당 부서 담당자가 입력합니다.'
      : dept
      ? dept + ' 관리 지표 ' + shown + '개만 보입니다 (전체 ' + total + '개). 저장해도 다른 부서 지표 값은 그대로 유지됩니다.'
      : '본인 팀을 고르면 그 팀이 관리하는 지표만 보입니다.';
  }

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
    var r = K.compute(d), auto = K.insights(r, K.elapsedRatio(d.meta), d.meta);
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
    var al = K.inputAlarm(data, new Date()), box = document.getElementById('alarmNote');
    if (al) {
      var period = al.q + '분기(' + al.m1 + '~' + al.m3 + '월)';
      box.innerHTML = '<span class="alarm-dot" aria-hidden="true"></span><div><b>' + esc(period) + ' 실적값 입력 기간입니다</b><p>' +
        esc(K.dotDate(al.end)) + (al.days > 0 ? '이 분기 마지막 날입니다(D-' + al.days + ').' : al.days === 0 ? ', 오늘이 분기 마지막 날입니다.' : '에 분기가 끝났습니다(' + (-al.days) + '일 지남).') +
        ' ' + (me.admin ? '부서 입력이 끝나면 기본 정보의 실적 기준일을 ' + esc(K.dotDate(al.end)) + '로 바꿔 주세요. 그러면 알림이 사라집니다.' : esc(me.dept) + ' 관리 지표의 실적값을 아래에 입력하고 저장해 주세요.') + '</p></div>';
      box.hidden = false;
    } else box.hidden = true;
    ['title', 'badge', 'dataBasis', 'asOfDate'].forEach(function (k) {
      document.getElementById('m-' + k).value = m[k] || '';
    });
    document.getElementById('m-updatedBy').value = me.admin ? (me.name === '관리자' ? '관리자' : me.name + ' (관리자)') : me.name + ' (' + me.dept + ')';
    ['title', 'badge', 'dataBasis', 'asOfDate'].forEach(function (k) { document.getElementById('m-' + k).disabled = !me.admin; });

    var html = '';
    data.indices.forEach(function (ix, i) {
      html += '<tr class="group-row"><td colspan="6">' + esc(ix.name) + '</td></tr>';
      ix.items.forEach(function (it, j) {
        if (!mine(it.dept)) return; // 다른 부서 지표는 담당자 화면에 그리지 않음
        var id = 'i' + i + '_' + j;
        html += '<tr data-dept="' + esc(it.dept) + '"><th scope="row" style="background:none;font-weight:500;color:var(--ink);white-space:normal"><label for="' + id + '-cur">' + esc(it.name) + ' <span class="dim small">(' + esc(it.unit) + ')</span></label></th>' +
          '<td class="r dim">' + K.fmt(it.targets.y2) + '</td>' +
          '<td><input class="cell-input num" id="' + id + '-cur" type="number" step="any" value="' + (it.current === null || it.current === undefined ? '' : esc(it.current)) + '"></td>' +
          '<td><select class="cell-select" id="' + id + '-st" aria-label="' + esc(it.name) + ' 상태">' +
          STATES.map(function (s) { return '<option value="' + s[0] + '"' + (it.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="cell-input wide" id="' + id + '-note" type="text" aria-label="' + esc(it.name) + ' 비고" value="' + esc(it.note) + '"></td>' +
          '<td><input class="cell-input wide" id="' + id + '-dept" type="text" aria-label="' + esc(it.name) + ' 관리부서" value="' + esc(it.dept) + '"' + (me.admin ? '' : ' readonly') + '></td></tr>';
      });
    });
    document.getElementById('rows').innerHTML = html;
    fillDeptFilter();
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
    next.indices.forEach(function (ix, i) {
      ix.items.forEach(function (it, j) {
        var id = 'i' + i + '_' + j;
        if (!document.getElementById(id + '-cur')) return; // 화면에 없는(다른 부서) 지표는 그대로
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
    next.meta.schema = K.SCHEMA;
    return { next: next, bad: bad };
  }

  /* 동시 저장 대비: 불러온 뒤 내가 바꾼 부분만 골라 최신 자료에 합칩니다 */
  var META_KEYS = ['title', 'badge', 'dataBasis', 'asOfDate'];
  var ITEM_KEYS = ['current', 'status', 'note', 'dept'];
  var LIST_PATHS = [['notes'], ['events'], ['fixes', 'data'], ['fixes', 'doc']];
  function getPath(o, p) { return p.reduce(function (a, k) { return a ? a[k] : undefined; }, o); }
  function setPath(o, p, v) { var t = o; for (var i = 0; i < p.length - 1; i++) { t[p[i]] = t[p[i]] || {}; t = t[p[i]]; } t[p[p.length - 1]] = v; }
  function itemMap(d) { var m = {}; d.indices.forEach(function (ix) { ix.items.forEach(function (it) { m[it.id] = it; }); }); return m; }
  function diff(before, after) {
    var patch = { meta: {}, items: {}, lists: [] };
    META_KEYS.forEach(function (k) { if ((before.meta[k] || '') !== (after.meta[k] || '')) patch.meta[k] = after.meta[k]; });
    var b = itemMap(before), a = itemMap(after);
    Object.keys(a).forEach(function (id) {
      ITEM_KEYS.forEach(function (k) {
        if (!b[id] || JSON.stringify(b[id][k]) !== JSON.stringify(a[id][k])) { (patch.items[id] = patch.items[id] || {})[k] = a[id][k]; }
      });
    });
    LIST_PATHS.forEach(function (p) {
      if (JSON.stringify(getPath(before, p) || []) !== JSON.stringify(getPath(after, p) || [])) patch.lists.push({ path: p, value: getPath(after, p) });
    });
    return patch;
  }
  function applyPatch(latest, patch, who) {
    var next = JSON.parse(JSON.stringify(latest)), m = itemMap(next);
    Object.keys(patch.meta).forEach(function (k) { next.meta[k] = patch.meta[k]; });
    Object.keys(patch.items).forEach(function (id) { if (m[id]) Object.assign(m[id], patch.items[id]); });
    patch.lists.forEach(function (l) { setPath(next, l.path, l.value); });
    next.meta.updatedBy = who;
    next.meta.schema = K.SCHEMA;
    return next;
  }
  function isEmptyPatch(p) { return !Object.keys(p.meta).length && !Object.keys(p.items).length && !p.lists.length; }

  function post(url, body) { return KPIAuth.post(url, body); }

  function load() {
    return KPIAuth.api('api/data').then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) { data = K.normalize(d); orig = JSON.parse(JSON.stringify(data)); fill(); });
  }

  function loadHistory() {
    var box = document.getElementById('history');
    if (!me.admin) return Promise.resolve();
    return KPIAuth.api('api/history').then(function (r) {
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
    var btn = e.submitter || document.querySelector('#editor button[type=submit]');
    btn.disabled = true;
    if (!me.admin) {
      // 담당자: 서버가 본인 부서 지표의 현재값·상태·비고만 골라 최신 자료에 반영
      post('api/data', c.next).then(function (res) {
        if (!res.ok) { msg('저장하지 못했습니다: ' + (res.body.error || res.status)); return; }
        var ch = res.body.changed || [];
        msg(ch.length ? '저장했습니다 (' + ch.length + '개 지표: ' + ch.join(', ') + ').' : '바뀐 값이 없어 저장하지 않았습니다.', true);
        return load();
      }).catch(function () { msg('저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'); })
        .then(function () { btn.disabled = false; });
      return;
    }
    var patch = diff(orig, c.next), who = c.next.meta.updatedBy;
    var send = function (doc, base) { return post('api/data', Object.assign({}, doc, { _base: base || '' })); };
    send(c.next, orig.meta.updatedAt).then(function (res) {
      if (res.status !== 409) return { res: res, merged: false };
      // 다른 담당자가 먼저 저장함 → 최신 자료를 받아 내 변경분만 합쳐 다시 저장
      return KPIAuth.api('api/data').then(function (r) { return r.json(); }).then(function (latest) {
        latest = K.normalize(latest);
        if (isEmptyPatch(patch)) return { res: { ok: true, body: {} }, merged: true, nothing: true };
        return send(applyPatch(latest, patch, who), latest.meta.updatedAt).then(function (r2) { return { res: r2, merged: true }; });
      });
    }).then(function (out) {
      var res = out.res;
      if (!res.ok) {
        msg(res.status === 409 ? '다른 담당자가 동시에 저장하고 있습니다. 잠시 후 다시 저장해 주세요. (입력한 값은 화면에 그대로 있습니다)' : '저장하지 못했습니다: ' + (res.body.error || res.status));
        return;
      }
      msg(out.nothing ? '바뀐 내용이 없어 저장하지 않았습니다. 최신 자료를 불러왔습니다.'
        : out.merged ? '저장했습니다. 그사이 다른 담당자가 저장한 내용과 합쳐서 저장했습니다(내가 바꾼 항목만 반영).'
        : '저장했습니다. 이전 자료는 변경 이력에 보관했습니다.', true);
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
  document.getElementById('deptFilter').addEventListener('change', function () {
    try { localStorage.setItem(DEPT_KEY, this.value); } catch (e) {}
    applyDeptFilter();
  });

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

  /* 가입자 관리 (관리자) */
  var userDepts = [];
  function loadUsers() {
    var box = document.getElementById('users');
    return KPIAuth.api('api/users').then(function (r) { return r.json(); }).then(function (res) {
      var list = res.users || [];
      userDepts = res.departments || [];
      if (!list.length) { box.innerHTML = '<p class="dim">아직 가입한 담당자가 없습니다.</p>'; return; }
      box.innerHTML = '<div class="table-scroll"><table class="le-table users-table"><thead><tr><th scope="col">인사번호</th><th scope="col">이름</th><th scope="col">부서</th><th scope="col">권한</th>' +
        '<th scope="col">가입</th><th scope="col">최근 로그인</th><th scope="col"></th></tr></thead><tbody>' +
        list.map(function (u, i) {
          var opts = userDepts.slice();
          if (opts.indexOf(u.dept) < 0) opts.unshift(u.dept);
          return '<tr><td>' + esc(u.id) + '</td>' +
            '<td><input class="cell-input mid" id="u-' + i + '-name" value="' + esc(u.name) + '" aria-label="' + esc(u.id) + ' 이름"></td>' +
            '<td><select class="cell-select" id="u-' + i + '-dept" aria-label="' + esc(u.id) + ' 부서">' +
            opts.map(function (d) { return '<option' + (d === u.dept ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></td>' +
            '<td><select class="cell-select" id="u-' + i + '-role" aria-label="' + esc(u.id) + ' 권한"><option value="user"' + (u.admin ? '' : ' selected') + '>담당자 (본인 부서)</option>' +
            '<option value="admin"' + (u.admin ? ' selected' : '') + '>관리자 (전체)</option></select></td>' +
            '<td class="small dim">' + esc(shortTime(u.createdAt)) + '</td><td class="small dim">' + (u.pinReset ? '<b class="pin-reset">PIN 초기화됨 (새 PIN 대기)</b>' : esc(u.lastLogin ? shortTime(u.lastLogin) : '—')) + '</td>' +
            '<td class="users-act"><button type="button" class="btn btn-sm" data-uact="update" data-uid="' + esc(u.id) + '" data-ui="' + i + '">저장</button>' +
            '<button type="button" class="btn btn-sm" data-uact="resetPin" data-uid="' + esc(u.id) + '" data-ui="' + i + '">PIN 초기화</button>' +
            '<button type="button" class="btn btn-sm" data-uact="delete" data-uid="' + esc(u.id) + '" data-ui="' + i + '">삭제</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function () { box.innerHTML = '<p class="dim">가입자 목록을 불러오지 못했습니다.</p>'; });
  }
  document.getElementById('users').addEventListener('click', function (e) {
    var b = e.target.closest('[data-uact]');
    if (!b) return;
    var act = b.getAttribute('data-uact'), id = b.getAttribute('data-uid'), i = b.getAttribute('data-ui');
    if (act === 'delete' && !window.confirm(id + ' 가입 정보를 완전히 삭제할까요?\nPIN만 잊은 경우에는 삭제 대신 [PIN 초기화]를 쓰세요.')) return;
    if (act === 'resetPin' && !window.confirm(id + ' PIN을 초기화할까요?\n가입 정보는 그대로 두고, 본인이 로그인 화면에서 새 PIN을 입력하면 그 PIN으로 바뀝니다.')) return;
    var body = { action: act, id: id };
    if (act === 'update') {
      body.name = document.getElementById('u-' + i + '-name').value;
      body.dept = document.getElementById('u-' + i + '-dept').value;
      body.admin = document.getElementById('u-' + i + '-role').value === 'admin';
    }
    b.disabled = true;
    post('api/users', body).then(function (res) {
      if (!res.ok) { msg('처리하지 못했습니다: ' + (res.body.error || res.status)); b.disabled = false; return; }
      msg(act === 'delete' ? id + ' 가입 정보를 삭제했습니다.' : act === 'resetPin' ? id + ' PIN을 초기화했습니다. 본인에게 로그인 화면에서 새 PIN을 입력하라고 안내해 주세요.' : id + ' 정보를 고쳤습니다.', true);
      return loadUsers();
    }).catch(function () { msg('저장소에 연결할 수 없습니다.'); b.disabled = false; });
  });
  document.getElementById('usersReload').addEventListener('click', loadUsers);

  K.initTheme();
  document.getElementById('themeToggle').addEventListener('click', K.toggleTheme);
  K.startClock();
  KPIAuth.start(function (user) {
    me = user;
    document.getElementById('roleNote').innerHTML = me.admin
      ? '<b>' + esc(me.name) + '</b> (관리자)로 로그인했습니다. 모든 지표와 기본 정보, 대시보드 문구, 가입자를 고칠 수 있습니다.'
      : '<b>' + esc(me.name) + '</b> (' + esc(me.dept) + ')로 로그인했습니다. <b>' + esc(me.dept) + '</b> 관리 지표의 현재값·상태·비고만 저장됩니다. 다른 항목은 기획팀(IR센터)에 요청해 주세요.';
    ['metaSec', 'textSec', 'histSec', 'usersSec'].forEach(function (id) { document.getElementById(id).hidden = !me.admin; });
    load().catch(function () { msg('저장소에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.'); });
    if (me.admin) { loadHistory(); loadUsers(); }
  });
})();
