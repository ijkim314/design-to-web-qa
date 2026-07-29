# design-to-web-qa

디자인 PNG와 실제 퍼블리싱 화면(웹 페이지)의 시각적 차이 및 웹 접근성(WCAG)을 자동으로 비교/검사하는 QA 도구입니다. GitHub Pages에 배포된 리포트 페이지와, 실시간 재검사를 담당하는 공용 백엔드 서버(Render)로 구성되어 있어 팀원 누구나 브라우저만으로 접속해 사용합니다.

## 사용 방법

1. **리포트 페이지 접속**: `dev` 브랜치에 변경사항이 push될 때마다 자동으로 QA가 실행되고 GitHub Pages에 최신 리포트가 배포됩니다. 배포된 링크로 접속하면 화면별 PASS/FAIL, 시각적 diff, 접근성 위반 목록을 바로 확인할 수 있습니다.
2. **라이브 기능 켜기**: 화면 우측 상단의 톱니바퀴(⚙) 아이콘 → **원격 QA 백엔드 연결 설정**에서 토큰을 입력하면 "직접입력 QA 실행", "새로고침", "수정" 등 서버에 실제 요청을 보내는 기능이 켜집니다. 토큰은 팀 전체가 같은 값을 사용하는 공용 비밀번호로, 아무나 백엔드에 무거운 캡처 작업을 실행시키지 못하도록 막는 최소한의 잠금장치입니다. 토큰은 각자 브라우저에만 저장되고, 다른 사람의 실행 결과와 섞이지 않도록 접속자별로 세션이 자동 분리됩니다.
3. **직접입력 QA 실행**: `qa.config.json`에 등록되지 않은 화면도 baseUrl·상세 경로·디자인 PNG를 그 자리에서 입력해 즉석으로 비교할 수 있습니다(뷰포트/전체 페이지 캡처/접근성 검사 여부 선택 가능). 입력한 값은 브라우저에 저장되어(이미지는 IndexedDB, 나머지는 localStorage) 새로고침해도 유지됩니다.
4. **개별 화면 새로고침**: 화면 목록의 새로고침 아이콘으로 해당 화면만 다시 캡처/비교합니다.
5. **직접입력 화면 수정**: 직접입력으로 실행한 화면은 연필 아이콘으로 경로/이미지/뷰포트를 수정한 뒤 재실행할 수 있습니다.

리포트는 "슬라이더 오버레이"(디자인/퍼블리싱을 겹쳐서 드래그로 비교)와 "나란히 보기"(디자인/캡처/diff 3열, 불일치 영역을 빨간 박스+번호로 표시하고 위치/크기/diff 픽셀 수/추정 원인을 목록으로 나열) 두 가지 뷰를 제공합니다.

## 동작 방식

1. `designs/` 폴더(또는 리포트에서 직접 업로드한 이미지)의 디자인 PNG를 읽습니다.
2. Playwright(Chromium)로 실제 URL을 렌더링해 동일한 뷰포트/배율로 스크린샷을 캡처하고, 동시에 axe-core로 웹 접근성(WCAG 2.1 A/AA)을 스캔합니다.
3. 두 이미지를 pixelmatch로 비교해 diff 이미지를 만들고, 화면별 pass/fail을 판정합니다. 인접한 차이 픽셀들을 16px 셀 단위로 클러스터링해 하나의 영역(최대 30개)으로 묶고, 각 영역을 다음 중 하나로 자동 분류합니다.
   - **위치/간격 차이**: 영역을 살짝 이동시켰을 때 diff가 크게 줄어드는 경우
   - **퍼블리싱에만 존재/누락된 요소**: 한쪽은 단색·빈 배경인데 다른 쪽만 콘텐츠가 있는 경우
   - **색상 차이**: 평균 색상 거리가 임계값 이상인 경우
   - **콘텐츠 차이**: 위 어디에도 속하지 않는 경우 — 이 경우 OCR(Tesseract, 한국어+영어)로 두 영역의 텍스트를 다시 읽어, 텍스트가 같으면 폰트 렌더링 차이로 보고 리포트에서 제외하고, 다르면 인식된 텍스트를 그대로 보여줍니다.
4. React + MUI 기반 리포트를 생성합니다.

## 배포 구조

