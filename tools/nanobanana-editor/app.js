const MAX_IMAGE_EDGE = 1600
const MASK_COLOR = 'rgba(45, 111, 214, 0.52)'

const fileInput = document.querySelector('#fileInput')
const sourceDropTarget = document.querySelector('#sourceDropTarget')
const referenceInput = document.querySelector('#referenceInput')
const referenceDropTarget = document.querySelector('#referenceDropTarget')
const referenceStrip = document.querySelector('#referenceStrip')
const credentialBox = document.querySelector('.credentialBox')
const credentialFileInput = document.querySelector('#credentialFileInput')
const credentialInput = document.querySelector('#credentialInput')
const credentialStatus = document.querySelector('#credentialStatus')
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
const previewToggleButton = document.querySelector('#previewToggleButton')
const selectedDownloadLink = document.querySelector('#selectedDownloadLink')
const selectAllButton = document.querySelector('#selectAllButton')
const clearButton = document.querySelector('#clearButton')
const statusText = document.querySelector('#statusText')
const workspace = document.querySelector('.workspace')
const canvasStage = document.querySelector('#canvasStage')
const sourceImageElement = document.querySelector('#sourceImage')
const previewImageElement = document.querySelector('#previewImage')
const maskCanvas = document.querySelector('#maskCanvas')
const draftCanvas = document.querySelector('#draftCanvas')
const previewBadge = document.querySelector('#previewBadge')
const resultMeta = document.querySelector('#resultMeta')
const resultPanel = document.querySelector('.resultPanel')
const itemGrid = document.querySelector('#itemGrid')
const toolButtons = {
  brush: document.querySelector('#brushTool'),
  erase: document.querySelector('#eraseTool'),
  rect: document.querySelector('#rectTool'),
}

let items = []
let referenceImages = []
let selectedId = null
let tool = 'brush'
let lastPoint = null
let rectStart = null
let previewMode = false
let suppressNextItemClick = false
let hasEnvCredential = false

function selectedItem() {
  return items.find((item) => item.id === selectedId) || null
}

function setStatus(message, isError = false) {
  statusText.textContent = message
  statusText.style.color = isError ? '#b42318' : '#66717d'
}

function updateCredentialState() {
  const ready = hasEnvCredential || Boolean(credentialInput.value.trim())
  credentialBox.classList.toggle('missingCredential', !ready)
  credentialBox.classList.toggle('readyCredential', ready)
  credentialStatus.textContent = ready ? 'Vertex JSON 선택됨' : 'Vertex JSON 미선택'
}

function setTool(nextTool) {
  tool = nextTool
  for (const [key, button] of Object.entries(toolButtons)) {
    button.classList.toggle('active', key === tool)
  }
}

function selectedDownloadName(item) {
  const suffix = resultDataUrls(item).length > 1 ? `-${selectedResultIndex(item) + 1}` : ''
  return `${item.name.replace(/\.[^.]+$/, '') || 'nanobanana'}-selected-edit${suffix}.png`
}

