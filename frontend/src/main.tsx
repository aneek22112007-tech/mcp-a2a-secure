import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'

// TODO: Replace YOUR_GOOGLE_CLIENT_ID with the value from Google Cloud Console.
const GOOGLE_CLIENT_ID = '1092162384024-e054dc9roeg3vfk513gffc5nbnuh3376.apps.googleusercontent.com';

// Cleanup legacy localStorage token to prevent confusion
localStorage.removeItem('auth_token');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
