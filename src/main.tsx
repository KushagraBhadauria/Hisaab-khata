import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { prefetchExports, reloadForUpdate } from './lib/lazy'

// A lazy file from an older deploy is missing → reload once to the latest version.
window.addEventListener('vite:preloadError', e => {
  if (reloadForUpdate()) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Load PDF/Excel code in the background so downloads keep working even after a new deploy.
prefetchExports()
