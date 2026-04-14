import { Button } from '../../shared/ui'

type WorkflowStep = {
  number: string
  title: string
  detail: string
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: '01',
    title: '요청부서가 마케팅팀에 업무협조전을 상신합니다.',
    detail: '작업 목적, 요청 배경, 희망 일정, 필요한 산출물이 빠지지 않도록 기본 정보를 먼저 정리합니다.',
  },
  {
    number: '02',
    title: '이재호 이사님이 디자인팀 스케줄을 확인합니다.',
    detail: '현재 진행 중인 작업과 일정 충돌 여부를 먼저 확인해 수용 가능 범위를 판단합니다.',
  },
  {
    number: '03',
    title: '검토 결과에 따라 승인하거나 보완을 요청합니다.',
    detail: '일정이 맞고 요청 내용이 충분하면 승인하고, 작업 의도나 기준이 불충분하면 보완 요청 후 재검토합니다.',
  },
  {
    number: '04',
    title: '요청부서와 실행부서의 라인방을 만들고 레퍼런스를 공유합니다.',
    detail:
      '요청부서 담당자, 실행부서 담당자, 팀장 등 의사결정 가능한 인원을 포함합니다. 시간이 부족하면 1안, 여유가 있으면 2안을 제안합니다.',
  },
  {
    number: '05',
    title: '추가 의견을 반영해 컨셉을 결정합니다.',
    detail: '2안을 제시했다면 이 단계에서 1안으로 좁혀 승인안으로 정리합니다.',
  },
  {
    number: '06',
    title: '확정한 컨셉을 이사님·대표님까지 공유해 방향 승인을 받습니다.',
    detail: '이 단계 전에는 본작업 방향이 확정된 것으로 보지 않습니다.',
  },
  {
    number: '07',
    title: '승인된 방향으로 본작업을 시작합니다.',
    detail: '컨셉 승인본을 기준으로 실제 제작, 편집, 정리 작업에 들어갑니다.',
  },
  {
    number: '08',
    title: '단체방에 완성본을 공유하고 보완 및 피드백 절차를 시작합니다.',
    detail: '문구, 구성, 디자인, 누락 요소를 확인하고 필요한 수정사항을 모읍니다.',
  },
  {
    number: '09',
    title: '보완 완료본을 다시 이사님·대표님께 올립니다.',
    detail: '실무 피드백이 반영된 최종안 기준으로 최종 결재 라인을 다시 거칩니다.',
  },
  {
    number: '10',
    title: '최종 승인 후 업로드합니다.',
    detail: '업로드 전 마지막 오류 여부를 확인하고, 승인된 결과물만 외부 채널에 반영합니다.',
  },
]

const PROCESS_RULES = [
  '작업 의도, 일정, 산출 기준이 불충분하면 3단계에서 바로 보완 요청합니다.',
  '컨셉 승인 전에는 본작업에 들어가지 않습니다.',
  '레퍼런스 제안은 일정이 촉박하면 1안, 비교 여유가 있으면 2안으로 운영합니다.',
  '완성본 공유와 최종 승인 단계를 분리해 수정 피드백과 결재를 혼선 없이 처리합니다.',
]

const CHECKPOINTS = [
  { title: '접수 완료 기준', detail: '업무협조전 상신과 스케줄 검토가 끝난 상태' },
  { title: '컨셉 확정 기준', detail: '요청부서 의견 반영 후 이사님·대표님 방향 승인 완료' },
  { title: '본작업 시작 기준', detail: '승인된 컨셉 1안이 정리되어 작업 기준이 명확한 상태' },
  { title: '업로드 가능 기준', detail: '완성본 수정 반영 후 최종 승인까지 끝난 상태' },
]

const VIDEO_NAMING_GUIDE = [
  {
    title: 'Teaser Video',
    usage: '행사 전 관심 유도와 사전 홍보용',
    naming: '[event-name]-teaser-video',
  },
  {
    title: 'Recap Video',
    usage: '행사 종료 후 결과 공유와 회고용',
    naming: '[event-name]-recap-video',
  },
  {
    title: 'Highlight Video',
    usage: '핵심 장면만 짧게 묶어 재공유할 때',
    naming: '[event-name]-highlight-video',
  },
  {
    title: 'Sketch Video',
    usage: '분위기 전달과 현장 기록 중심',
    naming: '[event-name]-sketch-video',
  },
]

