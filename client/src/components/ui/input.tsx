import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-mia-orange/20 bg-white px-3 py-2 text-sm text-mia-brown placeholder:text-mia-brown-light/60",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-mia-brown",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mia-orange focus-visible:ring-offset-2 focus-visible:border-mia-orange",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
