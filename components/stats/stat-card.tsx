import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function StatCard({ title, children, className }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card rounded-lg overflow-hidden shadow-lg",
      className
    )}>
      <div className="px-4 py-2 bg-muted border-b">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
} 