import { motion, useScroll, useTransform } from 'motion/react'
import heroRobot from '../assets/hero-robot-circuitos.png'

export default function Hero() {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 600], [0, 80])

  return (
    <section
      id="hero"
      className="relative min-h-[110vh] sm:min-h-[140vh] w-full flex flex-col items-center justify-start overflow-hidden bg-bg-base"
    >
      <div className="absolute top-[15vh] sm:top-[20vh] left-0 w-full h-[95vh] sm:h-[120vh] z-0 pointer-events-none">
        <motion.img
          src={heroRobot}
          alt=""
          style={{ y }}
          className="w-full h-full object-cover opacity-100"
        />
        <motion.div
          className="absolute inset-0 bg-brand-green/10 mix-blend-screen"
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute top-0 left-0 w-full h-24 sm:h-32 bg-gradient-to-b from-bg-base to-transparent" />
      </div>

      <div className="max-w-7xl w-full mx-auto px-8 md:px-16 lg:px-20 relative z-10 grid grid-cols-12 gap-x-4 md:gap-x-8 pt-[28vh] sm:pt-[34vh]">
        <div className="col-span-12 md:col-span-10 md:col-start-2">
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="font-display text-4xl sm:text-5xl lg:text-6xl leading-tight"
          >
            <span className="text-[#1a1a1a]">3Q Nexus convierte tus datos en decisiones</span>{' '}
            <span className="text-[#8e8e8e]">
              con agentes de IA que{' '}
              <span className="inline-flex w-[16px] md:w-[42px] lg:w-[62px] border-[2px] border-[#1a1a1a] rounded-full items-center justify-center align-middle mx-1">
                <span className="w-2 h-2 rounded-full bg-[#1a1a1a]" />
              </span>{' '}
              trabajan por ti, todos los días.
            </span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-8 max-w-md bg-white rounded-[6px] border border-black/[0.05] p-1 pl-4 flex items-center shadow-sm"
          >
            <input
              type="text"
              placeholder="Pide una demo..."
              className="flex-1 bg-transparent outline-none text-sm text-[#1a1a1a] placeholder:text-[#8e8e8e] py-2"
            />
            <button
              type="button"
              aria-label="solicitar demo"
              className="bg-[#1a1a1a] text-white w-9 h-9 rounded-full relative flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7H12M12 7L8 3M12 7L8 11"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </motion.div>
        </div>
      </div>

      <div className="absolute top-1/2 right-6 md:right-10 -translate-y-1/2 z-10">
        <button
          type="button"
          className="bg-white/40 backdrop-blur-md border border-white/60 rounded-full px-4 py-2 text-xs text-[#1a1a1a]"
        >
          es &harr; en
        </button>
      </div>

      <div className="absolute bottom-6 left-6 md:left-10 z-10 text-xs text-[#8e8e8e]">2026</div>
      <div className="absolute bottom-6 right-6 md:right-10 z-10 text-xs text-[#8e8e8e]">ERP · CRM · IA</div>
    </section>
  )
}
