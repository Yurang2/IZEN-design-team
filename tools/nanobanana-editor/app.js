const MAX_IMAGE_EDGE = 1600
const MASK_COLOR = 'rgba(45, 111, 214, 0.52)'

const fileInput = document.querySelector('#fileInput')
const credentialFileInput = document.querySelector('#credentialFileInput')
const credentialInput = document.querySelector('#credentialInput')
const projectInput = document.querySelector('#projectInput')
const locationInput = document.querySelector('#locationInput')
const modelInput = document.querySelector('#modelInput')
const brushInput = document.querySelector('#brushInput')
const brushValue = document.querySelector('#brushValue')
const featherInput = document.querySelector('#featherInput')
const featherValue = document.querySelector('#featherValue')
const promptInput = document.querySelector('#promptInput')
const runButton = document.querySelector('#runButton')
const runAllButton = document.querySelector('#runAllButton')
const clearButton = document.querySelector('#clearButton')
const statusText = document.querySelector('#statusText')
const canvasStage = document.querySelector('#canvasStage')
const sourceImageElement = document.querySelector('#sourceImage')
const maskCanvas = document.querySelector('#maskCanvas')
const resultMeta = document.querySelector('#resultMeta')
const itemGrid = document.querySelector('#itemGrid')
const toolButtons = {
  brush: document.querySelector('#brushTool'),
  erase: document.querySelector('#eraseTool'),
  rect: document.querySelector('#rectTool'),
}

let items = []
let selectedId = null
let tool = 'brush'
let lastPoint = null
let rectStart = null

function selectedItem() {
  return items.find((item) => item.id === selectedId) || null
}

function setStatus(message, isError = false) {
  statusText.textContent = message
  statusText.style.color = isError ? '#b42318' : '#66717d'
}

function setTool(nextTool) {
  tool = nextTool
  for (const [key, button] of Object.entries(toolButtons)) {
    button.classList.toggle('active', key === tool)
  }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    image.src = dataUrl
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsText(file)
  })
}

function dataUrlMimeType(dataUrl) {
  return dataUrl.match(/^data:([^;,]+);base64,/)?.[1] || 'image/png'
}

async function normalizeImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 열 수 있습니다.')
  const rawDataUrl = await fileToDataUrl(file)
  const image = await loadImage(rawDataUrl)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  if (scale === 1) {
    return { name: file.name, dataUrl: rawDataUrl, mimeType: file.type || dataUrlMimeType(rawDataUrl), width, height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return { name: file.name, dataUrl: canvas.toDataURL('image/png'), mimeType: 'image/png', width, height }
}

function createEmptyMask(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.toDataURL('image/png')
}

function saveSelectedMask() {
  const item = selectedItem()
  if (!item || !maskCanvas.width || !maskCanvas.height) return
  item.maskDataUrl = maskCanvas.toDataURL('image/png')
  item.hasMask = canvasHasMask(maskCanvas)
}

async function drawMaskDataUrl(maskDataUrl) {
  const context = maskCanvas.getContext('2d')
  context.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
  if (!maskDataUrl) return
  const image = await loadImage(maskDataUrl)
  context.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height)
}

async function selectItem(id) {
  saveSelectedMask()
  const item = items.find((next) => next.id === id)
  if (!item) return

  selectedId = id
  sourceImageElement.src = item.dataUrl
  canvasStage.classList.remove('empty')
  canvasStage.style.aspectRatio = `${item.width} / ${item.height}`
  maskCanvas.width = item.width
  maskCanvas.height = item.height
  await drawMaskDataUrl(item.maskDataUrl)
  setStatus(`${item.name} 선택됨. 변형할 영역을 칠하세요.`)
  renderItems()
}

function resetMask() {
  const context = maskCanvas.getContext('2d')
  context.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
  const item = selectedItem()
  if (item) {
    item.maskDataUrl = createEmptyMask(item.width, item.height)
    item.hasMask = false
  }
  renderItems()
}