function itemSortTime(item) {
  if (Number.isFinite(item.sortTime)) return item.sortTime
  const parsed = Date.parse(item.updatedAt || item.createdAt || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function sortedItems() {
  return [...items].sort((a, b) => itemSortTime(b) - itemSortTime(a))
}

function resultDataUrls(item) {
  if (Array.isArray(item?.resultDataUrls) && item.resultDataUrls.length) return item.resultDataUrls
  return item?.resultDataUrl ? [item.resultDataUrl] : []
}

function selectedResultIndex(item) {
  const urls = resultDataUrls(item)
  const index = Number.isInteger(item?.selectedResultIndex) ? item.selectedResultIndex : 0
  return Math.max(0, Math.min(index, Math.max(0, urls.length - 1)))
}

function currentResultDataUrl(item) {
  return resultDataUrls(item)[selectedResultIndex(item)] || null
}

function setResultDataUrls(item, urls) {
  item.resultDataUrls = urls
  item.selectedResultIndex = 0
  item.resultDataUrl = urls[0] || null
}

function selectResultVariant(item, index) {
  const urls = resultDataUrls(item)
  if (!urls[index]) return
  item.selectedResultIndex = index
  item.resultDataUrl = urls[index]
  if (item.id === selectedId) {
    previewImageElement.src = item.resultDataUrl
    updateSelectedPreviewControls()
  }
  renderItems()
  setStatus(`${item.name} 편집본 ${index + 1}/${urls.length} 선택됨.`)
}

function fitCanvasStageToWindow() {
  const item = selectedItem()
  if (!item) return
  const workspaceRect = workspace.getBoundingClientRect()
  const panelHeight = resultPanel?.getBoundingClientRect().height || 0
  const maxWidth = Math.max(320, workspaceRect.width)
  const maxHeight = Math.max(260, workspaceRect.height - panelHeight - 40)
  const ratio = item.width / item.height
  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }
  canvasStage.style.width = `${Math.round(width)}px`
  canvasStage.style.height = `${Math.round(height)}px`
}

function resetCanvasStage() {
  selectedId = null
  previewMode = false
  sourceImageElement.removeAttribute('src')
  previewImageElement.removeAttribute('src')
  canvasStage.classList.add('empty')
  canvasStage.classList.remove('previewing')
  canvasStage.style.removeProperty('aspect-ratio')
  canvasStage.style.removeProperty('width')
  canvasStage.style.removeProperty('height')
  maskCanvas.width = 0
  maskCanvas.height = 0
  draftCanvas.width = 0
  draftCanvas.height = 0
  updateSelectedPreviewControls()
}

function resolveRequestLocation() {
  if (modelInput.value === 'gemini-3.1-flash-image-preview') return 'global'
  return locationInput.value.trim() || 'us-central1'
}

function buildReferenceInstruction() {
  if (!referenceImages.length) return ''
  return [
    'Use the provided reference image(s) as visual guidance for the requested edit in the selected area.',
    'Refer to the relevant shapes, structure, materials, colors, lighting, proportions, and details from the reference image(s) only as needed for the user request.',
    'Blend the referenced visual information into the source image perspective and lighting. Do not paste a reference image as a flat rectangle.',
  ].join(' ')
}

function updateSelectedPreviewControls() {
  const item = selectedItem()
  const resultDataUrl = currentResultDataUrl(item)
  const hasResult = Boolean(resultDataUrl)
  previewToggleButton.disabled = !hasResult
  previewToggleButton.textContent = previewMode ? '기존본 보기' : '편집본 보기'
  selectedDownloadLink.classList.toggle('disabled', !hasResult)
  if (item && hasResult) {
    selectedDownloadLink.href = resultDataUrl
    selectedDownloadLink.download = selectedDownloadName(item)
  } else {
    selectedDownloadLink.removeAttribute('href')
  }
  canvasStage.classList.toggle('previewing', previewMode && hasResult)
  previewImageElement.style.removeProperty('display')
  previewBadge.textContent = previewMode && hasResult ? '편집본 표시중' : '기존본 표시중'
  maskCanvas.style.pointerEvents = previewMode && hasResult ? 'none' : ''
  draftCanvas.style.pointerEvents = 'none'
}

function historyResultName(item) {
  return item.historyDir ? `${item.historyDir}\\result.png` : selectedDownloadName(item)
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
  if (!isImageFile(file)) throw new Error('이미지 파일만 열 수 있습니다.')
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

function isImageFile(file) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)
}

function imageFilesFrom(fileList) {
  return Array.from(fileList || []).filter(isImageFile)
}

async function openReferenceFiles(files) {
  const loaded = []
  for (const file of files) {
    const image = await normalizeImage(file)
    loaded.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...image,
    })
  }
  referenceImages = [...referenceImages, ...loaded]
  renderReferences()
  setStatus(`참조 이미지 ${loaded.length}개를 추가했습니다.`)
}

