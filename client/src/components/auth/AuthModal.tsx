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
  hidden: { opacity: 0, scale: 0.94, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.85, delay: 0.04 },
  },
  exit: { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.18 } },
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

    return <FlipCard isFlipped={isFlipped} front={front} back={back} />
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1121]/55 backdrop-blur-lg"
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
            {/* Close button */}
            {view !== 'success' && (
              <button
                type="button"
                onClick={onClose}
                className="absolute -top-11 right-4 z-10 flex size-9 items-center justify-center rounded-xl bg-white/95 text-[#8b919a] shadow-sm border border-[#e9edf2] backdrop-blur-sm transition-all duration-200 hover:bg-white hover:text-[#111111] hover:shadow-md"
                aria-label="关闭弹窗"
              >
                <X className="size-4 stroke-[1.5]" />
              </button>
            )}

            {renderFlipCardContent()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
