import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface AccordionProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionItemProps {
  children: React.ReactNode;
  className?: string;
  value: string;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

const AccordionContext = React.createContext<{
  openItem: string | null;
  setOpenItem: (item: string | null) => void;
}>({ openItem: null, setOpenItem: () => {} });

function Accordion({ className, children, ...props }: AccordionProps & React.HTMLAttributes<HTMLDivElement>) {
  const [openItem, setOpenItem] = React.useState<string | null>(null);
  
  return (
    <AccordionContext.Provider value={{ openItem, setOpenItem }}>
      <div className={cn("flex w-full flex-col", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({ className, children, value }: AccordionItemProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-b last:border-b-0", className)} data-value={value}>
      {children}
    </div>
  );
}

function AccordionTrigger({ className, children }: AccordionTriggerProps & React.HTMLAttributes<HTMLButtonElement>) {
  const { openItem, setOpenItem } = React.useContext(AccordionContext);
  const itemValue = React.useContext(AccordionItemContext);
  const isOpen = openItem === itemValue;
  
  return (
    <button
      type="button"
      onClick={() => setOpenItem(isOpen ? null : itemValue)}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline",
        className
      )}
    >
      {children}
      {isOpen ? (
        <ChevronUp className="h-4 w-4 shrink-0 transition-transform duration-200" />
      ) : (
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      )}
    </button>
  );
}

const AccordionItemContext = React.createContext<string>("");

function AccordionContent({ className, children, ...props }: AccordionContentProps & React.HTMLAttributes<HTMLDivElement>) {
  const { openItem } = React.useContext(AccordionContext);
  const itemValue = React.useContext(AccordionItemContext);
  const isOpen = openItem === itemValue;
  
  if (!isOpen) return null;
  
  return (
    <div className={cn("overflow-hidden text-sm", className)} {...props}>
      {children}
    </div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
