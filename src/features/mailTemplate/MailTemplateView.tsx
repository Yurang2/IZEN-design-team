import { useMemo, useState } from 'react'
import { Button } from '../../shared/ui'

type CopyOptions = {
  successMessage?: string
  emptyMessage?: string
}

type MailTemplateViewProps = {
  onCopy: (text: string, options?: CopyOptions) => Promise<void>
}

type MailTemplateKind = 'videoDelivery'

type MailTemplateOption = {
  key: MailTemplateKind
  label: string
  description: string
}

type VideoDeliveryForm = {
  recipient: string
  sender: string
  cooperationDocumentNumber: string
  videoName: string
  googleLink: string
  nasLink: string
}

const TEMPLATE_OPTIONS: MailTemplateOption[] = [
  {
    key: 'videoDelivery',
    label: '영상 전달용',
    description: '완성된 영상을 구글 드라이브와 나스 링크로 전달할 때 쓰는 메일 본문입니다.',
  },
]

const EMPTY_VIDEO_DELIVERY_FORM: VideoDeliveryForm = {
  recipient: '',
  sender: '',
  cooperationDocumentNumber: '',
  videoName: '',
  googleLink: '',
  nasLink: '',
}

const VIDEO_DELIVERY_PLACEHOLDERS: VideoDeliveryForm = {
  recipient: '[수신자]',
  sender: '[발신자]',
  cooperationDocumentNumber: '[협조전 문서번호]',
  videoName: '[영상명]',
  googleLink: '[구글 링크]',
  nasLink: '[나스 링크]',
}

function normalizeValue(value: string): string {
  return value.trim()
}

function buildVideoDeliveryBody(values: VideoDeliveryForm): string {
  return [
    `안녕하세요 ${values.recipient}, 디자인팀 ${values.sender}입니다.`,
    '',
    `협조전 '${values.cooperationDocumentNumber}' 건으로 요청주신 ${values.videoName} 제작이 완료되었습니다.`,
    '구글 및 나스 다운로드 링크를 전달드립니다.(영상은 동일합니다.)',
    '',
    '[구글 다운로드 링크]',
    values.googleLink,
    '',
    '[나스 다운로드 링크]',
    values.nasLink,
    '',
    '확인 부탁드립니다.',
    '',
    '감사합니다.',
    `${values.sender} 드림.`,
  ].join('\n')
}