function setupImageDrop(target, onDrop) {
  if (!target) return
  const hasFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
  const hasImageDrag = (event) => Array.from(event.dataTransfer?.items || []).some((item) => item.type.startsWith('image/'))
  const setActive = (active) => target.classList.toggle('dragOver', active)
  const prevent = (event) => {
    if (!hasFileDrag(event) && !hasImageDrag(event) && !imageFilesFrom(event.dataTransfer?.files).length) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  target.addEventListener('dragenter', (event) => {
    prevent(event)
    setActive(true)
  })
  target.addEventListener('dragover', prevent)
  target.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || !target.contains(event.relatedTarget)) setActive(false)
  })
  target.addEventListener('drop', async (event) => {
    prevent(event)
    setActive(false)
    const files = imageFilesFrom(event.dataTransfer?.files)
    if (!files.length) return
    try {
      await onDrop(files)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '이미지를 불러오지 못했습니다.', true)
    }
  })
}

function renderReferences() {
  referenceStrip.innerHTML = ''
  if (!referenceImages.length) {
    const empty = document.createElement('span')
    empty.className = 'referenceEmpty'
    empty.textContent = '참조 이미지 없음'
    referenceStrip.append(empty)
    return
  }

  for (const image of referenceImages) {
    const chip = document.createElement('div')
    chip.className = 'referenceChip'
    const thumb = document.createElement('img')
    thumb.src = image.dataUrl
    thumb.alt = image.name
    const label = document.createElement('span')
    label.textContent = image.name
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'mini secondary'
    remove.textContent = '삭제'
    remove.addEventListener('click', () => {
      referenceImages = referenceImages.filter((item) => item.id !== image.id)
      renderReferences()
    })
    chip.append(thumb, label, remove)
    referenceStrip.append(chip)
  }
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
  const resultDataUrl = currentResultDataUrl(item)
  previewMode = Boolean(resultDataUrl)
  sourceImageElement.src = item.dataUrl
  previewImageElement.src = resultDataUrl || ''
  canvasStage.classList.remove('empty')
  canvasStage.style.aspectRatio = `${item.width} / ${item.height}`
  fitCanvasStageToWindow()
  maskCanvas.width = item.width
  maskCanvas.height = item.height
  draftCanvas.width = item.width
  draftCanvas.height = item.height
  await drawMaskDataUrl(item.maskDataUrl)
  clearDraft()
  updateSelectedPreviewControls()
  previewBadge.textContent = previewMode && resultDataUrl ? '편집본 표시중' : '기존본 표시중'
  setStatus(resultDataUrl ? `${item.name} 편집본 표시중입니다.` : `${item.name} 선택됨. 변형할 영역을 칠하세요.`)
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

function selectWholeImage() {
  const item = selectedItem()
  if (!item) {
    setStatus('먼저 이미지를 열어 주세요.', true)
    return
  }
  const context = maskCanvas.getContext('2d')
  context.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
  context.fillStyle = MASK_COLOR
  context.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
  item.maskDataUrl = maskCanvas.toDataURL('image/png')
  item.hasMask = true
  previewMode = false
  updateSelectedPreviewControls()
  renderItems()
  setStatus(`${item.name} 전체 영역을 선택했습니다.`)
}

async function promoteResultToSource(id) {
  saveSelectedMask()
  const item = items.find((next) => next.id === id)
  const resultDataUrl = currentResultDataUrl(item)
  if (!resultDataUrl) return
  const sourceItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: selectedDownloadName(item),
    dataUrl: resultDataUrl,
    mimeType: dataUrlMimeType(resultDataUrl),
    width: item.width,
    height: item.height,
    sortTime: Date.now(),
    maskDataUrl: createEmptyMask(item.width, item.height),
    hasMask: false,
    status: 'idle',
    resultDataUrl: null,
    resultDataUrls: [],
    selectedResultIndex: 0,
    error: null,
    sourceFrom: item.name,
  }
  items = [...items, sourceItem]
  await selectItem(sourceItem.id)
  setStatus(`${item.name} 편집본을 새 수정 이미지로 추가했습니다.`)
}

function getCanvasPoint(event) {
  const rect = maskCanvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * maskCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * maskCanvas.height,
  }
}

function clearDraft() {
  const context = draftCanvas.getContext('2d')
  context.clearRect(0, 0, draftCanvas.width, draftCanvas.height)
}

