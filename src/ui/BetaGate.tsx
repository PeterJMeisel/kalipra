import { useState, type ReactNode } from 'react'

const KEY = 'kalipra.beta'
const PASSWORD = 'beta'

/** Enkel spärr under betan. Skyddar inte data – den håller bara obehöriga besökare borta från programmet. */
export function BetaGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  if (open) return <>{children}</>

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (value.trim().toLowerCase() === PASSWORD) {
      try { localStorage.setItem(KEY, '1') } catch { /* lagring kan saknas */ }
      setOpen(true)
    } else {
      setWrong(true)
    }
  }

  return (
    <main className="gate">
      <form className="gatebox" onSubmit={submit}>
        <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Kalipra">
          <rect width="64" height="64" rx="14" fill="#3B2A4A" />
          <g transform="translate(8 8) scale(.75)">
            <circle cx="32" cy="32" r="29" fill="none" stroke="#FFFFFF" strokeWidth="4" />
            <path d="M32 10 A22 22 0 0 1 54 32 L32 32 Z" fill="#FFFFFF" />
            <path d="M54 32 A22 22 0 0 1 20.5 50.8 L32 32 Z" fill="#FFFFFF" opacity=".55" />
            <path d="M20.5 50.8 A22 22 0 0 1 32 10 L32 32 Z" fill="#E8A33D" />
          </g>
        </svg>
        <h1>Kalipra</h1>
        <p className="muted">Kalipra är i betatest. Ange lösenordet för att fortsätta.</p>
        <label className="field">
          <span>Lösenord</span>
          <input id="gate-pw" type="password" autoFocus autoComplete="off" value={value}
            onChange={e => { setValue(e.target.value); setWrong(false) }} aria-invalid={wrong} />
        </label>
        {wrong && <p className="warntext" role="alert">Fel lösenord.</p>}
        <button type="submit" className="primary">Öppna Kalipra</button>
        <a className="gateback" href="../">← Tillbaka till kalipra.se</a>
      </form>
    </main>
  )
}
