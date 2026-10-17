// 계명문화대학교 AI 사업단 성과관리 — Netlify 서버리스 API
//   GET  /api/data      현재 자료
//   POST /api/data      자료 저장 (이전 자료는 변경 이력에 자동 보관)
//   GET  /api/history   변경 이력 목록 (최근 순)
//   POST /api/restore   변경 이력의 특정 시점으로 되돌리기  { "id": "..." }
// 자료는 Netlify Blobs(사이트 전용 저장소)에 저장됩니다. 별도 설정이나 로그인은 필요 없습니다.
import { getStore } from "@netlify/blobs";
import seed from "../lib/seed.mjs";

const STORE_NAME = "kmcu-kpi";
const KEY_CURRENT = "current";
const KEY_INDEX = "history-index";
const MAX_BODY = 1024 * 1024; // 1MB
const KEEP_HISTORY = 100;

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
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString(); // 2026-10-17T10:20:30.123Z
  const stamp = k.slice(0, 10).replace(/-/g, "") + "-" + k.slice(11, 19).replace(/:/g, "") + k.slice(20, 23);
  return stamp + "-" + Math.random().toString(36).slice(2, 6);
}

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
  return null;
}

async function readCurrent(store) {
  return (await store.get(KEY_CURRENT, { type: "json" })) || seed;
}

async function readIndex(store) {
  const idx = await store.get(KEY_INDEX, { type: "json" });
  return Array.isArray(idx) ? idx : [];
}

// 지금 자료를 변경 이력에 보관하고 목록을 갱신
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
  const keep = idx.slice(0, KEEP_HISTORY);
  for (const old of idx.slice(KEEP_HISTORY)) {
    try { await store.delete(`history/${old.id}`); } catch (e) { /* 무시 */ }
  }
  await store.setJSON(KEY_INDEX, keep);
  return id;
}

async function readBody(req) {
  const text = await req.text();
  if (!text || text.length > MAX_BODY) return { error: "요청 크기가 올바르지 않습니다." };
  try { return { value: JSON.parse(text) }; } catch (e) { return { error: "JSON 형식이 아닙니다." }; }
}

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  try {
    if (path === "/api/data" && req.method === "GET") {
      return json(200, await readCurrent(store));
    }

    if (path === "/api/data" && req.method === "POST") {
      const body = await readBody(req);
      if (body.error) return json(400, { error: body.error });
      const doc = body.value;
      const err = validate(doc);
      if (err) return json(400, { error: err });
      const backupId = await archive(store, await readCurrent(store), "저장 전 자료");
      doc.meta.updatedAt = kstIso();
      await store.setJSON(KEY_CURRENT, doc);
      return json(200, { ok: true, backup: backupId, updatedAt: doc.meta.updatedAt });
    }

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
      const who = String((body.value && body.value.by) || "").slice(0, 40);
      snap.meta = snap.meta || {};
      snap.meta.updatedAt = kstIso();
      snap.meta.updatedBy = (who ? who + " · " : "") + "이력 되돌리기";
      await store.setJSON(KEY_CURRENT, snap);
      return json(200, { ok: true, updatedAt: snap.meta.updatedAt });
    }

    return json(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "저장소 처리 중 오류가 발생했습니다." });
  }
};

export const config = { path: "/api/*" };