function drawBrushDraft(point) {
  if (!point || !draftCanvas.width || !draftCanvas.height) return
  const context = draftCanvas.getContext('2d')
  clearDraft()
  context.save()
  context.lineWidth = 2
  context.strokeStyle = tool === 'erase' ? 'rgba(180, 35, 24, 0.95)' : 'rgba(45, 111, 214, 0.95)'
  context.fillStyle = tool === 'erase' ? 'rgba(180, 35, 24, 0.14)' : 'rgba(45, 111, 214, 0.14)'
  context.beginPath()
  context.arc(point.x, point.y, Number(brushInput.value) / 2, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

function drawRectDraft(from, to) {
  if (!from || !to) return
  const context = draftCanvas.getContext('2d')
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  const width = Math.abs(to.x - from.x)
  const height = Math.abs(to.y - from.y)
  clearDraft()
  context.save()
  context.fillStyle = 'rgba(45, 111, 214, 0.18)'
  context.strokeStyle = 'rgba(45, 111, 214, 0.98)'
  context.lineWidth = 2
  context.setLineDash([10, 6])
  context.fillRect(x, y, width, height)
  context.strokeRect(x, y, width, height)
  context.restore()
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
    const alpha = pixels[index + 3]
    pixels[index] = 255
    pixels[index + 1] = 255
    pixels[index + 2] = 255
    pixels[index + 3] = alpha > 0 ? 255 : 0
  }
  outputContext.putImageData(imageData, 0, 0)
  return output.toDataURL('image/png')
}

async function buildSelectionGuideDataUrl(item) {
  const [source, mask] = await Promise.all([loadImage(item.dataUrl), loadImage(item.maskDataUrl)])
  const canvas = document.createElement('canvas')
  canvas.width = item.width
  canvas.height = item.height
  const context = canvas.getContext('2d')
  context.drawImage(source, 0, 0, item.width, item.height)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = item.width
  maskCanvas.height = item.height
  const maskContext = maskCanvas.getContext('2d')
  maskContext.drawImage(mask, 0, 0, item.width, item.height)
  const maskData = maskContext.getImageData(0, 0, item.width, item.height)
  const pixels = maskData.data
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] > 0 ? 130 : 0
    pixels[index] = 45
    pixels[index + 1] = 111
    pixels[index + 2] = 214
    pixels[index + 3] = alpha
  }
  maskContext.putImageData(maskData, 0, 0)
  context.drawImage(maskCanvas, 0, 0)
  return canvas.toDataURL('image/png')
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
  updateSelectedPreviewControls()
  itemGrid.innerHTML = ''
  for (const item of sortedItems()) {
    const urls = resultDataUrls(item)
    const resultIndex = selectedResultIndex(item)
    const resultDataUrl = currentResultDataUrl(item)
    const card = document.createElement('article')
    card.className = `itemCard ${item.id === selectedId ? 'selected' : ''} status-${item.status}`

    const preview = document.createElement('button')
    preview.type = 'button'
    preview.className = 'itemPreview'
    preview.addEventListener('click', () => void selectItem(item.id))
    if (resultDataUrl) {
      const compare = document.createElement('div')
      compare.className = 'itemCompare'
      for (const [labelText, dataUrl, altText] of [
        ['기존본', item.dataUrl, `${item.name} 기존본`],
        ['편집본', resultDataUrl, `${item.name} 편집본`],
      ]) {
        const thumb = document.createElement('div')
        thumb.className = 'compareThumb'
        const image = document.createElement('img')
        image.src = dataUrl
        image.alt = altText
        const label = document.createElement('span')
        label.textContent = labelText
        thumb.append(image, label)
        compare.append(thumb)
      }
      preview.append(compare)
    } else {
      const previewImage = document.createElement('img')
      previewImage.src = item.dataUrl
      previewImage.alt = `${item.name} 기존본`
      preview.append(previewImage)
      const sourceBadge = document.createElement('span')
      sourceBadge.className = 'thumbTypeBadge'
      sourceBadge.textContent = '기존본'
      preview.append(sourceBadge)
    }

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
    const deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'secondary danger mini'
    deleteButton.textContent = '삭제'
    deleteButton.addEventListener('click', () => void deleteItem(item.id))
    actions.append(deleteButton)
    if (resultDataUrl) {
      const promoteButton = document.createElement('button')
      promoteButton.type = 'button'
      promoteButton.className = 'secondary mini'
      promoteButton.textContent = '수정본으로 사용'
      promoteButton.addEventListener('click', () => void promoteResultToSource(item.id))
      actions.append(promoteButton)

      const download = document.createElement('a')
      download.className = 'download mini'
      download.href = resultDataUrl
      download.download = selectedDownloadName(item)
      download.textContent = '저장'
      actions.append(download)
    }

    if (urls.length > 1) {
      const variants = document.createElement('div')
      variants.className = 'resultVariants'
      urls.forEach((_, index) => {
        const variantButton = document.createElement('button')
        variantButton.type = 'button'
        variantButton.className = `secondary mini ${index === resultIndex ? 'active' : ''}`
        variantButton.textContent = `${index + 1}`
        variantButton.title = `편집본 ${index + 1}/${urls.length}`
        variantButton.addEventListener('click', () => selectResultVariant(item, index))
        variants.append(variantButton)
      })
      actions.append(variants)
    }

    if (item.status === 'running' || item.status === 'pending') {
      const badge = document.createElement('div')
      badge.className = 'waitingOverlay'
      badge.textContent = item.status === 'running' ? '변형중' : '대기중'
      preview.append(badge)
    }
    if (resultDataUrl && item.id === selectedId && previewMode) {
      const activeBadge = document.createElement('div')
      activeBadge.className = 'activePreviewBadge'
      activeBadge.textContent = '편집본 표시중'
      preview.append(activeBadge)
    }

    card.append(preview, body, actions)
    itemGrid.append(card)
  }
}