export function MailTemplateView({ onCopy }: MailTemplateViewProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<MailTemplateKind>('videoDelivery')
  const [videoDeliveryForm, setVideoDeliveryForm] = useState<VideoDeliveryForm>(EMPTY_VIDEO_DELIVERY_FORM)

  const normalizedVideoDeliveryForm = useMemo(
    () => ({
      recipient: normalizeValue(videoDeliveryForm.recipient),
      sender: normalizeValue(videoDeliveryForm.sender),
      cooperationDocumentNumber: normalizeValue(videoDeliveryForm.cooperationDocumentNumber),
      videoName: normalizeValue(videoDeliveryForm.videoName),
      googleLink: normalizeValue(videoDeliveryForm.googleLink),
      nasLink: normalizeValue(videoDeliveryForm.nasLink),
    }),
    [videoDeliveryForm],
  )

  const isVideoDeliveryReady = Object.values(normalizedVideoDeliveryForm).every(Boolean)

  const videoDeliveryPreview = useMemo(
    () =>
      buildVideoDeliveryBody({
        recipient: normalizedVideoDeliveryForm.recipient || VIDEO_DELIVERY_PLACEHOLDERS.recipient,
        sender: normalizedVideoDeliveryForm.sender || VIDEO_DELIVERY_PLACEHOLDERS.sender,
        cooperationDocumentNumber:
          normalizedVideoDeliveryForm.cooperationDocumentNumber || VIDEO_DELIVERY_PLACEHOLDERS.cooperationDocumentNumber,
        videoName: normalizedVideoDeliveryForm.videoName || VIDEO_DELIVERY_PLACEHOLDERS.videoName,
        googleLink: normalizedVideoDeliveryForm.googleLink || VIDEO_DELIVERY_PLACEHOLDERS.googleLink,
        nasLink: normalizedVideoDeliveryForm.nasLink || VIDEO_DELIVERY_PLACEHOLDERS.nasLink,
      }),
    [normalizedVideoDeliveryForm],
  )

  const onChangeVideoDeliveryField = (key: keyof VideoDeliveryForm, value: string) => {
    setVideoDeliveryForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  return (
    <section className="mailTemplateView" aria-label="메일 템플릿">
      <article className="mailTemplateHero">
        <h2>메일 템플릿</h2>
        <p>반복 발송하는 메일 문구를 템플릿으로 관리하고, 필요한 값만 입력해 본문을 바로 복사할 수 있습니다.</p>
      </article>

      <div className="mailTemplateGrid">
        <article className="mailTemplateCard mailTemplateFormCard">
          <div className="mailTemplateCardHeader">
            <div>
              <h3>템플릿 선택</h3>
              <p className="muted">다른 양식은 추후 추가하고, 현재는 영상 전달용만 제공합니다.</p>
            </div>
          </div>

          <label>
            메일 종류
            <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value as MailTemplateKind)}>
              {TEMPLATE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mailTemplateTypeHint">
            <strong>{TEMPLATE_OPTIONS.find((option) => option.key === selectedTemplate)?.label}</strong>
            <span>{TEMPLATE_OPTIONS.find((option) => option.key === selectedTemplate)?.description}</span>
          </div>

          {selectedTemplate === 'videoDelivery' ? (
            <>
              <div className="mailTemplateCardHeader">
                <div>
                  <h3>입력 값</h3>
                  <p className="muted">수신자, 발신자, 문서번호, 영상명, 링크 2개를 넣으면 본문이 바로 갱신됩니다.</p>
                </div>
                <Button type="button" variant="secondary" size="mini" onClick={() => setVideoDeliveryForm(EMPTY_VIDEO_DELIVERY_FORM)}>
                  초기화
                </Button>
              </div>

              <div className="mailTemplateFields">
                <label>
                  수신자
                  <input
                    type="text"
                    value={videoDeliveryForm.recipient}
                    onChange={(event) => onChangeVideoDeliveryField('recipient', event.target.value)}
                    placeholder="전선민 대리님"
                  />
                </label>
                <label>
                  발신자
                  <input
                    type="text"
                    value={videoDeliveryForm.sender}
                    onChange={(event) => onChangeVideoDeliveryField('sender', event.target.value)}
                    placeholder="조정훈"
                  />
                </label>
                <label>
                  협조전 문서번호
                  <input
                    type="text"
                    value={videoDeliveryForm.cooperationDocumentNumber}
                    onChange={(event) => onChangeVideoDeliveryField('cooperationDocumentNumber', event.target.value)}
                    placeholder="이젠-해외영업1팀-26034"
                  />
                </label>
                <label>
                  영상명
                  <input
                    type="text"
                    value={videoDeliveryForm.videoName}
                    onChange={(event) => onChangeVideoDeliveryField('videoName', event.target.value)}
                    placeholder="인도 행사 후기 영상"
                  />
                </label>
                <label>
                  구글 링크
                  <input
                    type="url"
                    value={videoDeliveryForm.googleLink}
                    onChange={(event) => onChangeVideoDeliveryField('googleLink', event.target.value)}
                    placeholder="https://drive.google.com/..."
                  />
                </label>
                <label>
                  나스 링크
                  <input
                    type="url"
                    value={videoDeliveryForm.nasLink}
                    onChange={(event) => onChangeVideoDeliveryField('nasLink', event.target.value)}
                    placeholder="https://izensales.synology.me/..."
                  />
                </label>
              </div>
            </>
          ) : null}
        </article>

        <div className="mailTemplatePreviewList">
          <article className="mailTemplateCard mailTemplatePreviewCard">
            <div className="mailTemplateCardHeader">
              <div>
                <h3>본문 미리보기</h3>
                <p className="muted">입력값이 비어 있으면 자리표시자가 그대로 남습니다.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="mini"
                disabled={!isVideoDeliveryReady}
                onClick={() =>
                  void onCopy(videoDeliveryPreview, {
                    successMessage: '메일 본문을 복사했습니다.',
                    emptyMessage: '수신자, 발신자, 문서번호, 영상명, 구글 링크, 나스 링크를 모두 입력해 주세요.',
                  })
                }
              >
                본문 복사
              </Button>
            </div>
            <textarea className="mailTemplateTextarea" value={videoDeliveryPreview} readOnly rows={14} />
          </article>
        </div>
      </div>
    </section>
  )
}
