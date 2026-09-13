import { useEffect, useState } from 'react'
import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { SCANNER_FINDINGS } from '../../data/landingData'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell,
} from 'recharts'

const SEVERITY_DATA = [
  { name: 'PASS', count: 6, color: '#7CFF4F' },
  { name: 'WARN', count: 1, color: '#F5B84B' },
  { name: 'CRIT', count: 0, color: '#FF5C5C' },
]

export default function ScannerSection() {
  const { ref, visible } = useIntersectionReveal(0.15)
  const [scanProgress, setScanProgress] = useState(0)
  const [revealedFindings, setRevealedFindings] = useState(0)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!visible || scanning) return
    setScanning(true)

    // Progress animation
    const start = performance.now()
    const duration = 2500
    const frame = () => {
      const elapsed = performance.now() - start
      const p = Math.min(100, (elapsed / duration) * 100)
      setScanProgress(p)
      if (p < 100) requestAnimationFrame(frame)
      else {
        // Reveal findings one by one
        let i = 0
        const reveal = () => {
          if (i > SCANNER_FINDINGS.length) return
          setRevealedFindings(i)
          i++
          setTimeout(reveal, 200)
        }
        reveal()
      }
    }
    requestAnimationFrame(frame)
  }, [visible])

  const getIcon = (severity: string) => {
    if (severity === 'PASS') return <CheckCircle2 size={14} className="text-[#7CFF4F]" />
    if (severity === 'WARNING') return <AlertTriangle size={14} className="text-[#F5B84B]" />
    return <XCircle size={14} className="text-[#FF5C5C]" />
  }

  const getSeverityColor = (severity: string) => {
    if (severity === 'PASS') return '#7CFF4F'
    if (severity === 'WARNING') return '#F5B84B'
    return '#FF5C5C'
  }

  return (
    <section
      id="scanner"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-24 relative"
      aria-label="Security scanner results"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        {/* Heading */}
        <div className="mb-16">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            SECURITY SCANNER
          </span>
          <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            SEE THE
            <br />
            <span className="text-[#7CFF4F]">THREAT SURFACE.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-12">
          {/* Left: Scanner output */}
          <div>
            {/* Progress bar */}
            <div className={`mb-8 reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
              <div className="flex justify-between mb-2">
                <span className="label-tech text-[#9BA39D]">
                  {scanProgress < 100 ? 'SCANNING MCP SERVER...' : 'SCAN COMPLETE'}
                </span>
                <span className="label-tech text-[#7CFF4F] tabular-nums">
                  {Math.round(scanProgress)}%
                </span>
              </div>
              <div className="h-1 bg-[#0f1a11] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7CFF4F] transition-none rounded-full"
                  style={{
                    width: `${scanProgress}%`,
                    boxShadow: '0 0 8px #7CFF4F',
                  }}
                />
              </div>
            </div>

            {/* Findings list */}
            <div className="space-y-2" role="list" aria-label="Scanner findings">
              {SCANNER_FINDINGS.slice(0, revealedFindings).map((finding) => (
                <div
                  key={finding.id}
                  role="listitem"
                  className="flex items-center gap-4 p-3 rounded-lg bg-[#050905] border border-[#0f1a11]"
                  style={{ animation: 'fadeUp 0.3s ease both' }}
                  aria-label={`${finding.id}: ${finding.name} — ${finding.severity}`}
                >
                  <span className="label-tech text-[#5a6660] w-14 shrink-0">{finding.id}</span>
                  {getIcon(finding.severity)}
                  <span className="text-xs text-[#9BA39D] flex-1">{finding.name}</span>
                  <span className="text-xs text-[#5a6660] hidden md:block">{finding.description}</span>
                  <span className="label-tech shrink-0" style={{ color: getSeverityColor(finding.severity) }}>
                    {finding.severity}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Bar chart */}
          <div className={`reveal reveal-delay-3 ${visible ? 'visible' : ''}`}>
            <div className="mb-3">
              <span className="label-tech text-[#5a6660]">SEVERITY DISTRIBUTION</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SEVERITY_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#5a6660' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#5a6660' }} allowDecimals={false} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {SEVERITY_DATA.map((entry, index) => (
                      <Cell key={index} fill={entry.color} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-xs text-[#5a6660] mt-4 leading-relaxed">
              Demonstration data only. Coverage based on OWASP MCP security guidelines.
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
