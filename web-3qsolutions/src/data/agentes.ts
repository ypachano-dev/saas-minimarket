import valeImg from '../assets/agente-vale-queen.png'
import yhorgeImg from '../assets/agente-yhorge-queen.png'
import aloImg from '../assets/agente-alo-queen.png'

export type AgenteId = 'vale' | 'yhorge' | 'alo'

export interface Agente {
  id: AgenteId
  nombre: string
  rol: string
  imagen: string
  bullets: string[]
}

export const AGENTES: Agente[] = [
  {
    id: 'vale',
    nombre: 'VALE',
    rol: 'Analista de datos',
    imagen: valeImg,
    bullets: [
      'Lee ventas, mermas y stock en tiempo real',
      'Entrega 3 a 5 hallazgos concretos por semana',
      'Sugiere acciones, no solo números',
    ],
  },
  {
    id: 'yhorge',
    nombre: 'YHORGE',
    rol: 'Cobranza y tesorería',
    imagen: yhorgeImg,
    bullets: [
      'Prioriza las cuentas por cobrar más urgentes',
      'Vigila cuentas por pagar y saldos bancarios',
      'Redacta mensajes de cobranza listos para enviar',
    ],
  },
  {
    id: 'alo',
    nombre: 'ALO',
    rol: 'Ventas y CRM',
    imagen: aloImg,
    bullets: [
      'Visión 360° de cada cliente',
      'Historial de compras, cartera y pedidos en un solo lugar',
      'Responde preguntas de ventas al instante',
    ],
  },
]
