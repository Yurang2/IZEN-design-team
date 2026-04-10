# Claude → Codex 인수인계 노트

> 이 문서는 Claude Opus 4.6으로 약 1달간(2026-03~04) 작업하며 축적된 암묵지를 정리한 것입니다.
> Codex가 이 문서를 읽고 `AGENTS.md`, skills, 세션 규칙으로 재구성하는 데 사용합니다.

---

## 1. 프로젝트 개요

- **정체**: IZEN 디자인팀 내부 운영 콘솔
- **핵심 원칙**: Notion이 데이터 원장(SSOT), 웹은 가시화/편집 레이어
- **스택**: React 19 + Vite 7 | Cloudflare Workers (백엔드) | Notion API | Electron (오버레이)
- **호스팅**: Cloudflare Pages(프론트) + Cloudflare Workers(API)
- **설계 기준 문서**: `docs/00_설계도.md` (제품), `docs/hook-master.md` (API 계약)

---

## 2. 작업 워크플로우 (가장 중요)

사용자와의 작업은 아래 흐름을 따릅니다:

```
오더(사용자) → 계획(에이전트) → 승인(사용자) → 작업+보고(에이전트) → 승인(사용자) → 커밋+푸시(에이전트)
```

### 핵심 규칙
- **승인 전 작업 금지**: 사용자가 명시적으로 승인하기 전에 파일 수정을 시작하지 않는다
- **커밋과 푸시는 세트**: 작업 완료 후 별도 요청 없이 커밋+푸시를 한번에 진행
- **커밋 해시 필수 명시**: 푸시 후 반드시 커밋 해시를 알려줌 (배포 시간차 확인용)
- **검증 명령어**: `npm run build` (lint는 레거시 실패 포함, 신규 이슈와 구분 필요)

---

## 3. 반복된 작업 패턴 (1달간)

### 가장 많이 한 작업 유형
1. **Feature 추가**: 새 뷰 페이지 + Worker 핸들러 + Notion DB 연동을 세트로 만듦
2. **UI/UX 개선**: 기존 화면의 레이아웃, 정렬, 반응형 개선
3. **Notion 스키마 동기화**: DB 필드 변경 시 Worker 타입 + 프론트 타입 + 문서를 함께 수정
4. **외부 공유 페이지**: 행사 그래픽, 사진 가이드, 자막 등 외부인이 보는 공유 페이지 관리

### 전형적인 Feature 추가 흐름
1. `worker/src/types.ts`에 타입 정의 추가
2. `worker/src/notionWork.ts`에 Notion 쿼리/매핑 로직 추가
3. `worker/src/index.ts` 또는 `worker/src/handlers/`에 API 라우트 추가
4. `src/shared/types.ts`에 프론트엔드 타입 미러링
5. `src/features/<name>/`에 View 컴포넌트 생성
6. `src/App.tsx`에 라우팅 연결
7. `worker/wrangler.toml`에 새 Notion DB ID 환경변수 추가 (필요 시)

---

## 4. 건드리면 안 되는 것 / 주의사항

### 절대 주의
- **외부 공유 페이지가 활성 상태**: EventGraphicsSharePage, PhotoGuideSharePage, SubtitleSharePage 등은 외부인이 보고 있음. 전체 UI 톤 변경 시 사용자에게 타이밍 확인 필요
- **Notion 부모 페이지 ID**: DB 생성 시 `23ec1cc7-ec27-803a-9567-f6b5ebc7cb36` 사용. 다른 페이지에 만들면 사용자가 찾지 못함
- **Cloudflare API 토큰**: Worker 배포에 필요. 토큰 확보 여부를 반드시 먼저 확인. "필요 없다"고 단정하지 말 것
- **AUTH_DISABLED=true**: 인증이 의도적으로 비활성화된 상태. 재활성화하지 말 것

### 구조적 주의
- `docs/hook-master.md`는 API 계약서. JSON 스키마/필드명 변경 시 이 문서를 반드시 함께 수정
- `worker/src/notionWork.ts`는 4200줄+ 대형 파일. Notion 쿼리 로직이 전부 여기에 있음
- `worker/src/index.ts`도 3000줄+. 라우터 + 일부 핸들러가 섞여있음 (일부는 handlers/로 분리됨)
- mock 데이터(`src/mock/mockApi.ts`)는 개발용. 실 데이터와 동기화되지 않을 수 있음

---

## 5. 커밋 컨벤션

