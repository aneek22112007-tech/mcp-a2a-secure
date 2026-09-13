import { useState } from 'react'
import { create } from 'zustand'

interface UIState {
  activeTab: string
  setActiveTab: (tab: string) => void
  navOpen: boolean
  setNavOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: '1D',
  setActiveTab: (tab) => set({ activeTab: tab }),
  navOpen: false,
  setNavOpen: (v) => set({ navOpen: v }),
}))

export function useIsMobile() {
  const [isMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 768
  })
  return isMobile
}
