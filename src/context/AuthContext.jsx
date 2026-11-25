import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const profileRequest = useRef(0)
  const signOutRequest = useRef(null)
  const mounted = useRef(true)

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setProfile(null)
      setProfileError('')
      setProfileLoading(false)
      return
    }
    const requestId = ++profileRequest.current
    setProfileLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (!mounted.current || requestId !== profileRequest.current) return
    if (error) {
      setProfileError(error.message)
      setProfile(null)
      setProfileLoading(false)
      return
    }
    setProfileError('')
    setProfile(data)
    setProfileLoading(false)
  }, [])

  const logout = useCallback(() => {
    if (signOutRequest.current) return signOutRequest.current
    if (!supabase) return Promise.resolve({ error: new Error('Supabase is not configured.'), signedOut: false })

    setSigningOut(true)
    const request = Promise.resolve().then(async () => {
      let signOutError = null
      try {
        const { error } = await supabase.auth.signOut()
        signOutError = error
      } catch (error) {
        signOutError = error
      }

      if (signOutError) {
        try {
          const { error } = await supabase.auth.signOut({ scope: 'local' })
          signOutError = error
        } catch (error) {
          if (mounted.current) setSigningOut(false)
          return { error, signedOut: false }
        }
      }

      profileRequest.current += 1
      if (mounted.current) {
        setSession(null)
        setProfile(null)
        setProfileError('')
        setProfileLoading(false)
      }
      return { error: signOutError, signedOut: true }
    }).finally(() => {
      signOutRequest.current = null
      if (mounted.current) setSigningOut(false)
    })
    signOutRequest.current = request
    return request
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    mounted.current = true
    supabase.auth.getSession().then(async ({ data: { session: currentSession }, error }) => {
      if (!active) return
      if (error) {
        setProfileError(error.message)
        setLoading(false)
        return
      }
      setSession(currentSession)
      if (currentSession?.user) await loadProfile(currentSession.user.id)
      else setProfileLoading(false)
      if (active) setLoading(false)
    }).catch((error) => {
      if (!active) return
      setProfileError(error instanceof Error ? error.message : 'Unable to restore the Supabase session.')
      setProfileLoading(false)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        setProfileLoading(true)
        queueMicrotask(() => loadProfile(nextSession.user.id))
      } else {
        profileRequest.current += 1
        setProfile(null)
        setProfileError('')
        setProfileLoading(false)
      }
    })
    return () => {
      active = false
      mounted.current = false
      profileRequest.current += 1
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(() => loadProfile(session?.user?.id), [loadProfile, session])
  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    profileLoading,
    profileError,
    signingOut,
    logout,
    refreshProfile,
  }), [session, profile, loading, profileLoading, profileError, signingOut, logout, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