function getCanvasPoint(event) {
  const rect = maskCanvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * maskCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * maskCanvas.height,
  }
}

function drawStroke(from, to) {
  const context = maskCanvas.getContext('2d')
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Number(brushInput.value)
  context.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'
  context.strokeStyle = MASK_COLOR
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()
  context.restore()
}

function drawRect(from, to) {
  const context = maskCanvas.getContext('2d')
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  const width = Math.abs(to.x - from.x)
  const height = Math.abs(to.y - from.y)
  if (width < 4 || height < 4) return
  context.fillStyle = MASK_COLOR
  context.fillRect(x, y, width, height)
}

function canvasHasMask(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) return true
  }
  return false
}

async function maskDataUrlHasMask(maskDataUrl, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const image = await loadImage(maskDataUrl)
  context.drawImage(image, 0, 0, width, height)
  return canvasHasMask(canvas)
}

async function buildMaskDataUrl(item) {
  const output = document.createElement('canvas')
  output.width = item.width
  output.height = item.height
  const outputContext = output.getContext('2d')
  const image = await loadImage(item.maskDataUrl)
  outputContext.drawImage(image, 0, 0, item.width, item.height)
  const imageData = outputContext.getImageData(0, 0, item.width, item.height)
  const pixels = imageData.data
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 255
    pixels[index + 1] = 255
    pixels[index + 2] = 255
  }
  outputContext.putImageData(imageData, 0, 0)
  return output.toDataURL('image/png')
}

function closestAspectRatio(width, height) {
  const ratio = width / height
  const candidates = [
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
    ['3:2', 3 / 2],
    ['2:3', 2 / 3],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
  ]
  return candidates.reduce((best, next) => (Math.abs(next[1] - ratio) < Math.abs(best[1] - ratio) ? next : best))[0]
}

