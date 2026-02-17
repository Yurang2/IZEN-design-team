# Notion 디자인 업무 자동화

프로젝트 DB에 새 행사가 생성되면 체크리스트 기반 `proposal`을 만들고, 승인된 항목만 Notion `디자인팀 업무 DB`에 실제 Task로 생성하는 구성입니다.

자세한 구조/스키마는 `docs/NOTION_AUTOMATION.md`를 참고하세요.

## 1) 프론트 실행

```bash
cp .env.example .env
npm install
npm run dev
```

`VITE_FUNCTIONS_BASE_URL`는 반드시 Functions 서버 URL이어야 합니다.
예시:
- 로컬 에뮬레이터: `http://127.0.0.1:5001/<firebase-project-id>/asia-northeast3`
- 배포 환경: `https://<region>-<project-id>.cloudfunctions.net`

Cloudflare Pages를 사용하면 프로젝트 설정의 Environment Variables에
`VITE_FUNCTIONS_BASE_URL`를 추가한 뒤 재배포해야 합니다.

또는 배포된 웹 화면 상단의 `Functions API Base URL` 입력칸에
`https://<region>-<project-id>.cloudfunctions.net`를 입력하고
`저장 후 다시연결`을 눌러 런타임에 설정할 수 있습니다.

## 2) Functions 실행

```bash
cd functions
cp .env.example .env
npm install
npm run build
firebase emulators:start --only firestore,functions
```

## 주요 엔드포인트

- `GET /listPendingProposals`
- `POST /updateProposal`
- `POST /deleteProposal`
- `POST /approveProposals`

## 스케줄러

- `syncNewProjects` : 10분마다 실행
