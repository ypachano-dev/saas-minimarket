# Landing page de 3Q Solutions — Diseño

## Contexto

3Q Solutions es la empresa que vende el producto SaaS de este repo (internamente
llamado **3Q Nexus ERP**: CRM + ERP + agentes de IA para minimarkets/negocios).
Hoy existen dos artefactos relacionados que NO se tocan en este trabajo:

- `frontend/` — la app real del SaaS (React 19 + Vite + TS + Tailwind, sin `motion`).
- `presentacion/` — un one-pager estático viejo (Tailwind CDN) usado como deck de venta.

Este spec cubre un **sitio de marketing nuevo e independiente** para 3Q Solutions,
inspirado en la estructura del prompt de motionsites.ai (`Prompt pagina Web.txt`):
hero con elemento visual a pantalla ancha, navbar glassmorphic, tipografía
Inter/Outfit, animaciones con `motion/react`.

**No se despliega en este trabajo.** No hay hosting, dominio, redes sociales,
teléfonos ni correos reales todavía — todo el contenido de contacto va con
placeholders claramente marcados para reemplazar después.

## Alcance

Un solo proyecto Vite nuevo, una sola página (landing), sin backend propio,
sin formularios funcionales (los CTA son botones/links placeholder, no envían
datos a ningún lado todavía).

## Ubicación y stack

- Carpeta nueva: `web-3qsolutions/` en la raíz del repo (junto a `frontend/`,
  `presentacion/`, `app/`). Proyecto Vite independiente, build y deploy propios
  en el futuro; no comparte código con `frontend/`.
- Stack: Vite + React + TypeScript + Tailwind CSS + `motion` (paquete `motion/react`).
- Fuentes Google Fonts: **Inter** (`--font-sans`) y **Outfit** (`--font-display`).
- Paleta (igual que el prompt original, ya validada):
  - `--color-brand-green: #9fff00`
  - `--color-bg-base: #EDEEF5`
  - Texto principal `#1a1a1a`, texto secundario `#8e8e8e`.
- `body` con `@apply bg-bg-base text-zinc-900 font-sans antialiased;`.

## Assets visuales generados (no se hotlinkea nada de terceros)

El prompt original usa un `<video>` con una URL de CloudFront de otra marca
(mÄntality, de motionsites.ai). No se puede reutilizar: es un asset ajeno, sin
licencia, y no representa a 3Q Solutions. Tampoco hay herramienta de generación
de video real en este entorno de trabajo.

Se generan en su lugar **imágenes propias** (vía skill de generación de imágenes)
con el concepto elegido por el usuario:

1. **Hero**: robot con cerebro de circuitos, estética IA/tech, en la paleta de
   marca. Se anima en el navegador con `motion/react` (glow pulsante en las
   líneas de circuito, parallax sutil al hacer scroll) para simular movimiento
   sin necesitar un archivo de video.
2. **Agentes IA**: 3 mascotas robot de **forma femenina con corona estilo "queen"**,
   una por agente (VALE, YHORGE, ALO), cada una con paleta/detalle distinto según
   su rol. Se reutilizan en miniatura dentro de la tabla de planes.

Todas las imágenes generadas se guardan como assets estáticos dentro de
`web-3qsolutions/src/assets/`.

## Estructura de componentes

```
web-3qsolutions/
  src/
    index.css          # fonts, variables de color, @apply body
    App.tsx            # ensambla todas las secciones
    components/
      Navbar.tsx
      Hero.tsx
      Features.tsx
      AgentesIA.tsx     # las 3 "queens" robot
      Planes.tsx        # tabla Básico / Pro / Max
      CtaFinal.tsx
      Footer.tsx
    assets/
      hero-robot-circuitos.png   (o .webp)
      agente-vale-queen.png
      agente-yhorge-queen.png
      agente-alo-queen.png
```

### Navbar

- Fijo arriba (`fixed top-0 left-0 w-full z-50`), fondo glassmorphic
  (`backdrop-blur` + gradiente de claro a transparente).
- Grid de 12 columnas: logo "3Q Solutions" (ícono geométrico simple + wordmark
  en Outfit) a la izquierda; links centrados solo en desktop ("producto",
  "agentes IA", "planes", "nosotros"); a la derecha botón CTA "Empezar ahora" +
  toggle hamburguesa animado para mobile.
