import Image from "next/image";
import { TEAM_LOGOS } from "@/lib/constants/images";
import { MAP_IMAGES } from "@/lib/constants/images";

interface TeamLogoDotProps {
  cx: number;
  cy: number;
  teamSlug: string;
  totalSelected: number;
  viewType: 'byTeam' | 'byMap';
  mapName: string;
  payload?: any;
  onMouseEnter?: (event: React.MouseEvent, payload: any) => void;
  onMouseLeave?: () => void;
}

export function TeamLogoDot({ 
  cx, 
  cy, 
  teamSlug, 
  totalSelected, 
  viewType, 
  mapName, 
  payload,
  onMouseEnter,
  onMouseLeave 
}: TeamLogoDotProps) {
  const baseSize = 32;
  const minSize = 16;
  const scale = Math.max(minSize / baseSize, 1 - (totalSelected * 0.15));
  const size = baseSize * scale;

  if (payload) {
    payload.cx = cx;
    payload.cy = cy;
  }

  const imageUrl = viewType === 'byMap' 
    ? TEAM_LOGOS[teamSlug as keyof typeof TEAM_LOGOS]
    : MAP_IMAGES[mapName as keyof typeof MAP_IMAGES];

  return (
    <foreignObject
      x={cx - size/2}
      y={cy - size/2}
      width={size}
      height={size}
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => onMouseEnter?.(e, payload)}
      onMouseLeave={onMouseLeave}
    >
      <Image
        src={imageUrl}
        alt={teamSlug}
        width={size}
        height={size}
        className="rounded-full"
      />
    </foreignObject>
  );
} 