import { useEffect, useRef, useState } from 'react'
import type { BrainCloud } from '../scene/brainCloud'
import { odds as formatOdds } from './format'
import { useT } from './i18n'
import { selectionLabel } from './Slip'
import { activityFor, type Story } from './story'
import { useSkeletons, type Brain } from './useBrain'

const CYCLE_SECONDS = 7

export default function BrainPanel({ brain, story }: { brain: Brain | null; story: Story }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cloudRef = useRef<BrainCloud | null>(null)
  const skeletons = useSkeletons(Boolean(brain))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!brain || skeletons.loading) return
    const canvas = canvasRef.current!
    const parent = canvas.parentElement!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0, visible = true, disposed = false
    let cleanup = () => undefined as void
    import('../scene/brainCloud').then(({ BrainCloud }) => {
      if (disposed) return
      let cloud: BrainCloud
      try {
        cloud = new BrainCloud(canvas, brain.circuit, skeletons.asset, still)
      } catch {
        setFailed(true)
        return
      }
      cloudRef.current = cloud
      cloud.setActivity(activityFor(brain, story))
      const resize = () => { cloud.resize(parent.clientWidth, parent.clientHeight); if (still) cloud.render(1) }
      const observer = new ResizeObserver(resize)
      observer.observe(parent)
      resize()
      const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
      intersection.observe(canvas)
      const start = performance.now()
      const loop = () => {
        frame = requestAnimationFrame(loop)
        if (!visible || document.hidden) return
        const phase = (((performance.now() - start) / 1000) % CYCLE_SECONDS) / CYCLE_SECONDS
        cloud.render(Math.min(1, phase * 1.4))
      }
      if (still) cloud.render(1)
      else loop()
      cleanup = () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        intersection.disconnect()
        cloud.dispose()
      }
    })
    return () => {
      disposed = true
      cleanup()
      cloudRef.current = null
    }
  }, [brain, skeletons.loading, skeletons.asset, story])

  const options = story.options
  const maxDrive = Math.max(0.01, ...(options?.map(option => Math.abs(option.drive)) ?? [0]))

  return (
    <section className="brain" aria-labelledby="brain-title">
      <div className="section-head">
        <h2 id="brain-title">{t('brainTitle')}</h2>
        <p>{t('brainLead')}</p>
      </div>
      <div className="brain__monitor" data-failed={failed}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {!brain && <p className="brain__status">{t('brainLoading')}</p>}
      </div>
      <ul className="brain__legend">
        <li data-role="pn">{t('brainLegendPn')} <span>48</span></li>
        <li data-role="kc">{t('brainLegendKc')} <span>160</span></li>
        <li data-role="mbon">{t('brainLegendMbon')} <span>40</span></li>
        <li data-role="dan">{t('brainLegendDan')} <span>48</span></li>
      </ul>
      <p className="fine">{t('brainReal')} {skeletons.asset ? t('brainMorphology') : t('brainSchematic')}</p>

      {options && (
        <figure className="drives">
          <figcaption><strong>{t('drives')}</strong> <span>{t('drivesNote')}</span></figcaption>
          <ul>
            {options.map(option => (
              <li key={option.selection} data-chosen={option.selection === story.selection}>
                <span className="drives__label">{selectionLabel(t, option.selection, story.homeName, story.awayName)} <small>@{formatOdds(option.odds)}</small></span>
                <span className="drives__bar" aria-hidden="true"><span style={{ inlineSize: `${Math.max(2, (Math.abs(option.drive) / maxDrive) * 100)}%` }} /></span>
                <span className="drives__value">{option.drive.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </figure>
      )}
    </section>
  )
}
