import { useMemo, useState } from 'react'
import { Button } from '../../shared/ui'

type CopyOptions = {
  successMessage?: string
  emptyMessage?: string
}

type SnsPostGeneratorViewProps = {
  onCopy: (text: string, options?: CopyOptions) => Promise<void>
}

type FormState = {
  eventName: string
  countryName: string
  cityName: string
  startDate: string
  endDate: string
}

type PreviewValues = {
  eventName: string
  countryName: string
  cityName: string
  dateLabel: string
}

type HeartOption = {
  key: string
  label: string
  emoji: string
}

const EMPTY_FORM: FormState = {
  eventName: '',
  countryName: '',
  cityName: '',
  startDate: '',
  endDate: '',
}

const HEART_OPTIONS: HeartOption[] = [
  { key: 'red', label: '레드 하트', emoji: '❤️' },
  { key: 'orange', label: '오렌지 하트', emoji: '🧡' },
  { key: 'yellow', label: '옐로 하트', emoji: '💛' },
  { key: 'green', label: '그린 하트', emoji: '💚' },
  { key: 'blue', label: '블루 하트', emoji: '💙' },
  { key: 'lightBlue', label: '라이트 블루 하트', emoji: '🩵' },
  { key: 'purple', label: '퍼플 하트', emoji: '💜' },
  { key: 'pink', label: '핑크 하트', emoji: '🩷' },
  { key: 'brown', label: '브라운 하트', emoji: '🤎' },
  { key: 'black', label: '블랙 하트', emoji: '🖤' },
  { key: 'gray', label: '그레이 하트', emoji: '🩶' },
  { key: 'white', label: '화이트 하트', emoji: '🤍' },
]

const PLACEHOLDER_VALUES: PreviewValues = {
  eventName: '[행사명]',
  countryName: '[국가명]',
  cityName: '[도시명]',
  dateLabel: '[날짜]',
}

const STATIC_HASHTAGS = [
  'izenimplant',
  'koreanimplant',
  'zenexsystem',
  'izen',
  'zenex',
  'implant',
  'dental',
  'implantology',
  'dentalimplant',
  'dentistry',
  'implants',
  'implantdentist',
]

function normalizeValue(value: string): string {
  return value.trim()
}

