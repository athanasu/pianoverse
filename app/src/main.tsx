import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useLang } from './i18n/lang'
import { applyTheme } from './styles/theme'
import './styles/app.css'

applyTheme()
document.documentElement.lang = useLang.getState().lang

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
