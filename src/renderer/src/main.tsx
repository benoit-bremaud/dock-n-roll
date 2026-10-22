import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './App'
import './styles/tokens.css'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Missing #root element in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <Root api={globalThis.dockNRoll} />
  </StrictMode>
)
