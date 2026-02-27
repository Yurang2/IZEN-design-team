# hook-master.md

## 1) 문서 목적
- 이 문서는 IZEN 내부 데이터 훅/계약(JSON Contract)의 기준 문서다.
- API 응답/요청 포맷과 필드 정의는 본 문서를 우선으로 한다.

## 2) Connected DB (SSOT)
- Project DB: `NOTION_PROJECT_DB_ID`
- Task DB: `NOTION_TASK_DB_ID`
- Checklist DB: `NOTION_CHECKLIST_DB_ID` (optional)
- Meeting DB (fixed): `3f3c1cc7ec278216b5e881744612ed6b`
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

### 4.6 Meeting Transcript Input Rule
```json
{
  "key": "meetings/audio/.../file.m4a",
  "title": "yymmdd 디자인팀 주간보고",
  "minSpeakers": 2,
  "maxSpeakers": 10,
  "keywordSetId": "string | null"
}
```
- 프론트 업로드 폼은 `title` 수동 입력을 받지 않고, 업로드 파일명(`file.name`)을 `title`로 전송한다.
- `title`이 `yymmdd <제목>` 패턴이면:
- Notion `날짜` 속성(date)에 `YYYY-MM-DD`로 저장한다.
- Notion 페이지 제목은 `yymmdd` 이후 텍스트를 사용한다.
- 패턴이 아니면 기존 제목을 그대로 사용하고 `날짜`는 비운다.
- 서버는 R2 key의 UUID prefix(`<32hex>-`)를 제거한 파일명을 기준으로도 동일 파싱한다.
- Notion 날짜 컬럼은 `날짜` 또는 `일자`를 자동 인식해 기록한다.

### 4.7 Meeting Upload Presign Response
```json
{
  "ok": true,
  "key": "meetings/audio/.../file.wav",
  "putUrl": "string",
  "requiredHeaders": {
    "Content-Type": "audio/wav"
  },
  "uploadMode": "r2_presigned | worker_direct"
}
```

### 4.8 Meeting Transcript Read Shape (excerpt)
```json
{
  "transcript": {
    "id": "string",
    "meetingId": "string",
    "meetingDate": "YYYY-MM-DD | null",
    "status": "queued | submitted | processing | completed | failed | error",
    "bodySynced": false,
    "meeting": {
      "title": "string"
    }
  }
}
```

### 4.9 Meeting Transcript Publish (manual Notion sync)
- Endpoint: `POST /api/transcripts/:id/publish`
- Purpose: after speaker mapping is completed in web UI, publish mapped utterances to Notion body and generate summary.
- Rule:
- webhook/GET polling must not auto-publish transcript body.
- publish is rejected when transcript status is not `completed`.
- publish is rejected when any speaker label is unmapped.
- Notion `전문` section writes only `화자별 발화` (mapped names). `원문 텍스트` section is not written.
- `OPENAI_API_KEY`가 설정된 경우 `요약` 섹션은 GPT 요약으로 채운다. 미설정 시 placeholder를 유지한다.
- publish 반복 실행은 AssemblyAI 재전사 비용을 만들지 않는다. 단, `OPENAI_API_KEY`가 설정된 경우 요약 호출 비용은 실행 횟수만큼 발생한다.

```json
{
  "ok": true,
  "transcriptId": "string",
  "assemblyId": "string",
  "status": "completed",
  "utteranceCount": 123,
  "audioFileAttached": true
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
