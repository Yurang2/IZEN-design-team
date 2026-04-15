# NAS Structure Docs

이 폴더는 NAS/Google Drive 구조 합의본의 문서 SSOT입니다.

## 역할 분리
- `docs/nas-structure/*.md`: 현재 합의된 구조, 규칙, 표시 원칙
- `src/features/nasGuide/NasGuideView.tsx`: 위 합의본을 화면으로 표현한 구현
- Notion `이슈 트래커`: 논의 이력, 보류 이슈, 결정 배경

## 현재 기준
- 기준 화면: `NAS 폴더 구조 가이드 > 폴더 구조`
- 기준 트리: `NasGuideView.tsx`의 `NAS_TREE`, `GDRIVE_TREE`
- 기준 보조설명: 같은 파일의 `DECISION_ROWS`, `AUTO_SAVE_SUBFOLDER_ROWS`, `AUTO_SAVE_EXAMPLES`
- 기준 네이밍: 같은 파일의 `NAMING_ELEMENTS`, `NAMING_CATEGORIES`
- 실제파일 예시: txt 복구 데이터로 생성된 `nasGuideExamples.generated.ts`

## 문서 구성
- `tree.md`: NAS 폴더 구조
- `gdrive.md`: Google Drive 구조
- `naming.md`: 파일명 규칙
- `examples-policy.md`: `예시파일/실제파일` 표시 원칙

## 수정 원칙
1. 구조/규칙을 먼저 이 문서에 반영
2. 그 다음 `NasGuideView.tsx`와 생성 규칙을 수정
3. 관련 결정 배경이나 미결 사항은 Notion 이슈 트래커에 남김
4. 수정 후 `docs/nas-structure/*.md`와 `NasGuideView.tsx`의 트리/결정표/자동저장 예시가 서로 일치하는지 반드시 대조

## 주의
- `.tsx` 안의 샘플 파일명은 문서 규칙을 따라야 함
- 폴더트리는 하드코딩 예시 UI이므로, 문서와 하드코딩이 어긋난 채로 두면 안 됨
- `예시파일`은 임의 이름 금지, 현재 규칙을 엄격히 따라야 함
- `실제파일`은 txt 복구 기준이며, rename된 경우 `원본파일명`을 표시함
