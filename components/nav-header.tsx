"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./ui/theme-toggle"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
// import { useIsMobile } from "@/hooks/use-mobile"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "./ui/button"
import { Menu } from "lucide-react"
import { Logo } from "./logo"

type NavItem = {
  name: string
  href: string
  gradient: string
  isComingSoon?: boolean
}

const navItems: NavItem[] = [
  {
    name: "Rankings",
    href: "/rankings",
    gradient:
      "radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(37,99,235,0.06) 50%, rgba(29,78,216,0) 100%)",
  },
  {
    name: "Predictions",
    href: "/predictions",
    gradient:
      "radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(8,145,178,0.06) 50%, rgba(14,116,144,0) 100%)",
  },
  {
    name: "Map Pools",
    href: "/map-stats",
    gradient:
      "radial-gradient(circle, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)",
  },
  {
    name: "History",
    href: "/history",
    gradient:
      "radial-gradient(circle, rgba(168,85,247,0.12) 0%, rgba(147,51,234,0.06) 50%, rgba(126,34,206,0) 100%)",
  },
  {
    name: "Record Book",
    href: "/record-book",
    gradient:
      "radial-gradient(circle, rgba(236,72,153,0.12) 0%, rgba(219,39,119,0.06) 50%, rgba(190,24,93,0) 100%)",
  },
  {
    name: "Pick/Ban",
    href: "/pick-ban",
    isComingSoon: true,
    gradient:
      "radial-gradient(circle, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)",
  },
  {
    name: "Simulations",
    href: "/simulations",
    isComingSoon: true,
    gradient:
      "radial-gradient(circle, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)",
  },
  {
    name: "Player Ratings",
    href: "/player-ratings",
    isComingSoon: true,
    gradient:
      "radial-gradient(circle, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)",
  },


]

/*const glowVariants = {
  #initial: { opacity: 0, scale: 0.9 },
  hover: {
    opacity: 1,
    scale: 1.15,
    transition: {
      opacity: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
      scale: { duration: 0.35, type: "spring", stiffness: 240, damping: 20 },
    },
  },
}
*/

const itemVariants = {
  initial: { rotateX: 0, opacity: 1 },
  hover: { rotateX: -90, opacity: 0 },
}

const backVariants = {
  initial: { rotateX: 90, opacity: 0 },
  hover: { rotateX: 0, opacity: 1 },
}

const navGlowVariants = {
  initial: { opacity: 0 },
  hover: {
    opacity: 1,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  },
}

const sharedTransition = {
  type: "spring" as const,
  stiffness: 100,
  damping: 20,
  duration: 0.5,
}

function DesktopNav({ pathname }: { pathname: string }) {
  const { theme } = useTheme()
  const isDarkTheme = theme === "dark"

  return (
    <motion.nav
      className="relative hidden w-full lg:block"
      initial="initial"
      whileHover="hover"
    >
      <motion.div
        className="absolute -inset-3 rounded-2xl pointer-events-none"
        variants={navGlowVariants}
        style={{
          background: isDarkTheme
            ? "linear-gradient(90deg, rgba(34,197,94,0.14) 0%, rgba(34,197,94,0.14) 100%)"
            : "linear-gradient(90deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.10) 100%)",
          filter: "blur(10px)",
        }}
      />
      <div className="relative z-10 flex flex-nowrap justify-center gap-1 md:gap-2">
        {navItems.map((item) => (
          <motion.div
            key={item.name}
            className="relative"
            initial="initial"
            whileHover="hover"
            style={{ perspective: 600 }}
          >
            <Link
              href={item.href}
              className={cn(
                "relative z-10 inline-flex items-center gap-2 px-3 py-1.5 text-xs md:px-4 md:py-2 md:text-sm font-medium rounded-full transition-all duration-200 border will-change-transform",
                pathname === item.href
                  ? "bg-transparent text-black dark:text-white border-black dark:border-white"
                  : "text-black/80 dark:text-muted-foreground/90 border-neutral-200 dark:border-border/50 hover:text-black dark:hover:text-foreground hover:border-neutral-300 dark:hover:border-foreground/30 hover:bg-black/5 dark:hover:bg-foreground/5",
                item.isComingSoon && "opacity-60"
              )}
              style={{ transformStyle: "preserve-3d" }}
            >
              <motion.span
                className="block"
                variants={itemVariants}
                transition={sharedTransition}
                style={{ transformOrigin: "center bottom" }}
              >
                {item.name}
                {item.isComingSoon && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest opacity-70">
                    Soon
                  </span>
                )}
              </motion.span>
              <motion.span
                className="block absolute inset-0 flex items-center justify-center"
                variants={backVariants}
                transition={sharedTransition}
                style={{ transformOrigin: "center top", rotateX: 90 }}
              >
                {item.name}
                {item.isComingSoon && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest opacity-70">
                    Soon
                  </span>
                )}
              </motion.span>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.nav>
  )
}

function MobileNav({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="lg:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Open Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right">
          <nav className="grid gap-6 text-lg font-medium mt-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-4 px-2.5 transition-colors hover:text-foreground",
                  pathname === item.href
                    ? "text-foreground"
                    : "text-muted-foreground",
                  item.isComingSoon && "opacity-60"
                )}
                onClick={() => setIsOpen(false)}
              >
                {item.name}
                {item.isComingSoon && (
                  <span className="text-xs uppercase tracking-widest opacity-70">
                    Soon
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function NavHeader() {
  const pathname = usePathname()
  const [isScrolled, setIsScrolled] = useState(false)
  //const isMobile = useIsMobile()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        isScrolled
          ? "bg-white/80 text-black dark:bg-black/80 dark:text-white border-neutral-200/80 dark:border-white/20 backdrop-blur-sm"
          : "bg-transparent text-black dark:text-white border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Logo />
        </div>
        <div className="flex-1 flex justify-center">
          <DesktopNav pathname={pathname} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <ThemeToggle />
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  )
} 