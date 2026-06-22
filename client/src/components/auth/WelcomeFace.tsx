import { motion } from "framer-motion"

export interface WelcomeFaceProps {
  onFlip: () => void
}

export default function WelcomeFace({ onFlip }: WelcomeFaceProps) {
  return (
    <div className="glass-card p-10 w-full flex flex-col items-center text-center">
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-[#111] mb-6">
          <span className="text-3xl">🐱</span>
        </div>
        <h1 className="text-[26px] font-bold text-[#111] tracking-[-0.03em]">喵码</h1>
        <p className="text-[15px] text-[#888] mt-2 leading-relaxed">
          快递条码生成 · OCR 智能识别 · AI 聊天助手
        </p>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="w-12 h-px bg-[#e5e5e5] my-8"
      />

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="w-full"
      >
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onFlip}
          className="w-full h-12 bg-[#111] text-white font-semibold rounded-xl text-[15px] tracking-[-0.01em] hover:bg-[#333] transition-colors duration-200"
        >
          登录 / 注册
        </motion.button>
        <p className="text-xs text-[#aaa] mt-4">
          登录后解锁全部功能
        </p>
      </motion.div>
    </div>
  )
}
