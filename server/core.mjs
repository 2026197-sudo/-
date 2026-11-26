// 계명문화대학교 혁신지원사업단 성과관리 — 공용 API 처리 (Netlify·Vercel 함께 사용)
//   Netlify: netlify/functions/api.mjs (저장소: Netlify Blobs)
//   Vercel : api/index.mjs            (저장소: Upstash Redis)
//
//   로그인
//   GET  /api/auth/config   가입할 때 고를 부서 목록, 관리자 설정 여부
//   POST /api/auth/signup   회원가입 { id, name, dept, pin }  (가입 즉시 사용)
//   POST /api/auth/login    로그인   { id, pin }  → 토큰
//   GET  /api/auth/me       현재 로그인 정보
//
//   자료 (로그인 필요)
//   GET  /api/data          현재 자료
//   POST /api/data          저장. 담당자는 본인 부서 지표(현재값·상태·비고)만 반영, 관리자는 전체
//   GET  /api/history       변경 이력 (관리자)
//   POST /api/restore       변경 이력으로 되돌리기 (관리자)
//   GET  /api/users         가입자 목록 (관리자)
//   POST /api/users         가입자 부서·이름 수정, 삭제(PIN 초기화) (관리자)
//
//   GET  /api/health        저장소 연결 진단 (자료는 내보내지 않음)
//
// 관리자: 가입자 중 관리자 권한이 있는 사람. 관리자가 한 명도 없으면 가장 먼저 가입한 사람이 관리자가 되고,
//         이후 관리자가 '가입자 관리'에서 다른 가입자에게 관리자 권한을 주거나 뺄 수 있습니다.
//         (비상용) Netlify 환경 변수 KPI_ADMINS = "인사번호:PIN" 으로도 관리자 로그인을 할 수 있습니다.
// 자료·가입자 명단은 각 사이트의 전용 저장소에 저장됩니다. PIN은 해시로만 보관합니다.
// store 는 get(key, {type:"json"}) · set(key, text) · setJSON(key, value) · delete(key) 를 제공해야 합니다.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import seed from "./seed.mjs";

const KEY_CURRENT = "current";
const KEY_INDEX = "history-index";
const KEY_USERS = "users";
const KEY_SECRET = "auth-secret";
const MAX_BODY = 1024 * 1024; // 1MB
const KEEP_HISTORY = 100;
const TOKEN_HOURS = 12;          // 기본 로그인 유지 시간
const REMEMBER_DAYS = 3650;      // '이 기기에서 로그인 유지'를 고르면 로그아웃할 때까지 유지 (PIN 초기화·삭제 시 자동 해제)
const LOGIN_LIMIT = 10;           // 15분 동안 실패 허용 횟수
const LOGIN_WINDOW = 15 * 60e3;
const SIGNUP_LIMIT = 5;           // 1시간 동안 같은 곳에서 가입 허용 횟수
const SIGNUP_WINDOW = 60 * 60e3;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function kstIso(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00";
}

function newId(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString();
  const stamp = k.slice(0, 10).replace(/-/g, "") + "-" + k.slice(11, 19).replace(/:/g, "") + k.slice(20, 23);
  return stamp + "-" + Math.random().toString(36).slice(2, 6);
}

function errInfo(e) {
  return String((e && (e.name ? e.name + ": " : "") + (e.message || "")) || e).slice(0, 300);
}

/* ---------- 자료 검증 ---------- */
function validate(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return "자료 형식이 올바르지 않습니다.";
  if (!doc.meta || typeof doc.meta !== "object") return "meta 항목이 없습니다.";
  if (!Array.isArray(doc.indices) || doc.indices.length === 0) return "indices 항목이 없습니다.";
  for (const ix of doc.indices) {
    if (!ix || !Array.isArray(ix.items)) return "지수 항목 형식이 올바르지 않습니다.";
    for (const it of ix.items) {
      if (!it || typeof it.targets !== "object" || it.targets === null) return "세부지표 형식이 올바르지 않습니다.";
      if (!["actual", "pending", "missing"].includes(it.status)) return `상태 값이 올바르지 않습니다: ${it.name}`;
      if (it.current !== null && it.current !== undefined && (typeof it.current !== "number" || !Number.isFinite(it.current))) {
        return `현재값은 숫자여야 합니다: ${it.name}`;
      }
    }
  }
  const isList = (v) => v === undefined || (Array.isArray(v) && v.length <= 200 && v.every((x) => x && typeof x === "object" && !Array.isArray(x)));
  if (!isList(doc.notes)) return "유의사항 목록 형식이 올바르지 않습니다.";
  if (!isList(doc.events)) return "일정 목록 형식이 올바르지 않습니다.";
  if (doc.fixes !== undefined) {
    if (!doc.fixes || typeof doc.fixes !== "object" || Array.isArray(doc.fixes)) return "확인사항 형식이 올바르지 않습니다.";
    if (!isList(doc.fixes.data) || !isList(doc.fixes.doc)) return "확인사항 목록 형식이 올바르지 않습니다.";
  }
  return null;
}

