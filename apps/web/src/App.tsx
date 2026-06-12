import { useState } from 'react'
import { AudioProvider } from './context/AudioContext.js'
import { GenerateForm } from './components/GenerateForm.js'
import { JobList } from './components/JobList.js'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState('demo@audioforge.dev')
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('pro')
  const [loading, setLoading] = useState(false)

  async function login() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan }),
      })
      const body = (await res.json()) as { token: string }
      onToken(body.token)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '120px auto', fontFamily: 'system-ui' }}>
      <h2 style={{ marginBottom: 24 }}>🎵 Audio Forge — Demo Login</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          marginBottom: 16,
          borderRadius: 6,
          border: '1px solid #ccc',
          boxSizing: 'border-box',
        }}
      />
      <label style={{ display: 'block', marginBottom: 8 }}>Plan</label>
      <select
        value={plan}
        onChange={(e) => setPlan(e.target.value as typeof plan)}
        style={{
          width: '100%',
          padding: '8px 12px',
          marginBottom: 24,
          borderRadius: 6,
          border: '1px solid #ccc',
        }}
      >
        <option value='free'>Free (read-only)</option>
        <option value='pro'>Pro (can generate)</option>
        <option value='enterprise'>Enterprise</option>
      </select>
      <button
        onClick={login}
        disabled={loading}
        style={{
          width: '100%',
          padding: '10px',
          background: '#6366f1',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        {loading ? 'Signing in…' : 'Get demo token'}
      </button>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState<string | null>(null)

  if (!token) return <Login onToken={setToken} />

  return (
    <AudioProvider>
      <div
        style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui' }}
      >
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0 }}>🎵 Audio Forge</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
            Portfolio demo · Bull/Redis queue · JWT auth · React patterns
          </p>
        </header>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>Generate Audio</h2>
          <GenerateForm token={token} />
        </section>

        <section>
          <h2 style={{ marginTop: 0 }}>Your Jobs</h2>
          <JobList token={token} />
        </section>

        <footer style={{ marginTop: 48, color: '#9ca3af', fontSize: 12 }}>
          <button
            onClick={() => setToken(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Sign out
          </button>
        </footer>
      </div>
    </AudioProvider>
  )
}
