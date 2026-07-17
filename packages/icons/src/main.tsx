import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { uiIconNames } from './data'
import { SunIcon } from './react'

import './preview.css'

function IconPreview() {
  return (
    <main>
      <h1>Sun World React Icons</h1>
      <div className="icon-grid">
        {uiIconNames.map((name) => (
          <figure key={name}>
            <SunIcon name={name} size="xl" title={name} decorative={false} />
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <IconPreview />
  </StrictMode>
)
