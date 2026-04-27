# Reference / Storyboard Notion DB

## Purpose
- 레퍼런스 자료함은 이미지, YouTube, 일반 링크, 기타 자료를 Notion에 저장한다.
- 스토리보드 문서는 PPTX export 전 웹 편집 상태를 Notion에 저장한다.

## Environment
- `NOTION_REFERENCE_DB_ID`: 레퍼런스 자료함 DB
- `NOTION_STORYBOARD_DB_ID`: 스토리보드 문서 DB

## Reference DB
| field | type | note |
|---|---|---|
| 제목 | title | required |
| 귀속 프로젝트 | relation -> Project DB | optional |
| 출처 유형 | select | `image`, `youtube`, `link`, `other` |
| 레퍼런스 형태 | select | `단순저장`, `모작`, `아이디어` |
| 링크 | url | optional |
| 첨부 이미지 | files | pasted/uploaded image |
| 메모 | rich_text | optional |
| 태그 | multi_select | optional |
| 등록일 | date | optional |

## Storyboard DB
| field | type | note |
|---|---|---|
| 제목 | title | required |
| 귀속 프로젝트 | relation -> Project DB | optional |
| 버전명 | rich_text | export filename suffix |
| 메모 | rich_text | web-only, not exported |
| 스토리보드 JSON | rich_text | `meta` + `frames` |
| 내보내기 파일명 기록 | rich_text | duplicate export warning basis |
| 수정일 | date | last web save date |

## API
- `GET|POST /api/references`
- `GET|PATCH|DELETE /api/references/:id`
- `GET|POST /api/storyboards`
- `GET|PATCH|DELETE /api/storyboards/:id`

## Creation
- Run `node scripts/create-reference-storyboard-dbs.cjs`.
- The script uses parent page `23ec1cc7-ec27-803a-9567-f6b5ebc7cb36`.
- If `NOTION_PROJECT_DB_ID` is present, project fields are created as relations.
