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
  dateText: string
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

type ParsedDateRange = {
  start: Date
  end: Date
}

const EMPTY_FORM: FormState = {
  eventName: '',
  countryName: '',
  cityName: '',
  dateText: '',
}

const HEART_OPTIONS: HeartOption[] = [
  { key: 'white', label: '화이트 하트', emoji: '🤍' },
  { key: 'purple', label: '퍼플 하트', emoji: '💜' },
  { key: 'pink', label: '핑크 하트', emoji: '🩷' },
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

function extractDateTokens(value: string): string[] {
  return value.match(/\d{4}-\d{2}-\d{2}/g) ?? []
}

function parseDateRange(value: string): ParsedDateRange | null {
  const tokens = extractDateTokens(value)
  if (tokens.length === 0) return null

  const parsed = tokens.map(parseIsoDateToken)
  if (parsed.some((entry) => entry === null)) return null

  const dates = parsed as Date[]
  dates.sort((a, b) => a.getTime() - b.getTime())

  return {
    start: dates[0],
    end: dates[dates.length - 1],
  }
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

function formatDateRange(value: string): string | null {
  const parsed = parseDateRange(value)
  if (!parsed) return null

  const { start, end } = parsed
  const startYear = start.getUTCFullYear()
  const endYear = end.getUTCFullYear()
  const startMonth = start.getUTCMonth()
  const endMonth = end.getUTCMonth()

  if (start.getTime() === end.getTime()) {
    return `${formatDay(start)} ${formatMonth(start)}, ${startYear}`
  }

  if (startYear === endYear && startMonth === endMonth) {
    return `${formatDay(start)}-${formatDay(end)} ${formatMonth(start)}, ${startYear}`
  }

  if (startYear === endYear) {
    return `${formatDay(start)} ${formatMonth(start)} - ${formatDay(end)} ${formatMonth(end)}, ${startYear}`
  }

  return `${formatDay(start)} ${formatMonth(start)}, ${startYear} - ${formatDay(end)} ${formatMonth(end)}, ${endYear}`
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

  const normalizedForm = useMemo(
    () => ({
      eventName: normalizeValue(form.eventName),
      countryName: normalizeValue(form.countryName),
      cityName: normalizeValue(form.cityName),
      dateText: normalizeValue(form.dateText),
    }),
    [form],
  )

  const formattedDate = useMemo(() => formatDateRange(normalizedForm.dateText), [normalizedForm.dateText])
  const hasRequiredFields =
    Boolean(normalizedForm.eventName) && Boolean(normalizedForm.countryName) && Boolean(normalizedForm.cityName)
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

  const onChangeField = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  return (
    <section className="snsPostView" aria-label="SNS 본문 생성기">
      <article className="snsPostHero">
        <h2>SNS 본문 자동 생성</h2>
        <p>첫 줄은 `IZEN IMPLANT in 국가명 + 하트`로 고정하고, 행사명은 둘째 줄에 그대로 넣습니다.</p>
      </article>

      <div className="snsPostGrid">
        <article className="snsPostCard snsPostFormCard">
          <div className="snsPostCardHeader">
            <div>
              <h3>입력</h3>
              <p className="muted">날짜는 `YYYY-MM-DD` 형식으로 입력해 주세요. 여러 날짜는 쉼표 또는 `~`로 구분할 수 있습니다.</p>
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
              날짜
              <input
                type="text"
                value={form.dateText}
                onChange={(event) => onChangeField('dateText', event.target.value)}
                placeholder="2025-12-14 또는 2026-01-31,2026-02-01"
              />
            </label>
          </div>

          <div className="snsPostTagSection">
            <div className="snsPostCardHeader">
              <div>
                <h3>해시태그</h3>
                <p className="muted">브랜드 관련 태그는 고정하고, 국가명과 도시명만 치환합니다.</p>
              </div>
            </div>
            <div className="snsPostTagList" aria-label="생성된 해시태그">
              {hashtags.map((tag) => (
                <span key={tag} className="snsPostTag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {!formattedDate && normalizedForm.dateText ? (
            <p className="error">날짜는 `YYYY-MM-DD`, `YYYY-MM-DD,YYYY-MM-DD`, `YYYY-MM-DD~YYYY-MM-DD` 형식으로 입력해 주세요.</p>
          ) : null}
        </article>

        <div className="snsPostTemplateList">
          {HEART_OPTIONS.map((heartOption) => {
            const text = buildPostText(previewValues, heartOption.emoji, hashtags)

            return (
              <article key={heartOption.key} className="snsPostCard snsPostTemplateCard">
                <div className="snsPostCardHeader">
                  <div>
                    <h3>{heartOption.label}</h3>
                    <p className="muted">본문 구조는 고정이고 하트만 다르게 복사할 수 있습니다.</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="mini"
                    disabled={!isReady}
                    onClick={() =>
                      void onCopy(text, {
                        successMessage: 'SNS 본문을 복사했습니다.',
                        emptyMessage: '행사명, 국가명, 도시명, 날짜를 올바르게 입력해 주세요.',
                      })
                    }
                  >
                    복사
                  </Button>
                </div>
                <textarea className="snsPostTextarea" value={text} readOnly rows={10} />
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
