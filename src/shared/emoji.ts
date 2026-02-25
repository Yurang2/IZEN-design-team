function toCodePoints(value: string): number[] {
  return Array.from(value)
    .map((char) => char.codePointAt(0))
    .filter((code): code is number => typeof code === 'number')
}

function isRegionalIndicator(code: number): boolean {
  return code >= 0x1f1e6 && code <= 0x1f1ff
}

export function flagEmojiToCountryCode(emoji: string | undefined): string | null {
  const normalized = (emoji ?? '').trim()
  if (!normalized) return null

  const regional = toCodePoints(normalized).filter((code) => isRegionalIndicator(code))
  if (regional.length < 2) return null

  const first = String.fromCharCode(regional[0] - 0x1f1e6 + 65)
  const second = String.fromCharCode(regional[1] - 0x1f1e6 + 65)
  return `${first}${second}`
}

export function emojiToTwemojiUrl(emoji: string | undefined): string | null {
  const normalized = (emoji ?? '').trim()
  if (!normalized) return null

  const code = toCodePoints(normalized)
    .map((value) => value.toString(16))
    .join('-')
  if (!code) return null

  return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${code}.svg`
}

export function formatProjectIconLabel(emoji: string | undefined): string {
  const normalized = (emoji ?? '').trim()
  if (!normalized) return ''

  const countryCode = flagEmojiToCountryCode(normalized)
  if (!countryCode) return normalized
  return `${normalized} ${countryCode}`
}
