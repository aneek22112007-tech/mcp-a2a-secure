import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'

// Route-level code splitting — each route is a separate chunk
// Landing page gets ZERO dashboard/3D code; dashboard gets ZERO landing animation code
const McpA2aPage = lazy(() => import('./pages/McpA2aPage'))
const SignIn = lazy(() =>
  import('./components/auth/SignIn').then(m => ({ default: m.SignIn }))
)
const SignUp = lazy(() =>
  import('./components/auth/SignUp').then(m => ({ default: m.SignUp }))
)
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then(m => ({ default: m.Dashboard }))
)

// Lightweight fallback — no layout shift, no spinner flash
function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#030604',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label="Loading"
    />
  )
}

import { GoogleOAuthProvider } from '@react-oauth/google'

const GOOGLE_CLIENT_ID = '1092162384024-e054dc9roeg3vfk513gffc5nbnuh3376.apps.googleusercontent.com';

function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<McpA2aPage />} />
          <Route
            path="/signin"
            element={
              <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                <SignIn />
              </GoogleOAuthProvider>
            }
          />
          <Route
            path="/signup"
            element={
              <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                <SignUp />
              </GoogleOAuthProvider>
            }
          />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App
