import { useEffect, useMemo, useRef, useState } from 'react'
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
  // The same activity the 3D view plays, laid out as one square per neuron.
  const activity = useMemo(() => activityFor(brain, story), [brain, story])
  const circuit = brain?.circuit
  const mbonPeak = Math.max(0.0001, ...(activity?.mbon.map(Math.abs) ?? [0]))
  const approach = activity?.mbon.filter(value => value > 0).length ?? 0
  const pick = story.selection ? selectionLabel(t, story.selection, story.homeName, story.awayName) : null

  return (
    <section className="brain" aria-labelledby="brain-title">
      <div className="section-head">
        <h2 id="brain-title">{t('brainTitle')}</h2>
        <p>{t('brainLead')}</p>
      </div>
      <div className="brain__monitor" data-failed={failed}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {!brain && <p className="brain__status">{t('brainLoading')}</p>}
        {brain && !failed && <p className="brain__hint">{t('brainDrag')}</p>}
      </div>
      <div className="brain__body">
        {circuit && (
          <figure className="pathway">
            <figcaption><strong>{t('pathwayTitle')}</strong> <span>{pick ? t('pathwayNote', { pick }) : t('pathwayIdle')}</span></figcaption>
            <ol>
              <li data-role="pn">
                <p className="pathway__head"><span>{t('brainLegendPn')}</span><b>{t('pathActive', { n: activity?.pn.size ?? 0, total: circuit.pn.length })}</b></p>
                <div className="pathway__dots" aria-hidden="true">{circuit.pn.map((neuron, i) => <i key={neuron.id} data-on={activity?.pn.has(i) || undefined} />)}</div>
              </li>
              <li data-role="kc">
                <p className="pathway__head"><span>{t('brainLegendKc')}</span><b>{t('pathActive', { n: activity?.kc.size ?? 0, total: circuit.kc.length })}</b></p>
                <div className="pathway__dots" aria-hidden="true">{circuit.kc.map((neuron, i) => <i key={neuron.id} data-on={activity?.kc.has(i) || undefined} />)}</div>
              </li>
              <li data-role="mbon">
                <p className="pathway__head"><span>{t('brainLegendMbon')}</span><b>{activity ? t('pathMbon', { a: approach, b: circuit.mbon.length - approach }) : circuit.mbon.length}</b></p>
                <div className="pathway__dots" aria-hidden="true">
                  {circuit.mbon.map((neuron, i) => {
                    const value = activity?.mbon[i] ?? 0
                    return <i key={neuron.id} data-on={activity ? (value >= 0 ? 'approach' : 'avoid') : undefined} style={activity ? { opacity: 0.25 + 0.75 * Math.min(1, Math.abs(value) / mbonPeak) } : undefined} />
                  })}
                </div>
              </li>
              <li data-role="dan">
                <p className="pathway__head"><span>{t('brainLegendDan')}</span><b>{t(activity?.dopamine === 'reward' ? 'pathDanReward' : activity?.dopamine === 'punishment' ? 'pathDanPunish' : 'pathDanIdle')}</b></p>
                <div className="pathway__dots" aria-hidden="true">
                  {circuit.danReward.map(neuron => <i key={neuron.id} data-on={activity?.dopamine === 'reward' ? 'reward' : undefined} />)}
                  {circuit.danPunishment.map(neuron => <i key={neuron.id} data-on={activity?.dopamine === 'punishment' ? 'avoid' : undefined} />)}
                </div>
              </li>
            </ol>
          </figure>
        )}

        {options && (
          <figure className="drives">
            <figcaption><strong>{t('drives')}</strong> <span>{t('drivesNote')}</span></figcaption>
            <ul>
              {options.map(option => (
                <li key={option.selection} data-chosen={option.selection === story.selection}>
                  <span className="drives__label">{selectionLabel(t, option.selection, story.homeName, story.awayName)} <small>@{formatOdds(option.odds)}</small></span>
                  <span className="drives__value">{option.drive.toFixed(2)}</span>
                  <span className="drives__bar" aria-hidden="true"><span style={{ inlineSize: `${Math.max(2, (Math.abs(option.drive) / maxDrive) * 100)}%` }} /></span>
                </li>
              ))}
            </ul>
          </figure>
        )}
        <p className="fine">{t('brainReal')} {skeletons.asset ? t('brainMorphology') : t('brainSchematic')}</p>
      </div>
    </section>
  )
}
