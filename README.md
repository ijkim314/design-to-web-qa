# figma-to-web-qa

디자인 PNG와 실제 퍼블리싱 화면(웹 페이지)의 시각적 차이를 자동으로 비교하는 QA 도구입니다.

## 동작 방식

1. `designs/` 폴더에 미리 export해둔 디자인 PNG를 읽습니다.
2. Playwright로 실제 URL을 렌더링해 동일한 뷰포트/배율로 스크린샷을 캡처합니다.
3. 두 이미지를 pixelmatch로 비교해 차이 영역을 diff 이미지로 만들고, 화면별 pass/fail을 판정합니다.
4. `reports/<timestamp>/index.html`에 React + MUI 기반 리포트를 생성합니다. 화면 탭으로 전환하며, 각 화면은 "슬라이더 오버레이"(디자인/퍼블리싱을 겹쳐서 드래그로 비교)와 "나란히 보기"(디자인/캡처/diff 3열, 불일치 영역을 빨간 박스+번호로 표시하고 위치/크기/diff 픽셀 수를 목록으로 나열) 두 가지 뷰로 볼 수 있습니다. 리포트는 서버 없이 파일을 더블클릭해서 바로 열 수 있는 단일 HTML 파일입니다.

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
  "screens": [
    { "name": "home", "designImage": "designs/home.png", "path": "/" }
  ]
}
```

- `viewport`: 전역 기본 캡처 해상도/배율. 화면별로 `screens[].viewport`로 오버라이드 가능. 디자인 PNG의 실제 크기(px)와 최대한 일치시켜야 오탐이 줄어듭니다.
- `diffThreshold`: pixelmatch의 픽셀 단위 색상 임계값 (0~1, 낮을수록 민감).
- `failThresholdPercent`: 전체 픽셀 대비 diff 비율(%)이 이 값을 넘으면 해당 화면을 FAIL로 판정.
- `screens[].designImage`: `designs/` 폴더 내 PNG 경로.
- `screens[].path`: `baseUrl` 기준 상대 경로(비교할 실제 페이지).

## 실행

```bash
npm run qa
```

완료되면 리포트가 기본 브라우저로 자동으로 열립니다 (`CI` 환경변수가 설정되어 있으면 열지 않습니다). 하나라도 FAIL이면 프로세스가 exit code 1로 종료되어 CI 연동에 활용할 수 있습니다.

## 리포트 UI (`report-app/`)

리포트는 `report-app/`에 있는 React + MUI SPA를 빌드해 만들어집니다. `npm install` 시 자동 빌드되며, UI를 수정한 뒤에는 `npm run build:report-app`으로 다시 빌드해야 `npm run qa` 결과에 반영됩니다.

## 주의사항

- 디자인 PNG와 캡처 화면의 뷰포트 크기가 다르면 자동으로 겹치는 영역만 크롭해 비교하지만, 정확도를 위해서는 뷰포트를 디자인 PNG와 동일하게 맞추는 것을 권장합니다.
- 웹폰트 로딩 완료(`document.fonts.ready`) 및 애니메이션/트랜지션 비활성화 후 캡처하지만, 페이지 자체의 비동기 렌더링(지연 로딩 이미지 등)까지는 자동으로 기다리지 않습니다.
- 이 도구는 "차이 영역이 어디에 있는지"까지만 박스로 표시하며, 색상/폰트/간격 중 무엇이 다른지 원인 분류는 하지 않습니다.
- 불일치 영역은 16px 단위 셀로 묶어 인접한 차이들을 하나의 박스로 합칩니다 (`src/compare.ts`의 `findDiffRegions`). 너무 작은 차이(안티앨리어싱 수준)는 노이즈로 간주해 제외되고, 화면당 최대 30개 영역까지만 표시됩니다.
