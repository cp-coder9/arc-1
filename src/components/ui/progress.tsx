import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({ className, value = 0, max = 100, ...props }: React.ComponentProps<"div"> & { value?: number; max?: number }) {
  const safeMax = max > 0 ? max : 100
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
    </div>
  )
}

export { Progress }
