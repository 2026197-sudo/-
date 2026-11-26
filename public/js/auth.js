/* 로그인: 인사번호 + 본인 PIN. 로그인 전에는 로그인·가입 화면만 보입니다. */
(function () {
  'use strict';
  var KEY = 'kmcuKpiSession';
  var ID_KEY = 'kmcuKpiLastId'; // 이 기기에서 마지막으로 로그인한 인사번호
  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function expOf(token) {
    try {
      var b = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b)).exp || 0;
    } catch (e) { return 0; }
  }
  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.token && expOf(s.token) > Date.now() + 60e3) return s;
    } catch (e) {}
    return null;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* 로그인 정보를 붙여 요청합니다. 로그인이 풀렸으면 로그인 화면으로 돌아갑니다. */
  function api(url, opts) {
    opts = opts || {};
    var s = session();
    var headers = Object.assign({}, opts.headers || {});
    if (s) headers.Authorization = 'Bearer ' + s.token;
    return fetch(url, Object.assign({ cache: 'no-store' }, opts, { headers: headers })).then(function (res) {
      if (res.status === 401) { clear(); location.reload(); throw new Error('로그인이 필요합니다.'); }
      return res;
    });
  }
  function postJson(url, body) {
    return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      });
  }
  function publicPost(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      });
  }

  /* 상단 오른쪽: 로그인한 사람과 로그아웃 */
  function userChip(user) {
    var tools = document.querySelector('.tools');
    if (!tools || document.getElementById('userChip')) return;
    var box = document.createElement('span');
    box.className = 'user-box';
    box.id = 'userChip';
    box.innerHTML = '<span class="user-name">' + esc(user.name) + (user.admin ? (user.name === '관리자' ? '' : ' <span class="user-role">관리자</span>') : ' <span class="user-dept">' + esc(user.dept) + '</span>') + '</span>' +
      '<button type="button" class="btn btn-sm" id="logoutBtn">로그아웃</button>';
    tools.appendChild(box);
    document.getElementById('logoutBtn').addEventListener('click', function () { clear(); location.href = './'; });
  }

  /* 로그인·가입 화면 */
  function renderGate(onReady) {
    document.body.classList.add('locked');
    var gate = document.createElement('main');
    gate.id = 'gate';
    gate.className = 'gate';
    gate.innerHTML =
      '<div class="gate-box">' +
      '<h1>성과관리 시스템</h1>' +
      '<p class="gate-lead">혁신지원사업단 자율성과지표 현황은 담당자만 볼 수 있습니다. 인사번호와 본인이 정한 PIN으로 로그인하세요.</p>' +
      '<div class="gate-tabs" role="tablist">' +
      '<button type="button" role="tab" id="tabLogin" aria-selected="true" aria-controls="loginForm">로그인</button>' +
      '<button type="button" role="tab" id="tabSignup" aria-selected="false" aria-controls="signupForm">처음 사용 (가입)</button></div>' +
      '<div id="gateMsg" role="alert"></div>' +
      '<form id="loginForm" class="gate-form" autocomplete="on">' +
      '<label class="field">인사번호<input id="lgId" name="username" inputmode="numeric" autocomplete="username" required maxlength="12"></label>' +
      '<label class="field">PIN (숫자 4~6자리)<input id="lgPin" name="password" type="password" inputmode="numeric" autocomplete="current-password" required maxlength="6" pattern="[0-9]{4,6}"></label>' +
      '<label class="check"><input type="checkbox" id="lgKeep" checked> 이 기기에서 로그인 유지 (로그아웃할 때까지)</label>' +
      '<button type="submit" class="btn btn-primary">로그인</button>' +
      '<p class="gate-help">이미 가입했다면 다시 가입하지 마세요. PIN을 잊었으면 기획팀(IR센터)에 <b>PIN 초기화</b>를 요청한 뒤, 이 화면에서 새 PIN을 입력해 로그인하면 됩니다.</p>' +
      '</form>' +
      '<form id="signupForm" class="gate-form" hidden autocomplete="off">' +
      '<label class="field">인사번호<input id="sgId" inputmode="numeric" required maxlength="12"></label>' +
      '<label class="field">이름<input id="sgName" required maxlength="20"></label>' +
      '<label class="field">관리부서<select id="sgDept" required><option value="">불러오는 중…</option></select></label>' +
      '<div class="gate-row">' +
      '<label class="field">PIN 정하기 (숫자 4~6자리)<input id="sgPin" type="password" inputmode="numeric" autocomplete="new-password" required maxlength="6" pattern="[0-9]{4,6}"></label>' +
      '<label class="field">PIN 다시 입력<input id="sgPin2" type="password" inputmode="numeric" autocomplete="new-password" required maxlength="6" pattern="[0-9]{4,6}"></label></div>' +
      '<label class="check"><input type="checkbox" id="sgKeep" checked> 이 기기에서 로그인 유지 (로그아웃할 때까지)</label>' +
      '<p class="gate-help">가입은 처음 한 번만 합니다. 학교 포털 비밀번호는 쓰지 마세요. 가입하면 바로 쓸 수 있고, 실적은 선택한 부서의 지표만 입력할 수 있습니다. 공용 PC라면 로그인 유지를 해제하세요.</p>' +
      '<button type="submit" class="btn btn-primary">가입하고 시작하기</button>' +
      '</form></div>';
    var mainEl = document.querySelector('main');
    mainEl.parentNode.insertBefore(gate, mainEl);

    var msgBox = document.getElementById('gateMsg');
    var say = function (t) { msgBox.innerHTML = t ? '<div class="banner banner-error">' + esc(t) + '</div>' : ''; };
    var deptsLoaded = false;
    function show(which) {
      var login = which === 'login';
      document.getElementById('loginForm').hidden = !login;
      document.getElementById('signupForm').hidden = login;
      document.getElementById('tabLogin').setAttribute('aria-selected', String(login));
      document.getElementById('tabSignup').setAttribute('aria-selected', String(!login));
      say('');
      if (!login && !deptsLoaded) {
        fetch('api/auth/config', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
          deptsLoaded = true;
          document.getElementById('sgDept').innerHTML = '<option value="">부서를 고르세요</option>' +
            (c.departments || []).map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('');
        }).catch(function () { say('부서 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); });
      }
      (login ? document.getElementById('lgId') : document.getElementById('sgId')).focus();
    }
    document.getElementById('tabLogin').addEventListener('click', function () { show('login'); });
    document.getElementById('tabSignup').addEventListener('click', function () { show('signup'); });

    function done(res, btn) {
      btn.disabled = false;
      if (!res.ok) { say(res.body.error || '처리하지 못했습니다 (' + res.status + ').'); return; }
      save({ token: res.body.token, user: res.body.user });
      try { localStorage.setItem(ID_KEY, res.body.user.id); } catch (e) {}
      if (res.body.pinSet) window.alert('새 PIN이 저장되었습니다. 다음부터 이 PIN으로 로그인하세요.');
      gate.remove();
      document.body.classList.remove('locked');
      userChip(res.body.user);
      onReady(res.body.user);
    }
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter || this.querySelector('button[type=submit]');
      btn.disabled = true; say('');
      publicPost('api/auth/login', { id: document.getElementById('lgId').value, pin: document.getElementById('lgPin').value, remember: document.getElementById('lgKeep').checked })
        .then(function (res) { done(res, btn); })
        .catch(function () { btn.disabled = false; say('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'); });
    });
    document.getElementById('signupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter || this.querySelector('button[type=submit]');
      var pin = document.getElementById('sgPin').value;
      if (pin !== document.getElementById('sgPin2').value) { say('두 PIN이 서로 다릅니다.'); return; }
      btn.disabled = true; say('');
      publicPost('api/auth/signup', {
        id: document.getElementById('sgId').value, name: document.getElementById('sgName').value,
        dept: document.getElementById('sgDept').value, pin: pin, remember: document.getElementById('sgKeep').checked
      }).then(function (res) { done(res, btn); })
        .catch(function () { btn.disabled = false; say('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'); });
    });
    var lastId = '';
    try { lastId = localStorage.getItem(ID_KEY) || ''; } catch (e) {}
    if (lastId) { document.getElementById('lgId').value = lastId; document.getElementById('lgPin').focus(); }
    else document.getElementById('lgId').focus();
  }

  /* 페이지 시작: 로그인되어 있으면 바로, 아니면 로그인 화면을 거쳐 onReady(user) */
  function start(onReady) {
    var s = session();
    if (s && s.user) {
      userChip(s.user);
      onReady(s.user);
      // 부서 변경·삭제를 반영하기 위해 서버에서 한 번 더 확인
      api('api/auth/me').then(function (r) { return r.json(); }).then(function (b) {
        if (b && b.user && JSON.stringify(b.user) !== JSON.stringify(s.user)) { save({ token: s.token, user: b.user }); location.reload(); }
      }).catch(function () {});
    } else {
      clear();
      renderGate(onReady);
    }
  }

  window.KPIAuth = { start: start, api: api, post: postJson, session: session, logout: clear };
})();