- Drawer mobile con `AnimatePresence` + `motion.div` que se desliza hacia abajo
  mostrando los mismos links.

### Hero

- `<section>` con fondo `#EDEEF5`, imagen del robot+circuitos ocupando la zona
  superior (similar proporción al prompt: ~95–120vh en un wrapper absoluto),
  animada con `motion` (no es un `<video>`, es una imagen con animación CSS/JS
  de glow + parallax).
- Degradado (`bg-gradient-to-b from-bg-base to-transparent`) debajo de la
  imagen para fundirla con el fondo.
- Contenido centrado en grid de 12 columnas (`col-span-12 md:col-span-10
  md:col-start-2`):
  - Titular bicolor (`motion.h1`, slide-up fade): negro `#1a1a1a` para la frase
    principal, gris `#8e8e8e` para el resto — copy de ejemplo: *"3Q Nexus
    convierte tus datos en decisiones — con agentes de IA que trabajan por ti."*
    (copy final se ajusta en implementación, no es contractual).
  - Píldora de CTA dual con delay de animación: look de input ("Pide una
    demo...") + botón circular negro con flecha, sin backend real detrás.
  - Esquinas: switch de idioma es↔en (píldora glassmórfica) a la derecha;
    "2026" abajo-izquierda; "ERP · CRM · IA" abajo-derecha.

### Features (módulos del producto)

Grid de 3–4 columnas con tarjetas para los módulos reales: Caja/POS,
Inventario/Almacén, Desposte/Balanza, Cartera y Créditos, Bancos y Tesorería,
Delivery con mapa en vivo, Estadísticas Avanzadas. Iconografía simple (Lucide
o SVG inline). Animación de entrada escalonada con `motion` usando
`whileInView` (stagger por tarjeta).

### Agentes IA ("las queens")

Tres tarjetas grandes, una por agente, usando las imágenes generadas:

| Agente | Rol | Bullets |
|---|---|---|
| VALE | Analista de datos | Ventas, mermas, stock — hallazgos y recomendaciones |
| YHORGE | Cobranza y tesorería | CxC, CxP, bancos — prioriza cobros urgentes |
| ALO | Ventas y CRM | Visión 360° del cliente — historial, cartera, pedidos |

Cada tarjeta: imagen de la mascota + nombre + rol + 2–3 bullets. Esta sección
es la referencia visual que se reutiliza (en miniatura) en la tabla de planes.

### Planes (Básico / Pro / Max)

Tabla de 3 tarjetas, la de **Pro** destacada/elevada visualmente:

| | Básico | Pro | Max |
|---|---|---|---|
| Precio (ejemplo) | $29/mes | $79/mes | $149/mes |
| Agentes IA | Ninguno | 1 agente a elegir (mini-mascota del elegido) | Las 3 queens (VALE + YHORGE + ALO) |
| Módulos core | Caja, Inventario, Cartera básica | Todo lo de Básico | Todo + Delivery + Estadísticas avanzadas |
| CTA | "Empezar" | "Empezar" (destacado) | "Hablar con ventas" |

Los precios son placeholders de ejemplo, reemplazables sin tocar estructura.

### CTA final + Footer

- CTA ancho completo (fondo oscuro o acento verde lima) invitando a pedir demo.
- Footer: logo, links placeholder (`href="#"`), iconos de redes sin URL real,
  copyright "© 2026 3Q Solutions", y nota visual de que los datos de contacto
  (teléfono, correo, redes) se completan en una iteración futura cuando estén
  definidos.

## Fuera de alcance (explícito)

- Despliegue/hosting, dominio propio, redes sociales reales, teléfonos/correos
  reales.
- Formularios funcionales de demo/contacto (placeholders visuales únicamente).
- Generación de video real (no disponible en este entorno); se usa imagen
  animada con `motion` como sustituto.
- Cualquier cambio a `frontend/` o `presentacion/`.

## Testing / verificación

- `npm run dev` en `web-3qsolutions/` y revisión visual manual de cada sección
  en desktop y mobile (breakpoints `sm`/`md`).
- Verificar que el drawer mobile de la navbar abre/cierra correctamente.
- Verificar que las animaciones `whileInView` disparan al hacer scroll.
- `npm run build` para confirmar que TypeScript compila sin errores antes de
  considerar el trabajo terminado.
