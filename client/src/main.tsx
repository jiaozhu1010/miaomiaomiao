import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('auth-root')

if (root) {
  try {
    // Set a visible indicator before React renders
    const indicator = document.createElement('div')
    indicator.id = '__react_status'
    indicator.textContent = 'React initializing...'
    indicator.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:99999;background:#333;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-family:monospace'
    document.body.appendChild(indicator)

    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    )

    // If we get here, render() didn't throw synchronously
    indicator.textContent = 'React rendered, waiting effects...'
    indicator.style.background = '#fa0'

    // Check after effects should have run
    setTimeout(() => {
      if (typeof window.__miaositeOpenAuth === 'function') {
        indicator.textContent = 'React: OK ✓'
        indicator.style.background = '#080'
      } else {
        indicator.textContent = 'React: useEffect FAILED!'
        indicator.style.background = '#c00'
      }
    }, 500)
  } catch (err) {
    const indicator = document.getElementById('__react_status')
    if (indicator) {
      indicator.textContent = 'React: CRASH ' + (err instanceof Error ? err.message : String(err))
      indicator.style.background = '#c00'
    }
    console.error('React init error:', err)
  }
}
