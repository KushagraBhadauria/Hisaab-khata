import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './components/ui'
import AuthPage, { ResetPassword } from './pages/AuthPage'
import Home from './pages/Home'
import BookPage from './pages/BookPage'

const Settings = lazy(() => import('./pages/Settings'))

function Gate() {
  const { user, loading, recovering } = useAuth()
  if (loading) return <div className="spinner" />
  if (recovering) return <ResetPassword />
  if (!user) return <AuthPage />
  return (
    <StoreProvider key={user.id} userId={user.id}>
      <Suspense fallback={<div className="spinner" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book/:id" element={<BookPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </StoreProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