async function compositeResult(item, generatedDataUrl, maskDataUrl) {
  const [original, generated, mask] = await Promise.all([
    loadImage(item.dataUrl),
    loadImage(generatedDataUrl),
    loadImage(maskDataUrl),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = item.width
  canvas.height = item.height
  const context = canvas.getContext('2d')
  context.drawImage(original, 0, 0, canvas.width, canvas.height)

  const generatedLayer = document.createElement('canvas')
  generatedLayer.width = canvas.width
  generatedLayer.height = canvas.height
  const generatedContext = generatedLayer.getContext('2d')
  generatedContext.imageSmoothingEnabled = true
  generatedContext.imageSmoothingQuality = 'high'
  generatedContext.drawImage(generated, 0, 0, canvas.width, canvas.height)

  const alphaLayer = document.createElement('canvas')
  alphaLayer.width = canvas.width
  alphaLayer.height = canvas.height
  const alphaContext = alphaLayer.getContext('2d')
  const feather = Number(featherInput.value)
  if (feather > 0) alphaContext.filter = `blur(${feather}px)`
  alphaContext.drawImage(mask, 0, 0, canvas.width, canvas.height)

  generatedContext.globalCompositeOperation = 'destination-in'
  generatedContext.drawImage(alphaLayer, 0, 0)
  context.drawImage(generatedLayer, 0, 0)
  return canvas.toDataURL('image/png')
}

function updateQueueSummary() {
  const pending = items.filter((item) => item.status === 'pending').length
  const running = items.filter((item) => item.status === 'running').length
  const done = items.filter((item) => item.status === 'done').length
  resultMeta.textContent = items.length ? `${items.length}개 / 대기 ${pending} / 진행 ${running} / 완료 ${done}` : '아직 이미지 없음'
}

function statusLabel(item) {
  if (item.status === 'pending') return '대기중'
  if (item.status === 'running') return '변형중'
  if (item.status === 'done') return '완료'
  if (item.status === 'error') return '실패'
  return item.hasMask ? '준비됨' : '영역 필요'
}

function renderItems() {
  updateQueueSummary()
  itemGrid.innerHTML = ''
  for (const item of items) {
    const card = document.createElement('article')
    card.className = `itemCard ${item.id === selectedId ? 'selected' : ''} status-${item.status}`

    const preview = document.createElement('button')
    preview.type = 'button'
    preview.className = 'itemPreview'
    preview.addEventListener('click', () => void selectItem(item.id))
    const previewImage = document.createElement('img')
    previewImage.src = item.resultDataUrl || item.dataUrl
    previewImage.alt = item.name
    preview.append(previewImage)

    const body = document.createElement('div')
    body.className = 'itemBody'
    const title = document.createElement('strong')
    title.textContent = item.name
    const meta = document.createElement('span')
    meta.textContent = `${statusLabel(item)} / ${item.width}x${item.height}`
    body.append(title, meta)
    if (item.error) {
      const error = document.createElement('span')
      error.className = 'itemError'
      error.textContent = item.error
      body.append(error)
    }

    const actions = document.createElement('div')
    actions.className = 'itemActions'
    const editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'secondary mini'
    editButton.textContent = '선택'
    editButton.addEventListener('click', () => void selectItem(item.id))
    actions.append(editButton)
    if (item.resultDataUrl) {
      const download = document.createElement('a')
      download.className = 'download mini'
      download.href = item.resultDataUrl
      download.download = `${item.name.replace(/\.[^.]+$/, '') || 'nanobanana'}-selected-edit.png`
      download.textContent = '저장'
      actions.append(download)
    }

    if (item.status === 'running' || item.status === 'pending') {
      const badge = document.createElement('div')
      badge.className = 'waitingOverlay'
      badge.textContent = item.status === 'running' ? '변형중' : '대기중'
      preview.append(badge)
    }

    card.append(preview, body, actions)
    itemGrid.append(card)
  }
}

async function openFiles(files) {
  const loaded = []
  for (const file of files) {
    const image = await normalizeImage(file)
    loaded.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...image,
      maskDataUrl: createEmptyMask(image.width, image.height),
      hasMask: false,
      status: 'idle',
      resultDataUrl: null,
      error: null,
    })
  }
  items = [...items, ...loaded]
  renderItems()
  if (!selectedId && loaded[0]) {
    await selectItem(loaded[0].id)
  } else {
    setStatus(`${loaded.length}개 이미지를 추가했습니다.`)
  }
}

