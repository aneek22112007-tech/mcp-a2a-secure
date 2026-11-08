import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
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
const ConsoleApp = lazy(() =>
  import('./console/ConsoleApp').then(m => ({ default: m.ConsoleApp }))
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

function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span style={{ color: '#FE6E44', letterSpacing: '0.2em', fontSize: '0.75rem' }}>404</span>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 5vw, 3rem)', margin: 0 }}>
        Page not found
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
        The page you are looking for does not exist.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/" className="pill-solid">Home</Link>
        <Link to="/console" className="pill-outline">Console</Link>
      </div>
    </main>
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
          <Route path="/dashboard" element={<ConsoleApp />} />
          <Route path="/console" element={<ConsoleApp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App
