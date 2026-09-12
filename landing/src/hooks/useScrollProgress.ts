import { useEffect, useRef, useState } from 'react'

export function useScrollProgress() {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number>(0)
  const lastY = useRef(0)

  useEffect(() => {
    const update = () => {
      const scrollY = window.scrollY
      if (scrollY !== lastY.current) {
        lastY.current = scrollY
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight
        setProgress(maxScroll > 0 ? Math.min(1, scrollY / maxScroll) : 0)
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return progress
}

export function useIntersectionReveal(
  threshold = 0.15,
  rootMargin = '-60px 0px'
) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold, rootMargin }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin])

  return { ref, visible }
}

export function useSectionProgress(sectionRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const update = () => {
      const el = sectionRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const vh = window.innerHeight
        // -1 = fully below, 0 = entering, 1 = fully scrolled through
        const p = Math.max(0, Math.min(1, (-rect.top) / (rect.height - vh)))
        setProgress(p)
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sectionRef])

  return progress
}