async function requestEdit(item) {
  const maskDataUrl = await buildMaskDataUrl(item)
  const request = {
    prompt: promptInput.value,
    model: modelInput.value,
    serviceAccountJson: credentialInput.value.trim(),
    projectId: projectInput.value.trim(),
    location: locationInput.value.trim(),
    aspectRatio: closestAspectRatio(item.width, item.height),
    sourceImage: {
      name: item.name,
      dataUrl: item.dataUrl,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
    },
    maskImage: { name: 'selection-mask.png', mimeType: 'image/png', dataUrl: maskDataUrl },
  }
  const payload = window.nanobanana
    ? await window.nanobanana.edit(request)
    : await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }).then(async (response) => {
        const body = await response.json()
        if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`)
        return body
      })

  return compositeResult(item, payload.imageDataUrl, maskDataUrl)
}

async function runItem(item) {
  item.status = 'running'
  item.error = null
  renderItems()
  try {
    item.resultDataUrl = await requestEdit(item)
    item.status = 'done'
  } catch (error) {
    item.status = 'error'
    item.error = error instanceof Error ? error.message : '변형 실패'
  } finally {
    renderItems()
  }
}

async function runEdit() {
  saveSelectedMask()
  const item = selectedItem()
  if (!item) {
    setStatus('먼저 이미지를 열어 주세요.', true)
    return
  }
  if (!promptInput.value.trim()) {
    setStatus('변형 프롬프트를 입력해 주세요.', true)
    return
  }
  item.hasMask = await maskDataUrlHasMask(item.maskDataUrl, item.width, item.height)
  if (!item.hasMask) {
    setStatus('선택한 이미지의 변형할 부분을 먼저 선택해 주세요.', true)
    renderItems()
    return
  }

  setStatus(`${item.name} 변형 요청을 보냈습니다.`)
  item.status = 'pending'
  renderItems()
  await runItem(item)
  setStatus(item.status === 'done' ? `${item.name} 완료.` : `${item.name} 실패.`, item.status === 'error')
}

async function runAllEdits() {
  saveSelectedMask()
  if (!items.length) {
    setStatus('먼저 이미지를 열어 주세요.', true)
    return
  }
  if (!promptInput.value.trim()) {
    setStatus('변형 프롬프트를 입력해 주세요.', true)
    return
  }

  const readyItems = []
  for (const item of items) {
    item.hasMask = await maskDataUrlHasMask(item.maskDataUrl, item.width, item.height)
    if (item.hasMask && item.status !== 'running') readyItems.push(item)
  }
  if (!readyItems.length) {
    setStatus('변형할 영역이 선택된 이미지가 없습니다.', true)
    renderItems()
    return
  }

  for (const item of readyItems) {
    item.status = 'pending'
    item.error = null
  }
  renderItems()
  setStatus(`${readyItems.length}개 이미지 변형 요청을 동시에 보냈습니다.`)
  await Promise.all(readyItems.map((item) => runItem(item)))
  const failed = readyItems.filter((item) => item.status === 'error').length
  setStatus(failed ? `${readyItems.length - failed}개 완료, ${failed}개 실패.` : `${readyItems.length}개 모두 완료.`, failed > 0)
}

fileInput.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  try {
    await openFiles(files)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '이미지를 열지 못했습니다.', true)
  } finally {
    event.target.value = ''
  }
})

credentialFileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await fileToText(file)
    JSON.parse(text)
    credentialInput.value = text
    setStatus('서비스 계정 JSON을 불러왔습니다.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'JSON 파일을 읽지 못했습니다.', true)
  } finally {
    event.target.value = ''
  }
})

maskCanvas.addEventListener('pointerdown', (event) => {
  if (!selectedItem()) return
  maskCanvas.setPointerCapture(event.pointerId)
  const point = getCanvasPoint(event)
  if (tool === 'rect') {
    rectStart = point
  } else {
    lastPoint = point
    drawStroke(point, point)
  }
})

maskCanvas.addEventListener('pointermove', (event) => {
  if (!selectedItem() || tool === 'rect' || !lastPoint || event.buttons !== 1) return
  const point = getCanvasPoint(event)
  drawStroke(lastPoint, point)
  lastPoint = point
})

maskCanvas.addEventListener('pointerup', (event) => {
  const point = getCanvasPoint(event)
  if (tool === 'rect' && rectStart) drawRect(rectStart, point)
  rectStart = null
  lastPoint = null
  if (maskCanvas.hasPointerCapture(event.pointerId)) maskCanvas.releasePointerCapture(event.pointerId)
  saveSelectedMask()
  renderItems()
})

maskCanvas.addEventListener('pointercancel', () => {
  rectStart = null
  lastPoint = null
  saveSelectedMask()
  renderItems()
})

for (const [key, button] of Object.entries(toolButtons)) {
  button.addEventListener('click', () => setTool(key))
}

brushInput.addEventListener('input', () => {
  brushValue.textContent = brushInput.value
})

featherInput.addEventListener('input', () => {
  featherValue.textContent = featherInput.value
})

clearButton.addEventListener('click', () => {
  resetMask()
  setStatus('선택 영역을 지웠습니다.')
})

runButton.addEventListener('click', runEdit)
runAllButton.addEventListener('click', runAllEdits)

const configPromise = window.nanobanana ? window.nanobanana.config() : fetch('/api/config').then((response) => response.json())

configPromise
  .then((config) => {
    if (config.defaultModel) modelInput.value = config.defaultModel
    if (config.defaultLocation) locationInput.value = config.defaultLocation
    if (config.projectId) projectInput.value = config.projectId
  })
  .catch(() => {})
