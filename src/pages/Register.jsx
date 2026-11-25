import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Plane } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { getSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase'

export default function Register() {
  const { user, role, profileLoading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (user && role) navigate(role === 'passenger' ? '/portal' : '/dashboard', { replace: true })
  }, [user, role, navigate])

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) { setError('Supabase is not configured. Add the project URL and publishable key to .env.'); return }
    if (!name.trim()) { setError('Enter your full name.'); return }
    const normalizedEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return }
    if (password.length < 8) { setError('Your password must be at least 8 characters.'); return }
    setBusy(true)
    setError('')
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { full_name: name.trim() } },
      })
      if (authError) { setError(getSupabaseError(authError)); return }
      toast(data.session ? 'Account created successfully.' : 'Account created. Check your email to confirm the account, then sign in.')
      navigate(data.session ? '/' : '/login', { replace: true })
    } catch (authError) {
      setError(getSupabaseError(authError))
    } finally {
      setBusy(false)
    }
  }
  if (user && profileLoading) return <Loading label="Loading your FlightCare profile…" />
  return <main className="auth-page auth-page-register"><div className="auth-visual"><div className="auth-brand"><div className="brand-icon"><Plane size={20} fill="currentColor" /></div><strong>FlightCare</strong></div><div className="auth-visual-copy"><span>YOUR TRAVEL, IN ONE PLACE</span><h1>Support that<br />travels with you.</h1><p>Create a passenger account to see eligible updates and contact the assistance team.</p></div><div className="auth-visual-footer">Passenger accounts are assigned the passenger role automatically.</div></div>
    <section className="auth-form-side"><div className="auth-card"><Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link><span className="eyebrow">PASSENGER PORTAL</span><h2>Create your account</h2><p className="auth-subtitle">Set up your FlightCare passenger profile.</p>
      {!isSupabaseConfigured && <div className="config-warning"><strong>Supabase is not configured.</strong><span>Add project values to your local <code>.env</code> file before creating an account.</span></div>}
      <form className="auth-form" onSubmit={submit} noValidate><label className="form-field"><span>Full name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required /></label><label className="form-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label className="form-field"><span>Password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength="8" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={!isSupabaseConfigured || busy}>{busy ? 'Creating account…' : 'Create passenger account'} <ArrowRight size={17} /></button>
      </form><p className="role-notice">New registrations receive the passenger role. Staff roles can only be assigned by an administrator.</p>
    </div></section>
  </main>
}
