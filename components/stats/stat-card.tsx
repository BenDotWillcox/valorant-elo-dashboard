import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function StatCard({ title, children, className }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card/70 backdrop-blur rounded-xl overflow-hidden shadow-lg border border-border/60",
      className
    )}>
      <div className="px-4 py-2 border-b border-border/60 bg-gradient-to-r from-fuchsia-500/15 via-transparent to-cyan-400/15">
        <h3 className="font-semibold tracking-wide text-foreground/90">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
} 