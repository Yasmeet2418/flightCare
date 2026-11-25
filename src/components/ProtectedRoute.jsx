import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import Loading from './Loading'

export default function ProtectedRoute({ allowedRoles }) {
  const { user, role, loading, profileLoading, profileError } = useAuth()
  const location = useLocation()
  if (loading || (user && profileLoading)) return <Loading label={profileLoading ? 'Loading your FlightCare profile…' : undefined} />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (profileError || !role) {
    return (
      <div className="configuration-state">
        <h2>Profile unavailable</h2>
        <p>{profileError || 'Your account profile has not been provisioned. Contact an administrator.'}</p>
      </div>
    )
  }
  const canAccess = !allowedRoles || allowedRoles.some((allowedRole) => (
    allowedRole === 'staff' ? role !== 'passenger' : allowedRole === role
  ))
  if (!canAccess) return <Navigate to={role === 'passenger' ? '/portal' : '/dashboard'} replace />
  return <Outlet />
}
