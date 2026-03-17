import { Button, Modal } from '../../shared/ui'

export type ScreeningPlanImportForm = {
  sourceEventName: string
  targetProjectId: string
}

type ScreeningPlanImportModalProps = {
  open: boolean
  busy: boolean
  form: ScreeningPlanImportForm
  sourceEventOptions: string[]
  projectOptions: Array<{ id: string; name: string; eventDate?: string }>
  onClose: () => void
  onChange: (key: keyof ScreeningPlanImportForm, value: string) => void
  onSubmit: () => void | Promise<void>
}

export function ScreeningPlanImportModal({
  open,
  busy,
  form,
  sourceEventOptions,
  projectOptions,
  onClose,
  onChange,
  onSubmit,
}: ScreeningPlanImportModalProps) {
  return (
    <Modal open={open} onClose={onClose} className="screeningImportModal">
      <h3>기준 행사에서 불러오기</h3>
      <p className="muted small">
        상영 기록 DB의 기존 행사 구성을 가져와 상영 준비 초안을 만듭니다. 같은 <strong>기준 상영 기록 + 목표 프로젝트</strong> 조합은
        중복 생성하지 않습니다.
      </p>

      <label>
        기준 행사
        <select value={form.sourceEventName} onChange={(event) => onChange('sourceEventName', event.target.value)} disabled={busy}>
          <option value="">선택하세요</option>
          {sourceEventOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        목표 프로젝트
        <select value={form.targetProjectId} onChange={(event) => onChange('targetProjectId', event.target.value)} disabled={busy}>
          <option value="">선택하세요</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.eventDate ? `${project.name} (${project.eventDate})` : project.name}
            </option>
          ))}
        </select>
      </label>

      <p className="muted small screeningImportHint">
        목표 행사명과 상영일은 선택한 프로젝트의 이름과 <strong>`행사 진행일`</strong>을 기준으로 자동 입력됩니다.
      </p>

      <p className="muted small screeningImportHint">
        새 row는 기본적으로 <strong>`reuse_with_edit`</strong>, <strong>`pending`</strong> 상태로 생성됩니다.
      </p>

      <div className="screeningImportModalActions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          닫기
        </Button>
        <Button type="button" onClick={() => void onSubmit()} disabled={busy || !form.sourceEventName.trim() || !form.targetProjectId.trim()}>
          {busy ? '불러오는 중...' : '불러오기 실행'}
        </Button>
      </div>
    </Modal>
  )
}