const VIDEO_NAMING_RULES = [
  '파일명은 영문 소문자와 하이픈만 사용하는 kebab-case를 기본으로 합니다.',
  '후기영상은 recap-video로 통일하고, aftermovie 같은 다른 표현은 별도 요청이 있을 때만 사용합니다.',
  '협조전, 단체방, 파일명, 업로드 제목에서 같은 영문 명칭을 유지합니다.',
  '대외 노출 제목에는 v1, final, edit, 수정본 같은 내부 작업 표현을 넣지 않습니다.',
]

// ---------------------------------------------------------------------------
// 개별 업무 프로세스
// ---------------------------------------------------------------------------

type TaskProcess = {
  title: string
  eyebrow: string
  steps: Array<{ number: string; title: string; detail: string }>
  nasPath?: string
}

const TASK_PROCESSES: TaskProcess[] = [
  {
    title: '사진 프로세스',
    eyebrow: 'Photography',
    nasPath: '05_사진/',
    steps: [
      { number: '01', title: '촬영 + 원본 백업', detail: '촬영 후 외장하드에 백업, NAS a_자체촬영/에 업로드. 외주/타팀 수신분은 b_수신/에 분류.' },
      { number: '02', title: 'Bridge 1차 분류', detail: '전체를 한번 훑으며: reject(초점/흔들림)=삭제, 0점=보관(당장 안 씀), 1점=쓸 것. 레이팅 없음=아직 안 봄.' },
      { number: '03', title: '선별 (c_선별/)', detail: '1점 컷을 c_선별/로 이동. 자체촬영+수신 양쪽에서 골라낸 컷이 합쳐짐.' },
      { number: '04', title: '보정 (d_보정/)', detail: '선별 중 보정 대상을 Photoshop/Lightroom으로 작업. 외주 사진기사 보정본도 여기에 합류.' },
      { number: '05', title: '공유 (e_공유/)', detail: '보정본 중 외부 반출 가능한 것만 e_공유/로. 누구에게든 자유롭게 전달 가능.' },
      { number: '06', title: 'SNS 콘텐츠 제작', detail: '공유/보정 사진을 가져와서 03_디지털/SNS/에서 그래픽 작업 (PSD→PNG).' },
    ],
  },
  {
    title: '영상 프로세스',
    eyebrow: 'Video Production',
    nasPath: '04_영상/',
    steps: [
      { number: '01', title: '소스 수급', detail: '자체 촬영 → a_자체촬영/. 외주/타팀 수신 → b_수신/(외주 or 타팀). 영업팀이 사진+영상 섞어 보내면 확장자 정렬해서 분류.' },
      { number: '02', title: '편집 작업', detail: 'Premiere/After Effects 프로젝트 파일 → c_편집-프로젝트/. 소스를 여기서 편집.' },
      { number: '03', title: '모션 작업 (해당시)', detail: '2D 모션 → d_2D-모션/. 3D 모션(C4D 등) → e_3D-모션/.' },
      { number: '04', title: 'SNS 영상 (해당시)', detail: 'SNS용으로 별도 편집한 영상 → f_SNS-영상/.' },
      { number: '05', title: '최종 렌더', detail: '완성된 영상 → g_최종본/. 외주 영상팀 완성본도 여기에 합류.' },
      { number: '06', title: 'LIBRARY 등록', detail: '배포용 최종본은 03_LIBRARY/에 Rev 번호로 올림.' },
    ],
  },
  {
    title: '2D 디자인 프로세스 (인쇄물/디지털)',
    eyebrow: '2D Design',
    nasPath: '01_인쇄물/ 또는 03_디지털/',
    steps: [
      { number: '01', title: '기획 참고자료 수집', detail: '레퍼런스 → 00_기획-문서/레퍼런스/. 타팀 수신 기획서 → 00_기획-문서/.' },
      { number: '02', title: '시안 작업 (v01~)', detail: '해당 산출물 폴더에서 v01로 시작. 포스터 → 01_인쇄물/포스터/, SNS → 03_디지털/SNS/.' },
      { number: '03', title: '피드백 반영 (v02, v03...)', detail: '수정할 때마다 v 번호 올림. 이전 버전도 같은 폴더에 보관.' },
      { number: '04', title: '최종 승인 → LIBRARY', detail: '승인된 버전을 내보내기 → 03_LIBRARY/ 해당 카테고리에 Rev 번호로 올림.' },
    ],
  },
  {
    title: '3D 프로세스',
    eyebrow: '3D / Motion Graphics',
    nasPath: '02_부스/ 또는 04_영상/e_3D-모션/',
    steps: [
      { number: '01', title: '모델링/소스 준비', detail: '부스 3D → 02_부스/부스디자인/. 제품 렌더링(범용) → 02_ASSET/02_제품-렌더링/. 프로젝트 전용 → 03_디지털/렌더링/.' },
      { number: '02', title: '렌더링/모션 작업', detail: 'C4D 등 작업 파일과 렌더 결과물을 같은 폴더에. 영상용 3D 모션 → 04_영상/e_3D-모션/.' },
      { number: '03', title: '결과물 전달', detail: '렌더 이미지 → 해당 산출물 폴더. 모션 영상 → 04_영상/g_최종본/.' },
    ],
  },
  {
    title: '행사 운영 에셋 프로세스',
    eyebrow: 'Event Operations',
    nasPath: '03_디지털/행사운영/',
    steps: [
      { number: '01', title: '큐시트 확정', detail: '행사 타임테이블에 맞춰 큐 번호(Q01~) 확정. 큐시트 PDF 작성.' },
      { number: '02', title: '에셋 제작', detail: '큐별 이미지(I01~), 영상(V01~), 오디오(A01~) 제작. 전부 03_디지털/행사운영/에 flat으로 보관.' },
      { number: '03', title: '행사장 전달', detail: '행사운영/ 폴더를 통째로 복사해서 전달. 큐 코드로 자동 정렬됨.' },
    ],
  },
]