/* ---------- 저장소 도우미 ---------- */
async function readCurrent(store) {
  return (await store.get(KEY_CURRENT, { type: "json" })) || seed;
}
async function readIndex(store) {
  const idx = await store.get(KEY_INDEX, { type: "json" });
  return Array.isArray(idx) ? idx : [];
}
async function readUsers(store) {
  const u = await store.get(KEY_USERS, { type: "json" });
  const users = Array.isArray(u) ? u : [];
  // 관리자가 한 명도 없으면 가장 먼저 가입한 사람을 관리자로 지정
  if (users.length && !users.some((x) => x.admin) && admins().length === 0) {
    const first = users.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))[0];
    first.admin = true;
    await store.setJSON(KEY_USERS, users);
  }
  return users;
}
async function archive(store, doc, reason) {
  const id = newId();
  await store.setJSON(`history/${id}`, doc);
  const idx = await readIndex(store);
  idx.unshift({
    id,
    archivedAt: kstIso(),
    reason,
    updatedAt: (doc.meta && doc.meta.updatedAt) || null,
    updatedBy: (doc.meta && doc.meta.updatedBy) || "",
    title: (doc.meta && doc.meta.title) || "",
  });
  for (const old of idx.slice(KEEP_HISTORY)) {
    try { await store.delete(`history/${old.id}`); } catch (e) { /* 무시 */ }
  }
  await store.setJSON(KEY_INDEX, idx.slice(0, KEEP_HISTORY));
  return id;
}
async function readBody(req) {
  const text = await req.text();
  if (!text || text.length > MAX_BODY) return { error: "요청 크기가 올바르지 않습니다." };
  try { return { value: JSON.parse(text) }; } catch (e) { return { error: "JSON 형식이 아닙니다." }; }
}

