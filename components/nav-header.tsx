"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navItems = [
  { name: "Rankings", href: "/rankings" },
  { name: "History", href: "/history" },
  { name: "Predictions", href: "/predictions" },
  { name: "Map Stats", href: "/map-stats" },
  { name: "Pick/Ban", href: "/pick-ban" },
  { name: "Hall of Fame", href: "/hall-of-fame" },
]

export function NavHeader() {
  const pathname = usePathname()

  return (
    <header className="bg-[#111111] border-b border-border p-4">
      <nav className="flex flex-wrap justify-center gap-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "px-3 py-2 text-sm font-medium rounded-full transition-colors",
              pathname === item.href 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.name}
          </Link>
        ))}
      </nav>
    </header>
  )
} 