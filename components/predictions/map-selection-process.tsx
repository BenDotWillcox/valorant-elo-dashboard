import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface MapSelectionProcessProps {
  matchType: 'BO3' | 'BO5' | 'BO5_ADV';
  selectedMaps: string[];
  team1: string;
  team2: string;
  bans: {
    team1: string[];
    team2: string[];
  };
}

export function MapSelectionProcess({ matchType, selectedMaps, team1, team2, bans }: MapSelectionProcessProps) {
  const renderStep = (type: 'Ban' | 'Pick' | 'Decider', team: string, map: string) => (
    <div className="flex items-center gap-2 w-full">
      <Badge 
        variant={type === 'Ban' ? 'destructive' : type === 'Pick' ? 'success' : 'default'} 
        className="px-1.5 py-0 shrink-0"
      >
        {type}
      </Badge>
      <span className="whitespace-nowrap">{team} {type.toLowerCase()} {map}</span>
    </div>
  );

  if (matchType === 'BO3') {
    return (
      <Card className="w-full border border-black dark:border-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Map Selection Process</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max items-center justify-between gap-2 md:gap-2 text-sm pb-4">
              {renderStep('Ban', team1, bans.team1[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Ban', team2, bans.team2[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team2, selectedMaps[1])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Ban', team1, bans.team1[1])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Ban', team2, bans.team2[1])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Decider', '', selectedMaps[2])}
            </div>
            <ScrollBar orientation="horizontal" className="bg-muted [&_div]:bg-primary" />
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  if (matchType === 'BO5') {
    return (
      <Card className="w-full border border-black dark:border-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Map Selection Process</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max items-center justify-between gap-2 md:gap-2 text-sm pb-4">
              {renderStep('Ban', team1, bans.team1[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Ban', team2, bans.team2[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team2, selectedMaps[1])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[2])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team2, selectedMaps[3])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[4])}
            </div>
            <ScrollBar orientation="horizontal" className="bg-muted [&_div]:bg-primary" />
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  if (matchType === 'BO5_ADV') {
    return (
      <Card className="w-full border border-black dark:border-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Map Selection Process</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max items-center justify-between gap-2 md:gap-2 text-sm pb-4">
              {renderStep('Ban', team1, bans.team1[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Ban', team1, bans.team1[1])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[0])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team2, selectedMaps[1])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[2])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team2, selectedMaps[3])}
              <div className="text-muted-foreground">→</div>
              {renderStep('Pick', team1, selectedMaps[4])}
            </div>
            <ScrollBar orientation="horizontal" className="bg-muted [&_div]:bg-primary" />
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border border-black dark:border-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Map Selection Process</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max items-center justify-between gap-2 md:gap-4 text-sm pb-4">
            {renderStep('Ban', team1, bans.team1[0])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Ban', team2, bans.team2[0])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Pick', team1, selectedMaps[0])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Pick', team2, selectedMaps[1])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Pick', team1, selectedMaps[2])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Pick', team2, selectedMaps[3])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Pick', team1, selectedMaps[4])}
            <div className="text-muted-foreground">→</div>
            {renderStep('Decider', '', selectedMaps[5])}
          </div>
          <ScrollBar orientation="horizontal" className="bg-muted [&_div]:bg-primary" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 