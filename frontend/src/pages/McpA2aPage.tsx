import Nav from '../components/mcpa2a/Nav'
import HeroSection from '../components/mcpa2a/HeroSection'
import { Suspense, lazy } from 'react'

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
import '../index.css'

/**
 * McpA2aPage — root page orchestrating all sections in the ROCKY animation structure.
 * Scroll flow:
 *   Hero → Built To Last → Tile Shatter → Core Features → Footer
 */
export default function McpA2aPage() {
  return (
    <>
      <Nav />
      <main id="main-content" aria-label="MCP·A2A secure agent protocol landing page">
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
