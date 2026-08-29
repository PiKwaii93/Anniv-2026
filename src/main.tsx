import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'

import { AuthProvider } from './features/auth/AuthContext'
import { GuestsProvider } from './features/guests/GuestsContext'
import { PartyProvider } from './features/party/PartyContext'

import './index.css'
import './MobilePolish.css'
import './BingoGlobal.css'
import './PartyMotion.css'

createRoot(
  document.getElementById('root')!,
).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PartyProvider>
          <GuestsProvider>
            <App />
          </GuestsProvider>
        </PartyProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
