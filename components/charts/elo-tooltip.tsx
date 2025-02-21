import { cn } from "@/lib/utils";
import { EloDataPoint } from "@/types/elo";

interface TooltipPayload {
  value: number;
  name: string;
  payload: EloDataPoint;
}

interface EloTooltipProps {
  active?: boolean;
  payload?: { payload: EloDataPoint }[];
  coordinate?: { x: number; y: number };
  teamColors: Record<string, string>;
}

export function EloTooltip({ active, payload, coordinate }: EloTooltipProps) {
  if (!active || !payload?.[0]?.payload || !coordinate) return null;

  const data = payload[0].payload;
  const eloDelta = data.rating - (data.prevRating ?? data.rating);
  const isWin = eloDelta > 0;  // Simplified win condition

  return (
    <div 
      className="rounded-lg border border-border bg-background/95 p-4 shadow-md min-w-[280px] fixed transform -translate-x-1/2 -translate-y-full"
      style={{
        left: coordinate.x,
        top: coordinate.y - 8, // Small offset
        zIndex: 50
      }}
    >
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {new Date(data.ratingDate).toLocaleDateString()}
          </span>
          <div className={cn(
            "px-2 py-1 rounded text-sm font-medium",
            isWin ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          )}>
            {isWin ? "Win" : "Loss"}
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-sm font-medium text-muted-foreground">
            {data.mapName}
          </div>
          <div className="font-medium">
            {data.teamName} vs {data.opponentName}
          </div>
          <div className="text-sm">
            Score: {data.score}
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-2 mt-2">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              Previous Elo: {Math.round(data.prevRating)}
            </div>
            <div className={cn(
              "font-bold text-lg",
              isWin ? "text-green-500" : "text-red-500"
            )}>
              {Math.round(data.rating)}
            </div>
          </div>
          <div className={cn(
            "text-sm",
            isWin ? "text-green-500" : "text-red-500"
          )}>
            {eloDelta > 0 ? "+" : ""}{Math.round(eloDelta)}
          </div>
        </div>
      </div>
    </div>
  );
} 