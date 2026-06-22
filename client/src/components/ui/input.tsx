import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-sm text-[#111111] shadow-sm shadow-black/5 transition-shadow",
          "placeholder:text-[#b0b7c0]/70",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#111111]",
          "focus-visible:border-[#111111] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(17,17,17,0.15)]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f5f7fa]",
          "transition-shadow transition-colors duration-200",
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
