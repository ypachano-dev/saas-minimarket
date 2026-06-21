import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import apiClient from "../api/client";

const PROVEEDORES = ["Distribuidora Polar", "Alimentos Mary", "Vatel C.A.", "Cargill Venezuela", "Proveedor Local / Otro"];
const PRESENTACIONES = ["Unidad", "Empaque", "Bulto", "Botella", "Frasco", "Pote", "Lata", "Caja", "Bolsa", "Blíster", "Granel"];

const initial = {
  // Información básica
  codigo_interno: "",
  codigo_barras: "",
  nombre: "",
  marca: "",
  caracteristicas: "",
  linea: "",
  clase_o_tipo: "",
  // Logística y proveedor
  proveedor: "",
  tipo_envase: "",
  peso: "",
  ubicacion: "",
  tipo_venta: "unidad",
  factor_merma: "",
  refrigerado: false,
  perecedero: false,
  // Fechas críticas
  fecha_elaboracion: "",
  fecha_ingreso_stock: "",
  fecha_vencimiento: "",
  // Inventario
  stock_minimo: "",
  // Costos
  costo_usd: "",
  precio_1_detalle: "",
  precio_2_mayorista: "",
  precio_3_especial: "",
  aplica_iva: true,
  foto_url: "",
};

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 font-medium";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1";
const seccionCls = "text-xs font-black uppercase tracking-wider text-slate-900";

function MsgLine({ msg }: { msg: { tipo: "ok" | "error"; texto: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`p-3 rounded-xl text-xs font-bold border ${msg.tipo === "ok" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"} text-center`}>
      {msg.texto}
    </div>
  );
}

