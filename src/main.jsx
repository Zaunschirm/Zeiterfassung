import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
const root = createRoot(document.getElementById('root'))
root.render(<App />)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/src/service-worker.js').catch(console.error)
  })
}
