# Notion -> Proposal -> Task 자동화

## 파일 트리

```text
.
├── .env.example
├── firebase.json
├── functions
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src
│       ├── config.ts
│       ├── deadline.ts
│       ├── index.ts
│       ├── notion.ts
│       └── types.ts
├── src
│   ├── App.tsx
│   ├── App.css
│   └── index.css
└── docs
    └── NOTION_AUTOMATION.md
```

## Firestore 스키마

### `sync_state/{SYNC_DOC_ID}`
- `last_seen_project_ids: string[]`
- `updatedAt: Timestamp`

### `proposals/{proposalId}`
- `status: 'pending' | 'approved' | 'deleted'`
- `projectId: string` (Notion 프로젝트 page id)
- `projectName: string`
- `checklistItemId: string`
- `taskName: string` (초기값: 체크리스트의 제작물)
- `workCategory: string` (초기값: 체크리스트의 작업 분류)
- `dueDate: string (YYYY-MM-DD)`
- `deadlineBasis: 'event_date'`
- `offsetDays: number`
- `dueDateSource: 'rule_table' | 'text_parser'`
- `finalDueText: string`
- `aiDeadlineSuggestion: { deadlineBasis: 'event_date', offsetDays: number } | undefined`
- `notionTaskPageId?: string`
- `notionTaskPageUrl?: string`
- `createdAt, updatedAt, approvedAt: Timestamp`

## Function 목록

- `syncNewProjects` (scheduled, 10분)
  - 프로젝트 DB 조회
  - `sync_state` 대비 신규 프로젝트 탐지
  - 체크리스트 필터 후 proposal 생성
- `listPendingProposals` (GET)
- `updateProposal` (POST)
- `deleteProposal` (POST, soft-delete)
- `approveProposals` (POST)
  - 선택 proposal을 Notion Task DB에 생성
  - proposal 상태를 `approved`로 변경하고 Notion page id/url 기록

## 환경변수

Functions (`functions/.env.example`):
- `NOTION_TOKEN`
- `NOTION_PROJECT_DB_ID`
- `NOTION_CHECKLIST_DB_ID`
- `NOTION_TASK_DB_ID`
- `FUNCTION_REGION` (기본 `asia-northeast3`)
- `SYNC_DOC_ID` (기본 `notion_project_sync`)

Frontend (`.env.example`):
- `VITE_FUNCTIONS_BASE_URL` 예: `http://127.0.0.1:5001/<project-id>/asia-northeast3`