type WorkflowProcessViewProps = {
  onOpenGuide: () => void
}

export function WorkflowProcessView({ onOpenGuide }: WorkflowProcessViewProps) {
  return (
    <section className="workflowView" aria-label="업무진행 프로세스">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">Operations Manual</span>
          <h2>업무진행 프로세스</h2>
          <p>
            요청 접수부터 최종 업로드까지 디자인팀이 공통으로 따를 기본 흐름입니다. 컨셉 승인 단계와 본작업 단계를 분리해
            일정 판단, 피드백, 최종 승인 지점을 명확히 둡니다.
          </p>
        </div>
        <div className="workflowHeroActions">
          <Button type="button" variant="secondary" size="mini" onClick={onOpenGuide}>
            사용법 열기
          </Button>
        </div>
      </header>

      <div className="workflowGrid">
        <article className="workflowCard workflowCardWide">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Step By Step</span>
              <h3>표준 진행 순서</h3>
            </div>
          </div>
          <div className="workflowTimeline">
            {WORKFLOW_STEPS.map((step) => (
              <article key={step.number} className="workflowStep">
                <div className="workflowStepNumber">{step.number}</div>
                <div className="workflowStepBody">
                  <h4>{step.title}</h4>
                  <p>{step.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="workflowCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Core Rules</span>
              <h3>운영 원칙</h3>
            </div>
          </div>
          <ul className="workflowList">
            {PROCESS_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </article>

        <article className="workflowCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Checkpoint</span>
              <h3>결정 기준</h3>
            </div>
          </div>
          <div className="workflowCheckpointGrid">
            {CHECKPOINTS.map((checkpoint) => (
              <article key={checkpoint.title} className="workflowCheckpoint">
                <h4>{checkpoint.title}</h4>
                <p>{checkpoint.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="workflowCard workflowCardWide">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Video Naming</span>
              <h3>영상 영문 파일명 가이드</h3>
            </div>
          </div>
          <div className="workflowNamingGrid">
            {VIDEO_NAMING_GUIDE.map((item) => (
              <article key={item.title} className="workflowCheckpoint">
                <h4>{item.title}</h4>
                <p>{item.usage}</p>
                <p className="workflowNamingExample">권장 표기: {item.naming}</p>
              </article>
            ))}
          </div>
          <ul className="workflowList">
            {VIDEO_NAMING_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </article>
        {/* 개별 업무 프로세스 */}
        {TASK_PROCESSES.map((proc) => (
          <article key={proc.title} className="workflowCard workflowCardWide">
            <div className="workflowSectionHeader">
              <div>
                <span className="workflowSectionEyebrow">{proc.eyebrow}</span>
                <h3>{proc.title}</h3>
              </div>
              {proc.nasPath ? (
                <span style={{ fontSize: '0.75em', color: 'var(--muted)', background: 'var(--bg-soft)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)' }}>
                  {proc.nasPath}
                </span>
              ) : null}
            </div>
            <div className="workflowTimeline">
              {proc.steps.map((step) => (
                <article key={step.number} className="workflowStep">
                  <div className="workflowStepNumber">{step.number}</div>
                  <div className="workflowStepBody">
                    <h4>{step.title}</h4>
                    <p>{step.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