function compactTag(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function uniqueTags(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function parseIsoDateToken(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function formatDateInput(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

function formatDay(date: Date): string {
  return String(date.getUTCDate()).padStart(2, '0')
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(date)
}

function formatDateRange(startValue: string, endValue: string): string | null {
  const start = parseIsoDateToken(startValue)
  if (!start) return null

  const end = endValue ? parseIsoDateToken(endValue) : start
  if (!end) return null

  const sorted = start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start }
  const { start: first, end: last } = sorted

  if (first.getTime() === last.getTime()) {
    return `${formatDay(first)} ${formatMonth(first)}, ${first.getUTCFullYear()}`
  }

  if (first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()) {
    return `${formatDay(first)}-${formatDay(last)} ${formatMonth(first)}, ${first.getUTCFullYear()}`
  }

  if (first.getUTCFullYear() === last.getUTCFullYear()) {
    return `${formatDay(first)} ${formatMonth(first)} - ${formatDay(last)} ${formatMonth(last)}, ${first.getUTCFullYear()}`
  }

  return `${formatDay(first)} ${formatMonth(first)}, ${first.getUTCFullYear()} - ${formatDay(last)} ${formatMonth(last)}, ${last.getUTCFullYear()}`
}

function buildHashtags(countryName: string, cityName: string, isReady: boolean): string[] {
  if (!isReady) {
    return [
      'izenimplantincountry',
      'izenimplant',
      'izenimplantcountry',
      'koreanimplant',
      'zenexsystem',
      'izen',
      'zenex',
      'implant',
      'dental',
      'implantology',
      'dentalimplant',
      'dentistry',
      'implants',
      'implantdentist',
      'country',
      'city',
      'countrydental',
    ]
  }

  const countryTag = compactTag(countryName)
  const cityTag = compactTag(cityName)

  return uniqueTags([
    countryTag ? `izenimplantin${countryTag}` : '',
    'izenimplant',
    countryTag ? `izenimplant${countryTag}` : '',
    ...STATIC_HASHTAGS,
    countryTag,
    cityTag,
    countryTag ? `${countryTag}dental` : '',
  ])
}

function buildPostText(values: PreviewValues, heart: string, hashtags: string[]): string {
  return [
    `IZEN IMPLANT in ${values.countryName}${heart}`,
    '',
    values.eventName,
    '',
    `📍 Date: ${values.dateLabel}`,
    `📍 Location: ${values.cityName}, ${values.countryName}`,
    '',
    hashtags.map((tag) => `#${tag}`).join(' '),
  ].join('\n')
}

export function SnsPostGeneratorView({ onCopy }: SnsPostGeneratorViewProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [selectedHeartKey, setSelectedHeartKey] = useState<string>(HEART_OPTIONS[0]?.key ?? 'red')

  const normalizedForm = useMemo(
    () => ({
      eventName: normalizeValue(form.eventName),
      countryName: normalizeValue(form.countryName),
      cityName: normalizeValue(form.cityName),
      startDate: normalizeValue(form.startDate),
      endDate: normalizeValue(form.endDate),
    }),
    [form],
  )

  const selectedHeart =
    HEART_OPTIONS.find((option) => option.key === selectedHeartKey) ?? HEART_OPTIONS[0]
  const formattedDate = useMemo(
    () => formatDateRange(normalizedForm.startDate, normalizedForm.endDate),
    [normalizedForm.endDate, normalizedForm.startDate],
  )

  const hasRequiredFields =
    Boolean(normalizedForm.eventName) &&
    Boolean(normalizedForm.countryName) &&
    Boolean(normalizedForm.cityName) &&
    Boolean(normalizedForm.startDate)
  const isReady = hasRequiredFields && Boolean(formattedDate)

  const previewValues: PreviewValues = isReady
    ? {
        eventName: normalizedForm.eventName,
        countryName: normalizedForm.countryName,
        cityName: normalizedForm.cityName,
        dateLabel: formattedDate ?? PLACEHOLDER_VALUES.dateLabel,
      }
    : {
        eventName: normalizedForm.eventName || PLACEHOLDER_VALUES.eventName,
        countryName: normalizedForm.countryName || PLACEHOLDER_VALUES.countryName,
        cityName: normalizedForm.cityName || PLACEHOLDER_VALUES.cityName,
        dateLabel: formattedDate ?? PLACEHOLDER_VALUES.dateLabel,
      }

  const hashtags = useMemo(
    () => buildHashtags(normalizedForm.countryName, normalizedForm.cityName, isReady),
    [isReady, normalizedForm.cityName, normalizedForm.countryName],
  )

  const postText = useMemo(
    () => buildPostText(previewValues, selectedHeart.emoji, hashtags),
    [hashtags, previewValues, selectedHeart.emoji],
  )

  const onChangeField = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const onChangeDateField = (key: 'startDate' | 'endDate', value: string) => {
    onChangeField(key, formatDateInput(value))
  }

  return (
    <section className="snsPostView" aria-label="SNS 본문 생성기">
      <article className="snsPostHero">
        <h2>SNS 본문 자동 생성</h2>
        <p>하트 색상을 직접 고르고, 국가명과 도시명만 반영해서 본문과 해시태그를 생성합니다.</p>
      </article>

      <div className="snsPostGrid">
        <article className="snsPostCard snsPostFormCard">
          <div className="snsPostCardHeader">
            <div>
              <h3>입력</h3>
              <p className="muted">종료일은 비워두면 단일 날짜로 처리됩니다. 날짜는 `YYYY-MM-DD` 형식으로 입력해 주세요.</p>
            </div>
            <Button type="button" variant="secondary" size="mini" onClick={() => setForm(EMPTY_FORM)}>
              초기화
            </Button>
          </div>

          <div className="snsPostFormFields">
            <label>
              행사명
              <input
                type="text"
                value={form.eventName}
                onChange={(event) => onChangeField('eventName', event.target.value)}
                placeholder="Tajikistan Second Office Course"
              />
            </label>
            <label>
              국가명
              <input
                type="text"
                value={form.countryName}
                onChange={(event) => onChangeField('countryName', event.target.value)}
                placeholder="Tajikistan"
              />
            </label>
            <label>
              도시명
              <input
                type="text"
                value={form.cityName}
                onChange={(event) => onChangeField('cityName', event.target.value)}
                placeholder="Dushanbe"
              />
            </label>
            <label>
              시작일
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                className="snsPostDateInput"
                value={form.startDate}
                onChange={(event) => onChangeDateField('startDate', event.target.value)}
                placeholder="2025-12-14"
                autoComplete="off"
              />
            </label>
            <label>
              종료일(선택)
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                className="snsPostDateInput"
                value={form.endDate}
                onChange={(event) => onChangeDateField('endDate', event.target.value)}
                placeholder="2025-12-14"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="snsPostTagSection">
            <div className="snsPostCardHeader">
              <div>
                <h3>하트 / 해시태그</h3>
                <p className="muted">브랜드 태그는 고정이고, 하트는 원하는 색상으로 직접 지정할 수 있습니다.</p>
              </div>
            </div>
            <div className="snsPostHeartOptions" role="radiogroup" aria-label="하트 색상 선택">
              {HEART_OPTIONS.map((heartOption) => {
                const isSelected = heartOption.key === selectedHeart.key

                return (
                  <button
                    key={heartOption.key}
                    type="button"
                    className={`snsPostHeartOption${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setSelectedHeartKey(heartOption.key)}
                    aria-pressed={isSelected}
                    aria-label={heartOption.label}
                    title={heartOption.label}
                  >
                    <span className="snsPostHeartEmoji" aria-hidden="true">
                      {heartOption.emoji}
                    </span>
                    <span className="snsPostHeartLabel">{heartOption.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="snsPostTagList" aria-label="생성된 해시태그">
              {hashtags.map((tag) => (
                <span key={tag} className="snsPostTag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {normalizedForm.startDate && !formattedDate ? (
            <p className="error">시작일과 종료일은 `YYYY-MM-DD` 형식으로 입력해 주세요.</p>
          ) : null}
        </article>

        <div className="snsPostTemplateList">
          <article className="snsPostCard snsPostTemplateCard">
            <div className="snsPostCardHeader">
              <h3>생성 결과</h3>
              <Button
                type="button"
                variant="secondary"
                size="mini"
                disabled={!isReady}
                onClick={() =>
                  void onCopy(postText, {
                    successMessage: 'SNS 본문을 복사했습니다.',
                    emptyMessage: '행사명, 국가명, 도시명, 시작일을 올바르게 입력해 주세요.',
                  })
                }
              >
                복사
              </Button>
            </div>
            <textarea className="snsPostTextarea" value={postText} readOnly rows={10} />
            <p className="muted snsPostTemplateHint">선택한 하트 색상이 첫 줄 제목에 바로 반영됩니다.</p>
          </article>
        </div>
      </div>
    </section>
  )
}
