import { useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import { Button, Modal } from '../../shared/ui'

type ShotSlotForm = {
  title: string
  group: string
  description: string
  eventName: string
  eventDate: string
  location: string
  callTime: string
  contact: string
}

const EMPTY_FORM: ShotSlotForm = {
  title: '',
  group: '',
  description: '',
  eventName: '',
  eventDate: '',
  location: '',
  callTime: '',
  contact: '',
}

type PhotoGuideCreateModalProps = {
  open: boolean
  onClose: () => void
  onCreated: () => void | Promise<void>
}

export function PhotoGuideCreateModal({ open, onClose, onCreated }: PhotoGuideCreateModalProps) {
  const [form, setForm] = useState<ShotSlotForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const onInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const reset = () => {
    setForm(EMPTY_FORM)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)

    try {
      await api('/photo-guide', {
        method: 'POST',
        body: JSON.stringify(form),
      })

      reset()
      await onCreated()
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '촬영가이드 컷 슬롯 생성에 실패했습니다.'
      alert(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <h3>새 컷 슬롯</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        제목과 설명만 먼저 저장하고, 이미지는 카드에서 드래그앤드롭으로 나중에 채우면 됩니다.
      </p>

      <form onSubmit={(event) => void onSubmit(event)} className="createForm">
        <label>
          컷 제목 *
          <input name="title" value={form.title} onChange={onInput} required placeholder="예: 청중 반응" />
        </label>

        <label>
          그룹
          <input name="group" value={form.group} onChange={onInput} placeholder="예: 일요일 강연 / 월요일 크루즈" />
          <span className="photoGuideFieldHint">그룹은 상위 묶음입니다. 예: `토요일 학회`, `일요일 강연`, `월요일 크루즈`</span>
        </label>

        <label className="fullWidth">
          컷 설명
          <textarea
            name="description"
            rows={5}
            value={form.description}
            onChange={onInput}
            placeholder="예: 청중이 집중하는 컷, 외국 참가자 포함, 발표자와 같은 흐름으로 이어질 수 있는 리액션"
          />
        </label>

        <details className="photoGuideOptionalMeta fullWidth">
          <summary>추가 메타 입력</summary>
          <div className="photoGuideOptionalMetaGrid">
            <label>
              행사명
              <input name="eventName" value={form.eventName} onChange={onInput} />
            </label>

            <label>
              행사일
              <input type="date" name="eventDate" value={form.eventDate} onChange={onInput} />
            </label>

            <label>
              장소
              <input name="location" value={form.location} onChange={onInput} />
            </label>

            <label>
              콜타임
              <input name="callTime" value={form.callTime} onChange={onInput} placeholder="예: 08:00" />
            </label>

            <label>
              현장 담당자
              <input name="contact" value={form.contact} onChange={onInput} />
            </label>
          </div>
        </details>

        <div className="actions fullWidth">
          <Button type="button" variant="secondary" onClick={handleClose}>
            취소
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '생성 중...' : '컷 슬롯 생성'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
