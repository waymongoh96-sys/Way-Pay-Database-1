import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx' // This pulls in the big code you just pasted
import './index.css' // (Optional, if you have styles)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