async function deleteItem(id) {
  const orderedItems = sortedItems()
  const itemIndex = orderedItems.findIndex((item) => item.id === id)
  const item = orderedItems[itemIndex]
  if (!item) return
  if (item.status === 'running' || item.status === 'pending') {
    setStatus('진행 중인 이미지는 삭제할 수 없습니다.', true)
    return
  }

  const wasSelected = item.id === selectedId
  items = items.filter((next) => next.id !== id)
  if (wasSelected) {
    const remainingOrderedItems = sortedItems()
    const nextItem = remainingOrderedItems[Math.min(itemIndex, remainingOrderedItems.length - 1)]
    if (nextItem) {
      selectedId = null
      await selectItem(nextItem.id)
    } else {
      resetCanvasStage()
    }
  }
  renderItems()
  setStatus(`${item.name}을 목록에서 제거했습니다. 원본 파일은 유지됩니다.`)
}

async function openFiles(files) {
  const loaded = []
  for (const file of files) {
    const image = await normalizeImage(file)
    loaded.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...image,
      sortTime: Date.now() + loaded.length,
      maskDataUrl: createEmptyMask(image.width, image.height),
      hasMask: false,
      status: 'idle',
      resultDataUrl: null,
      resultDataUrls: [],
      selectedResultIndex: 0,
      error: null,
    })
  }
  items = [...items, ...loaded]
  renderItems()
  if (loaded.length) {
    const latest = loaded[loaded.length - 1]
    await selectItem(latest.id)
    setStatus(`${loaded.length}개 이미지를 추가했습니다. ${latest.name} 선택됨.`)
  }
}

