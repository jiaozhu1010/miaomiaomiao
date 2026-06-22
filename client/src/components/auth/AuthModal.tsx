import { useState, useCallback, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { X } from 'lucide-react'
import { FlipCard } from '@/components/auth/FlipCard'
import WelcomeFace from '@/components/auth/WelcomeFace'
import LoginForm from '@/components/auth/LoginForm'
import RegisterForm from '@/components/auth/RegisterForm'
import SuccessFace from '@/components/auth/SuccessFace'

type View = 'welcome' | 'form' | 'success'
type Mode = 'login' | 'register'

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
    setMode('login')
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

    const back = (
      <FlipCard
        isFlipped={mode === 'register'}
        duration={0.58}
        front={<LoginForm onSuccess={handleSuccess} onSwitchToRegister={handleSwitchToRegister} />}
        back={<RegisterForm onSuccess={handleSuccess} onSwitchToLogin={handleSwitchToLogin} />}
      />
    )

    return <FlipCard isFlipped={isFlipped} front={front} back={back} />
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 grid h-dvh place-items-center overflow-y-auto bg-[#0b1121]/55 p-4 backdrop-blur-lg"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={handleBackdropClick}
        >
          <motion.div
            className="auth-shell relative"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            {view !== 'success' && (
              <button
                type="button"
                onClick={onClose}
                className="absolute -top-11 right-0 z-10 flex size-9 items-center justify-center rounded-xl bg-white/95 text-[#8b919a] shadow-sm border border-[#e9edf2] backdrop-blur-sm transition-all duration-200 hover:bg-white hover:text-[#111111] hover:shadow-md"
                aria-label="关闭弹窗"
              >
                <X className="size-4 stroke-[1.5]" />
              </button>
            )}

            {renderFlipCardContent()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
