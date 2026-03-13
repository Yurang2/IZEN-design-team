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

type TemplateDefinition = {
  key: string
  label: string
  emoji: string
  buildSubtitle: (values: PreviewValues) => string
}

type PreviewValues = {
  eventName: string
  countryName: string
  cityName: string
  dateText: string
}

type PreviewTemplate = TemplateDefinition & {
  text: string
}

const EMPTY_FORM: FormState = {
  eventName: '',
  countryName: '',
  cityName: '',
  dateText: '',
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: 'standard',
    label: '패턴 A · 기본형',
    emoji: '🤍',
    buildSubtitle: ({ cityName }) => `Live Update from ${cityName}`,
  },
  {
    key: 'city-focus',
    label: '패턴 B · 도시 강조형',
    emoji: '💜',
    buildSubtitle: ({ cityName, countryName }) => `Highlights from ${cityName}, ${countryName}`,
  },
  {
    key: 'event-focus',
    label: '패턴 C · 행사 강조형',
    emoji: '🩷',
    buildSubtitle: ({ eventName, cityName }) => `${eventName} Spotlight in ${cityName}`,
  },
]

const PLACEHOLDER_VALUES: PreviewValues = {
  eventName: '[행사명]',
  countryName: '[국가명]',
  cityName: '[도시명]',
  dateText: '[날짜]',
}

const IMPLANT_DEFAULT_TAGS = [
  'koreanimplant',
  'implant',
  'dental',
  'implantology',
  'dentalimplant',
  'dentistry',
  'implants',
  'implantdentist',
]

const IZEN_BRAND_TAGS = ['zenexsystem', 'izen', 'zenex']

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

function buildHashtags(values: PreviewValues, isReady: boolean): string[] {
  if (!isReady) {
    return ['eventname', 'countryname', 'cityname', 'hashtags']
  }

  const eventTag = compactTag(values.eventName)
  const countryTag = compactTag(values.countryName)
  const cityTag = compactTag(values.cityName)
  const eventWordTags = values.eventName
    .split(/[\s/,&+-]+/g)
    .map((entry) => compactTag(entry))
    .filter(Boolean)

  const isImplantEvent = /implant/i.test(values.eventName)
  const isIzenEvent = /izen/i.test(values.eventName)

  const tags = [
    countryTag && eventTag ? `${eventTag}in${countryTag}` : '',
    eventTag,
    countryTag && eventTag ? `${eventTag}${countryTag}` : '',
    ...eventWordTags,
    ...(isImplantEvent ? IMPLANT_DEFAULT_TAGS : ['event', 'seminar', 'training']),
    ...(isIzenEvent ? IZEN_BRAND_TAGS : []),
    countryTag,
    cityTag,
    countryTag ? `${countryTag}${isImplantEvent ? 'dental' : 'event'}` : '',
  ]

  return uniqueTags(tags)
}

function buildPostText(values: PreviewValues, template: TemplateDefinition, hashtags: string[]): string {
  return [
    `${values.eventName} in ${values.countryName} ${template.emoji}`.trim(),
    '',
    template.buildSubtitle(values),
    '',
    `📍 Date: ${values.dateText}`,
    `📍 Location: ${values.cityName}, ${values.countryName}`,
    '',
    hashtags.map((tag) => `#${tag}`).join(' '),
  ].join('\n')
}

export function SnsPostGeneratorView({ onCopy }: SnsPostGeneratorViewProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const normalizedForm = useMemo<PreviewValues>(
    () => ({
      eventName: normalizeValue(form.eventName),
      countryName: normalizeValue(form.countryName),
      cityName: normalizeValue(form.cityName),
      dateText: normalizeValue(form.dateText),
    }),
    [form],
  )

  const isReady =
    Boolean(normalizedForm.eventName) &&
    Boolean(normalizedForm.countryName) &&
    Boolean(normalizedForm.cityName) &&
    Boolean(normalizedForm.dateText)

  const previewValues = isReady
    ? normalizedForm
    : {
        eventName: normalizedForm.eventName || PLACEHOLDER_VALUES.eventName,
        countryName: normalizedForm.countryName || PLACEHOLDER_VALUES.countryName,
        cityName: normalizedForm.cityName || PLACEHOLDER_VALUES.cityName,
        dateText: normalizedForm.dateText || PLACEHOLDER_VALUES.dateText,
      }

  const hashtags = useMemo(() => buildHashtags(normalizedForm, isReady), [isReady, normalizedForm])

  const templates = useMemo<PreviewTemplate[]>(
    () =>
      TEMPLATE_DEFINITIONS.map((template) => ({
        ...template,
        text: buildPostText(previewValues, template, hashtags),
      })),
    [hashtags, previewValues],
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
        <p>행사명, 국가명, 도시명, 날짜만 넣으면 재사용 가능한 본문 패턴과 해시태그를 바로 만듭니다.</p>
      </article>

      <div className="snsPostGrid">
        <article className="snsPostCard snsPostFormCard">
          <div className="snsPostCardHeader">
            <div>
              <h3>입력</h3>
              <p className="muted">날짜는 원하는 표기 그대로 반영됩니다. 예: `19 February, 2026`</p>
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
                placeholder="IZEN IMPLANT"
              />
            </label>
            <label>
              국가명
              <input
                type="text"
                value={form.countryName}
                onChange={(event) => onChangeField('countryName', event.target.value)}
                placeholder="Kyrgyzstan"
              />
            </label>
            <label>
              도시명
              <input
                type="text"
                value={form.cityName}
                onChange={(event) => onChangeField('cityName', event.target.value)}
                placeholder="Bishkek"
              />
            </label>
            <label>
              날짜
              <input
                type="text"
                value={form.dateText}
                onChange={(event) => onChangeField('dateText', event.target.value)}
                placeholder="19 February, 2026"
              />
            </label>
          </div>

          <div className="snsPostTagSection">
            <div className="snsPostCardHeader">
              <div>
                <h3>자동 해시태그</h3>
                <p className="muted">`implant`가 포함되면 임플란트용 기본 태그 묶음을 자동 확장합니다.</p>
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
        </article>

        <div className="snsPostTemplateList">
          {templates.map((template) => (
            <article key={template.key} className="snsPostCard snsPostTemplateCard">
              <div className="snsPostCardHeader">
                <div>
                  <h3>{template.label}</h3>
                  <p className="muted">입력값만 바꾸면 같은 구조로 계속 재사용할 수 있습니다.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="mini"
                  disabled={!isReady}
                  onClick={() =>
                    void onCopy(template.text, {
                      successMessage: 'SNS 본문을 복사했습니다.',
                      emptyMessage: '먼저 행사명, 국가명, 도시명, 날짜를 모두 입력해 주세요.',
                    })
                  }
                >
                  복사
                </Button>
              </div>
              <textarea className="snsPostTextarea" value={template.text} readOnly rows={10} />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
