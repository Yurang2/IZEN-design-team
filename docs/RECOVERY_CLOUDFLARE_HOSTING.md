# Cloudflare 호스팅 복구 가이드

이 문서는 이 저장소를 **Cloudflare 호스팅** 기준으로 빠르게 복구하기 위한 런북입니다.

## 1) 기준 스냅샷 고정

- 권장 기준 커밋: `cc49e356876693ed8e1050ffe493ed726691146a` (`main`)
- 운영 복구 시 먼저 이 커밋으로 체크아웃해서 시작합니다.

```bash
git fetch origin
git checkout main
git pull origin main
git checkout cc49e356876693ed8e1050ffe493ed726691146a
```

## 2) Worker 복구 (Cloudflare Workers)

대상:
- Worker 이름: `izen-design-api`
- 설정 파일: `worker/wrangler.toml`

필수 Secrets (Production):
- `NOTION_TOKEN`
- `NOTION_TASK_DB_ID`
- `NOTION_PROJECT_DB_ID`

체크리스트 기능 복구 시 추가:
- `NOTION_CHECKLIST_DB_ID`

선택 Vars:
- `API_CACHE_TTL_SECONDS=60`

CLI 배포:
```bash
npm install
npm run deploy:worker
```

검증:
- `https://<worker-subdomain>.workers.dev/api/projects`
- JSON 응답이 나오면 정상

## 3) Front 복구 (Cloudflare Pages)

대상:
- Pages 프로젝트: `izen-design-team`
- 브랜치: `main`

Build 설정:
- Build command: `npm run build`
- Build output directory: `dist`

환경변수 (Preview/Production 둘 다 권장):
- `VITE_API_BASE_URL=https://<worker-subdomain>.workers.dev/api`

반영:
- 변수 저장 후 `Retry deployment` 또는 새 배포 실행
- 필요 시 `Clear build cache` 후 재배포

검증:
- `https://izen-design-team.pages.dev/`
- 앱에서 API 에러 없이 프로젝트/업무 목록 로딩

## 4) 빠른 장애 진단

증상: `config_missing`  
조치: Worker Secrets 누락 여부 확인

증상: `API가 JSON 대신 HTML을 반환`  
조치:
- Pages의 `VITE_API_BASE_URL` 확인
- Pages 재배포
- 브라우저 강력 새로고침 (`Ctrl+Shift+R`)

증상: 주소에 `/api/projects` 붙였는데 HTML 반환  
조치:
- `pages.dev` 주소인지 `workers.dev` 주소인지 확인
- API 검증은 반드시 `https://...workers.dev/api/projects`

## 5) 완전 복구 체크리스트

- [ ] Git 커밋 해시 고정 (`cc49e356...`)
- [ ] Worker Secrets 입력 완료
- [ ] Worker 배포 성공 확인
- [ ] Worker `/api/projects` JSON 확인
- [ ] Pages `VITE_API_BASE_URL` 입력 완료
- [ ] Pages 재배포 성공 확인
- [ ] Pages 화면 정상 로딩 확인

## 6) 스냅샷 백업 권장

코드 스냅샷 태그:
```bash
git checkout main
git pull origin main
git tag -a backup-cloudflare-hosting-2026-02-23 -m "Cloudflare hosting stable snapshot"
git push origin backup-cloudflare-hosting-2026-02-23
```

주의:
- Git만으로는 Secrets/대시보드 설정이 복구되지 않습니다.
- Cloudflare 대시보드의 변수/시크릿/빌드 설정을 이 문서대로 함께 복원해야 완전 복구됩니다.

## 2026-02-27 Upload Runtime Update
- Current meeting upload pipeline: Browser -> (R2 presigned or worker_direct fallback) -> R2 -> AssemblyAI(audio_url) -> webhook -> transcript detail/publish.
- Upload timeout handling was updated: dynamic timeout by file size (min 5m, max 30m).
- Upload retry policy was updated: retry once on retryable upload errors (total up to 2 attempts).
- worker_direct is a fallback path when R2 presigned URL is not available. Hard size blocking was removed; warning-only behavior remains.
- Deployment note: manual Cloudflare Pages deploy via Wrangler requires CLOUDFLARE_API_TOKEN in non-interactive environments.
