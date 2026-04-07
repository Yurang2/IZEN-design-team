// ---------------------------------------------------------------------------
// Video Production Checklist — 영상 작업 체크리스트
// ---------------------------------------------------------------------------
// Notion DB에서 항목을 가져옵니다. 오프라인 시 마지막 캐시를 사용합니다.
// ---------------------------------------------------------------------------

const API_BASE = 'https://izen-design-team.a98763969.workers.dev/api'
const STORAGE_KEY = 'izen-video-checklist'
const CACHE_KEY = 'izen-video-checklist-items'

let CHECKLIST = [] // [{ category, items: [{ id, text }] }]

// ---------------------------------------------------------------------------
// API fetch + cache
// ---------------------------------------------------------------------------

async function fetchChecklist() {
  try {
    const res = await fetch(`${API_BASE}/video-manual`)
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json()
    if (data.ok && data.items?.length > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data.items))
      return groupItems(data.items)
    }
  } catch {
    // offline or error — use cache
  }
  // try cached
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached?.length > 0) return groupItems(cached)
  } catch {}
  return []
}

function groupItems(items) {
  const map = new Map()
  for (const item of items) {
    const cat = item.category || '미분류'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat).push({ id: item.id, text: item.itemName })
  }
  return [...map.entries()].map(([category, list]) => ({ category, items: list }))
}

// ---------------------------------------------------------------------------
// Storage — check state
// ---------------------------------------------------------------------------

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  const body = document.getElementById('checklist-body')
  const state = loadState()
  body.innerHTML = ''

  if (CHECKLIST.length === 0) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:rgba(255,255,255,0.4)">항목을 불러오는 중...</div>'
    return
  }

  let totalItems = 0
  let checkedItems = 0

  CHECKLIST.forEach((cat) => {
    const catEl = document.createElement('div')
    catEl.className = 'category is-open'

    let catChecked = 0
    cat.items.forEach((item) => {
      totalItems++
      if (state[item.id]) { checkedItems++; catChecked++ }
    })
    const allDone = catChecked === cat.items.length

    const header = document.createElement('button')
    header.className = 'category-header'
    header.innerHTML = `
      <span class="category-arrow">▶</span>
      <span class="category-label">${cat.category}</span>
      <span class="category-count ${allDone ? 'is-done' : ''}">${catChecked}/${cat.items.length}</span>
    `
    header.addEventListener('click', () => {
      catEl.classList.toggle('is-open')
    })

    const itemsWrap = document.createElement('div')
    itemsWrap.className = 'category-items'

    cat.items.forEach((item) => {
      const checked = !!state[item.id]

      const el = document.createElement('label')
      el.className = `check-item${checked ? ' is-checked' : ''}`

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = checked
      cb.addEventListener('change', () => {
        const s = loadState()
        if (cb.checked) s[item.id] = true; else delete s[item.id]
        saveState(s)
        render()
      })

      const label = document.createElement('span')
      label.className = 'check-label'
      label.textContent = item.text

      el.appendChild(cb)
      el.appendChild(label)
      itemsWrap.appendChild(el)
    })

    catEl.appendChild(header)
    catEl.appendChild(itemsWrap)
    body.appendChild(catEl)
  })

  const pct = totalItems ? Math.round((checkedItems / totalItems) * 100) : 0
  document.getElementById('progress-bar').style.width = pct + '%'
  document.getElementById('progress-text').textContent = `${checkedItems} / ${totalItems}`
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  render() // show loading state

  CHECKLIST = await fetchChecklist()
  render() // show actual items

  document.getElementById('btn-close').addEventListener('click', () => window.overlay.close())
  document.getElementById('btn-minimize').addEventListener('click', () => window.overlay.minimize())

  const slider = document.getElementById('opacity-slider')
  const opacityLabel = document.getElementById('opacity-value')
  slider.addEventListener('input', () => {
    const pct = parseInt(slider.value, 10)
    opacityLabel.textContent = pct + '%'
    window.overlay.setOpacity(pct / 100)
  })

  document.getElementById('btn-reset').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY)
    render()
  })

  document.getElementById('btn-collapse-all').addEventListener('click', () => {
    const cats = document.querySelectorAll('.category')
    const allClosed = [...cats].every(c => !c.classList.contains('is-open'))
    cats.forEach(c => {
      if (allClosed) c.classList.add('is-open'); else c.classList.remove('is-open')
    })
    document.getElementById('btn-collapse-all').textContent = allClosed ? '모두 접기' : '모두 펼치기'
  })
})
