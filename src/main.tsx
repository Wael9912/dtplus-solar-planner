import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { startUpdates } from './updates'
import { startPwa } from './pwa'
startUpdates()
startPwa()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
