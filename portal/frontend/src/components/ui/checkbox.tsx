import * as React from "react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-4 shrink-0 rounded-[4px] border border-border/70 bg-background align-middle text-primary accent-primary shadow-xs transition-[border-color,box-shadow,background-color,accent-color] outline-none hover:border-border focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/45",
        className
      )}
      {...props}
    />
  )
})

Checkbox.displayName = "Checkbox"

export { Checkbox }
