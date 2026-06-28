const REDES = ['instagram', 'linkedin', 'x']

export default function Footer() {
  return (
    <footer id="footer" className="relative max-w-7xl mx-auto px-8 md:px-16 lg:px-20 py-16 border-t border-black/[0.05]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <p className="font-display text-lg text-[#1a1a1a]">3Q Solutions</p>
          <p className="mt-1 text-sm text-[#8e8e8e]">© 2026 3Q Solutions. Todos los derechos reservados.</p>
        </div>

        <div className="flex gap-6 text-sm text-[#8e8e8e]">
          <a href="#features" className="hover:text-[#1a1a1a]">producto</a>
          <a href="#agentes" className="hover:text-[#1a1a1a]">agentes ia</a>
          <a href="#planes" className="hover:text-[#1a1a1a]">planes</a>
        </div>

        <div className="flex gap-4">
          {REDES.map((red) => (
            <a key={red} href="#" aria-label={red} className="text-sm text-[#8e8e8e] hover:text-[#1a1a1a]">
              {red}
            </a>
          ))}
        </div>
      </div>

      <p className="mt-8 text-xs text-[#8e8e8e]/70">
        Teléfono, correo y redes sociales se publican aquí en una próxima iteración.
      </p>
    </footer>
  )
}