async function requestEdit(item) {
  const [maskDataUrl, selectionGuideDataUrl] = await Promise.all([buildMaskDataUrl(item), buildSelectionGuideDataUrl(item)])
  const request = {
    prompt: promptInput.value,
    model: modelInput.value,
    serviceAccountJson: credentialInput.value.trim(),
    projectId: projectInput.value.trim(),
    location: resolveRequestLocation(),
    aspectRatio: closestAspectRatio(item.width, item.height),
    sourceImage: {
      name: item.name,
      dataUrl: item.dataUrl,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
    },
    maskImage: { name: 'selection-mask.png', mimeType: 'image/png', dataUrl: maskDataUrl },
    selectionGuideImage: { name: 'selection-guide.png', mimeType: 'image/png', dataUrl: selectionGuideDataUrl },
    referenceImages: referenceImages.map((image) => ({
      name: image.name,
      mimeType: image.mimeType,
      dataUrl: image.dataUrl,
      width: image.width,
      height: image.height,
    })),
    referenceInstruction: buildReferenceInstruction(),
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

  if (payload.historyId) item.historyId = payload.historyId
  if (payload.historyDir) item.historyDir = payload.historyDir
  const imageDataUrls = Array.isArray(payload.imageDataUrls) && payload.imageDataUrls.length
    ? payload.imageDataUrls
    : [payload.imageDataUrl].filter(Boolean)
  if (!imageDataUrls.length) throw new Error('edited_image_missing')
  return Promise.all(imageDataUrls.map((dataUrl) => compositeResult(item, dataUrl, maskDataUrl)))
}

async function runItem(item) {
  item.status = 'running'
  item.error = null
  renderItems()
  try {
    const resultUrls = await requestEdit(item)
    setResultDataUrls(item, resultUrls)
    item.status = 'done'
    item.historySavedPath = historyResultName(item)
    if (item.id === selectedId) {
      previewMode = true
      previewImageElement.src = currentResultDataUrl(item)
      updateSelectedPreviewControls()
    }
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

function itemFromHistory(job) {
  if (!job?.sourceDataUrl) return null
  const restoredResults = Array.isArray(job.resultDataUrls) && job.resultDataUrls.length
    ? job.resultDataUrls
    : [job.resultDataUrl].filter(Boolean)
  return {
    id: `history-${job.id}`,
    historyId: job.id,
    historyDir: job.dir,
    historySavedPath: restoredResults.length ? `${job.dir}\\result.png` : null,
    name: job.sourceName || 'history-image.png',
    dataUrl: job.sourceDataUrl,
    mimeType: 'image/png',
    createdAt: job.createdAt || '',
    updatedAt: job.updatedAt || '',
    sortTime: Date.parse(job.updatedAt || job.createdAt || '') || 0,
    width: job.width || 1,
    height: job.height || 1,
    maskDataUrl: job.maskDataUrl || createEmptyMask(job.width || 1, job.height || 1),
    hasMask: Boolean(job.maskDataUrl),
    status: job.status === 'done' && restoredResults.length ? 'done' : job.status === 'error' ? 'error' : 'pending',
    resultDataUrl: restoredResults[0] || null,
    resultDataUrls: restoredResults,
    selectedResultIndex: 0,
    error: job.error || null,
  }
}

async function restoreHistory() {
  if (!window.nanobanana?.history) return
  const history = await window.nanobanana.history()
  const restored = history.map(itemFromHistory).filter(Boolean).slice(0, 50)
  if (!restored.length) return
  const existingIds = new Set(items.map((item) => item.historyId || item.id))
  items = [...items, ...restored.filter((item) => !existingIds.has(item.historyId || item.id))]
  renderItems()
  if (!selectedId && items[0]) {
    await selectItem(items[0].id)
  }
  setStatus(`최근 작업 ${restored.length}개를 불러왔습니다.`)
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

setupImageDrop(sourceDropTarget, openFiles)
setupImageDrop(canvasStage, openFiles)
setupImageDrop(itemGrid, openFiles)
setupImageDrop(referenceDropTarget, openReferenceFiles)
setupImageDrop(referenceStrip, openReferenceFiles)

itemGrid.addEventListener('wheel', (event) => {
  if (!items.length) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  event.preventDefault()
  itemGrid.scrollLeft += event.deltaY * 5
}, { passive: false })

let itemGridDrag = null

itemGrid.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  itemGridDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    scrollLeft: itemGrid.scrollLeft,
    moved: false,
    captured: false,
  }
})

itemGrid.addEventListener('pointermove', (event) => {
  if (!itemGridDrag || itemGridDrag.pointerId !== event.pointerId) return
  const distance = event.clientX - itemGridDrag.startX
  if (Math.abs(distance) > 3) {
    itemGridDrag.moved = true
    if (!itemGridDrag.captured) {
      itemGrid.setPointerCapture(event.pointerId)
      itemGridDrag.captured = true
    }
  }
  if (!itemGridDrag.moved) return
  itemGrid.scrollLeft = itemGridDrag.scrollLeft - distance
})

itemGrid.addEventListener('pointerup', (event) => {
  if (!itemGridDrag || itemGridDrag.pointerId !== event.pointerId) return
  if (itemGridDrag.moved) {
    event.preventDefault()
    suppressNextItemClick = true
  }
  if (itemGridDrag.captured && itemGrid.hasPointerCapture(event.pointerId)) itemGrid.releasePointerCapture(event.pointerId)
  itemGridDrag = null
})

itemGrid.addEventListener('pointercancel', (event) => {
  if (itemGridDrag?.captured && itemGrid.hasPointerCapture(event.pointerId)) itemGrid.releasePointerCapture(event.pointerId)
  itemGridDrag = null
})

itemGrid.addEventListener('click', (event) => {
  if (!suppressNextItemClick) return
  event.preventDefault()
  event.stopPropagation()
  suppressNextItemClick = false
}, true)

for (const eventName of ['dragover', 'drop']) {
  document.addEventListener(eventName, (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
      event.preventDefault()
    }
  })
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

referenceInput.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  try {
    await openReferenceFiles(files)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '참조 이미지를 열지 못했습니다.', true)
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
    hasEnvCredential = false
    updateCredentialState()
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
    drawRectDraft(rectStart, point)
  } else {
    lastPoint = point
    drawStroke(point, point)
    drawBrushDraft(point)
  }
})

