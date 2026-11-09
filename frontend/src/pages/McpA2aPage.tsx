import Nav from '../components/mcpa2a/Nav'
import HeroSection from '../components/mcpa2a/HeroSection'
import { Suspense, lazy, useEffect, useState } from 'react'
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
        <Suspense fallback={<div style={{minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><div className="system-ready-spinner" /></div>}>
          <BuiltToLastSection />
          <TileShatterSection />
          <CoreFeaturesSection />
          <WhyNowSection />
          <CompetitorLandscapeSection />
          <WhereWeFitSection />
          <ArchitectureLayersSection />
          <SandboxedExecutionSection />
          <TamperDetectionSection />
          <SecurityScannerSection />
          <A2ADelegationSection />
          <ThreatModelSection />
          <FooterSection />
        </Suspense>
      </main>
    </>
  )
}
