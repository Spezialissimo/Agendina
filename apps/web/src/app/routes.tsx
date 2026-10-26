import { Navigate, type RouteObject } from 'react-router'
import { AuthGate } from '../auth/AuthGate.tsx'
import { PlannerPage } from '../planner/PlannerPage.tsx'
import { useToday } from './AppProviders.tsx'

function GoToToday() {
  return <Navigate to={`/day/${useToday()}`} replace />
}

/** Every route is behind the auth gate, which shows setup or sign-in at the requested URL. */
export const routes: RouteObject[] = [
  {
    element: <AuthGate />,
    children: [
      { index: true, element: <GoToToday /> },
      { path: 'day/:day', element: <PlannerPage /> },
      { path: '*', element: <GoToToday /> },
    ],
  },
]
