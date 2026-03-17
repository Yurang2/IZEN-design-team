import { Button, Modal } from '../../shared/ui'

export type ScreeningPlanImportForm = {
  sourceEventName: string
  targetEventName: string
  targetProjectId: string
  targetDate: string
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
        상영 기록 DB에서 기준 행사를 골라 상영 준비 DB 초안을 만듭니다. 같은 <strong>기준 상영 기록 + 목표 행사명</strong> 조합은
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
        목표 행사명
        <input
          value={form.targetEventName}
          onChange={(event) => onChange('targetEventName', event.target.value)}
          placeholder="예: Dental Salon 2026"
          disabled={busy}
        />
      </label>

      <label>
        목표 프로젝트
        <select value={form.targetProjectId} onChange={(event) => onChange('targetProjectId', event.target.value)} disabled={busy}>
          <option value="">연결 안 함</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        목표 상영일
        <input type="date" value={form.targetDate} onChange={(event) => onChange('targetDate', event.target.value)} disabled={busy} />
      </label>

      <p className="muted small screeningImportHint">
        새 row는 기본적으로 <strong>`reuse_with_edit`</strong>, <strong>`pending`</strong> 상태로 생성됩니다.
      </p>

      <div className="screeningImportModalActions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          닫기
        </Button>
        <Button
          type="button"
          onClick={() => void onSubmit()}
          disabled={busy || !form.sourceEventName.trim() || !form.targetEventName.trim()}
        >
          {busy ? '불러오는 중...' : '불러오기 실행'}
        </Button>
      </div>
    </Modal>
  )
}
