# 밥찰칵 (mealsnap)

먹을 때 사진 한 장 찍으면 **시간과 함께 저장**만 하는 초경량 식단 기록 앱 (설치형 PWA, Android 대상).
조언·칼로리·통계·소셜 기능은 없습니다. "나는 언제 뭘 먹고 지내나"만 보여줍니다.

- 설계 문서: [docs/PLAN.md](docs/PLAN.md)
- 상태: v0.1.0 — 촬영/달력/하루/타임라인/뷰어/백업·복원/용량 관리 구현

## 실행

빌드 없이 정적 파일만 사용합니다.

```bash
cd mealsnap && python3 -m http.server 8123   # http://localhost:8123
```

카메라는 HTTPS 또는 localhost에서만 동작합니다. 폰에서는 GitHub Pages 주소(`.../mealsnap/`)로 접속해 Chrome 메뉴 → "홈 화면에 추가"로 설치하세요.

## 구조

- `index.html`, `styles.css`, `manifest.webmanifest`, `service-worker.js`
- `src/db.js` IndexedDB / `src/image.js` 축소·WebP / `src/camera.js` 앱 내 촬영
- `src/viewer.js` 전체 슬라이드 뷰어 / `src/backup.js` ZIP 백업·복원 / `src/storage.js` 용량 관리
- `src/views/` 달력·하루·타임라인·설정

## 데이터

사진은 기기 안(IndexedDB)에만 저장되며 서버로 전송되지 않습니다. 백업 ZIP은 git에 올리지 마세요(`.gitignore` 처리됨).
