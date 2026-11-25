// Vercel 서버리스 함수: 공용 처리(server/core.mjs)에 Upstash Redis 저장소를 연결합니다.
// Vercel 프로젝트의 Storage 에서 Upstash for Redis 를 연결하면 아래 환경 변수가 자동으로 생깁니다.
//   KV_REST_API_URL / KV_REST_API_TOKEN  또는  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
import { handle } from "../server/core.mjs";

const PREFIX = "kmcu-kpi:";

function redisStore() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    const e = new Error("Vercel 프로젝트에 Upstash Redis 저장소가 연결되지 않았습니다 (Storage → Upstash for Redis → Connect).");
    e.name = "StoreNotConfigured";
    throw e;
  }
  async function cmd(args) {
    const res = await fetch(url.replace(/\/+$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error("Redis 오류: " + (body.error || res.status));
    return body.result;
  }
  return {
    async get(key, o = {}) {
      const v = await cmd(["GET", PREFIX + key]);
      if (v === null || v === undefined) return null;
      return o.type === "json" ? JSON.parse(v) : v;
    },
    async set(key, value) { await cmd(["SET", PREFIX + key, String(value)]); },
    async setJSON(key, value) { await cmd(["SET", PREFIX + key, JSON.stringify(value)]); },
    async delete(key) { await cmd(["DEL", PREFIX + key]); },
  };
}

async function run(req) {
  const url = new URL(req.url);
  // vercel.json 이 /api/<경로> 를 /api?__p=<경로> 로 넘겨 줍니다
  const p = url.searchParams.get("__p");
  const path = p !== null ? "/api/" + p : url.pathname;
  let store;
  try {
    store = redisStore();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "저장소에 연결할 수 없습니다.", detail: e.message }), {
      status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return handle(req, { store, path, platform: "vercel" });
}

export function GET(req) { return run(req); }
export function POST(req) { return run(req); }
