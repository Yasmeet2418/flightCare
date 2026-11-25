import { useCallback, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { ToastContext } from '../context/ToastContext'

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), [])
  const toast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((items) => [...items, { id, message, type }])
    window.setTimeout(() => dismiss(id), 4500)
  }, [dismiss])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div className={`toast toast-${item.type}`} key={item.id}>
            {item.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{item.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
