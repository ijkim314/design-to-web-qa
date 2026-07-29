# design-to-web-qa

디자인 PNG와 실제 퍼블리싱 화면(웹 페이지)의 시각적 차이 및 웹 접근성(WCAG)을 자동으로 비교/검사하는 QA 도구입니다.

## 동작 방식

1. `designs/` 폴더(또는 리포트에서 직접 업로드)의 디자인 PNG를 읽습니다.
2. Playwright(Chromium)로 실제 URL을 렌더링해 동일한 뷰포트/배율로 스크린샷을 캡처하고, 동시에 axe-core로 웹 접근성(WCAG 2.1 A/AA)을 스캔합니다.
3. 두 이미지를 pixelmatch로 비교해 diff 이미지를 만들고, 화면별 pass/fail을 판정합니다. 인접한 차이 픽셀들을 16px 셀 단위로 클러스터링해 하나의 영역(최대 30개)으로 묶고, 각 영역을 다음 중 하나로 자동 분류합니다.
   - **위치/간격 차이**: 영역을 살짝 이동시켰을 때 diff가 크게 줄어드는 경우
   - **퍼블리싱에만 존재/누락된 요소**: 한쪽은 단색·빈 배경인데 다른 쪽만 콘텐츠가 있는 경우
   - **색상 차이**: 평균 색상 거리가 임계값 이상인 경우
   - **콘텐츠 차이**: 위 어디에도 속하지 않는 경우 — 이 경우 OCR(Tesseract, 한국어+영어)로 두 영역의 텍스트를 다시 읽어, 텍스트가 같으면 폰트 렌더링 차이로 보고 리포트에서 제외하고, 다르면 인식된 텍스트를 그대로 보여줍니다.
4. React + MUI 기반 리포트를 생성합니다. 화면 탭으로 전환하며, 각 화면은 "슬라이더 오버레이"(디자인/퍼블리싱을 겹쳐서 드래그로 비교)와 "나란히 보기"(디자인/캡처/diff 3열, 불일치 영역을 빨간 박스+번호로 표시하고 위치/크기/diff 픽셀 수/추정 원인을 목록으로 나열) 두 가지 뷰로 볼 수 있고, 화면별 접근성 위반 목록(심각도·선택자·설명)도 함께 확인할 수 있습니다.

## 두 가지 사용 방식

