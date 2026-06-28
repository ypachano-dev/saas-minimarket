import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import AgentesIA from './components/AgentesIA'
import Planes from './components/Planes'
import CtaFinal from './components/CtaFinal'
import Footer from './components/Footer'

function App() {
  return (
    <div className="min-h-screen bg-bg-base selection:bg-brand-green selection:text-black">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <AgentesIA />
        <Planes />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  )
}

export default App