export default function FichaProducto() {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [pasoIA, setPasoIA] = useState("");
  
  const [fotoFrontal, setFotoFrontal] = useState<File | null>(null);
  const [fotoTrasera, setFotoTrasera] = useState<File | null>(null);
  const [previewFrontal, setPreviewFrontal] = useState<string | null>(null);
  const [previewTrasera, setPreviewTrasera] = useState<string | null>(null);
  
  const inputFrontalRef = useRef<HTMLInputElement>(null);
  const inputTraseraRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof typeof initial>(key: K, value: typeof initial[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onScanCodigoBarras(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      nombreRef.current?.focus();
    }
  }

  // Comprimir y redimensionar imagen para optimizar ancho de banda en tabletas y límites de APIs (max 1MB)
  function comprimirImagen(file: File): Promise<File> {
    return new Promise((resolve) => {
      // Si no es imagen, retornar original
      if (!file.type.startsWith("image/")) {
        return resolve(file);
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.split(".")[0] + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          }, "image/jpeg", 0.7); // 70% calidad
        };
      };
      reader.onerror = () => resolve(file);
    });
  }

  // Lógica del Escáner de IA Dual (foto frontal + trasera opcional)
  async function escanearArchivos(frontal: File, trasera: File | null) {
    setMsg(null);
    setEscaneando(true);
    setPasoIA("Conectando con el motor de visión IA y optimizando imágenes...");
    
    // Simular pasos visuales del motor de IA
    const pasos = [
      "Comprimiendo y redimensionando fotos para transmisión rápida...",
      "Escaneando empaque frontal (Marca, Nombre y Diseño)...",
      "Procesando cara trasera (Buscando códigos de barra, peso neto)...",
      "Analizando lista de ingredientes y características del fabricante...",
      "Ejecutando algoritmos OCR y correspondencia semántica...",
      "Clasificando categoría del producto y tasas arancelarias...",
      "¡Extracción neuronal de metadatos completada con éxito!"
    ];

    let pIdx = 0;
    const interval = setInterval(() => {
      if (pIdx < pasos.length) {
        setPasoIA(pasos[pIdx]);
        pIdx++;
      } else {
        clearInterval(interval);
      }
    }, 450);

    try {
      const frontalOpt = await comprimirImagen(frontal);
      const traseraOpt = trasera ? await comprimirImagen(trasera) : null;
      
      const formData = new FormData();
      if (frontalOpt) {
        formData.append("foto_frontal", frontalOpt);
      }
      if (traseraOpt) {
        formData.append("foto_trasera", traseraOpt);
      }

      const res = await apiClient.post("/api/v1/productos/analizar-foto", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      clearInterval(interval);
      setPasoIA("Indexando campos en la ficha técnica...");
      
      const data = res.data;
      setForm({
        codigo_interno: data.codigo_interno || "",
        codigo_barras: data.codigo_barras || "",
        nombre: data.nombre || "",
        marca: data.marca || "",
        caracteristicas: data.caracteristicas || "",
        linea: data.linea || "",
        clase_o_tipo: data.clase_o_tipo || "",
        proveedor: data.proveedor || "",
        tipo_envase: data.tipo_envase || "",
        peso: String(data.peso ?? ""),
        ubicacion: data.ubicacion || "",
        tipo_venta: data.tipo_venta || "unidad",
        factor_merma: String(data.factor_merma ?? ""),
        refrigerado: !!data.refrigerado,
        perecedero: !!data.perecedero,
        fecha_elaboracion: data.fecha_elaboracion || "",
        fecha_ingreso_stock: data.fecha_ingreso_stock || "",
        fecha_vencimiento: data.fecha_vencimiento || "",
        stock_minimo: String(data.stock_minimo ?? "0"),
        costo_usd: String(data.costo_usd ?? ""),
        precio_1_detalle: String(data.precio_1_detalle ?? ""),
        precio_2_mayorista: String(data.precio_2_mayorista ?? ""),
        precio_3_especial: String(data.precio_3_especial ?? ""),
        aplica_iva: !!data.aplica_iva,
        foto_url: data.foto_url || "",
      });

      setMsg({ tipo: "ok", texto: `🤖 IA: Se identificó "${data.nombre}" como [${data.linea} / ${data.clase_o_tipo}] y se auto-completaron todos los campos.` });
    } catch {
      clearInterval(interval);
      setMsg({ tipo: "error", texto: "No se pudo procesar la foto con el motor de IA." });
    } finally {
      setEscaneando(false);
      setPasoIA("");
    }
  }

  function analizarFotosCargadas() {
    if (fotoFrontal) {
      escanearArchivos(fotoFrontal, fotoTrasera);
    }
  }

  // Simulación con archivos falsos para pruebas rápidas
  function simularEscanerIA(frontalFilename: string, traseraFilename: string | null = null, previewFrontalUrl: string, previewTraseraUrl: string | null = null) {
    const fakeFrontal = new File(["fake_content"], frontalFilename, { type: "image/png" });
    const fakeTrasera = traseraFilename ? new File(["fake_content"], traseraFilename, { type: "image/png" }) : null;
    
    setFotoFrontal(fakeFrontal);
    setPreviewFrontal(previewFrontalUrl);
    
    if (fakeTrasera) {
      setFotoTrasera(fakeTrasera);
      setPreviewTrasera(previewTraseraUrl);
    } else {
      setFotoTrasera(null);
      setPreviewTrasera(null);
    }
    
    escanearArchivos(fakeFrontal, fakeTrasera);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!form.codigo_interno.trim() || !form.nombre.trim()) {
      setMsg({ tipo: "error", texto: "Código Interno y Nombre son obligatorios." });
      return;
    }

    const costo = Number(form.costo_usd || 0);
    const precio1 = Number(form.precio_1_detalle || 0);
    const precio2 = Number(form.precio_2_mayorista || 0);
    const precio3 = Number(form.precio_3_especial || 0);
    const peso = Number(form.peso || 0);
    const stockMinimo = Number(form.stock_minimo || 0);

    if ([costo, precio1, precio2, precio3, peso, stockMinimo].some((n) => Number.isNaN(n) || n < 0)) {
      setMsg({ tipo: "error", texto: "Peso, Costo, Precios y Stock Mínimo deben ser números válidos (≥ 0)." });
      return;
    }

    const factorMerma = Number(form.factor_merma || 0);
    if (form.tipo_venta === "peso" && (Number.isNaN(factorMerma) || factorMerma < 0 || factorMerma > 100)) {
      setMsg({ tipo: "error", texto: "El % de Merma / Factor de Desposte debe ser un número entre 0 y 100." });
      return;
    }

    try {
      await apiClient.post("/api/v1/productos", {
        codigo_interno: form.codigo_interno.trim(),
        codigo_barras: form.codigo_barras.trim() || null,
        nombre: form.nombre.trim(),
        marca: form.marca.trim() || null,
        caracteristicas: form.caracteristicas.trim() || null,
        linea: form.linea.trim() || null,
        clase_o_tipo: form.clase_o_tipo.trim() || null,
        tipo_envase: form.tipo_envase || null,
        ubicacion: form.ubicacion.trim() || null,
        refrigerado: form.refrigerado,
        perecedero: form.perecedero,
        fecha_elaboracion: form.fecha_elaboracion || null,
        fecha_ingreso_stock: form.fecha_ingreso_stock || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        stock_minimo: stockMinimo,
        costo_usd: costo,
        precio_1_detalle: precio1,
        precio_2_mayorista: precio2,
        precio_3_especial: precio3,
        aplica_iva: form.aplica_iva,
        proveedor: form.proveedor || null,
        peso,
        foto_url: form.foto_url.trim() || null,
        tipo_venta: form.tipo_venta,
        factor_merma: form.tipo_venta === "peso" ? factorMerma : null,
      });
      setMsg({ tipo: "ok", texto: "Ficha guardada en el inventario correctamente." });
      setForm(initial);
      setFotoFrontal(null);
      setFotoTrasera(null);
      setPreviewFrontal(null);
      setPreviewTrasera(null);
    } catch (err: any) {
      const detalle = err.response?.data?.detail ?? "No se pudo guardar la ficha del producto.";
      setMsg({ tipo: "error", texto: detalle });
    }
  }

  return (
    <div className="p-6 relative">
      {/* Overlay del Escáner Láser de IA */}
      {escaneando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 p-4">
          <div className="relative w-48 h-48 border-4 border-blue-500 rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center bg-slate-950">
            {/* Animación del láser */}
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent top-0 animate-[scan_2s_infinite] shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{
              animation: "scan 1.5s ease-in-out infinite"
            }} />
            <span className="text-4xl">📸</span>
          </div>
          <style>{`
            @keyframes scan {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
          `}</style>
          <div className="mt-6 text-center space-y-2">
            <h3 className="text-lg font-black text-white tracking-tight uppercase">Analizando con Visión Artificial</h3>
            <p className="text-sm font-bold text-blue-400 animate-pulse">{pasoIA}</p>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-100/80 bg-white p-8 shadow-sm hover:shadow-md transition-all duration-300 space-y-6">
        <div className="flex flex-col gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Ficha de Catálogo</h2>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Ficha técnica extendida con visión artificial dual</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-2">
            {/* Foto Frontal Upload Card */}
            <div className="relative group border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-3xl p-4 transition-all duration-300 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-white text-center cursor-pointer min-h-[160px]"
                 onClick={() => inputFrontalRef.current?.click()}>
              <input
                type="file"
                ref={inputFrontalRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFotoFrontal(file);
                    setPreviewFrontal(URL.createObjectURL(file));
                  }
                }}
                accept="image/*"
                className="hidden"
              />
              {previewFrontal ? (
                <div className="relative w-full h-full flex items-center justify-center p-2">
                  <img src={previewFrontal} alt="Vista frontal" className="max-h-[120px] rounded-xl object-contain shadow-sm" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFotoFrontal(null);
                      setPreviewFrontal(null);
                    }}
                    className="absolute -top-2 -right-2 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold rounded-full p-2 h-7 w-7 flex items-center justify-center shadow-md transition-all"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl text-slate-400 group-hover:scale-110 transition-transform">📸</div>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Foto Frontal (Obligatoria)</p>
                  <p className="text-[10px] text-slate-400 font-medium">Toma foto de la marca, nombre y cara principal</p>
                </div>
              )}
            </div>

            {/* Foto Trasera Upload Card */}
            <div className="relative group border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-3xl p-4 transition-all duration-300 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-white text-center cursor-pointer min-h-[160px]"
                 onClick={() => inputTraseraRef.current?.click()}>
              <input
                type="file"
                ref={inputTraseraRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFotoTrasera(file);
                    setPreviewTrasera(URL.createObjectURL(file));
                  }
                }}
                accept="image/*"
                className="hidden"
              />
              {previewTrasera ? (
                <div className="relative w-full h-full flex items-center justify-center p-2">
                  <img src={previewTrasera} alt="Vista trasera" className="max-h-[120px] rounded-xl object-contain shadow-sm" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFotoTrasera(null);
                      setPreviewTrasera(null);
                    }}
                    className="absolute -top-2 -right-2 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold rounded-full p-2 h-7 w-7 flex items-center justify-center shadow-md transition-all"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl text-slate-400 group-hover:scale-110 transition-transform">🔍</div>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Foto Trasera (Opcional)</p>
                  <p className="text-[10px] text-slate-400 font-medium">Toma foto del código de barra, peso e ingredientes</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full">
            <button
              type="button"
              disabled={!fotoFrontal}
              onClick={analizarFotosCargadas}
              className={`w-full flex items-center justify-center gap-2 rounded-2xl font-black text-xs px-6 py-3.5 shadow-md transition-all duration-300 ${fotoFrontal ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-lg" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
            >
              🤖 Extraer Datos con Visión Artificial Dual {fotoFrontal && "✨"}
            </button>
          </div>
        </div>

        {/* Demo Plantillas de IA */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">💡 Demos Rápidas de IA por Clase (Simula foto frontal y trasera):</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "harina_pan_frontal.png", 
                "harina_pan_trasera.png",
                "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=400&q=80"
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🌾 Víveres: Harina PAN
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "pepsi_cola_frontal.png", 
                "pepsi_cola_trasera.png",
                "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80"
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🥤 Bebida: Pepsi Cola
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "ibuprofeno_frontal.png", 
                "ibuprofeno_trasera.png",
                "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1607619275536-2479e0a298a6?auto=format&fit=crop&w=400&q=80"
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              💊 Medicina: Ibuprofeno
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "martillo_stanley_frontal.png", 
                "martillo_stanley_trasera.png",
                "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1530124560677-bdaea02790a5?auto=format&fit=crop&w=400&q=80"
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🛠️ Ferretería: Martillo Stanley
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "queso_gouda_frontal.png", 
                "queso_gouda_trasera.png",
                "https://images.unsplash.com/photo-1486887396153-fa416525c108?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1528256015116-953e7f849dfb?auto=format&fit=crop&w=400&q=80"
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🧀 Charcutería: Queso Gouda
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "lomito_res_frontal.png", 
                null,
                "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80",
                null
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🥩 Carne: Lomito de Res
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "tomate_manzano_frontal.png", 
                null,
                "https://images.unsplash.com/photo-1595855759920-86582396756a?auto=format&fit=crop&w=400&q=80",
                null
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🍅 Fruver: Tomate Manzano
            </button>
            <button
              type="button"
              onClick={() => simularEscanerIA(
                "chicco_lotion_frontal.png", 
                "chicco_lotion_trasera.png",
                "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80"
              )}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              🧴 Bebé: Loción Chicco
            </button>
          </div>
        </div>

        {msg && (
          <MsgLine msg={msg} />
        )}

        {/* Formulario de Ficha */}
        <form onSubmit={guardar} className="space-y-8">
          {/* --- Información Básica --- */}
          <section>
            <h3 className={seccionCls}>Información Básica</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Código Interno (SKU)</span>
                <input className={inputCls} value={form.codigo_interno} onChange={(e) => set("codigo_interno", e.target.value)} placeholder="P004" required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Código de Barra (lector)</span>
                <input
                  className={inputCls}
                  value={form.codigo_barras}
                  onChange={(e) => set("codigo_barras", e.target.value)}
                  onKeyDown={onScanCodigoBarras}
                  placeholder="Escanear o digitar..."
                />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Nombre</span>
                <input ref={nombreRef} className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Marca</span>
                <input className={inputCls} value={form.marca} onChange={(e) => set("marca", e.target.value)} placeholder="Ej: Vatel, Primor, Polar..." />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Línea de Negocio (Crítica)</span>
                <input className={inputCls} value={form.linea} onChange={(e) => set("linea", e.target.value)} placeholder="Ej: Víveres, Carnicería, Charcutería..." />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Tipo / Categoría</span>
                <input className={inputCls} value={form.clase_o_tipo} onChange={(e) => set("clase_o_tipo", e.target.value)} placeholder="Ej: Charcutería, Granos, Lácteos..." />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className={labelCls}>Descripción detallada</span>
                <textarea className={inputCls} rows={3} value={form.caracteristicas} onChange={(e) => set("caracteristicas", e.target.value)} placeholder="Componentes, presentación visual, notas relevantes..." />
              </label>
            </div>
          </section>

          {/* --- Logística y Proveedor --- */}
          <section>
            <h3 className={seccionCls}>Logística y Proveedor</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Proveedor</span>
                <select className={inputCls} value={form.proveedor} onChange={(e) => set("proveedor", e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {PROVEEDORES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Presentación</span>
                <select className={inputCls} value={form.tipo_envase} onChange={(e) => set("tipo_envase", e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {PRESENTACIONES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>
                  {["Cuidado Personal", "Bebidas", "Limpieza"].includes(form.linea) ? "Volumen / Contenido (ml)" : "Peso exacto (kg)"}
                </span>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step={["Cuidado Personal", "Bebidas", "Limpieza"].includes(form.linea) ? "1" : "0.001"}
                    min="0"
                    className={`${inputCls} pr-12 mt-0`}
                    value={form.peso}
                    onChange={(e) => set("peso", e.target.value)}
                    placeholder={["Cuidado Personal", "Bebidas", "Limpieza"].includes(form.linea) ? "200" : "0.000"}
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-bold font-mono">
                    {["Cuidado Personal", "Bebidas", "Limpieza"].includes(form.linea) ? "ml" : "kg"}
                  </span>
                </div>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Ubicación física (Pasillo / Estante)</span>
                <input className={inputCls} value={form.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} placeholder="Ej: Pasillo 2, Estante B" />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Stock Mínimo Alerta</span>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step={form.tipo_venta === "peso" ? "0.001" : "1"}
                    min="0"
                    className={`${inputCls} pr-12 mt-0`}
                    value={form.stock_minimo}
                    onChange={(e) => set("stock_minimo", e.target.value)}
                    placeholder={form.tipo_venta === "peso" ? "0.000" : "0"}
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-bold font-mono">
                    {form.tipo_venta === "peso" ? "kg" : "und"}
                  </span>
                </div>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Tipo de Venta</span>
                <div className="mt-1 inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => set("tipo_venta", "unidad")}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-300 ${form.tipo_venta === "unidad" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    Por Unidad
                  </button>
                  <button
                    type="button"
                    onClick={() => set("tipo_venta", "peso")}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-300 ${form.tipo_venta === "peso" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    Por Peso / Granel
                  </button>
                </div>
              </label>
              {form.tipo_venta === "peso" && (
                <label className="flex flex-col">
                  <span className={labelCls}>% Merma Estimado / Factor de Desposte</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className={inputCls}
                    value={form.factor_merma}
                    onChange={(e) => set("factor_merma", e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              )}
              <div className="flex gap-6 items-center mt-4 col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.refrigerado} onChange={(e) => set("refrigerado", e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">¿Requiere Refrigeración?</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.perecedero} onChange={(e) => set("perecedero", e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">¿Es Perecedero?</span>
                </label>
              </div>
            </div>
          </section>

          {/* --- Fechas Críticas --- */}
          <section>
            <h3 className={seccionCls}>Fechas Críticas</h3>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Elaboración</span>
                <input type="date" className={inputCls} value={form.fecha_elaboracion} onChange={(e) => set("fecha_elaboracion", e.target.value)} />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Ingreso al almacén</span>
                <input type="date" className={inputCls} value={form.fecha_ingreso_stock} onChange={(e) => set("fecha_ingreso_stock", e.target.value)} />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Vencimiento (FV)</span>
                <input type="date" className={inputCls} value={form.fecha_vencimiento} onChange={(e) => set("fecha_vencimiento", e.target.value)} />
              </label>
            </div>
          </section>

          {/* --- Costos y Estructura Financiera --- */}
          <section>
            <h3 className={seccionCls}>Costos y Finanzas</h3>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Costo USD</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.costo_usd} onChange={(e) => set("costo_usd", e.target.value)} placeholder="0.00" />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Precio 1 (Detalle)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.precio_1_detalle} onChange={(e) => set("precio_1_detalle", e.target.value)} placeholder="0.00" />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Precio 2 (Mayorista)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.precio_2_mayorista} onChange={(e) => set("precio_2_mayorista", e.target.value)} placeholder="0.00" />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Precio 3 (Especial / VIP)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.precio_3_especial} onChange={(e) => set("precio_3_especial", e.target.value)} placeholder="0.00" />
              </label>
              <label className="flex flex-col col-span-2">
                <span className={labelCls}>URL Foto del producto</span>
                <input type="url" className={inputCls} value={form.foto_url} onChange={(e) => set("foto_url", e.target.value)} placeholder="https://..." />
              </label>
              <div className="flex items-center mt-6 col-span-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.aplica_iva} onChange={(e) => set("aplica_iva", e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Aplica cobro de IVA (16%)</span>
                </label>
              </div>
            </div>
          </section>

          <button type="submit" className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-blue-700 hover:shadow-md">
            Guardar Ficha en Inventario
          </button>
        </form>
      </div>
    </div>
  );
}
