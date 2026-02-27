# hook-master.md

## 1) 문서 목적
- 이 문서는 IZEN 내부 데이터 훅/계약(JSON Contract)의 기준 문서다.
- API 응답/요청 포맷과 필드 정의는 본 문서를 우선으로 한다.

## 2) Connected DB (SSOT)
- Project DB: `NOTION_PROJECT_DB_ID`
- Task DB: `NOTION_TASK_DB_ID`
- Checklist DB: `NOTION_CHECKLIST_DB_ID` (optional)
- Meeting DB: `NOTION_MEETING_DB_ID` (optional)
- Checklist Assignment DB: `NOTION_CHECKLIST_ASSIGNMENT_DB_ID` (optional)

## 3) 공통 규칙
- ID: 문자열(`string`) 사용
- 날짜: `YYYY-MM-DD` 형식 사용
- 날짜/옵션 필드는 필요 시 생략 가능(옵셔널)
- 할당 해제는 `null` 또는 빈 값 정책을 엔드포인트 규격에 맞춰 처리

## 4) Core JSON Contract

### 4.1 ProjectRecord
```json
{
  "id": "string",
  "key": "string",
  "bindingValue": "string",
  "name": "string",
  "eventDate": "YYYY-MM-DD",
  "shippingDate": "YYYY-MM-DD",
  "operationMode": "self | dealer",
  "fulfillmentMode": "domestic | overseas | dealer",
  "projectType": "string",
  "eventCategory": "string",
  "iconEmoji": "string",
  "iconUrl": "string",
  "coverUrl": "string",
  "source": "project_db | task_select"
}
```

### 4.2 TaskRecord
```json
{
  "id": "string",
  "url": "string",
  "projectKey": "string",
  "projectName": "string",
  "projectSource": "relation | select | unknown",
  "requester": ["string"],
  "workType": "string",
  "taskName": "string",
  "status": "string",
  "statusColor": "string",
  "assignee": ["string"],
  "startDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "actualEndDate": "YYYY-MM-DD",
  "detail": "string",
  "priority": "string",
  "urgent": true,
  "issue": "string"
}
```

### 4.3 CreateTaskInput
```json
{
  "taskName": "string",
  "projectId": "string",
  "projectName": "string",
  "workType": "string",
  "status": "string",
  "assignee": ["string"],
  "requester": ["string"],
  "startDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "detail": "string",
  "priority": "string",
  "urgent": false,
  "issue": "string"
}
```

### 4.4 UpdateTaskInput
```json
{
  "projectId": "string | null",
  "projectName": "string | null",
  "taskName": "string | null",
  "workType": "string | null",
  "status": "string | null",
  "assignee": ["string"],
  "requester": ["string"],
  "startDate": "YYYY-MM-DD | null",
  "dueDate": "YYYY-MM-DD | null",
  "detail": "string | null",
  "priority": "string | null",
  "urgent": true,
  "issue": "string | null"
}
```

### 4.5 ChecklistAssignmentRow
```json
{
  "id": "string",
  "key": "string",
  "projectPageId": "string",
  "checklistItemPageId": "string",
  "taskPageId": "string | null",
  "applicable": true,
  "assignmentStatus": "not_applicable | unassigned | assigned",
  "assignmentStatusText": "string"
}
```

## 5) 내부 공용 JSON 구조 예시
- 아래 구조는 팀 내부 문서/훅 계약에서 공용 예시로 사용한다.

```json
{
  "id": "string",
  "name": "string",
  "status": "Draft | Approved | Completed",
  "startDate": "YYYY-MM-DD"
}
```

```json
{
  "projectId": "string",
  "title": "string",
  "assigneeId": "string",
  "dueDate": "YYYY-MM-DD",
  "done": true
}
```

## 6) 변경 규칙
- 파일명 및 JSON schema 변경은 `hook-master.md` 동시 수정이 없으면 실패로 간주한다.
- 계약 변경 시 관련 타입 파일(`worker/src/types.ts`, `src/shared/types.ts`)과 함께 동기화한다.
