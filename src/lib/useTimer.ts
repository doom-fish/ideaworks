import { useEffect, useRef, useState } from 'react'

export function useTimer(totalSeconds: number, running: boolean, onDone?: () => void) {
  const [elapsed, setElapsed] = useState(0)
  const doneRef = useRef(false)
  const cbRef = useRef(onDone)
  cbRef.current = onDone

  useEffect(() => {
    if (!running) return
    const start = Date.now() - elapsed * 1000
    const t = setInterval(() => {
      const e = (Date.now() - start) / 1000
      setElapsed(e)
      if (e >= totalSeconds && !doneRef.current) {
        doneRef.current = true
        cbRef.current?.()
      }
    }, 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, totalSeconds])

  const remaining = Math.max(0, totalSeconds - elapsed)
  return {
    elapsed,
    remaining,
    progress: Math.min(1, elapsed / totalSeconds),
    reset: () => {
      doneRef.current = false
      setElapsed(0)
    },
  }
}

export function fmtClock(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
