import * as React from "react"
import { cn } from "@/lib/utils"

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
 orientation?: 'horizontal' | 'vertical';
 children?: React.ReactNode;
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
 ({ className, children, orientation = 'vertical', ...props }, ref) => {
 return (
 <div
 ref={ref}
 data-slot="scroll-area"
 className={cn(
 "relative overflow-auto",
 orientation === 'horizontal' ? 'overflow-x-auto' : 'overflow-y-auto',
 className
 )}
 {...props}
 >
 {children}
 </div>
 )
 }
);
ScrollArea.displayName = "ScrollArea";

interface ScrollBarProps extends React.HTMLAttributes<HTMLDivElement> {
 orientation?: 'horizontal' | 'vertical';
}

const ScrollBar = React.forwardRef<HTMLDivElement, ScrollBarProps>(
 ({ className, orientation = 'vertical', ...props }, ref) => {
 return (
 <div
 ref={ref}
 data-slot="scroll-bar"
 className={cn(
 "flex",
 orientation === 'horizontal' ? 'h-2.5 w-full flex-col overflow-visible' : 'w-2.5 h-full flex-row',
 className
 )}
 {...props}
 >
 <div className="flex-1 rounded-full bg-border opacity-50 hover:opacity-100 transition-opacity" />
 </div>
 )
 }
);
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar }
