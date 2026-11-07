import fs from 'node:fs'

const port = 9222
const mode = process.argv[2]

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      const list = await res.json()
      if (list.length) return list
    } catch {
      /* bekle */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('CDP hedefi bulunamadı')
}

const list = await targets()
const page = list.find((t) => t.type === 'page') ?? list[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}

await new Promise((resolve) => (ws.onopen = resolve))

function send(method, params = {}) {
  return new Promise((resolve) => {
    const current = ++id
    pending.set(current, resolve)
    ws.send(JSON.stringify({ id: current, method, params }))
  })
}

if (mode === 'shot') {
  const out = process.argv[3]
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(out, Buffer.from(res.result.data, 'base64'))
  console.log(`screenshot: ${out}`)
} else if (mode === 'hover') {
  const x = Number(process.argv[3])
  const y = Number(process.argv[4])
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
  console.log(`hover: ${x},${y}`)
} else if (mode === 'click') {
  const x = Number(process.argv[3])
  const y = Number(process.argv[4])
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  console.log(`click: ${x},${y}`)
} else if (mode === 'evalwait') {
  const expression = process.argv[3]
  const delay = Number(process.argv[4] ?? 200)
  const out = process.argv[5]
  await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  await new Promise((r) => setTimeout(r, delay))
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(out, Buffer.from(res.result.data, 'base64'))
  console.log(`screenshot: ${out}`)
} else if (mode === 'eval') {
  const expression = process.argv[3]
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  console.log(JSON.stringify(res.result, null, 2))
}

ws.close()
process.exit(0)
