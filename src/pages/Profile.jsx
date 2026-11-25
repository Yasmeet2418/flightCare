import { useState } from 'react'
import { Save, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { getSupabaseError, roleLabels, supabase } from '../lib/supabase'

export default function Profile() {
  const { profile, user, role, refreshProfile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    if (!name.trim()) { setError('Please enter your full name.'); return }
    setSaving(true); setError('')
    const { error: updateError } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', user.id)
    setSaving(false)
    if (updateError) { setError(getSupabaseError(updateError)); toast(getSupabaseError(updateError), 'error'); return }
    await refreshProfile()
    toast('Profile updated.')
  }
  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">ACCOUNT <span>/</span> PROFILE</div><h1>My profile</h1><p>Manage your personal information and review your access level.</p></div></div>
    <div className="profile-layout"><section className="panel profile-form-panel"><div className="profile-intro"><div className="profile-avatar"><UserRound size={25} /></div><div><h2>Personal details</h2><p>Changes are saved to your FlightCare profile.</p></div></div>
      <form className="profile-form" onSubmit={save} noValidate><label className="form-field"><span>Full name *</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="form-field"><span>Email address</span><input type="email" value={profile?.email || user?.email || ''} disabled /><small>Contact support if you need to change your email.</small></label><label className="form-field"><span>Phone number</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button-primary" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </section><section className="panel access-panel"><div className="access-icon"><ShieldCheck size={22} /></div><span className="eyebrow">ACCESS LEVEL</span><h2>{roleLabels[role] || 'Account'}</h2><p>Your permissions are managed securely by FlightCare administrators.</p><div className="security-note"><ShieldCheck size={17} /><span>Your role cannot be changed through profile settings.</span></div></section></div>
  </div>
}
