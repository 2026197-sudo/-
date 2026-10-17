# 계명문화대학교 AI 사업단 성과관리 대시보드 — Netlify 배포용

접속 코드나 수정 PIN 없이, **링크를 아는 누구나** 대시보드를 보고 실적을 입력할 수 있는 버전입니다.
GitHub 저장소에 올리고 Netlify에 연결하면 자동으로 배포됩니다. 별도 서버나 프로그램 설치가 필요 없습니다.

## 1. 배포하기 (처음 한 번, 약 10분)

### ① GitHub에 올리기
1. https://github.com 로그인 → 오른쪽 위 **+ → New repository**
2. Repository name: 예) `kmcu-kpi-dashboard` · **Private(비공개)** 선택 권장 → **Create repository**
3. 새 저장소 화면에서 **uploading an existing file** 클릭
4. 압축을 푼 `kmcu-kpi-netlify` 폴더 **안의 내용 전체**(`netlify.toml`, `package.json`, `public`, `netlify` 폴더 등)를 끌어다 놓기
   - 폴더째가 아니라 **폴더 안의 파일들**을 올려야 `netlify.toml`이 맨 위(루트)에 놓입니다.
5. 아래 **Commit changes** 클릭

### ② Netlify에 연결하기
1. https://app.netlify.com 접속 → **GitHub 계정으로 로그인**
2. **Add new site(또는 Add new project) → Import an existing project → GitHub**
3. 방금 만든 저장소 선택 (처음이면 Netlify가 GitHub 저장소 접근 권한을 요청합니다 → 허용)
4. 설정 화면은 `netlify.toml`이 자동으로 채우니 **그대로 두고 Deploy** 클릭
   - Publish directory: `public` · Functions directory: `netlify/functions`
5. 1~2분 뒤 `https://<임의이름>.netlify.app` 주소가 생깁니다.
   - **Site configuration → Change site name**에서 예) `kmcu-kpi`로 바꾸면 `https://kmcu-kpi.netlify.app`

### ③ 확인
- `https://주소/` → 대시보드
- `https://주소/admin.html` → 실적 입력 (PIN 없이 바로 열림)
- 실적을 한 번 저장해 보고, 다른 PC·휴대폰에서 대시보드에 반영되는지 확인하세요(최대 1분).

## 2. 쓰는 법

| 기능 | 방법 |
|---|---|
| 현황 보기 | 대시보드 주소 접속 (1분마다 자동 갱신) |
| 실적 입력 | 메뉴의 **실적 입력** → 입력자 이름 적기(필수) → 값 수정 → **저장하기** |
| 잘못 저장했을 때 | 실적 입력 화면 아래 **변경 이력** → 원하는 시점의 **이 시점으로 되돌리기** |
| 요약보고 | 대시보드 오른쪽 위 **AI 요약보고서** → 공유하기 / PDF 저장 / 출력 |

- 입력자 이름은 기기에 기억되어 다음부터 자동으로 채워집니다.
- 저장·되돌리기를 할 때마다 직전 자료가 **변경 이력에 최근 100개까지** 자동 보관됩니다. 되돌리기도 이력에 남으므로 다시 되돌릴 수 있습니다.
- 상태 값: **실적**(진척률 계산) · **측정 전**(학년도 말 조사 등, 진척률 미표시) · **미입력**(지수 계산에서 0)

## 3. 자료는 어디에 저장되나요?

- 웹에서 입력한 실적은 **Netlify Blobs**(이 사이트 전용 저장소)에 저장됩니다. Netlify 무료 플랜에 포함되어 있고 따로 설정할 것이 없습니다.
- `netlify/lib/seed.mjs`와 `public/data.json`은 **처음 배포했을 때의 기본 자료**(2026 2분기 실적)입니다.
  - 웹에서 한 번이라도 저장한 뒤에는 저장소의 자료가 우선입니다. GitHub의 이 파일들을 고쳐도 웹 자료가 덮어써지지 않습니다.
  - 저장소에 일시적으로 연결하지 못하면 대시보드는 `public/data.json`을 **읽기 전용**으로 보여 줍니다.
- 정기 보관이 필요하면 실적 입력 화면의 **현재 자료 내려받기(JSON)**로 분기마다 파일을 받아 두세요.

## 4. 화면·문구를 고치고 싶을 때

GitHub 저장소에서 파일을 열어 연필(✏️) 아이콘으로 수정 → **Commit changes**하면 Netlify가 1~2분 안에 자동으로 다시 배포합니다.

| 고칠 내용 | 위치 |
|---|---|
| 유의사항·일정·정리 필요 사항 문구, 색상 구간(30·60·90%) | 첫 배포 **전**에 `netlify/lib/seed.mjs`와 `public/data.json`을 같은 내용으로 수정하세요. 배포 후에는 웹 저장소 자료에 들어 있어 실적 입력 화면에서는 아직 고칠 수 없습니다(필요하면 편집 화면을 추가할 수 있습니다). |
| 디자인 | `public/css/style.css` |
| 로고 | `public/img/logo.png` (같은 이름으로 교체) |

## 5. 계산 방식 (자율성과지표 정의서 기준)

- 세부지표 진척률 = 현재값 ÷ 2차년도('26) 목표 × 100
- 혁신지수 = Σ (현재값 ÷ 3차년도('27) 목표 × 100 × 반영비중)
- 지수 진척률 = 현재 지수 ÷ 2차년도 목표 지수 × 100 · 전체 평균 = 4개 지수 진척률 평균
- 색상: 90% 이상 우수 · 60~90% 양호 · 30~60% 주의 · 30% 미만 부진
- 도넛 위 눈금: 실적 기준일(현재 2026.08.31)까지의 측정기간 경과율(참고)

## 6. 공개 범위 안내 (꼭 읽어 주세요)

- 이 버전은 **로그인 없이 링크를 아는 누구나 보고 수정**할 수 있습니다. 링크는 사업단 내부에만 공유하세요.
- 검색엔진에는 노출되지 않도록 설정되어 있습니다(noindex). 다만 링크가 외부로 전달되면 누구나 열 수 있습니다.
- 누군가 잘못 수정해도 **변경 이력**으로 되돌릴 수 있습니다.
- 나중에 접근을 제한하고 싶다면 Netlify의 사이트 비밀번호 보호(유료 플랜) 기능을 켜거나, 학교 내부망 전용 버전(`kmcu-kpi`, PIN 방식)을 쓰는 방법이 있습니다.

## 7. 폴더 구성

```
kmcu-kpi-netlify/
├─ netlify.toml              Netlify 배포 설정 (자동 인식)
├─ package.json              서버리스 함수가 쓰는 패키지(@netlify/blobs) — Netlify가 자동 설치
├─ netlify/
│  ├─ functions/api.mjs      자료 조회·저장·변경 이력·되돌리기 API (/api/*)
│  └─ lib/seed.mjs           첫 배포용 기본 자료
└─ public/                   화면 (index.html, admin.html, css, js, img, data.json)
```

## 8. 배포가 안 될 때

- Netlify **Deploys** 탭에서 실패한 배포를 눌러 로그를 확인하세요.
- `netlify.toml`이 저장소 **맨 위(루트)**에 있는지 확인하세요. 폴더째 올렸다면 Netlify 설정의 **Base directory**에 그 폴더 이름(예: `kmcu-kpi-netlify`)을 적으면 됩니다.
- 대시보드에 "읽기 전용" 배너가 계속 뜨면 Netlify **Logs → Functions → api**에서 오류를 확인하세요.
