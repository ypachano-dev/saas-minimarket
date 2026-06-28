import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'

function App() {
  return (
    <div className="min-h-screen bg-bg-base selection:bg-brand-green selection:text-black">
      <Navbar />
      <main>
        <Hero />
        <Features />
      </main>
    </div>
  )
}

export default App
