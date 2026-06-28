import { motion } from 'motion/react'

export default function CtaFinal() {
  return (
    <section className="relative max-w-7xl mx-auto px-8 md:px-16 lg:px-20 py-24">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="rounded-3xl bg-[#1a1a1a] px-8 md:px-16 py-16 text-center"
      >
        <h2 className="font-display text-3xl sm:text-4xl text-white max-w-xl mx-auto">
          Dale a tu negocio el equipo de IA que nunca duerme.
        </h2>
        <p className="mt-4 text-[#cfcfcf]">
          Pide una demo y te mostramos a VALE, YHORGE y ALO trabajando con tus propios datos.
        </p>
        <button
          type="button"
          className="mt-8 inline-flex bg-brand-green text-black rounded-full px-8 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Pedir demo
        </button>
      </motion.div>
    </section>
  )
}
