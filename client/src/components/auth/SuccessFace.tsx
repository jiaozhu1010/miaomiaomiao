import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

interface SuccessFaceProps {
  username: string
  onClose: () => void
}

export default function SuccessFace({ username, onClose }: SuccessFaceProps) {
  return (
    <div className="glass-card p-10 w-full flex flex-col items-center text-center">
      {/* Check icon */}
      <motion.div
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
        className="inline-flex items-center justify-center size-16 rounded-2xl bg-[#111] mb-6"
      >
        <Check className="size-7 text-white stroke-[2.5]" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <h2 className="text-[22px] font-bold text-[#111] tracking-[-0.03em]">欢迎回来 🎉</h2>
        <p className="text-sm text-[#999] mt-1.5">
          <span className="font-semibold text-[#111]">{username}</span> 主人，登录成功啦
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4 }}
        className="mt-8 w-full"
      >
        <div className="rounded-xl bg-[#f8f9fb] border border-[#eef0f4] p-4 mb-6">
          <p className="text-[13px] text-[#999]">你现在可以使用喵码的全部功能了</p>
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          onClick={onClose}
          className="w-full h-12 bg-[#111] text-white font-semibold rounded-xl text-[15px] tracking-[-0.01em] hover:bg-[#333] transition-colors duration-200"
        >
          开始使用
        </motion.button>
      </motion.div>
    </div>
  )
}