```
[동사] [대상]: [상세] (영문 또는 한글)
```

예시:
- `Add video management view as separate tool from subtitle script`
- `Fix: 장비 상태 한글↔영문 매핑 누락 수정`
- `Enhance: 촬영장비 UX 개선 — 안내 배너, 행사일순 정렬, 지난 행사 접기`
- `Redesign: 일정 뷰 UI 전면 리디자인`

타입: Add, Fix, Enhance, Improve, Redesign, Refactor, Remove

---

## 6. 기존 Codex 인프라 현황

이미 존재하는 파일들:
- `AGENTS.md`: 프로젝트 목적, 호스팅 모델, SSOT 참조, 작업 규칙, Git 정책 정의됨
- `docs/CODEX_RULES.md`: 운영 프로토콜 10조 + 시스템 무결성 조건
- `ops/20_AAR_LOG.md`: AAR(After Action Review) 기록 (Codex 시절 사용)
- `ops/30_TEST_PLAYBOOK.md`: 테스트 시나리오 (Codex 시절 사용)

### Claude 기간 동안 달라진 점
- `AGENTS.md`는 유지했지만, Claude 메모리 시스템(`.claude/`)을 병행 사용
- `CODEX_RULES.md`의 AAR/테스트 플레이북 절차는 Claude 작업 중 적극 사용하지 않음
- 대신 Claude 메모리에 피드백/프로젝트 노트 7개를 축적
- ops/ 폴더의 AAR/테스트 문서가 최신 상태인지 검증 필요

---

## 7. Claude 메모리에서 추출한 운영 규칙 (7건)

| # | 규칙 | 이유 |
|---|------|------|
| 1 | 작업 완료 시 커밋+푸시 자동 수행 | 매번 요청하는 게 번거로움 |
| 2 | 커밋 후 커밋 해시 명시 | 배포 시간차로 최신 버전 확인 필요 |
| 3 | 외부 공유 중인 페이지 UI 변경 시 타이밍 확인 | 외부 사용자에게 영향 |
| 4 | Notion DB 생성 시 부모 페이지 ID 확인 | 잘못된 위치에 만들면 혼란 |
| 5 | Cloudflare 배포 시 API 토큰 확보 먼저 | 이전에 "필요 없다"고 잘못 답한 전례 |
| 6 | 승인 전 코드 수정 금지 | 사용자 워크플로우 원칙 |
| 7 | 질문 시 짧고 간결하게 | 긴 프리뷰는 UI에서 잘림 |

---

## 8. 주요 Feature 영역별 현재 상태

| 영역 | 상태 | 비고 |
|------|------|------|
| Dashboard | 안정 | Editorial Flow 스타일 리디자인 완료 |
| Tasks | 안정 | List/Board 뷰, 필터, 생성 폼 완비 |
| Checklist | 안정 | Notion DB 저장, 외부 공유, 할당 모달 |
| Event Graphics | 안정 | 타임테이블, 업로드, 외부 공유/인쇄 |
| Photo Guide | 안정 | 샷 슬롯, 섹션, 외부 공유, Notion 저장 |
| Video Manual | 안정 | 체크리스트(사전준비→편집→마무리), 오버레이 |
| Video Management | 활발 개발중 | 자막 상태, 카드 UI, 생성 폼 최근 추가 |
| Subtitle | 안정 | Diff 비교, XLSX 임포트, 외부 공유 |
| Equipment | 안정 | 행사별 체크, 반출/반납 추적 |
| Schedule | 안정 | 캘린더 뷰, 등록 폼 |
| Meetings | 안정 | 음성 업로드→전사→문서화 파이프라인 |
| Screening | 안정 | 상영 기록/계획 DB |
| Feedback | 안정 | 행사별 피드백 수집 |
| File Guide | 안정 | 폴더 네이밍 가이드 |

---

## 9. 기술적 특이사항

- **테마 시스템**: v1(모노톤 라이트), v2(다크), v3(기본). localStorage + query param으로 전환
- **Mock 모드**: `?demo=1` 또는 `VITE_USE_MOCK_DATA=true`로 Notion 없이 개발 가능
- **Cron 작업**: Worker에 3개 크론 등록 (23:55, 08:30, 매30분) — LINE 알림/리마인더
- **R2 스토리지**: 회의 음성 파일, 이벤트 그래픽 에셋 저장
- **외부 API**: AssemblyAI(음성전사), Gemini(이미지생성), LINE(알림), OpenAI(요약)
