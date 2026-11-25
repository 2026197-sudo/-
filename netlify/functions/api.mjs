// Netlify 서버리스 함수: 공용 처리(server/core.mjs)에 Netlify Blobs 저장소를 연결합니다.
import { getStore } from "@netlify/blobs";
import { handle } from "../../server/core.mjs";

export default async (req, context) => {
  let store;
  try {
    store = getStore({ name: "kmcu-kpi", consistency: "strong" });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "저장소에 연결할 수 없습니다.", detail: String(e && e.message) }), {
      status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return handle(req, { store, ip: context && context.ip, platform: "netlify" });
};

export const config = { path: "/api/*" };
