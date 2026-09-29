import { useEffect, useState } from 'react'
import { useScrollProgress } from '../../hooks/useScrollProgress'

import Navigation from './Navigation'
import SecurityCore, { type CoreState } from './SecurityCore'
import ParticleAtmosphere, { type ParticleMode } from './ParticleAtmosphere'

// Sections
import HeroSection from './HeroSection'
import BuiltToDefendSection from './BuiltToDefendSection'
import RuntimeSecuritySection from './RuntimeSecuritySection'
import VerifiedExecutionSection from './VerifiedExecutionSection'
import ZeroTrustSection from './ZeroTrustSection'
import ThreatResponseSection from './ThreatResponseSection'
import CoreFeaturesSection from './CoreFeaturesSection'
import MCPNetworkSection from './MCPNetworkSection'
import SchemaTamperSection from './SchemaTamperSection'
import ScannerSection from './ScannerSection'
import A2ADelegationSection from './A2ADelegationSection'
import ObservabilitySection from './ObservabilitySection'
import ProductPreviewSection from './ProductPreviewSection'
import FinalCTASection from './FinalCTASection'
import Footer from './Footer'

// Map scroll progress or section intersections to states
const SECTION_IDS = [
  'hero',
  'built-to-defend',
  'runtime',
  'verified-execution',
  'zero-trust',
  'threat-response',
  'features',
  'network',
  'tamper',
  'scanner',
  'a2a',
  'observability',
  'preview',
  'cta',
]

const SECTION_TO_CORE_STATE: Record<string, CoreState> = {
  'hero': 'hero',
  'built-to-defend': 'defend',
  'runtime': 'runtime',
  'verified-execution': 'execution',
  'zero-trust': 'zeroTrust',
  'threat-response': 'threat',
  'features': 'features',
  'network': 'network',
  'tamper': 'tamper',
  'scanner': 'scanner',
  'a2a': 'a2a',
  'observability': 'observability',
  'preview': 'preview',
  'cta': 'final',
}

const SECTION_TO_PARTICLE_MODE: Record<string, ParticleMode> = {
  'hero': 'hero',
  'built-to-defend': 'defend',
  'runtime': 'runtime',
  'verified-execution': 'runtime',
  'zero-trust': 'runtime',
  'threat-response': 'threat',
  'features': 'runtime',
  'network': 'network',
  'tamper': 'tamper',
  'scanner': 'runtime',
  'a2a': 'a2a',
  'observability': 'runtime',
  'preview': 'runtime',
  'cta': 'final',
}

export default function LandingPage() {
  const scrollProgress = useScrollProgress()
  const [activeSection, setActiveSection] = useState('hero')
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })

  // Track active section via IntersectionObserver
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        // Find highest intersecting ratio or just the first intersecting
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          // Sort by intersection ratio
          visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          setActiveSection(visible[0].target.id)
        }
      },
      { threshold: 0.3, rootMargin: '-10% 0px -10% 0px' }
    )

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })

    return () => obs.disconnect()
  }, [])

  // Track mouse for particles
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const coreState = SECTION_TO_CORE_STATE[activeSection] || 'hero'
  const particleMode = SECTION_TO_PARTICLE_MODE[activeSection] || 'hero'

  return (
    <div className="bg-[#030604] min-h-screen text-white relative font-sans selection:bg-[#7CFF4F] selection:text-[#030604]">
      {/* BACKGROUND ASSETS (Fixed) */}
      <ParticleAtmosphere
        mode={particleMode}
        mouseX={mousePos.x}
        mouseY={mousePos.y}
      />

      <div
        className="fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
      >
        <SecurityCore state={coreState} scrollProgress={scrollProgress} />
      </div>

      {/* FOREGROUND CONTENT */}
      <div className="relative z-10 mix-blend-normal">
        <Navigation />

        <main>
          <HeroSection />
          <BuiltToDefendSection />
          <RuntimeSecuritySection />
          <VerifiedExecutionSection />
          <ZeroTrustSection />
          <ThreatResponseSection />
          <CoreFeaturesSection />
          <MCPNetworkSection />
          <SchemaTamperSection />
          <ScannerSection />
          <A2ADelegationSection />
          <ObservabilitySection />
          <ProductPreviewSection />
          <FinalCTASection />
        </main>

        <Footer />
      </div>
    </div>
  )
}