- **정적 리포트 (CLI)**: `npm run qa`로 `qa.config.json`에 정의된 화면들을 일괄 비교하고, 서버 없이 더블클릭으로 여는 단일 HTML 리포트(`reports/<timestamp>/index.html`)를 만듭니다. CI(GitHub Actions)에서 자동 실행되어 GitHub Pages로 배포됩니다.
- **라이브 백엔드 모드**: 배포된 정적 리포트(또는 `npm run qa:dev` 로컬 개발 서버)에서 "QA 실행" 버튼으로 실시간 재실행이 가능합니다. `qa.config.json`에 없는 화면도 baseUrl·경로·디자인 이미지를 직접 입력해 즉석에서 비교할 수 있는 "직접입력 QA 실행" 기능을 제공하며, 여러 사용자가 동시에 접속해도 세션별로 실행 결과가 분리됩니다. 이 모드를 쓰려면 별도로 배포된 백엔드 서버가 필요합니다 (아래 [라이브 백엔드 배포](#라이브-백엔드-배포) 참고).

## 설치

```bash
npm install
```

(`postinstall`에서 Playwright Chromium 설치와 리포트 UI(`report-app/`) 빌드를 자동으로 수행합니다.)

## 설정

`qa.config.json`에서 비교할 화면을 정의합니다.

```json
{
  "baseUrl": "http://localhost:3000",
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 2 },
  "diffThreshold": 0.1,
  "failThresholdPercent": 0.5,
  "accessibility": {
    "enabled": true,
    "wcagTags": ["wcag2a", "wcag2aa"],
    "excludeRules": [],
    "failSeverities": ["critical", "serious"]
  },
  "screens": [
    { "name": "home", "designImage": "designs/home.png", "path": "/" }
  ]
}
```

- `viewport`: 전역 기본 캡처 해상도/배율. 화면별로 `screens[].viewport`로 오버라이드 가능. 디자인 PNG의 실제 크기(px)와 최대한 일치시켜야 오탐이 줄어듭니다. 모바일 디자인(예: 너비 393px)을 비교할 때는 해당 화면에 `viewport`를 반드시 오버라이드하세요 — 전역 기본값(PC 해상도)으로 캡처하면 완전히 다른 레이아웃이 비교됩니다. `deviceScaleFactor`도 디자인 PNG가 1x로 export됐는지 2x인지에 맞춰야 합니다(예: 디자인 너비가 393이면 1x이므로 `deviceScaleFactor: 1`).
- `diffThreshold`: pixelmatch의 픽셀 단위 색상 임계값 (0~1, 낮을수록 민감).
- `failThresholdPercent`: 전체 픽셀 대비 diff 비율(%)이 이 값을 넘으면 해당 화면을 FAIL로 판정.
- `accessibility`: 전역 접근성 검사 설정. `enabled`(기본 `true`), `wcagTags`(기본 `["wcag2a", "wcag2aa"]`), `excludeRules`(제외할 axe 규칙 id 목록), `failSeverities`(기본 `["critical", "serious"]` — 이 심각도 위반이 하나라도 있으면 화면을 FAIL 처리).
- `screens[].designImage`: `designs/` 폴더 내 PNG 경로.
- `screens[].path`: `baseUrl` 기준 상대 경로(비교할 실제 페이지).
- `screens[].fullPage`: 기본값 `false`(뷰포트 높이만 캡처). 디자인 PNG가 스크롤 전체 페이지를 담고 있다면(디자인 높이가 뷰포트 높이보다 큰 경우) `true`로 설정해 전체 페이지를 캡처해야 합니다.
- `screens[].accessibility`: 화면별 접근성 검사 오버라이드. `false`로 끄거나, `{ "enabled": true, "excludeRules": [...] }` 형태로 세부 조정 가능.

## 실행

```bash
npm run qa
```

완료되면 리포트가 기본 브라우저로 자동으로 열립니다 (`CI` 환경변수가 설정되어 있으면 열지 않습니다). 하나라도 FAIL(시각적 diff 초과 또는 접근성 위반)이면 프로세스가 exit code 1로 종료되어 CI 연동에 활용할 수 있습니다.

로컬에서 "QA 실행" 버튼으로 라이브 재실행을 테스트하려면:

```bash
npm run qa:dev
```

## 리포트 UI (`report-app/`)

리포트는 `report-app/`에 있는 React + MUI SPA를 빌드해 만들어집니다. `npm install` 시 자동 빌드되며, UI를 수정한 뒤에는 `npm run build:report-app`으로 다시 빌드해야 `npm run qa` 결과에 반영됩니다.

정적 리포트는 데이터가 HTML에 그대로 박혀있어 서버 없이 볼 수 있지만, 화면 우측 상단의 톱니바퀴(⚙) 아이콘으로 **원격 QA 백엔드 연결 설정**에서 토큰을 입력하면 같은 화면에서 라이브 기능이 켜집니다.

- **직접입력 QA 실행**: baseUrl과 화면(경로 + 디자인 PNG 업로드, 뷰포트/전체 페이지/접근성 검사 여부 선택)을 입력해 `qa.config.json`에 없는 화면도 즉석에서 비교합니다. 입력한 값은 브라우저에 저장돼(이미지는 IndexedDB, 나머지는 localStorage) 새로고침해도 유지됩니다.
- **개별 화면 새로고침**: 화면 목록의 새로고침 아이콘으로 해당 화면만 다시 캡처/비교합니다.
- **직접입력 화면 수정**: 직접입력으로 실행한 화면은 연필 아이콘으로 경로/이미지/뷰포트를 수정한 뒤 재실행할 수 있습니다.

## 라이브 백엔드 배포

라이브 모드는 Playwright(Chromium)를 실행할 별도의 백엔드 서버가 필요합니다. 이 프로젝트는 `Dockerfile` + `render.yaml`로 [Render](https://render.com)에 배포하도록 구성되어 있습니다.

- `QA_RUN_TOKEN` (필수): "QA 실행" 등 상태를 변경하는 API(`/api/run`, `/api/run-adhoc`, `/api/refresh`, `/api/update-screen`)를 호출할 때 `X-QA-Token` 헤더로 검증하는 공용 비밀번호입니다. 이 값이 없으면 서버가 시작되지 않습니다. 프론트엔드는 정적 공개 빌드라 토큰을 빌드에 심을 수 없으므로, 각 사용자가 리포트 UI의 설정 다이얼로그에서 직접 입력해 자신의 브라우저에만 저장합니다.
- `ALLOWED_ORIGIN`: CORS 허용 origin. 쉼표로 여러 개 지정 가능(기본값: `https://ijkim314.github.io`).
- `PORT`: 서버 포트 (기본 `5183`).
- `QA_MAX_CONCURRENT_CAPTURES`: 동시에 진행 가능한 캡처(Playwright) 개수 (기본 `1`). Render 무료 플랜(512MB RAM) 등 자원이 제한된 환경에서 여러 세션이 겹쳐도 메모리 부족으로 죽지 않도록 제한합니다. 초과 요청은 큐에서 순서대로 대기합니다.

사용자별 실행 결과는 브라우저 `sessionStorage`에 생성되는 세션 ID(`X-QA-Session` 헤더)로 서버에서 분리 관리되며, 2시간 이상 미사용 세션은 자동 정리됩니다.

## GitHub Pages 자동 배포

`.github/workflows/deploy.yml`이 `dev` 브랜치 push마다 `npm run qa`를 실행해 정적 리포트를 GitHub Pages에 배포합니다. QA가 FAIL이어도 리포트는 배포하되, 워크플로 자체는 실패 처리되어 알림이 가도록 구성되어 있습니다.

## 주의사항

- 디자인 PNG와 캡처 화면의 뷰포트 크기가 다르면 자동으로 겹치는 영역만 크롭해 비교하지만, 정확도를 위해서는 뷰포트를 디자인 PNG와 동일하게 맞추는 것을 권장합니다.
- 웹폰트 로딩 완료(`document.fonts.ready`) 및 애니메이션/트랜지션 비활성화 후 캡처하지만, 페이지 자체의 비동기 렌더링(지연 로딩 이미지 등)까지는 자동으로 기다리지 않습니다.
- 불일치 영역의 원인 분류("위치/간격 차이", "색상 차이" 등)와 OCR 텍스트 비교는 정밀한 비전 분석이 아니라 색상 평균/분산 기반 휴리스틱이므로 참고용으로만 활용하세요.
- 접근성 검사는 axe-core 기반 자동 스캔이라 WCAG 위반의 일부만 탐지하며, 자동화로 잡을 수 없는 항목(예: 대체 텍스트의 의미적 적절성)은 수동 검토가 필요합니다.
