# 해빗트래커

Google Drive의 `해빗트래커.xlsx`를 분석해 만든 설치형 정적 PWA입니다.

## 구성

- `index.html`: 앱 본체
- `manifest.webmanifest`: 설치형 PWA 매니페스트
- `service-worker.js`: 오프라인 캐시와 앱 업데이트
- `icons/`: 설치 아이콘
- `.github/workflows/pages.yml`: GitHub Pages 배포 워크플로

## 비공개 데이터

실제 습관, 할 일, 만다라트 데이터는 깃에 올리지 않습니다.

- 원본 엑셀: `source/habit-tracker.xlsx`
- 복원용 JSON: `private-data/habit-tracker-private-data.json`

두 경로는 `.gitignore`에 포함되어 있습니다.

폰에서 쓰는 순서:

1. GitHub Pages 주소로 접속
2. 브라우저 메뉴 또는 앱의 `설치` 버튼으로 홈 화면에 추가
3. 앱 실행 후 `복원`
4. `habit-tracker-private-data.json` 선택

복원 이후 데이터는 해당 기기의 브라우저 저장소에만 저장됩니다.

## 배포

이 저장소를 GitHub에 push한 뒤 `Settings > Pages > Source`를 `GitHub Actions`로 설정하면 배포됩니다.

GitHub Pages는 HTTPS를 제공하므로 폰에서 PWA 설치와 서비스워커 업데이트가 동작합니다.