/* ---------- 부서 ---------- */
function splitDepts(s) {
  return String(s || "").split(/\s*[,·/]\s*/).map((x) => x.trim()).filter(Boolean);
}
function departmentsOf(doc) {
  const set = new Set();
  (doc.indices || []).forEach((ix) => (ix.items || []).forEach((it) => splitDepts(it.dept).forEach((d) => set.add(d))));
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

/* ---------- 인증 ---------- */
function admins() {
  // KPI_ADMINS="2026000:123456, 2026001:654321"
  return String(process.env.KPI_ADMINS || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).map((pair) => {
    const i = pair.indexOf(":");
    return i > 0 ? { id: pair.slice(0, i), pin: pair.slice(i + 1) } : null;
  }).filter((a) => a && a.id && a.pin);
}
function normId(v) { return String(v || "").trim().replace(/\s+/g, ""); }
const ID_RE = /^[0-9A-Za-z]{4,12}$/;
const PIN_RE = /^[0-9]{4,6}$/;

function hashPin(pin, salt) { return scryptSync(String(pin), salt, 32).toString("hex"); }
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
async function secretOf(store) {
  let s = await store.get(KEY_SECRET);
  if (!s) { s = randomBytes(32).toString("hex"); await store.set(KEY_SECRET, s); }
  return String(s);
}
function b64url(s) { return Buffer.from(s).toString("base64url"); }
function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
function verify(token, secret) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expect = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(mac, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
function clientIp(req, ip) {
  return ip || req.headers.get("x-real-ip") || String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
}
async function limited(store, key, limit, windowMs) {
  const r = (await store.get(key, { type: "json" })) || { n: 0, t: Date.now() };
  if (Date.now() - r.t > windowMs) return false;
  return r.n >= limit;
}
async function bump(store, key, windowMs) {
  let r = (await store.get(key, { type: "json" })) || { n: 0, t: Date.now() };
  if (Date.now() - r.t > windowMs) r = { n: 0, t: Date.now() };
  r.n += 1;
  await store.setJSON(key, r);
}
function publicUser(u) { return { id: u.id, name: u.name, dept: u.dept, admin: !!u.admin }; }

// 요청의 토큰을 확인해 사용자 정보를 돌려줍니다. 담당자는 저장소의 최신 정보(부서 변경·삭제)로 다시 확인합니다.
async function currentUser(req, store) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const p = verify(token, await secretOf(store));
  if (!p) return null;
  if (p.env) return admins().some((a) => a.id === p.id) ? { id: p.id, name: "관리자", dept: "", admin: true } : null;
  const u = (await readUsers(store)).find((x) => x.id === p.id);
  if (!u || !u.pinHash) return null;
  if (p.v !== undefined && p.v !== pinVer(u)) return null;
  return publicUser(u);
}
// PIN이 바뀌거나 초기화되면 이전 로그인은 모두 풀리도록 토큰에 PIN 버전을 넣음
function pinVer(user) { return user.env ? "" : String(user.salt || "").slice(0, 8); }
async function issue(store, user, remember) {
  const ms = remember ? REMEMBER_DAYS * 24 * 3600e3 : TOKEN_HOURS * 3600e3;
  return sign({ id: user.id, env: !!user.env, v: pinVer(user), exp: Date.now() + ms }, await secretOf(store));
}

/* ---------- 담당자 저장: 본인 부서 지표만 반영 ---------- */
function mergeForDept(current, submitted, dept) {
  const next = JSON.parse(JSON.stringify(current));
  const sub = {};
  (submitted.indices || []).forEach((ix) => (ix.items || []).forEach((it) => { sub[it.id] = it; }));
  const changed = [];
  next.indices.forEach((ix) => ix.items.forEach((it) => {
    if (!splitDepts(it.dept).includes(dept)) return;
    const s = sub[it.id];
    if (!s) return;
    const before = JSON.stringify([it.current, it.status, it.note]);
    if (s.current === null || (typeof s.current === "number" && Number.isFinite(s.current))) it.current = s.current;
    if (["actual", "pending", "missing"].includes(s.status)) it.status = s.status;
    if (typeof s.note === "string") it.note = s.note.slice(0, 500);
    if (JSON.stringify([it.current, it.status, it.note]) !== before) changed.push(it.short || it.name);
  }));
  return { next, changed };
}

/* ---------- 요청 처리 ---------- */
export async function handle(req, { store, ip, path: forcedPath, platform }) {
  const path = (forcedPath || new URL(req.url).pathname).replace(/\/+$/, "");
  try {

    if (path === "/api/health" && req.method === "GET") {
      const cur = await store.get(KEY_CURRENT, { type: "json" });
      return json(200, {
        ok: true,
        store: "connected",
        platform: platform || "",
        data: cur ? "saved" : "seed (아직 웹에서 저장한 적 없음)",
        admins: admins().length,
        users: (await readUsers(store)).length,
        history: (await readIndex(store)).length,
        checkedAt: kstIso(),
      });
    }

    /* 로그인 */
    if (path === "/api/auth/config" && req.method === "GET") {
      return json(200, { departments: departmentsOf(await readCurrent(store)), adminConfigured: admins().length > 0 });
    }

    if (path === "/api/auth/signup" && req.method === "POST") {
      const ipKey = "rl/signup/" + clientIp(req, ip);
      if (await limited(store, ipKey, SIGNUP_LIMIT, SIGNUP_WINDOW)) return json(429, { error: "가입 시도가 너무 많습니다. 1시간 뒤 다시 시도해 주세요." });
      const body = await readBody(req);
      if (body.error) return json(400, { error: body.error });
      const id = normId(body.value.id), name = String(body.value.name || "").trim().slice(0, 20);
      const dept = String(body.value.dept || "").trim(), pin = String(body.value.pin || "");
      if (!ID_RE.test(id)) return json(400, { error: "인사번호를 확인해 주세요 (숫자·영문 4~12자)." });
      if (!name) return json(400, { error: "이름을 입력해 주세요." });
      if (!departmentsOf(await readCurrent(store)).includes(dept)) return json(400, { error: "부서를 목록에서 골라 주세요." });
      if (!PIN_RE.test(pin)) return json(400, { error: "PIN은 숫자 4~6자리로 정해 주세요." });
      if (admins().some((a) => a.id === id)) return json(409, { error: "이 인사번호로는 가입할 수 없습니다. 관리자에게 문의해 주세요." });
      const users = await readUsers(store);
      const existing = users.find((u) => u.id === id);
      if (existing) {
        return json(409, { error: existing.pinHash
          ? "이미 가입된 인사번호입니다. 다시 가입하지 말고 로그인해 주세요. PIN을 잊었다면 관리자에게 PIN 초기화를 요청하세요."
          : "이미 가입된 인사번호이고 PIN이 초기화되어 있습니다. 로그인 화면에서 새 PIN을 입력해 로그인하세요." });
      }
      await bump(store, ipKey, SIGNUP_WINDOW);
      const salt = randomBytes(16).toString("hex");
      const user = { id, name, dept, salt, pinHash: hashPin(pin, salt), createdAt: kstIso() };
      users.push(user);
      await store.setJSON(KEY_USERS, users);
      const saved = (await readUsers(store)).find((x) => x.id === id) || user; // 첫 가입자는 여기서 관리자가 됨
      return json(200, { ok: true, token: await issue(store, saved, !!body.value.remember), user: publicUser(saved) });
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      if (body.error) return json(400, { error: body.error });
      const id = normId(body.value.id), pin = String(body.value.pin || "");
      const ipKey = "rl/login/ip/" + clientIp(req, ip), idKey = "rl/login/id/" + id;
      if (await limited(store, ipKey, LOGIN_LIMIT * 3, LOGIN_WINDOW) || await limited(store, idKey, LOGIN_LIMIT, LOGIN_WINDOW)) {
        return json(429, { error: "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요." });
      }
      const admin = admins().find((a) => a.id === id);
      if (admin && safeEqual(admin.pin, pin)) {
        const user = { id, name: "관리자", dept: "", admin: true, env: true };
        return json(200, { ok: true, token: await issue(store, user, !!body.value.remember), user: publicUser(user) });
      }
      const remember = !!body.value.remember;
      const u = !admin && (await readUsers(store)).find((x) => x.id === id);
      // 관리자가 PIN을 초기화한 계정: 이번에 입력한 PIN을 새 PIN으로 정하고 로그인 (가입 정보는 그대로)
      if (u && !u.pinHash) {
        if (!PIN_RE.test(pin)) return json(400, { error: "PIN이 초기화된 계정입니다. 새로 쓸 PIN을 숫자 4~6자리로 입력해 주세요." });
        const users = await readUsers(store);
        const me = users.find((x) => x.id === id);
        me.salt = randomBytes(16).toString("hex");
        me.pinHash = hashPin(pin, me.salt);
        me.pinSetAt = kstIso();
        me.lastLogin = kstIso();
        await store.setJSON(KEY_USERS, users);
        return json(200, { ok: true, pinSet: true, token: await issue(store, me, remember), user: publicUser(me) });
      }
      if (u && safeEqual(u.pinHash, hashPin(pin, u.salt))) {
        const users = await readUsers(store);
        const me = users.find((x) => x.id === id);
        if (me) { me.lastLogin = kstIso(); await store.setJSON(KEY_USERS, users); }
        return json(200, { ok: true, token: await issue(store, me || u, remember), user: publicUser(me || u) });
      }
      await bump(store, ipKey, LOGIN_WINDOW);
      await bump(store, idKey, LOGIN_WINDOW);
      return json(401, { error: "인사번호 또는 PIN이 맞지 않습니다." });
    }

    /* 여기부터 로그인 필요 */
    const me = await currentUser(req, store);
    if (path.startsWith("/api/") && !me) return json(401, { error: "로그인이 필요합니다." });

    if (path === "/api/auth/me" && req.method === "GET") return json(200, { user: me });

    if (path === "/api/data" && req.method === "GET") {
      return json(200, await readCurrent(store));
    }

    if (path === "/api/data" && req.method === "POST") {
      const body = await readBody(req);
      if (body.error) return json(400, { error: body.error });
      const doc = body.value;
      const base = doc && typeof doc === "object" ? doc._base : undefined;
      if (doc && typeof doc === "object") delete doc._base;
      const err = validate(doc);
      if (err) return json(400, { error: err });
      const current = await readCurrent(store);

      if (!me.admin) {
        // 담당자: 본인 부서 지표의 현재값·상태·비고만 최신 자료에 반영 (다른 부서·기본 정보·문구는 무시)
        const { next, changed } = mergeForDept(current, doc, me.dept);
        if (!changed.length) return json(200, { ok: true, changed: [], updatedAt: (current.meta && current.meta.updatedAt) || null });
        const backupId = await archive(store, current, "저장 전 자료");
        next.meta.updatedAt = kstIso();
        next.meta.updatedBy = `${me.name} (${me.dept})`;
        await store.setJSON(KEY_CURRENT, next);
        return json(200, { ok: true, changed, backup: backupId, updatedAt: next.meta.updatedAt });
      }

      // 관리자: 전체 저장. 불러온 뒤 다른 사람이 저장했으면 409로 알려 화면에서 합치게 함
      const curStamp = (current.meta && current.meta.updatedAt) || "";
      if (base !== undefined && base !== curStamp) {
        return json(409, { error: "다른 담당자가 먼저 저장했습니다.", updatedAt: curStamp });
      }
      const backupId = await archive(store, current, "저장 전 자료");
      doc.meta.updatedAt = kstIso();
      doc.meta.updatedBy = me.name === "관리자" ? "관리자" : `${me.name} (관리자)`;
      await store.setJSON(KEY_CURRENT, doc);
      return json(200, { ok: true, backup: backupId, updatedAt: doc.meta.updatedAt });
    }

    /* 관리자 전용 */
    const adminOnly = ["/api/history", "/api/restore", "/api/users"];
    if (adminOnly.includes(path) && !me.admin) return json(403, { error: "관리자만 할 수 있습니다." });

    if (path === "/api/history" && req.method === "GET") {
      return json(200, { items: await readIndex(store) });
    }

    if (path === "/api/restore" && req.method === "POST") {
      const body = await readBody(req);
      if (body.error) return json(400, { error: body.error });
      const id = String((body.value && body.value.id) || "");
      if (!/^[0-9A-Za-z-]{8,40}$/.test(id)) return json(400, { error: "이력 번호가 올바르지 않습니다." });
      const snap = await store.get(`history/${id}`, { type: "json" });
      if (!snap) return json(404, { error: "해당 이력을 찾을 수 없습니다." });
      await archive(store, await readCurrent(store), "되돌리기 전 자료");
      snap.meta = snap.meta || {};
      snap.meta.updatedAt = kstIso();
      snap.meta.updatedBy = `${me.name} (이력 되돌리기)`;
      await store.setJSON(KEY_CURRENT, snap);
      return json(200, { ok: true, updatedAt: snap.meta.updatedAt });
    }

    if (path === "/api/users" && req.method === "GET") {
      const users = (await readUsers(store)).map((u) => ({ id: u.id, name: u.name, dept: u.dept, admin: !!u.admin, pinReset: !u.pinHash, createdAt: u.createdAt || null, lastLogin: u.lastLogin || null }));
      return json(200, { users, departments: departmentsOf(await readCurrent(store)) });
    }

    if (path === "/api/users" && req.method === "POST") {
      const body = await readBody(req);
      if (body.error) return json(400, { error: body.error });
      const { action } = body.value || {};
      const id = normId(body.value && body.value.id);
      const users = await readUsers(store);
      const i = users.findIndex((u) => u.id === id);
      if (i < 0) return json(404, { error: "가입자를 찾을 수 없습니다." });
      const lastAdmin = users[i].admin && users.filter((u) => u.admin).length === 1 && admins().length === 0;
      if (action === "resetPin") {
        users[i].pinHash = null;
        users[i].salt = null;
        users[i].pinResetAt = kstIso();
      } else if (action === "delete") {
        if (lastAdmin) return json(400, { error: "마지막 관리자는 삭제할 수 없습니다. 다른 가입자에게 관리자 권한을 먼저 주세요." });
        users.splice(i, 1);
      } else if (action === "update") {
        const name = String(body.value.name || "").trim().slice(0, 20);
        const dept = String(body.value.dept || "").trim();
        if (!name) return json(400, { error: "이름을 입력해 주세요." });
        if (!departmentsOf(await readCurrent(store)).includes(dept)) return json(400, { error: "부서를 목록에서 골라 주세요." });
        const admin = body.value.admin === undefined ? !!users[i].admin : !!body.value.admin;
        if (lastAdmin && !admin) return json(400, { error: "마지막 관리자의 권한은 뺄 수 없습니다. 다른 가입자에게 관리자 권한을 먼저 주세요." });
        users[i].name = name;
        users[i].dept = dept;
        users[i].admin = admin;
      } else {
        return json(400, { error: "알 수 없는 요청입니다." });
      }
      await store.setJSON(KEY_USERS, users);
      return json(200, { ok: true });
    }

    return json(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: "저장소 처리 중 오류가 발생했습니다.", detail: errInfo(e) });
  }
}
