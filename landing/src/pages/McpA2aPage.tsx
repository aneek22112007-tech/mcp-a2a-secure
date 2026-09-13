import Nav from '../components/mcpa2a/Nav'
import HeroSection from '../components/mcpa2a/HeroSection'
import BuiltToLastSection from '../components/mcpa2a/BuiltToLastSection'
import TileShatterSection from '../components/mcpa2a/TileShatterSection'
import CoreFeaturesSection from '../components/mcpa2a/CoreFeaturesSection'
import WhyNowSection from '../components/mcpa2a/WhyNowSection'
import CompetitorLandscapeSection from '../components/mcpa2a/CompetitorLandscapeSection'
import WhereWeFitSection from '../components/mcpa2a/WhereWeFitSection'
import ArchitectureLayersSection from '../components/mcpa2a/ArchitectureLayersSection'
import SandboxedExecutionSection from '../components/mcpa2a/SandboxedExecutionSection'
import TamperDetectionSection from '../components/mcpa2a/TamperDetectionSection'
import SecurityScannerSection from '../components/mcpa2a/SecurityScannerSection'
import A2ADelegationSection from '../components/mcpa2a/A2ADelegationSection'

import ThreatModelSection from '../components/mcpa2a/ThreatModelSection'
import FooterSection from '../components/mcpa2a/FooterSection'
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
      </main>
    </>
  )
}
