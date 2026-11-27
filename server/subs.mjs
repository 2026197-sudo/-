// 세부운영지수(세부지표를 이루는 항목)와 담당자·문서번호(증빙)
// 출처: 2026학년도 전문대학 혁신지원사업 자율성과지표 세부지수 현황
// 저장된 자료에 세부운영지수가 없으면 처음 한 번 이 표를 넣습니다(meta.subsSource 로 표시).
export const SUBS_SOURCE = "2026 자율성과지표 세부지수 현황";

// 문서번호(증빙)와 비고는 한 칸(note)으로 씁니다
const S = (id, name, value, dept, owner, evidence = "", note = "") => ({ id, name, value, dept, owner, note: [evidence, note].filter(Boolean).join("\n") });

export const TEMPLATE = {
  f1: { subs: [
    S("f1a", "마이크로디그리 운영 건수", 5, "학사운영팀", "심임도", "",
      "트랙명: 고령친화 헬스케어 전문가 과정 / 디지털 헬스케어 코디네이터 과정 / 시니어라이프케어과정 / 파크골프 전문스포츠 지도자과정 / 당구 전문스포츠 지도자과정"),
    S("f1b", "나노디그리 운영 건수", null, "학사운영팀", "심임도"),
    S("f1c", "융합전공 운영 건수", 1, "학사운영팀", "심임도", "", "기획팀과 협의 필요(웰니스)"),
  ] },
  f2: { subs: [
    S("f2a", "AI셀터디(15시간 이상 이수) 학생", 7, "교수학습지원센터", "권민지", "교수학습지원센터-123(2026.04.08.)", "프로그램 운영 중으로 현재값 도출이 어려움"),
    S("f2b", "AI적응형 교과 참여 학생 수", 116, "교수학습지원센터", "김은영", "",
      "2학기 AI코치헬스케어용어(강민아 교수 30명), 보건의료법규(이경은 교수 01분반 44명, 02분반 42명) 교과목 운영 중이며 교과 참여 학생이 지표값"),
  ] },
  f3: { owner: "전효빈", value: 82.3 },
  s1: { owner: "이혜영", value: 505, evidence: "2026.07.10 공문(8.31 기준)", note: "첨부파일 참조" },
  s2: { calc: "ratio", subs: [
    S("s2a", "(A) 재학인원 (2026.4.1.)", 4581, "학사운영팀", "", "", "정보공시 참고"),
    S("s2b", "(B) 재학인원 (2026.10.1.)", 4154, "학사운영팀", "", "", "정보공시 참고"),
  ] },
  g1: { subs: [
    S("g1a", "정규 캡스톤 운영 건수", 6, "학사운영팀", "박현숙",
      "1. 컴퓨터전기학부: 통합정보시스템-20260430-002 / 통합정보시스템-20260611-003\n2. 해외서비스경영과: 통합정보시스템-20260427-026 / 통합정보시스템-20260709-004\n3. 유아교육과: 통합정보시스템-20261007-024\n4. 생활체육학부: 통합정보시스템-20261020-008\n5. 반려동물보건과: 통합정보시스템-20261027-008\n6. 행정복지학과: 20261030-002"),
    S("g1b", "비정규 캡스톤 운영 건수", 5, "학사운영팀", "박현숙",
      "1. 문화융합자율전공과(주간): 20260402-003 / 통합정보시스템-20260617-004\n2. 기계과: 통합정보시스템-20260624-001 / 통합정보시스템-20260726-001\n3. 디자인융합학부: 기획팀-436(2026.05.15.) / 기획팀-1259(2026.10.20.)\n4. 문화융합자율전공과: 통합정보시스템-20261007-029\n5. (학과명 확인 필요): 20261027-001"),
    S("g1c", "현장실습 운영 건수(명)", 1180, "현장실습지원센터", "김지영", "", "1학기 결과와 2학기 계획 인원 포함(확정 실적 확인 필요)"),
  ] },
  g2: { evidence: "학사운영팀-482(2026.04.16.), 학사운영팀-489(2026.04.16.), 학사운영팀-596(2026.05.04.)", subs: [
    S("g2a", "교양 학점인정 인원", 403, "학사운영팀", "박혜민"),
    S("g2b", "전공 학점인정 인원(유교과 포함)", 111, "학사운영팀", "박혜민"),
    S("g2c", "기타 학점인정 (항목명 확인 필요)", 1, "학사운영팀", "박혜민"),
    S("g2d", "유아교육과 전공 학점인정", 99, "학사운영팀", "박혜민"),
    S("g2e", "외국인 유학생 학점인정 인원", 55, "학사운영팀", "박혜민"),
  ] },
  g3: { owner: "전효빈" },
  r1: { owner: "전효빈" },
  r2: { subs: [
    S("r2a", "공동교과목 개발 건수", 1, "기획팀", "전효빈", "", "생활속의 AI윤리이야기"),
    S("r2b", "학점교류 건수", 2, "학사운영팀", "심임도", "", "교비 2건(유한대, 한림성심대)"),
    S("r2c", "인적자원 공유", null, "기획팀", "전효빈"),
    S("r2d", "교육공간 공유", 81, "교육환경지원팀", "정건식", "결의서관리-교비(비등록)-수입결의서(교육환경지원팀)-제정: 5322-01"),
  ] },
  r3: { owner: "전효빈", value: 23 },
};

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/* 세부운영지수로 지표 현재값 계산: 합계(기본) 또는 비율(B ÷ A × 100) */
export function subsValue(it) {
  const subs = Array.isArray(it.subs) ? it.subs : [];
  const vals = subs.map((s) => numOrNull(s.value));
  if (!vals.some((v) => v !== null)) return undefined; // 입력된 세부값이 없으면 지표 값을 그대로 둠
  if (it.calc === "ratio") {
    const [a, b] = vals;
    return a && b !== null ? Math.round((b / a) * 1000) / 10 : null;
  }
  return Math.round(vals.reduce((s, v) => s + (v || 0), 0) * 100) / 100;
}

