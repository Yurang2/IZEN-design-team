import { useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import { Button, Modal } from '../../shared/ui'

type PhotoGuideForm = {
  title: string
  section: string
  eventName: string
  eventDate: string
  location: string
  callTime: string
  contact: string
  purpose: string
  mustShoot: string
  timeline: string
  cautions: string
  delivery: string
  references: string
  referenceLink: string
}

const EMPTY_FORM: PhotoGuideForm = {
  title: '',
  section: '',
  eventName: '',
  eventDate: '',
  location: '',
  callTime: '',
  contact: '',
  purpose: '',
  mustShoot: '',
  timeline: '',
  cautions: '',
  delivery: '',
  references: '',
  referenceLink: '',
}

type PhotoGuideCreateModalProps = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function PhotoGuideCreateModal({ open, onClose, onCreated }: PhotoGuideCreateModalProps) {
  const [form, setForm] = useState<PhotoGuideForm>(EMPTY_FORM)
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const onInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const addFiles = (newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter((file) => {
      const mime = (file.type || '').toLowerCase()
      return mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf'
    })
    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted])
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)

    try {
      const result = await api<{ ok: boolean; id: string }>('/photo-guide', {
        method: 'POST',
        body: JSON.stringify(form),
      })

      if (result.ok && result.id && files.length > 0) {
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          try {
            await api(`/photo-guide/${encodeURIComponent(result.id)}/files`, {
              method: 'POST',
              body: formData,
            })
          } catch {
            // File upload failure should not block overall creation
          }
        }
      }

      setForm(EMPTY_FORM)
      setFiles([])
      onCreated()
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '촬영가이드 생성에 실패했습니다.'
      alert(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setForm(EMPTY_FORM)
      setFiles([])
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <h3>새 촬영가이드</h3>
      <form onSubmit={(event) => void onSubmit(event)} className="createForm">
        <label>
          제목 *
          <input name="title" value={form.title} onChange={onInput} required />
        </label>

        <label>
          섹션
          <input name="section" value={form.section} onChange={onInput} placeholder="예: 본식, 리허설" />
        </label>

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

        <label className="fullWidth">
          촬영 목적
          <textarea name="purpose" rows={3} value={form.purpose} onChange={onInput} />
        </label>

        <label className="fullWidth">
          필수 컷
          <textarea name="mustShoot" rows={4} value={form.mustShoot} onChange={onInput} placeholder="줄바꿈으로 구분" />
        </label>

        <label className="fullWidth">
          시간대별 포인트
          <textarea name="timeline" rows={4} value={form.timeline} onChange={onInput} placeholder="줄바꿈으로 구분" />
        </label>

        <label className="fullWidth">
          주의 사항
          <textarea name="cautions" rows={3} value={form.cautions} onChange={onInput} />
        </label>

        <label className="fullWidth">
          납품 규격
          <textarea name="delivery" rows={2} value={form.delivery} onChange={onInput} />
        </label>

        <label className="fullWidth">
          참고 메모
          <textarea name="references" rows={2} value={form.references} onChange={onInput} />
        </label>

        <label className="fullWidth">
          참고 링크
          <input type="url" name="referenceLink" value={form.referenceLink} onChange={onInput} placeholder="https://..." />
        </label>

        <div className="fullWidth">
          <span className="photoGuideUploadLabel">첨부 자료 (이미지/영상/PDF)</span>
          <div
            className={`photoGuideDropZone${isDragging ? ' is-dragging' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <p>파일을 드래그하거나 클릭하여 선택</p>
            <input
              type="file"
              multiple
              accept="image/*,video/*,.pdf"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </div>
          {files.length > 0 && (
            <div className="photoGuideFileList">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="photoGuideFileItem">
                  <span>{file.name}</span>
                  <button type="button" onClick={() => removeFile(index)}>
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="actions fullWidth">
          <Button type="button" variant="secondary" onClick={handleClose}>
            취소
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '생성 중...' : '생성'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
