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
  // Uses capture phase (true) so React fires BEFORE the old miaosite-auth.js handler,
  // then stopImmediatePropagation prevents the old handler from firing.
  useEffect(() => {
    function handleUserBtnClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const btn = target.closest('#btn-user')
      if (!btn) return
      if (isLoggedIn) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      openModal()
    }

    document.addEventListener('click', handleUserBtnClick, true)
    return () => {
      document.removeEventListener('click', handleUserBtnClick, true)
    }
  }, [isLoggedIn, openModal])

  return <AuthModal isOpen={isModalOpen} onClose={closeModal} />
}
