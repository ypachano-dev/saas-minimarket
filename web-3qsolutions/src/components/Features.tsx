import { motion } from 'motion/react'

const MODULOS = [
  { titulo: 'Caja / POS', detalle: 'Ventas rápidas, turnos de caja y cierre diario sin fricción.' },
  { titulo: 'Inventario y Almacén', detalle: 'Recepción de mercancía, auditorías y stock proyectado en tiempo real.' },
  { titulo: 'Desposte y Balanza', detalle: 'Descompón productos enteros en cortes y pésalos con trazabilidad.' },
  { titulo: 'Cartera y Créditos', detalle: 'Cuentas por cobrar, historial de pagos y alertas de vencimiento.' },
  { titulo: 'Bancos y Tesorería', detalle: 'Saldos consolidados y cuentas por pagar bajo control.' },
  { titulo: 'Delivery', detalle: 'Mapa en vivo, ETA y seguimiento GPS del repartidor.' },
  { titulo: 'Estadísticas Avanzadas', detalle: 'Indicadores del negocio que se actualizan solos, sin hojas de cálculo.' },
]

export default function Features() {
  return (
    <section id="features" className="relative max-w-7xl mx-auto px-8 md:px-16 lg:px-20 py-24">
      <motion.h2
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="font-display text-3xl sm:text-4xl text-[#1a1a1a] max-w-2xl"
      >
        Un solo lugar para correr todo el negocio.
      </motion.h2>

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {MODULOS.map((modulo, index) => (
          <motion.div
            key={modulo.titulo}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.08 }}
            className="bg-white rounded-2xl border border-black/[0.05] p-6 shadow-sm"
          >
            <h3 className="font-display text-lg text-[#1a1a1a]">{modulo.titulo}</h3>
            <p className="mt-2 text-sm text-[#8e8e8e]">{modulo.detalle}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
