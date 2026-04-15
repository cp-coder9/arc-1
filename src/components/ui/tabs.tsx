import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
}>({});

function Tabs({
  className,
  value,
  onValueChange,
  defaultValue,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const activeValue = value !== undefined ? value : internalValue;
  const handleValueChange = React.useCallback((val: string) => {
    setInternalValue(val);
    onValueChange?.(val);
  }, [onValueChange]);

  return (
    <TabsContext.Provider value={{ value: activeValue, onValueChange: handleValueChange }}>
      <div
        data-slot="tabs"
        className={cn("group/tabs flex flex-col gap-2", className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground bg-muted",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof tabsListVariants>) {
  return (
    <div
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, value, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: activeValue, onValueChange } = React.useContext(TabsContext);
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-active={isActive}
      onClick={() => onValueChange?.(value)}
      className={cn(
        "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        isActive && "bg-background text-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, value, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: activeValue } = React.useContext(TabsContext);
  if (activeValue !== value) return null;

  return (
    <div
      role="tabpanel"
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