/* 세부값이 있으면 지표 현재값을 다시 계산하고, 미입력이던 지표는 실적으로 바꿈 */
export function applySubs(it) {
  const v = subsValue(it);
  if (v === undefined) return;
  it.current = v;
  if (it.status === "missing" && v !== null) it.status = "actual";
}

/* 저장된 자료에 세부운영지수 표를 한 번 넣음 */
export function migrateSubs(doc) {
  if (!doc || !doc.meta || doc.meta.subsSource === SUBS_SOURCE) return false;
  (doc.indices || []).forEach((ix) => (ix.items || []).forEach((it) => {
    const t = TEMPLATE[it.id];
    if (!t) return;
    if (t.subs && !(Array.isArray(it.subs) && it.subs.length)) it.subs = t.subs.map((s) => ({ ...s }));
    if (t.calc) it.calc = t.calc;
    if (t.owner && !it.owner) it.owner = t.owner;
    const tn = [t.evidence, t.note].filter(Boolean).join("\n");
    if (tn && !String(it.note || "").includes(tn)) it.note = [tn, it.note].filter(Boolean).join("\n");
    if (t.value !== undefined) it.current = t.value;
    applySubs(it);
  }));
  doc.meta.subsSource = SUBS_SOURCE;
  return true;
}

/* 예전 자료의 문서번호(evidence) 칸을 비고(note) 칸으로 합침 (여러 번 실행해도 같음) */
export function mergeEvidence(doc) {
  const join = (o) => {
    if (!o || !o.evidence) { if (o) delete o.evidence; return; }
    if (!String(o.note || "").includes(o.evidence)) o.note = [o.evidence, o.note].filter(Boolean).join("\n");
    delete o.evidence;
  };
  (doc.indices || []).forEach((ix) => (ix.items || []).forEach((it) => { join(it); (it.subs || []).forEach(join); }));
}
