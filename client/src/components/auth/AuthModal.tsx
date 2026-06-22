import { useState, useCallback, type MouseEvent } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { X } from 'lucide-react'
import { FlipCard } from '@/components/auth/FlipCard'
import WelcomeFace from '@/components/auth/WelcomeFace'
import LoginForm from '@/components/auth/LoginForm'
import RegisterForm from '@/components/auth/RegisterForm'
import SuccessFace from '@/components/auth/SuccessFace'

type Mode = 'login' | 'register'
type View = 'welcome' | 'form' | 'success'

export interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 40 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 25, delay: 0.08 },
  },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } },
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [view, setView] = useState<View>('welcome')
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [isFlipped, setIsFlipped] = useState(false)

  const handleFlip = useCallback(() => {
    setView('form')
    setIsFlipped(true)
  }, [])

  const handleSwitchToRegister = useCallback(() => {
    setMode('register')
  }, [])

  const handleSwitchToLogin = useCallback(() => {
    setMode('login')
  }, [])

  const handleSuccess = useCallback((name: string) => {
    setUsername(name)
    setView('success')
  }, [])

  const handleClose = useCallback(() => {
    window.location.reload()
  }, [])

  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const renderFlipCardContent = () => {
    if (view === 'success') {
      return <SuccessFace username={username} onClose={handleClose} />
    }

    const front = <WelcomeFace onFlip={handleFlip} />

    const back =
      mode === 'login' ? (
        <LoginForm onSuccess={handleSuccess} onSwitchToRegister={handleSwitchToRegister} />
      ) : (
        <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={handleSwitchToLogin} />
      )

    return (
      <FlipCard isFlipped={isFlipped} front={front} back={back} />
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={handleBackdropClick}
        >
          <motion.div
            className="relative w-full max-w-md px-4"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Close button — only shown on welcome and form views */}
            {view !== 'success' && (
              <button
                type="button"
                onClick={onClose}
                className="absolute -top-10 right-4 z-10 flex size-8 items-center justify-center rounded-full bg-white/80 text-stone-500 shadow-sm transition hover:bg-white hover:text-stone-800"
                aria-label="关闭弹窗"
              >
                <X className="size-4" />
              </button>
            )}

            {renderFlipCardContent()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
