import { useEffect, useState } from 'react'
import { ArrowRight, Plane } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { getSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase'

export default function Login() {
  const { user, role, profileError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (user && role) navigate(role === 'passenger' ? '/portal' : '/dashboard', { replace: true })
  }, [user, role, navigate])
  const signIn = async (event) => {
    event.preventDefault()
    if (!supabase) { setError('Supabase is not configured. Add the project URL and publishable key to .env.'); return }
    const normalizedEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return }
    if (!password) { setError('Enter your password.'); return }
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (authError) { setError(getSupabaseError(authError)); return }
      toast('Signed in successfully.')
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    } catch (authError) {
      setError(getSupabaseError(authError))
    } finally {
      setBusy(false)
    }
  }
  const resetPassword = async () => {
    if (!supabase) { setError('Supabase is not configured. Add the project URL and publishable key to .env.'); return }
    const normalizedEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address first.'); return }
    setBusy(true)
    setError('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/settings` })
      if (resetError) setError(getSupabaseError(resetError))
      else toast('If an account exists for that email, a password reset link has been sent.')
    } catch (resetError) {
      setError(getSupabaseError(resetError))
    } finally {
      setBusy(false)
    }
  }
  return <main className="auth-page"><div className="auth-visual"><div className="auth-brand"><div className="brand-icon"><Plane size={20} fill="currentColor" /></div><strong>FlightCare</strong></div><div className="auth-visual-copy"><span>FLIGHT OPERATIONS · PASSENGER CARE</span><h1>Better journeys,<br />even when plans change.</h1><p>One connected workspace for flight disruption response and passenger assistance.</p><div className="auth-feature"><div><i /> Operations teams</div><div><i /> Passenger support</div></div></div><div className="auth-visual-footer">Designed for calm, coordinated travel assistance.</div></div>
    <section className="auth-form-side"><div className="auth-card"><div className="auth-mobile-brand"><Plane size={20} /> FlightCare</div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to FlightCare</h2><p className="auth-subtitle">Use your registered email to continue to your workspace.</p>
      {!isSupabaseConfigured && <div className="config-warning"><strong>Supabase is not configured.</strong><span>Copy <code>.env.example</code> to <code>.env</code>, then add your project URL and publishable key before signing in.</span></div>}
      <form className="auth-form" onSubmit={signIn} noValidate><label className="form-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@airline.com" required /></label><label className="form-field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}{user && profileError && <p className="form-error" role="alert">You are signed in, but your role could not be loaded: {profileError}</p>}<button className="auth-submit" type="submit" disabled={!isSupabaseConfigured || busy}>{busy ? 'Please wait…' : 'Sign in'} <ArrowRight size={17} /></button>
      </form><button className="forgot-link" type="button" disabled={!isSupabaseConfigured || busy} onClick={resetPassword}>Forgot your password?</button>
      <div className="auth-switch">New to FlightCare? <Link to="/register">Create a passenger account</Link></div><div className="auth-security">Access is secured with Supabase Authentication and role-based database policies.</div>
    </div></section>
  </main>
}