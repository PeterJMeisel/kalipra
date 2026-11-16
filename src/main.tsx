import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BetaGate } from './ui/BetaGate'

// Lösenordsspärren gäller bara webbplatsen, inte artefakten (byggs med --mode single).
const gated = import.meta.env.MODE !== 'single'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {gated ? <BetaGate><App /></BetaGate> : <App />}
  </StrictMode>,
)
