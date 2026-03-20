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
      </div>
    </section>
  )
}
