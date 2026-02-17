# Notion 디자인 업무 자동화

프로젝트 DB에 새 행사가 생성되면 체크리스트 기반 `proposal`을 만들고, 승인된 항목만 Notion `디자인팀 업무 DB`에 실제 Task로 생성하는 구성입니다.

자세한 구조/스키마는 `docs/NOTION_AUTOMATION.md`를 참고하세요.

## 1) 프론트 실행

```bash
cp .env.example .env
npm install
npm run dev
```

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
