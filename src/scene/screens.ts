// Canvas-drawn surfaces for the room: the CRT broadcast, the wall calendar, the Panama pennant.
export interface BroadcastInfo {
  header: string
  when: string
  home: string
  away: string
  odds: [number, number, number] | null
  pick: 0 | 1 | 2 | null
  footer: string
  red: boolean
}

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif'
const BODY = '"Atkinson Hyperlegible", Arial, sans-serif'

const fit = (context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 800) => {
  let current = size
  do {
    context.font = `${weight} ${current}px ${DISPLAY}`
    current -= 2
  } while (context.measureText(text).width > maxWidth && current > 18)
}

export const drawBroadcast = (canvas: HTMLCanvasElement, info: BroadcastInfo) => {
  const context = canvas.getContext('2d')!
  const { width, height } = canvas
  const accent = info.red ? '#ff5a4a' : '#ffc061'
  context.fillStyle = info.red ? '#2a0807' : '#0c1712'
  context.fillRect(0, 0, width, height)

  context.fillStyle = accent
  context.fillRect(0, 0, width, 64)
  context.fillStyle = info.red ? '#2a0807' : '#141006'
  context.font = `800 40px ${DISPLAY}`
  context.textBaseline = 'middle'
  context.fillText(info.header.toUpperCase(), 28, 34)

  context.fillStyle = '#efe9da'
  context.font = `700 26px ${BODY}`
  context.fillText(info.when.toUpperCase(), 28, 104)

  fit(context, info.home.toUpperCase(), width - 56, 76)
  context.fillText(info.home.toUpperCase(), 28, 172)
  context.fillStyle = accent
  context.font = `700 30px ${BODY}`
  context.fillText('vs', 28, 226)
  context.fillStyle = '#efe9da'
  fit(context, info.away.toUpperCase(), width - 56, 76)
  context.fillText(info.away.toUpperCase(), 28, 278)

  if (info.odds) {
    const labels = ['1', 'X', '2']
    const boxWidth = (width - 56 - 24) / 3
    info.odds.forEach((value, i) => {
      const x = 28 + i * (boxWidth + 12), y = 330
      const chosen = info.pick === i
      context.fillStyle = chosen ? accent : 'rgba(239, 233, 218, 0.1)'
      context.fillRect(x, y, boxWidth, 78)
      context.fillStyle = chosen ? '#141006' : '#efe9da'
      context.font = `700 24px ${BODY}`
      context.fillText(labels[i], x + 14, y + 22)
      context.font = `800 46px ${DISPLAY}`
      context.fillText(value.toFixed(2), x + 14, y + 54)
    })
  }

  context.fillStyle = accent
  fit(context, info.footer.toUpperCase(), width - 56, 34, 800)
  context.fillText(info.footer.toUpperCase(), 28, height - 32)

  // Scanlines.
  context.fillStyle = 'rgba(0, 0, 0, 0.18)'
  for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 2)
}

export const drawCalendar = (canvas: HTMLCanvasElement, month: string, days: number, firstWeekday: number, circled: number | null, red: boolean) => {
  const context = canvas.getContext('2d')!
  const { width, height } = canvas
  context.fillStyle = '#efe6cf'
  context.fillRect(0, 0, width, height)
  context.fillStyle = red ? '#b3241c' : '#3f4a2c'
  context.fillRect(0, 0, width, 70)
  context.fillStyle = '#efe6cf'
  context.font = `800 46px ${DISPLAY}`
  context.textBaseline = 'middle'
  context.fillText(month.toUpperCase(), 20, 38)
  const cell = (width - 40) / 7
  context.font = `700 22px ${BODY}`
  for (let day = 1; day <= days; day++) {
    const index = firstWeekday + day - 1
    const x = 20 + (index % 7) * cell, y = 100 + Math.floor(index / 7) * cell * 0.9
    context.fillStyle = '#3b3222'
    context.fillText(String(day), x + 8, y + 14)
    if (day === circled) {
      context.strokeStyle = '#c0261d'
      context.lineWidth = 5
      context.beginPath()
      context.ellipse(x + 20, y + 14, 24, 20, -0.2, 0, Math.PI * 2)
      context.stroke()
    }
  }
}

export const drawPennant = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d')!
  const { width, height } = canvas
  const halfW = width / 2, halfH = height / 2
  const star = (cx: number, cy: number, r: number, color: string) => {
    context.fillStyle = color
    context.beginPath()
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 ? r * 0.4 : r
      const angle = -Math.PI / 2 + (i * Math.PI) / 5
      context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
    }
    context.fill()
  }
  // Panama: white with blue star, red; blue, white with red star.
  context.fillStyle = '#f4f1ea'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#d21034'
  context.fillRect(halfW, 0, halfW, halfH)
  context.fillStyle = '#005293'
  context.fillRect(0, halfH, halfW, halfH)
  star(halfW / 2, halfH / 2, halfH * 0.32, '#005293')
  star(halfW * 1.5, halfH * 1.5, halfH * 0.32, '#d21034')
}
