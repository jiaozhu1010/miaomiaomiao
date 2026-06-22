import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SuccessFaceProps {
  username: string
  onClose: () => void
}

export default function SuccessFace({ username, onClose }: SuccessFaceProps) {
  return (
    <Card className="w-full h-full flex flex-col items-center justify-center text-center">
      <CardHeader>
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 15,
            delay: 0.2,
          }}
          className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center"
        >
          <CheckCircle className="w-10 h-10 text-green-500" />
        </motion.div>
        <h2 className="text-xl font-bold text-stone-800 mt-4">
          欢迎回来喵~ 🎉
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          <span className="font-semibold text-orange-500">{username}</span>{' '}
          主人，登录成功啦
        </p>
      </CardHeader>

      <CardContent className="w-full">
        <p className="text-sm text-stone-400 mb-4">
          你现在可以使用喵码的全部功能了
        </p>
        <Button className="w-full" onClick={onClose}>
          <ArrowRight className="w-4 h-4" />
          继续
        </Button>
      </CardContent>
    </Card>
  )
}
