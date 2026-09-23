import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import McpA2aPage from './pages/McpA2aPage'
import { SignIn } from './components/auth/SignIn'
import { SignUp } from './components/auth/SignUp'
import { Dashboard } from './pages/Dashboard'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<McpA2aPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  )
}

export default App
