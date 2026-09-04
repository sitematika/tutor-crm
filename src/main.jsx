import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Тема: сохранённый выбор ставит data-theme, иначе работает системная
const savedTheme = (() => { try { return localStorage.getItem('tutor-crm-theme') } catch { return null } })()
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.dataset.theme = savedTheme
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
