import { cn } from "@/lib/utils"
import Link from "next/link";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("text-2xl font-bold tracking-tighter", className)}>
      <span className="text-foreground">VALO</span>
      <span className="text-green-500 font-display">MAPPED</span>
    </Link>
  )
}
