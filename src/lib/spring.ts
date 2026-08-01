import { useEffect, useRef, useState } from 'react'

export interface SpringConfig {
  stiffness: number
  damping: number
  mass: number
  /** below this displacement and velocity, snap and stop */
  rest: number
}

export const SPRING: Record<'soft' | 'snappy' | 'bouncy', SpringConfig> = {
  soft: { stiffness: 120, damping: 20, mass: 1, rest: 0.0005 },
  snappy: { stiffness: 260, damping: 26, mass: 1, rest: 0.0005 },
  bouncy: { stiffness: 320, damping: 16, mass: 1, rest: 0.0005 },
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Damped-harmonic spring integrator over an array of values.
 *
 * Springs rather than CSS easing because these values are data, not decoration:
 * a spring settles at a rate that reflects how far it had to travel, so a point
 * that moved a long way visibly arrives with more energy. Fixed-duration easing
 * makes every element take the same time regardless of distance, which reads as
 * uniform and lifeless.
 *
 * Integration is on a fixed 1/120 s substep so the motion is identical on 60 Hz
 * and 120 Hz displays; a raw delta-time integrator changes its damping
 * behaviour with frame rate.
 */
export function useSprings(
  targets: number[],
  config: SpringConfig = SPRING.snappy,
  /** per-index start delay in seconds, for staggering */
  delays: number[] = [],
): number[] {
  const [values, setValues] = useState<number[]>(() => targets.map(() => 0))
  const state = useRef<{ pos: number[]; vel: number[]; elapsed: number }>({
    pos: targets.map(() => 0),
    vel: targets.map(() => 0),
    elapsed: 0,
  })
  const targetRef = useRef(targets)
  targetRef.current = targets

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValues(targetRef.current)
      return
    }
    // Grow the state arrays if the target list got longer.
    const s = state.current
    while (s.pos.length < targets.length) {
      s.pos.push(0)
      s.vel.push(0)
    }
    s.elapsed = 0

    let raf = 0
    let last = performance.now()
    let carry = 0
    const STEP = 1 / 120

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.064)
      last = now
      carry += dt
      s.elapsed += dt

      while (carry >= STEP) {
        carry -= STEP
        const t = targetRef.current
        for (let i = 0; i < t.length; i++) {
          if (s.elapsed < (delays[i] ?? 0)) continue
          const dx = t[i] - s.pos[i]
          const a = (config.stiffness * dx - config.damping * s.vel[i]) / config.mass
          s.vel[i] += a * STEP
          s.pos[i] += s.vel[i] * STEP
          if (Math.abs(dx) <= config.rest && Math.abs(s.vel[i]) <= config.rest) {
            s.pos[i] = t[i]
            s.vel[i] = 0
          }
        }
      }

      // Settling is decided from the state of the springs, never from whether a
      // substep happened to run this frame. A frame shorter than one substep is
      // normal — deciding there that nothing moved froze every animation at its
      // start value.
      const t = targetRef.current
      let moving = false
      for (let i = 0; i < t.length; i++) {
        if (s.elapsed < (delays[i] ?? 0)) {
          moving = true
          break
        }
        if (Math.abs(t[i] - s.pos[i]) > config.rest || Math.abs(s.vel[i]) > config.rest) {
          moving = true
          break
        }
      }

      setValues([...s.pos])
      if (moving) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.length, config.stiffness, config.damping, config.mass])

  return values
}

/** Single-value spring, for counters and bars. */
export function useSpring(target: number, config: SpringConfig = SPRING.snappy, delay = 0) {
  return useSprings([target], config, [delay])[0] ?? 0
}
