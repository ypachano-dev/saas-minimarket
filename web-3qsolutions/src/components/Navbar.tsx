import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

const NAV_LINKS = [
  { label: 'producto', href: '#features' },
  { label: 'agentes ia', href: '#agentes' },
  { label: 'planes', href: '#planes' },
  { label: 'nosotros', href: '#footer' },
]

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 1L27 14L14 27L1 14L14 1Z" stroke="#1a1a1a" strokeWidth="2" />
      <circle cx="14" cy="14" r="4" fill="#1a1a1a" />
    </svg>
  )
}

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 w-full z-50 py-6 md:py-10 bg-gradient-to-b from-[#f1f1f1]/80 to-transparent backdrop-blur-[2px]">
      <div className="grid grid-cols-12 max-w-7xl mx-auto px-6 md:px-8 items-center">
        <div className="col-span-6 md:col-span-3 flex items-center gap-2">
          <LogoMark />
          <span className="font-display text-lg tracking-tight text-[#1a1a1a]">3Q Solutions</span>
        </div>

        <nav className="hidden md:flex col-span-6 items-center justify-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm lowercase text-[#1a1a1a]/70 hover:text-[#1a1a1a] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="col-span-6 md:col-span-3 flex items-center justify-end gap-4">
          <a href="#planes" className="hidden sm:inline text-sm text-[#1a1a1a]/70 hover:text-[#1a1a1a]">
            encuentra ayuda
          </a>
          <a
            href="#planes"
            className="hidden sm:inline-flex bg-[#1a1a1a] text-white text-sm px-5 py-2.5 rounded-full hover:bg-black transition-colors"
          >
            empezar ahora
          </a>
          <button
            type="button"
            aria-label="abrir menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="md:hidden flex flex-col gap-1.5 w-8 h-8 items-center justify-center"
          >
            <motion.span className="block w-6 h-[2px] bg-[#1a1a1a]" animate={{ rotate: open ? 45 : 0, y: open ? 6 : 0 }} />
            <motion.span className="block w-6 h-[2px] bg-[#1a1a1a]" animate={{ opacity: open ? 0 : 1 }} />
            <motion.span className="block w-6 h-[2px] bg-[#1a1a1a]" animate={{ rotate: open ? -45 : 0, y: open ? -6 : 0 }} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden overflow-hidden bg-[#f1f1f1]/95 backdrop-blur-md"
          >
            <nav className="flex flex-col gap-4 px-6 py-6">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="text-base lowercase text-[#1a1a1a]"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="#planes"
                onClick={() => setOpen(false)}
                className="inline-flex bg-[#1a1a1a] text-white text-sm px-5 py-2.5 rounded-full w-fit"
              >
                empezar ahora
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
