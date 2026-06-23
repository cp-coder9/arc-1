import { cn } from "@/lib/utils"
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react"
import { Slot } from "@radix-ui/react-slot"

/* ------------------------------------------------------------------ */
/*  GlassCard                                                          */
/* ------------------------------------------------------------------ */
export const GlassCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl p-6 glass-card", className)} {...props} />
  )
)
GlassCard.displayName = "GlassCard"

export const GlassCardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 mb-4", className)} {...props} />
  )
)
GlassCardHeader.displayName = "GlassCardHeader"

export const GlassCardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
  )
)
GlassCardContent.displayName = "GlassCardContent"

/* ------------------------------------------------------------------ */
/*  GlassTile                                                          */
/* ------------------------------------------------------------------ */
export const GlassTile = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl p-4 cursor-pointer glass-tile", className)} {...props} />
  )
)
GlassTile.displayName = "GlassTile"

/* ------------------------------------------------------------------ */
/*  GlassPanel                                                         */
/* ------------------------------------------------------------------ */
export const GlassPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-2xl p-8 glass-panel", className)} {...props} />
  )
)
GlassPanel.displayName = "GlassPanel"

/* ------------------------------------------------------------------ */
/*  GlassSection                                                       */
/* ------------------------------------------------------------------ */
export const GlassSection = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl p-4 glass-section", className)} {...props} />
  )
)
GlassSection.displayName = "GlassSection"

/* ------------------------------------------------------------------ */
/*  GlassButton                                                        */
/* ------------------------------------------------------------------ */
interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "solid"
  asChild?: boolean
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        className={cn(
          "glass-button h-9 px-4 text-sm font-medium",
          variant === "solid" && "glass-button-solid",
          className
        )}
        {...props}
      />
    )
  }
)
GlassButton.displayName = "GlassButton"

/* ------------------------------------------------------------------ */
/*  GlassPill                                                          */
/* ------------------------------------------------------------------ */
interface GlassPillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "brand"
}

export const GlassPill = forwardRef<HTMLSpanElement, GlassPillProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "glass-pill",
        variant === "brand" && "bg-primary/20 text-primary border-primary/30",
        className
      )}
      {...props}
    />
  )
)
GlassPill.displayName = "GlassPill"

/* ------------------------------------------------------------------ */
/*  GlassInput                                                         */
/* ------------------------------------------------------------------ */
export const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg px-3 py-2 text-sm glass-input file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
GlassInput.displayName = "GlassInput"

/* ------------------------------------------------------------------ */
/*  GlassMetric                                                        */
/* ------------------------------------------------------------------ */
interface GlassMetricProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  value: string | number
  icon?: ReactNode
}

export const GlassMetric = forwardRef<HTMLDivElement, GlassMetricProps>(
  ({ className, label, value, icon, ...props }, ref) => (
    <div ref={ref} className={cn("glass-metric flex items-center gap-3", className)} {...props}>
      {icon && <span className="text-primary/60">{icon}</span>}
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    </div>
  )
)
GlassMetric.displayName = "GlassMetric"

/* ------------------------------------------------------------------ */
/*  GlassIconBox                                                       */
/* ------------------------------------------------------------------ */
export const GlassIconBox = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn("glass-icon-box", className)} {...props} />
  )
)
GlassIconBox.displayName = "GlassIconBox"

/* ------------------------------------------------------------------ */
/*  GlassDivider                                                       */
/* ------------------------------------------------------------------ */
export const GlassDivider = forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => (
    <hr ref={ref} className={cn("glass-divider my-4", className)} {...props} />
  )
)
GlassDivider.displayName = "GlassDivider"

/* ------------------------------------------------------------------ */
/*  GlassHeader                                                       */
/* ------------------------------------------------------------------ */
export const GlassHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("sticky top-0 z-30 px-6 py-4 glass-header", className)} {...props} />
  )
)
GlassHeader.displayName = "GlassHeader"
