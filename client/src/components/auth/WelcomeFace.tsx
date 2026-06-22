import { motion } from "framer-motion"
import { Cat, QrCode, Scan, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface WelcomeFaceProps {
  /** Called when the user clicks the login/register button */
  onFlip: () => void
  /** Additional class names for the root element */
  className?: string
}

const FEATURES = [
  {
    icon: QrCode,
    title: "快递条码生成",
    desc: "支持多种快递单号格式，快速生成条码图片",
  },
  {
    icon: Scan,
    title: "OCR 智能识别",
    desc: "上传面单照片，自动识别运单号和包裹信息",
  },
  {
    icon: MessageSquare,
    title: "AI 智能助手",
    desc: "对接 DeepSeek 大模型，解答快递相关问题",
  },
] as const

export function WelcomeFace({ onFlip, className }: WelcomeFaceProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {/* Cat logo */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mb-6 flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-mia-orange to-mia-orange-dark shadow-lg"
      >
        <Cat className="size-12 text-white" />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-2 text-3xl font-bold text-mia-brown"
      >
        喵码
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-10 text-sm text-mia-brown-light"
      >
        快递条码生成 · OCR 识别 · AI 聊天
      </motion.p>

      {/* Feature items */}
      <div className="mb-10 flex w-full max-w-sm flex-col gap-4">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex items-center gap-4 rounded-xl bg-white/70 p-4 text-left shadow-sm backdrop-blur-xs"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-mia-orange/10">
                <Icon className="size-5 text-mia-orange" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-mia-brown">
                  {feature.title}
                </p>
                <p className="text-xs text-mia-brown-light">{feature.desc}</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* CTA button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Button
          size="lg"
          onClick={onFlip}
          className="w-48 text-base font-semibold shadow-md"
        >
          登录 / 注册
        </Button>
      </motion.div>
    </div>
  )
}
