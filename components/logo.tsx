import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("text-2xl font-bold tracking-tighter", className)}>
      <span className="text-foreground">VALO</span>
      <span className="text-green-500 font-display">MAPPED</span>
    </div>
  )
}
