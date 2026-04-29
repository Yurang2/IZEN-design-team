const MAX_IMAGE_EDGE = 1600
const MASK_COLOR = 'rgba(45, 111, 214, 0.52)'

const fileInput = document.querySelector('#fileInput')
const modelInput = document.querySelector('#modelInput')
const brushInput = document.querySelector('#brushInput')
const brushValue = document.querySelector('#brushValue')
const featherInput = document.querySelector('#featherInput')
const featherValue = document.querySelector('#featherValue')
const promptInput = document.querySelector('#promptInput')
const runButton = document.querySelector('#runButton')
const clearButton = document.querySelector('#clearButton')
const statusText = document.querySelector('#statusText')
const canvasStage = document.querySelector('#canvasStage')
const sourceImageElement = document.querySelector('#sourceImage')
const maskCanvas = document.querySelector('#maskCanvas')
const resultImage = document.querySelector('#resultImage')
const resultMeta = document.querySelector('#resultMeta')
const downloadLink = document.querySelector('#downloadLink')
const toolButtons = {
  brush: document.querySelector('#brushTool'),
  erase: document.querySelector('#eraseTool'),
  rect: document.querySelector('#rectTool'),
}

let sourceImage = null
let tool = 'brush'
let lastPoint = null
let rectStart = null

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

function resetMask() {
  const context = maskCanvas.getContext('2d')
  context.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
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

function hasMask() {
  const data = maskCanvas.getContext('2d').getImageData(0, 0, maskCanvas.width, maskCanvas.height).data
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) return true
  }
  return false
}

function buildMaskDataUrl() {
  const output = document.createElement('canvas')
  output.width = maskCanvas.width
  output.height = maskCanvas.height
  const sourceContext = maskCanvas.getContext('2d')
  const outputContext = output.getContext('2d')
  const imageData = sourceContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
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

async function compositeResult(generatedDataUrl, maskDataUrl) {
  const [original, generated, mask] = await Promise.all([
    loadImage(sourceImage.dataUrl),
    loadImage(generatedDataUrl),
    loadImage(maskDataUrl),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = sourceImage.width
  canvas.height = sourceImage.height
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

async function openFile(file) {
  sourceImage = await normalizeImage(file)
  sourceImageElement.src = sourceImage.dataUrl
  canvasStage.classList.remove('empty')
  canvasStage.style.aspectRatio = `${sourceImage.width} / ${sourceImage.height}`
  maskCanvas.width = sourceImage.width
  maskCanvas.height = sourceImage.height
  resetMask()
  resultImage.classList.remove('hasResult')
  downloadLink.classList.add('disabled')
  resultMeta.textContent = `${sourceImage.name} / ${sourceImage.width}x${sourceImage.height}`
  setStatus('변형할 부분을 칠하거나 박스로 선택하세요.')
}

async function runEdit() {
  if (!sourceImage) {
    setStatus('먼저 이미지를 열어 주세요.', true)
    return
  }
  if (!promptInput.value.trim()) {
    setStatus('변형 프롬프트를 입력해 주세요.', true)
    return
  }
  if (!hasMask()) {
    setStatus('변형할 부분을 먼저 선택해 주세요.', true)
    return
  }

  runButton.disabled = true
  setStatus('Vertex AI로 선택 영역을 변형하는 중입니다.')
  try {
    const maskDataUrl = buildMaskDataUrl()
    const response = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptInput.value,
        model: modelInput.value,
        aspectRatio: closestAspectRatio(sourceImage.width, sourceImage.height),
        sourceImage,
        maskImage: { name: 'selection-mask.png', mimeType: 'image/png', dataUrl: maskDataUrl },
      }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`)

    const finalDataUrl = await compositeResult(payload.imageDataUrl, maskDataUrl)
    resultImage.src = finalDataUrl
    resultImage.classList.add('hasResult')
    downloadLink.href = finalDataUrl
    downloadLink.download = `${sourceImage.name.replace(/\.[^.]+$/, '') || 'nanobanana'}-selected-edit.png`
    downloadLink.classList.remove('disabled')
    resultMeta.textContent = `${payload.model} / ${sourceImage.width}x${sourceImage.height}`
    setStatus('완료했습니다. 선택 밖 영역은 원본으로 다시 합성했습니다.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '변형에 실패했습니다.', true)
  } finally {
    runButton.disabled = false
  }
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    await openFile(file)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '이미지를 열지 못했습니다.', true)
  } finally {
    event.target.value = ''
  }
})

maskCanvas.addEventListener('pointerdown', (event) => {
  if (!sourceImage) return
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
  if (!sourceImage || tool === 'rect' || !lastPoint || event.buttons !== 1) return
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
})

maskCanvas.addEventListener('pointercancel', () => {
  rectStart = null
  lastPoint = null
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

fetch('/api/config')
  .then((response) => response.json())
  .then((config) => {
    if (config.defaultModel) modelInput.value = config.defaultModel
    if (!config.hasCredentials) {
      setStatus('서버에 Google 서비스 계정 환경변수가 없습니다. README 설정 후 다시 실행하세요.', true)
    }
  })
  .catch(() => {})
