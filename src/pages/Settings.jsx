import { useState } from 'react'
import { KeyRound, Save } from 'lucide-react'
import { useToast } from '../context/useToast'
import { getSupabaseError, supabase } from '../lib/supabase'

export default function Settings() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changePassword = async (event) => {
    event.preventDefault()
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return }
    if (password !== confirm) { setError('The passwords do not match.'); return }
    setSaving(true); setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) { setError(getSupabaseError(updateError)); toast(getSupabaseError(updateError), 'error'); return }
    setPassword(''); setConfirm(''); toast('Password updated successfully.')
  }
  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">ACCOUNT <span>/</span> SETTINGS</div><h1>Settings</h1><p>Security and account preferences for your FlightCare access.</p></div></div>
    <section className="panel settings-card"><div className="profile-intro"><div className="profile-avatar"><KeyRound size={23} /></div><div><h2>Password & security</h2><p>Choose a strong password that you don’t use elsewhere.</p></div></div>
      <form className="profile-form narrow-form" onSubmit={changePassword} noValidate><label className="form-field"><span>New password *</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="8" /></label><label className="form-field"><span>Confirm new password *</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button-primary" disabled={saving}><Save size={16} /> {saving ? 'Updating…' : 'Update password'}</button>
      </form>
    </section>
  </div>
}
