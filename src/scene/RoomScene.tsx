import { useEffect, useRef, useState } from 'react'
import { visitorHour } from '../site/mood'
import { phaseAt, type DayPhase } from './city'
import type { FlyMood } from './fly3d'
import type { CalendarInfo } from './room'
import type { BroadcastInfo } from './screens'

interface Props {
  broadcast: BroadcastInfo
  calendar: CalendarInfo
  red: boolean
  mood: FlyMood
  label: string
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Three.js room, loaded lazily so text content renders first. Pauses when hidden or offscreen.
export default function RoomScene({ broadcast, calendar, red, mood, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const roomRef = useRef<import('./room').Room | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [phase, setPhase] = useState<DayPhase>(() => phaseAt(visitorHour()))

  // Follow the visitor's clock; re-check every few minutes.
  useEffect(() => {
    const timer = window.setInterval(() => setPhase(phaseAt(visitorHour())), 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    let disposed = false, frame = 0, visible = true
    let cleanup = () => undefined as void
    const still = prefersReducedMotion()
    ;(async () => {
      await Promise.allSettled([document.fonts.load('800 40px "Big Shoulders Display"'), document.fonts.load('700 24px "Atkinson Hyperlegible"')])
      const { Room } = await import('./room')
      if (disposed) return
      let room: InstanceType<typeof Room>
      try {
        room = new Room(canvas)
      } catch {
        setFailed(true)
        return
      }
      roomRef.current = room
      const parent = canvas.parentElement!
      const resize = () => {
        room.resize(parent.clientWidth, parent.clientHeight)
        if (still) room.render(0, true)
      }
      const observer = new ResizeObserver(resize)
      observer.observe(parent)
      resize()
      const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
      intersection.observe(canvas)
      const onPointer = (event: PointerEvent) => {
        const rect = parent.getBoundingClientRect()
        room.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1)
      }
      if (!still) parent.addEventListener('pointermove', onPointer)
      const start = performance.now()
      const loop = () => {
        frame = requestAnimationFrame(loop)
        if (visible && !document.hidden) room.render((performance.now() - start) / 1000, false)
      }
      if (!still) loop()
      setReady(true)
      cleanup = () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        intersection.disconnect()
        parent.removeEventListener('pointermove', onPointer)
        room.dispose()
      }
    })()
    return () => {
      disposed = true
      cleanup()
      roomRef.current = null
    }
  }, [])

  useEffect(() => {
    const room = roomRef.current
    if (!room) return
    room.setRed(red)
    room.setTimeOfDay(phase)
    room.setCalendar(calendar)
    room.setBroadcast(broadcast)
    room.mood = mood
    if (prefersReducedMotion()) room.render(0, true)
  }, [ready, broadcast, calendar, red, mood, phase])

  return (
    <div className="scene" data-ready={ready} data-failed={failed}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  )
}
