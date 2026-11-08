import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { AppProviders } from './app/AppProviders.tsx'
import { routes } from './app/routes.tsx'
import { blurWhenKeyboardCloses } from './editor/softKeyboard.ts'
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root element')

const router = createBrowserRouter(routes)
blurWhenKeyboardCloses()

createRoot(root).render(
  <StrictMode>
    <AppProviders currentPath={() => router.state.location.pathname}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
