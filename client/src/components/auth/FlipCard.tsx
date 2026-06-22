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
          className="grid place-items-center"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Front face — grid cell auto-sizes to the larger of the two faces */}
          <div
            aria-hidden={isFlipped}
            className={isFlipped ? "pointer-events-none" : "pointer-events-auto"}
            style={{ gridArea: "1/1", backfaceVisibility: "hidden" }}
          >
            {front}
          </div>

          {/* Back face — co-located in the same grid cell, rotated 180deg so it faces the viewer when the parent flips */}
          <div
            aria-hidden={!isFlipped}
            className={isFlipped ? "pointer-events-auto" : "pointer-events-none"}
            style={{ gridArea: "1/1", backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
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
