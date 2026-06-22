import { useState, useEffect, useCallback } from 'react'
import AuthModal from '@/components/auth/AuthModal'

declare global {
  interface Window {
    __miaositeOpenAuth?: () => void
  }
}

export default function App() {
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
  // Uses capture phase (true) so React fires BEFORE the old miaosite-auth.js handler.
  // Don't stopPropagation — the old handler checks window.__miaositeOpenAuth and gracefully returns.
  // IMPORTANT: Read localStorage directly instead of using React's isLoggedIn state.
  // Vanilla JS (lib/miaosite-auth.js) can clear the session outside React's awareness,
  // which would leave React's cached isLoggedIn stale. Checking localStorage directly
  // ensures the handler always sees the authoritative login state.
  useEffect(() => {
    function handleUserBtnClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const btn = target.closest('#btn-user')
      if (!btn) return
      if (localStorage.getItem('miaosite_token')) return
      e.preventDefault()
      openModal()
    }

    document.addEventListener('click', handleUserBtnClick, true)
    return () => {
      document.removeEventListener('click', handleUserBtnClick, true)
    }
  }, [openModal])

  return <AuthModal isOpen={isModalOpen} onClose={closeModal} />
}
