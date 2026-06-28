import { motion } from 'motion/react'
import { AGENTES, type AgenteId } from '../data/agentes'

interface Plan {
  nombre: string
  precio: string
  agentesIncluidos: AgenteId[]
  modulos: string
  cta: string
  destacado: boolean
}

const PLANES: Plan[] = [
  {
    nombre: 'Básico',
    precio: '$29/mes',
    agentesIncluidos: [],
    modulos: 'Caja, Inventario, Cartera básica',
    cta: 'Empezar',
    destacado: false,
  },
  {
    nombre: 'Pro',
    precio: '$79/mes',
    agentesIncluidos: ['alo'],
    modulos: 'Todo lo de Básico',
    cta: 'Empezar',
    destacado: true,
  },
  {
    nombre: 'Max',
    precio: '$149/mes',
    agentesIncluidos: ['vale', 'yhorge', 'alo'],
    modulos: 'Todo + Delivery + Estadísticas avanzadas',
    cta: 'Hablar con ventas',
    destacado: false,
  },
]

function agentePorId(id: AgenteId) {
  return AGENTES.find((agente) => agente.id === id)!
}

export default function Planes() {
  return (
    <section id="planes" className="relative max-w-7xl mx-auto px-8 md:px-16 lg:px-20 py-24">
      <motion.h2
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="font-display text-3xl sm:text-4xl text-[#1a1a1a] max-w-2xl"
      >
        Un plan para cada etapa del negocio.
      </motion.h2>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {PLANES.map((plan, index) => (
          <motion.div
            key={plan.nombre}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={
              plan.destacado
                ? 'rounded-3xl border-2 border-[#1a1a1a] p-8 shadow-lg bg-white md:-translate-y-4 flex flex-col'
                : 'rounded-3xl border border-black/[0.05] p-8 shadow-sm bg-white flex flex-col'
            }
          >
            <h3 className="font-display text-2xl text-[#1a1a1a]">{plan.nombre}</h3>
            <p className="mt-2 text-3xl font-display text-[#1a1a1a]">{plan.precio}</p>
            <p className="mt-1 text-xs text-[#8e8e8e]">precio de ejemplo</p>

            <div className="mt-6">
              <p className="text-sm text-[#8e8e8e]">Agentes IA</p>
              {plan.agentesIncluidos.length === 0 ? (
                <p className="mt-2 text-sm text-[#1a1a1a]/70">Ninguno</p>
              ) : (
                <div className="mt-2 flex gap-3">
                  {plan.agentesIncluidos.map((id) => {
                    const agente = agentePorId(id)
                    return (
                      <div key={id} className="flex flex-col items-center">
                        <img src={agente.imagen} alt={agente.nombre} className="w-12 h-12 object-contain" />
                        <span className="text-xs text-[#1a1a1a]/70">{agente.nombre}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <p className="mt-6 text-sm text-[#1a1a1a]/80">{plan.modulos}</p>

            <button
              type="button"
              className={
                plan.destacado
                  ? 'mt-8 bg-[#1a1a1a] text-white rounded-full px-6 py-3 text-sm hover:bg-black transition-colors'
                  : 'mt-8 border border-[#1a1a1a] text-[#1a1a1a] rounded-full px-6 py-3 text-sm hover:bg-[#1a1a1a] hover:text-white transition-colors'
              }
            >
              {plan.cta}
            </button>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
