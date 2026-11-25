
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import { ToastProvider } from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import Navbar from './components/navbar'
import Loading from './components/Loading'
import { entityConfigs } from './pages/entityConfig'

const Dashboard = lazy(() => import('./pages/dashboard'))
const Flights = lazy(() => import('./pages/flights'))
const FlightTracking = lazy(() => import('./pages/FlightTracking'))
const Disruptions = lazy(() => import('./pages/Disruptions'))
const Passengers = lazy(() => import('./pages/Passengers'))
const Assistance = lazy(() => import('./pages/Assistance'))
const Login = lazy(() => import('./pages/login'))
const Register = lazy(() => import('./pages/Register'))
const AlternativeFlights = lazy(() => import('./pages/AlternativeFlights'))
const Staff = lazy(() => import('./pages/Staff'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Analytics = lazy(() => import('./pages/Analytics'))
const PassengerDashboard = lazy(() => import('./pages/PassengerDashboard'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const EntityPage = lazy(() => import('./pages/EntityPage'))

function HomeRedirect() {
  const { role } = useAuth()
  return <Navigate to={role === 'passenger' ? '/portal' : '/dashboard'} replace />
}

function AppShell() {
  const location = useLocation()
  return <div className="app-shell">
    <div className="app-main"><Navbar><Sidebar /></Navbar><main className="main-content" key={location.pathname}><Outlet /></main></div>
  </div>
}

function ApplicationRoutes() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route index element={<HomeRedirect />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="tracking" element={<FlightTracking />} />
        <Route element={<ProtectedRoute allowedRoles={['staff']} />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="disruptions" element={<Disruptions />} />
          <Route path="passengers" element={<Passengers />} />
          <Route path="assistance" element={<Assistance />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['admin', 'operations_manager']} />}>
          <Route path="flights" element={<Flights />} />
          <Route path="alternatives" element={<AlternativeFlights />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="staff" element={<Staff />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['passenger']} />}>
          <Route path="portal" element={<PassengerDashboard />} />
          <Route path="my-bookings" element={<EntityPage config={entityConfigs.bookings} />} />
          <Route path="my-disruptions" element={<EntityPage config={entityConfigs.myDisruptions} />} />
          <Route path="my-alternatives" element={<EntityPage config={entityConfigs.myAlternatives} />} />
          <Route path="my-assistance" element={<EntityPage config={entityConfigs.myAssistance} />} />
          <Route path="my-notifications" element={<EntityPage config={entityConfigs.myNotifications} />} />
        </Route>
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Route>
  </Routes>
}

export default function App() {
  return <AuthProvider><ToastProvider><BrowserRouter><Suspense fallback={<Loading />}><ApplicationRoutes /></Suspense></BrowserRouter></ToastProvider></AuthProvider>
}
