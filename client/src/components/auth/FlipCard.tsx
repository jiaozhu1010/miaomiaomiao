import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface FlipCardProps {
  /** Whether the card is currently flipped */
  isFlipped: boolean
  /** Content rendered on the front face */
  front: React.ReactNode
  /** Content rendered on the back face */
  back: React.ReactNode
  /** Additional class names for the outer wrapper */
  className?: string
  /** Flip animation duration in seconds (default: 0.6) */
  duration?: number
}

const FlipCard = React.forwardRef<HTMLDivElement, FlipCardProps>(
  ({ isFlipped, front, back, className, duration = 0.6 }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("perspective-[1200px]", className)}
      >
        <motion.div
          className="relative"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Front face */}
          <div
            style={{ backfaceVisibility: "hidden" }}
          >
            {front}
          </div>

          {/* Back face — rotated 180deg so it faces the viewer when the parent flips */}
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            {back}
          </div>
        </motion.div>
      </div>
    )
  },
)
FlipCard.displayName = "FlipCard"

export { FlipCard }
