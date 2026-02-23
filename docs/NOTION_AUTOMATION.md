# Notion/CSV -> Proposal -> Task 자동화

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
- `projectCategory?: string` (UI에서 선택/저장하는 행사 분류)
- `checklistItemId: string`
- `eventCategories?: string[]` (체크리스트 항목의 행사 분류 매핑)
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
- `sourceType?: 'csv_ai' | 'csv_diff_ai'`
- `sourceUploadId?: string`
- `sourceEventKey?: string`
- `sourceEventDate?: string | null`
- `sourceDiffType?: 'added' | 'changed'`
- `requiresProjectMapping?: boolean`
- `revisionPreviousUploadId?: string`
- `revisionCurrentUploadId?: string`
- `createdAt, updatedAt, approvedAt: Timestamp`

### `csv_uploads/{uploadId}`
- `status: 'uploaded' | 'generated' | 'compared'`
- `source: 'manual_csv_upload'`
- `revisionRole: 'previous' | 'current' | null`
- `fileName, mimeType, sizeBytes, sha256`
- `extractedTextPreview`
- `candidateProjectName`
- `candidateEventDate?: string | null`
- `extractedEvents?: [{ key, name, date?, raw? }]`
- `normalizedRows?: [{ rowId, month, dateText, country, city, eventName, purpose, startDate, endDate, raw, confidence }]`
- `generatedProposalCount?: number`
- `compareSummary?: { addedEvents, changedEvents, removedEvents, createdProposals, updatedProposals, limitPerEvent }`
- `createdAt, updatedAt`

### `revision_diffs/{diffId}`
- `previousUploadId`
- `currentUploadId`
- `summary: { addedEvents, changedEvents, removedEvents, createdProposals, updatedProposals, limitPerEvent }`
- `addedEventKeys: string[]`
- `changedEventKeys: string[]`
- `removedEventKeys: string[]`
- `createdAt`

## Function 목록

- `syncNewProjects` (scheduled, 10분)
  - 프로젝트 DB 조회
  - `sync_state` 대비 신규 프로젝트 탐지
  - 체크리스트 필터 후 proposal 생성
- `listPendingProposals` (GET)
- `listChecklistCategories` (GET)
  - 체크리스트 DB의 `행사 분류`를 유니크 목록으로 반환(프론트 분류 선택지 소스)
- `diagnoseNotionAccess` (GET)
  - Project/Checklist/Task DB 접근 가능 여부 점검
  - `object_not_found`, `unauthorized` 등 권한 오류 진단 힌트 반환
- `uploadProjectCsv` (POST, 기본)
  - CSV 업로드 저장 + 정제 행(`normalizedRows`) 생성
  - 권장 컬럼: `month`, `date`, `startdate`, `enddate`, `country`, `city`, `name`, `purpose`
  - 필수: `name` + (`startdate/enddate` 또는 `date`)
  - `name`이 `TBD` 계열이면 `City_Event` 패턴으로 보정
  - `date` 기반 교차월(`27 - April 1`, `August 30 - 4`) 파싱 지원
  - 하루 행사(`startdate`만 있는 경우)는 `startDate=endDate`로 보정
  - `startdate/enddate`가 `TBD`인 행도 이벤트 존재 비교를 위해 정제 목록에 유지
  - 파일명 `[xxx]...` 접두는 `xxx_...` 형태로 정리해서 저장
  - `revisionRole`(`previous|current`) 저장
- `getUploadNormalizedRows` (GET, 기본)
  - `uploadId` 기준 정제 행 반환
  - 프론트에서 Month/Date/Country/City/Event/Purpose/Startdate/Enddate 표 + CSV 원본 미리보기 확인용
- `uploadProjectPdf`, `getPdfUploadNormalizedRows`
  - 레거시 별칭(이전 화면 호환용)
- `compareRevisionsAndGenerateProposals` (POST, 권장)
  - 이전/현재 업로드의 정제 행 기반으로 added/changed/removed 계산
  - 기본 키(`행사명+도시+국가`)가 달라도 행사명 동일성 매칭 시 `changed`로 판정
  - `previewOnly=true`면 proposal 생성 없이 added/changed/removed 상세만 반환(선판별)
  - added/changed 이벤트 기준 proposal 생성
  - changed 이벤트는 기존 pending proposal 마감일 재계산 update
- `generateProposalsFromUpload` (POST, 레거시)
  - 단일 업로드에서 러프 proposal 생성
- `updateProposal` (POST)
  - 수정 허용 필드: `taskName`, `workCategory`, `dueDate`
- `updateProjectCategory` (POST)
  - 입력: `projectId`, `projectCategory`
  - 해당 프로젝트의 pending proposal들에 `projectCategory`를 일괄 저장/해제
  - 체크리스트 DB 기준으로 `eventCategories`를 재동기화
  - 프론트는 `listChecklistCategories` 결과를 행사 분류 선택지로 사용
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
- `APP_FUNCTION_REGION` (기본 `asia-northeast3`)
- `SYNC_DOC_ID` (기본 `notion_project_sync`)

Frontend (`.env.example`):
- `VITE_FUNCTIONS_BASE_URL` 예: `http://127.0.0.1:5001/<project-id>/asia-northeast3`
