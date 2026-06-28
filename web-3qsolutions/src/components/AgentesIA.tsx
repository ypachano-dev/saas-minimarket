import { motion } from 'motion/react'
import { AGENTES } from '../data/agentes'

export default function AgentesIA() {
  return (
    <section id="agentes" className="relative max-w-7xl mx-auto px-8 md:px-16 lg:px-20 py-24">
      <motion.h2
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="font-display text-3xl sm:text-4xl text-[#1a1a1a] max-w-2xl"
      >
        Tres agentes de IA, listos para reinar tu operación.
      </motion.h2>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        {AGENTES.map((agente, index) => (
          <motion.article
            key={agente.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-white rounded-3xl border border-black/[0.05] p-6 shadow-sm flex flex-col items-center text-center"
          >
            <img src={agente.imagen} alt={`Agente ${agente.nombre}`} className="w-40 h-40 object-contain" />
            <h3 className="mt-4 font-display text-xl text-[#1a1a1a]">{agente.nombre}</h3>
            <p className="text-sm text-[#8e8e8e]">{agente.rol}</p>
            <ul className="mt-4 space-y-2 text-left">
              {agente.bullets.map((bullet) => (
                <li key={bullet} className="text-sm text-[#1a1a1a]/80 flex gap-2">
                  <span className="text-brand-green">•</span>
                  {bullet}
                </li>
              ))}
            </ul>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
