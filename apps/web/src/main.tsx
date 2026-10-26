import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { AppProviders } from './app/AppProviders.tsx'
import { routes } from './app/routes.tsx'
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root element')

const router = createBrowserRouter(routes)

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
