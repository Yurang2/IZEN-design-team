# CODEX_RULES

## Operational Protocol

1. 작업 시작 절차 (최상단)
- 모든 작업은 시작 전 목표, 범위, 산출물을 명시하고 시작한다.

2. 설계 우선 원칙
- 구현 전에 `docs/00_설계도.md`와 `docs/hook-master.md`를 먼저 확인하고 이를 기준으로 의사결정한다.

3. 작업 단위 규칙
- 작업은 검증 가능한 작은 단위로 쪼개어 수행하고, 각 단위별 결과를 확인한다.

4. 변경 기록 의무
- 모든 의미 있는 변경은 근거와 함께 기록하며, 작업 종료 전 `ops/20_AAR_LOG.md`에 AAR를 반드시 남긴다.

5. 자기 피드백 루프
- 구현 후 스스로 점검(요구사항 일치, 누락, 회귀 가능성)을 수행하고 필요 시 즉시 보정한다.

6. 사용자 관점 검증
- 결과물은 사용자 시나리오 기준으로 검증하며, `ops/30_TEST_PLAYBOOK.md` 시나리오를 실행한다.

7. 배포 금지 조건
- Acceptance 기준을 통과하지 못하면 완료/배포를 선언하지 않는다.

8. 중간 생략 방지
- 설계 확인, 구현, 테스트, 기록 단계를 임의로 생략하지 않는다.

9. 작업 종료 조건
- 테스트 완료, 문서 반영, AAR 기록, Acceptance 통과가 모두 충족되어야 작업 종료로 본다.

10. 시스템 무결성 조건 (파일 존재 강제)
- 다음 파일은 항상 존재해야 한다: `README.md`, `docs/CODEX_RULES.md`, `docs/00_설계도.md`, `docs/hook-master.md`, `ops/20_AAR_LOG.md`, `ops/30_TEST_PLAYBOOK.md`, `ops/40_ACCEPTANCE_CHECKLIST.md`.

11. 연동 변경 일관성 조건
- 파일명 및 JSON schema 변경은 `docs/hook-master.md` 동시 수정이 없으면 실패로 간주한다.
