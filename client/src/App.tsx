import { useState, useEffect, useCallback } from 'react'
import AuthModal from '@/components/auth/AuthModal'
import { useAuthStore } from '@/lib/auth-store'

declare global {
  interface Window {
    __miaositeOpenAuth?: () => void
  }
}

export default function App() {
  const { isLoggedIn } = useAuthStore()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  // Expose global open function for external (non-React) triggering
  useEffect(() => {
    window.__miaositeOpenAuth = openModal
    return () => {
      delete window.__miaositeOpenAuth
    }
  }, [openModal])

  // Listen for clicks on #btn-user in existing pages
  useEffect(() => {
    function handleUserBtnClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const btn = target.closest('#btn-user')
      if (!btn) return
      if (isLoggedIn) return
      e.preventDefault()
      e.stopPropagation()
      openModal()
    }

    document.addEventListener('click', handleUserBtnClick)
    return () => {
      document.removeEventListener('click', handleUserBtnClick)
    }
  }, [isLoggedIn, openModal])

  return <AuthModal isOpen={isModalOpen} onClose={closeModal} />
}