- **프론트엔드(리포트 페이지)**: `.github/workflows/deploy.yml`이 `dev` 브랜치 push마다 QA를 실행해 정적 리포트를 GitHub Pages에 배포합니다. QA가 FAIL이어도 리포트는 배포하되, 워크플로 자체는 실패 처리되어 알림이 가도록 구성되어 있습니다.
- **백엔드(라이브 실행 서버)**: 리포트 페이지의 "직접입력 QA 실행"·"새로고침"·"수정" 기능은 `Dockerfile` + `render.yaml`로 [Render](https://render.com)에 배포된 공용 백엔드 서버가 처리합니다. 이 서버가 실제로 Playwright를 띄워 캡처하므로, 여러 명이 몰려도 서버가 죽지 않도록 다음과 같이 보호되어 있습니다.
  - `QA_RUN_TOKEN`: 상태를 변경하는 API(`/api/run-adhoc`, `/api/refresh`, `/api/update-screen` 등)를 호출할 때 `X-QA-Token` 헤더로 검증하는 공용 비밀번호. 프론트엔드는 정적 공개 빌드라 토큰을 빌드에 심을 수 없으므로, 각 사용자가 리포트 페이지 설정 다이얼로그에서 직접 입력합니다.
  - `X-QA-Session`: 접속자(브라우저)별로 자동 생성되는 세션 ID. 여러 사용자가 동시에 접속해도 서버가 실행 결과를 세션별로 분리 관리하며, 2시간 이상 미사용 세션은 자동 정리됩니다.
  - `QA_MAX_CONCURRENT_CAPTURES`: 동시에 진행 가능한 캡처(Playwright) 개수 (기본 `1`). Render 무료 플랜(512MB RAM)처럼 자원이 제한된 환경에서 여러 세션의 요청이 겹쳐도 메모리 부족으로 죽지 않도록, 초과 요청은 큐에서 순서대로 대기시킵니다.
  - `ALLOWED_ORIGIN`: CORS 허용 origin(쉼표로 여러 개 지정 가능).

## 정식 비교 화면 목록 관리 (`qa.config.json`)

매 배포마다 자동으로 비교되는 화면 목록은 저장소의 `qa.config.json`에 정의되어 있습니다. 새 화면을 정식으로 추가/수정하려면 이 파일을 고쳐 `dev` 브랜치에 push하면 됩니다(리포트에서 "직접입력"으로 실행하는 것은 임시 확인용이며 이 파일에는 반영되지 않습니다).

```json
{
  "baseUrl": "https://example.com",
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

## 주의사항

- 디자인 PNG와 캡처 화면의 뷰포트 크기가 다르면 자동으로 겹치는 영역만 크롭해 비교하지만, 정확도를 위해서는 뷰포트를 디자인 PNG와 동일하게 맞추는 것을 권장합니다.
- 웹폰트 로딩 완료(`document.fonts.ready`) 및 애니메이션/트랜지션 비활성화 후 캡처하지만, 페이지 자체의 비동기 렌더링(지연 로딩 이미지 등)까지는 자동으로 기다리지 않습니다.
- 불일치 영역의 원인 분류("위치/간격 차이", "색상 차이" 등)와 OCR 텍스트 비교는 정밀한 비전 분석이 아니라 색상 평균/분산 기반 휴리스틱이므로 참고용으로만 활용하세요.
- 접근성 검사는 axe-core 기반 자동 스캔이라 WCAG 위반의 일부만 탐지하며, 자동화로 잡을 수 없는 항목(예: 대체 텍스트의 의미적 적절성)은 수동 검토가 필요합니다.
- 백엔드는 Render 무료 플랜으로 운영되어 동시 캡처 개수가 제한되어 있으므로, 여러 명이 한꺼번에 "직접입력 QA 실행"을 돌리면 요청이 순서대로 대기할 수 있습니다.

## 로컬 개발 (코드/설정을 수정하는 경우)

이 저장소를 직접 수정·테스트하려면:

```bash
npm install   # postinstall에서 Playwright Chromium 설치 + report-app 빌드까지 자동 수행
npm run qa    # qa.config.json 기준으로 로컬에서 QA를 실행하고 reports/ 아래 정적 리포트 생성
npm run qa:dev  # report-app을 로컬 서버로 띄워 "QA 실행" 등 라이브 기능까지 테스트
```

`report-app/` UI를 수정한 뒤에는 `npm run build:report-app`으로 다시 빌드해야 `npm run qa` 결과물에 반영됩니다.
