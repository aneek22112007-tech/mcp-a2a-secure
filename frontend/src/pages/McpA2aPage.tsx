import Nav from '../components/mcpa2a/Nav'
import HeroSection from '../components/mcpa2a/HeroSection'
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

const BuiltToLastSection = lazy(() => import('../components/mcpa2a/BuiltToLastSection'))
const TileShatterSection = lazy(() => import('../components/mcpa2a/TileShatterSection'))
const CoreFeaturesSection = lazy(() => import('../components/mcpa2a/CoreFeaturesSection'))
const WhyNowSection = lazy(() => import('../components/mcpa2a/WhyNowSection'))
const CompetitorLandscapeSection = lazy(() => import('../components/mcpa2a/CompetitorLandscapeSection'))
const WhereWeFitSection = lazy(() => import('../components/mcpa2a/WhereWeFitSection'))
const ArchitectureLayersSection = lazy(() => import('../components/mcpa2a/ArchitectureLayersSection'))
const SandboxedExecutionSection = lazy(() => import('../components/mcpa2a/SandboxedExecutionSection'))
const TamperDetectionSection = lazy(() => import('../components/mcpa2a/TamperDetectionSection'))
const SecurityScannerSection = lazy(() => import('../components/mcpa2a/SecurityScannerSection'))
const A2ADelegationSection = lazy(() => import('../components/mcpa2a/A2ADelegationSection'))
const ThreatModelSection = lazy(() => import('../components/mcpa2a/ThreatModelSection'))
const FooterSection = lazy(() => import('../components/mcpa2a/FooterSection'))
const BackgroundScene = lazy(() => import('../components/mcpa2a/BackgroundScene'))
import '../index.css'

const STATIC_BACKDROP =
  'radial-gradient(ellipse 70% 55% at 70% 20%, rgba(254,110,68,0.10) 0%, transparent 60%),' +
  'radial-gradient(ellipse 60% 50% at 15% 80%, rgba(146,37,4,0.16) 0%, transparent 60%), #000'

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Fixed layer behind the whole page. Shows a static gradient first, then
 * loads the three.js scene once the browser is idle after first paint.
 * Reduced motion or no WebGL keeps the static gradient only.
 */
function PageBackdrop() {
  const reducedMotion = useReducedMotion()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (reducedMotion || !hasWebGL()) return
    const wide = window.matchMedia('(min-width: 1024px)')
    if (!wide.matches) return
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => setReady(true), 600)
    return () => window.clearTimeout(t)
  }, [reducedMotion])

  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: STATIC_BACKDROP }}
    >
      {ready && !reducedMotion && (
        <Suspense fallback={null}>
          <BackgroundScene />
        </Suspense>
      )}
    </div>
  )
}

const SECTION_PLACEHOLDER = '32rem'

/**
 * Mount a below-the-fold section once it is within about 600px of the viewport.
 * The placeholder keeps the page from jumping while the chunk loads.
 */
function NearViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true)
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (!show) {
    return <div ref={ref} style={{ minHeight: SECTION_PLACEHOLDER }} />
  }
  return (
    <Suspense fallback={<div style={{ minHeight: SECTION_PLACEHOLDER }} />}>
      {children}
    </Suspense>
  )
}

/**
 * McpA2aPage: root page for the landing sections.
 * The background scene is mounted once here, behind <main>.
 */
export default function McpA2aPage() {
  return (
    <>
      <PageBackdrop />
      <Nav />
      <main
        id="main-content"
        aria-label="MCP·A2A secure agent protocol landing page"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <HeroSection />
        <NearViewport><BuiltToLastSection /></NearViewport>
        <NearViewport><TileShatterSection /></NearViewport>
        <NearViewport><CoreFeaturesSection /></NearViewport>
        <NearViewport><WhyNowSection /></NearViewport>
        <NearViewport><CompetitorLandscapeSection /></NearViewport>
        <NearViewport><WhereWeFitSection /></NearViewport>
        <NearViewport><ArchitectureLayersSection /></NearViewport>
        <NearViewport><SandboxedExecutionSection /></NearViewport>
        <NearViewport><TamperDetectionSection /></NearViewport>
        <NearViewport><SecurityScannerSection /></NearViewport>
        <NearViewport><A2ADelegationSection /></NearViewport>
        <NearViewport><ThreatModelSection /></NearViewport>
        <NearViewport><FooterSection /></NearViewport>
      </main>
    </>
  )
}
