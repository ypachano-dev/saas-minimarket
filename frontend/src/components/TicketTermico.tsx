import { FIRMA_PROVEEDOR } from "../config/brand";

export type TamanoPapel = "80mm" | "57mm";

export interface TicketConfigVM {
  tamano_papel: TamanoPapel;
  mostrar_logo: boolean;
  mostrar_rif: boolean;
  texto_cabecera: string;
  texto_pie: string;
  desglosar_impuestos: boolean;
}

export interface TicketLineaVM {
  label: string;
  monto: number;
}

export interface TicketDatosVM {
  nombreComercial: string;
  rif: string;
  logoUrl?: string | null;
  facturaNum: number | string;
  fecha: string;
  clienteName: string;
  clienteCedula: string;
  metodoPago: string;
  lineas: TicketLineaVM[];
  totalUsd: number;
  totalVes: number;
  montoRecibido?: number;
  vuelto?: number;
}

export const TICKET_CONFIG_DEFAULT: TicketConfigVM = {
  tamano_papel: "80mm",
  mostrar_logo: true,
  mostrar_rif: true,
  texto_cabecera: "",
  texto_pie: "",
  desglosar_impuestos: false,
};

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tasa de IVA simulada para el desglose (16%): el total ya incluye el impuesto,
// por lo que el subtotal se deriva dividiendo entre 1 + tasa.
const TASA_IVA = 0.16;

/** Plantilla visual del ticket térmico: la usan tanto la previsualización en
 * vivo de Configuración de Tienda como el recibo real emitido en Caja, así
 * ambas vistas siempre quedan sincronizadas con la misma plantilla. */
export default function TicketTermico({ config, datos }: { config: TicketConfigVM; datos: TicketDatosVM }) {
  const subtotalUsd = config.desglosar_impuestos ? datos.totalUsd / (1 + TASA_IVA) : datos.totalUsd;
  const ivaUsd = config.desglosar_impuestos ? datos.totalUsd - subtotalUsd : 0;

  return (
    <div
      style={{ width: config.tamano_papel }}
      className="mx-auto bg-white border border-dashed border-slate-300 p-3 font-mono text-[10.5px] text-slate-800 leading-tight"
    >
      {config.mostrar_logo && datos.logoUrl && (
        <div className="flex justify-center pb-1">
          <img src={datos.logoUrl} alt={datos.nombreComercial} className="h-10 max-w-full object-contain" />
        </div>
      )}

      <div className="text-center space-y-0.5">
        <p className="font-black text-[12px] uppercase tracking-tight">{datos.nombreComercial}</p>
        {config.mostrar_rif && <p className="text-[9px] text-slate-500">RIF: {datos.rif}</p>}
        {config.texto_cabecera && <p className="text-[9px] text-slate-500 whitespace-pre-line">{config.texto_cabecera}</p>}
      </div>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      <p className="text-[9px] text-slate-500">TICKET NRO: {datos.facturaNum}</p>
      <p className="text-[9px] text-slate-500">FECHA: {datos.fecha}</p>
      <p className="text-[9px] text-slate-500">CLIENTE: {datos.clienteName}</p>
      <p className="text-[9px] text-slate-500">CÉDULA: {datos.clienteCedula}</p>
      <p className="text-[9px] text-slate-500">PAGO: {datos.metodoPago}</p>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      <div className="space-y-0.5">
        {datos.lineas.map((linea, idx) => (
          <div key={idx} className="flex justify-between">
            <span className="truncate pr-2">{linea.label}</span>
            <span>${fmt(linea.monto)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      {config.desglosar_impuestos ? (
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>${fmt(subtotalUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA (16%):</span>
            <span>${fmt(ivaUsd)}</span>
          </div>
        </div>
      ) : null}

      <div className="flex justify-between font-black text-[12px] mt-1">
        <span>TOTAL USD:</span>
        <span>${fmt(datos.totalUsd)}</span>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500">
        <span>TOTAL VES:</span>
        <span>Bs. {fmt(datos.totalVes)}</span>
      </div>

      {typeof datos.montoRecibido === "number" && (
        <div className="flex justify-between text-[9px] text-slate-500 mt-1">
          <span>Recibido:</span>
          <span>${fmt(datos.montoRecibido)}</span>
        </div>
      )}
      {typeof datos.vuelto === "number" && (
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>Vuelto:</span>
          <span>${fmt(datos.vuelto)}</span>
        </div>
      )}

      {config.texto_pie && (
        <>
          <div className="border-t border-dashed border-slate-300 my-1.5" />
          <p className="text-center text-[9px] text-slate-500 whitespace-pre-line">{config.texto_pie}</p>
        </>
      )}

      <div className="border-t border-dashed border-slate-300 my-1.5" />
      <p className="text-center text-[8px] text-slate-400">{FIRMA_PROVEEDOR}</p>
    </div>
  );
}