maskCanvas.addEventListener('pointermove', (event) => {
  if (!selectedItem()) return
  const point = getCanvasPoint(event)
  if (tool === 'rect') {
    if (rectStart && event.buttons === 1) drawRectDraft(rectStart, point)
    return
  }
  if (!lastPoint || event.buttons !== 1) {
    drawBrushDraft(point)
    return
  }
  drawStroke(lastPoint, point)
  drawBrushDraft(point)
  lastPoint = point
})

maskCanvas.addEventListener('pointerup', (event) => {
  const point = getCanvasPoint(event)
  if (tool === 'rect' && rectStart) drawRect(rectStart, point)
  clearDraft()
  rectStart = null
  lastPoint = null
  if (maskCanvas.hasPointerCapture(event.pointerId)) maskCanvas.releasePointerCapture(event.pointerId)
  saveSelectedMask()
  renderItems()
})

maskCanvas.addEventListener('pointercancel', () => {
  rectStart = null
  lastPoint = null
  clearDraft()
  saveSelectedMask()
  renderItems()
})

maskCanvas.addEventListener('pointerleave', () => {
  if (!rectStart && !lastPoint) clearDraft()
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
  previewMode = false
  resetMask()
  setStatus('선택 영역을 지웠습니다.')
})

selectAllButton.addEventListener('click', selectWholeImage)
runButton.addEventListener('click', runEdit)
runAllButton.addEventListener('click', runAllEdits)
previewToggleButton.addEventListener('click', () => {
  const item = selectedItem()
  const resultDataUrl = currentResultDataUrl(item)
  if (!resultDataUrl) return
  previewMode = !previewMode
  previewImageElement.src = resultDataUrl
  updateSelectedPreviewControls()
  setStatus(previewMode ? `${item.name} 편집본 표시중입니다.` : `${item.name} 기존본 표시중입니다.`)
})

const configPromise = window.nanobanana ? window.nanobanana.config() : fetch('/api/config').then((response) => response.json())

configPromise
  .then((config) => {
    hasEnvCredential = Boolean(config.hasCredentials)
    updateCredentialState()
    if (config.defaultModel) modelInput.value = config.defaultModel
    if (config.defaultLocation) locationInput.value = config.defaultLocation
    if (config.projectId) projectInput.value = config.projectId
    if (config.historyDir) setStatus(`작업 기록 폴더: ${config.historyDir}`)
    return restoreHistory()
  })
  .catch(() => {})

renderReferences()
updateCredentialState()

window.addEventListener('resize', fitCanvasStageToWindow)
if ('ResizeObserver' in window) {
  const stageResizeObserver = new ResizeObserver(fitCanvasStageToWindow)
  stageResizeObserver.observe(workspace)
  stageResizeObserver.observe(resultPanel)
}
