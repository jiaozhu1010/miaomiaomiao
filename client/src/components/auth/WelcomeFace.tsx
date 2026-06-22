import { Zap, Shield, Sparkles, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

export interface WelcomeFaceProps {
  /** Called when the user clicks the login/register button */
  onFlip: () => void
}

const FEATURES = [
  { icon: Zap, text: "快递条码生成 — 支持多种快递单号格式，快速生成条码图片" },
  { icon: Shield, text: "OCR 智能识别 — 上传面单照片，自动识别运单号和包裹信息" },
  { icon: Sparkles, text: "AI 智能助手 — 对接 DeepSeek 大模型，解答快递相关问题" },
] as const

export default function WelcomeFace({ onFlip }: WelcomeFaceProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col items-center">
        <div className="mb-6 flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-mia-orange to-mia-orange-dark shadow-lg">
          <LogIn className="size-12 text-white" />
        </div>
        <h1 className="mb-2 text-3xl font-bold text-mia-brown">欢迎使用喵码 🐱</h1>
        <p className="mb-10 text-sm text-mia-brown-light">
          快递条码生成 · OCR 识别 · AI 聊天
        </p>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div className="mb-10 flex w-full max-w-sm flex-col gap-4">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl bg-white/70 p-4 text-left shadow-sm backdrop-blur-sm"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-mia-orange/10">
                  <Icon className="size-5 text-mia-orange" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-mia-brown">
                    {feature.text}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <Button
          size="lg"
          onClick={onFlip}
          className="w-48 text-base font-semibold shadow-md"
        >
          登录 / 注册
        </Button>
      </CardContent>
    </Card>
  )
}
