# 밥찰칵 (mealsnap)

먹을 때 사진 한 장 찍으면 **시간과 함께 저장**만 하는 초경량 식단 기록 앱 (설치형 PWA, Android 대상).
조언·칼로리·통계·소셜 기능은 없습니다. "나는 언제 뭘 먹고 지내나"만 보여줍니다.

- 설계 문서: [docs/PLAN.md](docs/PLAN.md)
- 사용성·디자인 검토(체크리스트·페르소나·토의·재검증): [docs/REVIEW.md](docs/REVIEW.md)
- 상태: v1.0.0 — 촬영·오늘/달력/하루/타임라인·뷰어(확대)·백업/복원·용량 관리·보기 설정·하루 시작 시각, 접근성/성능 검토 반영

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

## Android 앱(APK)으로 설치

`android/dist/mealsnap-<버전>.apk` 를 폰으로 옮겨 설치합니다 (웹 배포 없이 동작, 인터넷 불필요).

1. APK 파일을 폰에 저장 (Claude 앱 첨부, 카톡 "나에게", Drive, USB 등)
2. 파일을 탭 → "출처를 알 수 없는 앱 설치" 허용 (해당 앱에 대해 1회)
3. Play Protect가 "알 수 없는 개발자" 경고를 띄우면 **계속/무시하고 설치**
4. 앱 실행 → 촬영 버튼 → 카메라 허용

- 앱 껍데기는 WebView 하나이고, 웹 앱 파일은 APK 안(`assets/www`)에 들어 있습니다. 카메라·갤러리 선택·백업 파일 저장(다운로드 폴더/공유)·뒤로가기만 네이티브가 처리합니다.
- **앱을 삭제하면 기록도 함께 지워집니다.** 삭제 전에 설정 > 백업을 만드세요. 업데이트는 같은 키(`android/mealsnap.keystore`)로 서명된 APK를 덮어 설치하면 기록이 유지됩니다.
- 직접 빌드: `sudo apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-21-jdk-headless` 후 `mealsnap/android/build.sh`. 버전은 `AndroidManifest.xml`의 `versionName`/`versionCode`.
- 키스토어 비밀번호(`mealsnap`)는 개인용 설치 파일 서명 용도라 저장소에 포함했습니다. 앱 스토어 배포에는 쓰지 마세요.
