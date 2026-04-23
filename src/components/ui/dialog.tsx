import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

const DialogContext = React.createContext<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}>({});

function Dialog({ children, open, onOpenChange }: { children: React.ReactNode, open?: boolean, onOpenChange?: (open: boolean) => void }) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      <div data-slot="dialog">{children}</div>
    </DialogContext.Provider>
  );
}

function DialogTrigger({ children, render, onClick, asChild }: { children?: React.ReactNode, render?: React.ReactNode, onClick?: () => void, asChild?: boolean }) {
  const { onOpenChange } = React.useContext(DialogContext);
  const content = render || children;

  const handleClick = (e: React.MouseEvent) => {
    if (React.isValidElement(content)) {
      (content.props as any).onClick?.(e);
    }
    onClick?.();
    onOpenChange?.(true);
  };

  if (React.isValidElement(content)) {
    return React.cloneElement(content as React.ReactElement<any>, {
      onClick: handleClick
    });
  }
  return <div data-slot="dialog-trigger" onClick={handleClick}>{content}</div>;
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  const { open } = React.useContext(DialogContext);
  if (!open) return null;
  return <div data-slot="dialog-portal">{children}</div>;
}

function DialogClose({ children, render, onClick, asChild }: { children?: React.ReactNode, render?: React.ReactNode, onClick?: () => void, asChild?: boolean }) {
  const { onOpenChange } = React.useContext(DialogContext);
  const content = render || children;

  const handleClick = (e: React.MouseEvent) => {
    if (React.isValidElement(content)) {
      (content.props as any).onClick?.(e);
    }
    onClick?.();
    onOpenChange?.(false);
  };

  if (React.isValidElement(content)) {
    return React.cloneElement(content as React.ReactElement<any>, {
      onClick: handleClick
    });
  }
  return <div data-slot="dialog-close" onClick={handleClick}>{content}</div>;
}

function DialogOverlay({ className, onClick }: { className?: string, onClick?: () => void }) {
  const { onOpenChange } = React.useContext(DialogContext);
  const handleClick = () => {
    onClick?.();
    onOpenChange?.(false);
  };
  return (
    <div
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        className
      )}
      onClick={handleClick}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onClose
}: {
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  onClose?: () => void;
}) {
  const { onOpenChange } = React.useContext(DialogContext);
  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  return (
    <DialogPortal>
      <DialogOverlay onClick={handleClose} />
      <div
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-background p-6 shadow-lg border border-border",
          className
        )}
      >
        {children}
        {showCloseButton && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
