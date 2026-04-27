# Reference / Storyboard Notion DB

## Purpose
- 레퍼런스 자료함은 이미지, YouTube, 일반 링크, 기타 자료를 Notion에 저장한다.
- 스토리보드 문서는 PPTX export 전 웹 편집 상태를 Notion에 저장한다.

## Environment
- `NOTION_REFERENCE_DB_ID`: `34fc1cc7ec278178bf5ec4c5a7c1491f`
- `NOTION_STORYBOARD_DB_ID`: `34fc1cc7ec2781af9ed3d8d3327cd00f`
- Related task DB: `23ec1cc7ec2781afabb6ca25fb3ee56c`

## Reference DB
| field | type | note |
|---|---|---|
| 제목 | title | required |
| 관련 업무 | relation -> Task DB | optional |
| 프로젝트명 | rich_text | web selection label |
| 출처 유형 | select | `image`, `youtube`, `link`, `other` |
| 레퍼런스 형태 | select | `단순저장`, `모작`, `아이디어` |
| 링크 | url | optional |
| 첨부 이미지 | files | pasted/uploaded image |
| 메모 | rich_text | optional |
| 저장자 | rich_text | defaults to `REFERENCE_DEFAULT_AUTHOR_NAME` before login-based authoring |
| 저장자 IP | rich_text | recorded from `CF-Connecting-IP` |
| 태그 | multi_select | optional |
| 등록일 | date | optional |

## Storyboard DB
| field | type | note |
|---|---|---|
| 제목 | title | required |
| 관련 업무 | relation -> Task DB | optional |
| 프로젝트명 | rich_text | web selection label |
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
- Reference saves default to `REFERENCE_DEFAULT_AUTHOR_NAME=조정훈`; later login can replace this author source.

## Creation
- Run `node scripts/create-reference-storyboard-dbs.cjs`.
- The script uses parent page `23ec1cc7-ec27-803a-9567-f6b5ebc7cb36`.
- The relation fields point to `NOTION_TASK_DB_ID`.
