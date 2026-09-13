import { Shield } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-[#0f1a11] bg-[#030604] pt-16 pb-8" aria-label="Site footer">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <Shield size={18} className="text-[#7CFF4F]" strokeWidth={2.5} aria-hidden="true" />
              <span className="text-xs font-bold tracking-[0.15em] text-white tabular-nums">
                MCP GUARD
              </span>
            </div>
            <p className="text-xs text-[#5a6660] max-w-xs leading-relaxed">
              Verifiable execution and security infrastructure for AI agents and the Model Context Protocol.
            </p>
          </div>

          {/* Links 1 */}
          <div>
            <div className="label-tech text-[#9BA39D] mb-4">PRODUCT</div>
            <ul className="space-y-3">
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Features</a></li>
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Security Architecture</a></li>
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Pricing</a></li>
            </ul>
          </div>

          {/* Links 2 */}
          <div>
            <div className="label-tech text-[#9BA39D] mb-4">COMPANY</div>
            <ul className="space-y-3">
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">About</a></li>
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Blog</a></li>
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">GitHub</a></li>
              <li><a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-[#0f1a11] gap-4">
          <div className="text-xs text-[#5a6660]">
            © {new Date().getFullYear()} MCP Guard. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs text-[#5a6660] hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
