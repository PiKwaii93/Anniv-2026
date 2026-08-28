import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'

import { AuthProvider } from './features/auth/AuthContext'
import { GuestsProvider } from './features/guests/GuestsContext'

import './index.css'
import './MobilePolish.css'

createRoot(
  document.getElementById('root')!,
).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GuestsProvider>
          <App />
        </GuestsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
