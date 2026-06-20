import { useState } from "react";

interface CuentaPorCobrar {
    id: string;
    cliente: string;
    cedula: string;
    saldo_pendiente: number;
    limite_credito: number;
    ultima_compra: string;
}

interface CuentaPorPagar {
    id: string;
    proveedor: string;
    rif: string;
    nro_factura: string;
    monto_deuda: number;
    fecha_emision: string;
    dias_credito: number;
}

const COBRAR_SEED: CuentaPorCobrar[] = [
    { id: "CXC-001", cliente: "Juan Pérez", cedula: "V-12345678", saldo_pendiente: 45.50, limite_credito: 150.00, ultima_compra: "2026-06-10" },
    { id: "CXC-002", cliente: "María Rodríguez", cedula: "V-87654321", saldo_pendiente: 120.00, limite_credito: 200.00, ultima_compra: "2026-06-13" },
];

const PAGAR_SEED: CuentaPorPagar[] = [
    { id: "CXP-001", proveedor: "Distribuidora Polar", rif: "J-00002456-0", nro_factura: "FAC-9921", monto_deuda: 340.00, fecha_emision: "2026-06-01", dias_credito: 15 },
    { id: "CXP-002", proveedor: "Alimentos Mary", rif: "J-30124578-1", nro_factura: "FAC-4412", monto_deuda: 185.00, fecha_emision: "2026-06-10", dias_credito: 7 },
];

export default function ModuloCuentas() {
    const [tab, setTab] = useState<"cxc" | "cxp">("cxc");
    const [itemSel, setItemSel] = useState<any>(null);
    const [montoAbono, setMontoAbono] = useState("");

    return (
        <div className="p-6 space-y-6">
            <div className="rounded-3xl bg-slate-900 p-6 text-white border border-slate-800 shadow-xl flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black tracking-tight">Cartera Financiera de Créditos</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Auditoría fiscal de cuentas por cobrar (CxC) y liquidación de facturas a proveedores (CxP)</p>
                </div>
                <div className="flex gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
                    <button type="button" onClick={() => setTab("cxc")} className={`px-4 py-1.5 rounded-lg transition-all ${tab === "cxc" ? "bg-blue-600 text-white" : "text-slate-400"}`}>💸 Clientes (CxC)</button>
                    <button type="button" onClick={() => setTab("cxp")} className={`px-4 py-1.5 rounded-lg transition-all ${tab === "cxp" ? "bg-blue-600 text-white" : "text-slate-400"}`}>🚚 Proveedores (CxP)</button>
                </div>
            </div>

            {tab === "cxc" ? (
                <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                                <th className="px-6 py-3">Cliente Deudor</th>
                                <th className="px-6 py-3 text-center">Límite Otorgado</th>
                                <th className="px-6 py-3 text-center">Deuda Activa</th>
                                <th className="px-6 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                            {COBRAR_SEED.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50/40">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900">{c.cliente}</p>
                                        <p className="text-[10px] font-mono text-slate-400">{c.cedula} · Ult. Fiado: {c.ultima_compra}</p>
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono font-bold">${c.limite_credito.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2.5 py-1 rounded-xl font-mono font-black bg-rose-50 border border-rose-100 text-rose-600">${c.saldo_pendiente.toFixed(2)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button type="button" onClick={() => setItemSel(c)} className="bg-slate-900 hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">💵 Abonar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                                <th className="px-6 py-3">Proveedor / Factura</th>
                                <th className="px-6 py-3 text-center">Plazo Original</th>
                                <th className="px-6 py-3 text-center">Monto Pendiente</th>
                                <th className="px-6 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                            {PAGAR_SEED.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50/40">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900">{p.proveedor}</p>
                                        <p className="text-[10px] font-mono text-blue-500 font-bold">{p.nro_factura} · RIF: {p.rif}</p>
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono text-slate-500">{p.dias_credito} días (Emisión: {p.fecha_emision})</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2.5 py-1 rounded-xl font-mono font-black bg-amber-50 border border-amber-100 text-amber-700">${p.monto_deuda.toFixed(2)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button type="button" onClick={() => setItemSel(p)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">💳 Liquidar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal interactivo de abonos */}
            {itemSel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setItemSel(null)}>
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
                        <div>
                            <h3 className="text-base font-black text-slate-900">Registrar Pago Financiero</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{itemSel.cliente || itemSel.proveedor}</p>
                        </div>
                        <input type="number" step="0.01" value={montoAbono} onChange={e => setMontoAbono(e.target.value)} placeholder="Monto a procesar ($)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-center text-base font-black font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setItemSel(null)} className="w-1/2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs py-2 transition-colors">Cerrar</button>
                            <button type="button" onClick={() => { alert("Transacción procesada en el flujo de caja."); setItemSel(null); setMontoAbono(""); }} className="w-1/2 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs py-2 transition-colors">Guardar Recibo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}