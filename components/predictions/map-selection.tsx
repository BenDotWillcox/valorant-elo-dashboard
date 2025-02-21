'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";
import { MAP_IMAGES } from "@/lib/constants/images";
import { MAP_POOL } from "@/lib/constants/maps";
import { Badge } from "@/components/ui/badge";

interface MapSelectionProps {
  matchType: 'BO3' | 'BO5' | 'BO5_ADV';
  selectedMaps: string[];
  onMapSelect: (index: number, mapName: string) => void;
  availableMaps: string[];
  autoSelection: boolean;
}

export function MapSelection({ matchType, selectedMaps, onMapSelect, availableMaps, autoSelection }: MapSelectionProps) {
  const numMaps = matchType === 'BO3' ? 3 : 5;

  const isMapInactive = (mapName: string) => MAP_POOL.inactive.includes(mapName);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Map Selection</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: numMaps }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <div className="relative h-28 sm:h-24 w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                {selectedMaps[index] ? (
                  <>
                    <Image
                      src={MAP_IMAGES[selectedMaps[index] as keyof typeof MAP_IMAGES]}
                      alt={selectedMaps[index]}
                      fill
                      className="object-cover"
                    />
                    {isMapInactive(selectedMaps[index]) && (
                      <div className="absolute bottom-1 right-1">
                        <Badge variant="secondary" className="opacity-90 text-xs">Inactive</Badge>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm">Map {index + 1}</span>
                )}
              </div>
              {!autoSelection ? (
                <Select
                  value={selectedMaps[index]}
                  onValueChange={(value) => onMapSelect(index, value)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={`Select Map ${index + 1}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMaps
                      .filter(map => !selectedMaps.includes(map) || selectedMaps[index] === map)
                      .map((map) => (
                        <SelectItem key={map} value={map} className="text-sm">
                          <div className="flex items-center justify-between w-full">
                            <span>{map}</span>
                            {isMapInactive(map) && (
                              <Badge variant="secondary" className="ml-2 text-xs">Inactive</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  {selectedMaps[index]}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 