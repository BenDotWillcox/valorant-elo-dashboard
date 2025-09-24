"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchPlayersByIgn } from "@/actions/players-actions";

type Player = {
  id: number;
  ign: string;
};

type PlayerSearchProps = {
  players: Player[];
  onPlayerAdded: (player: Player) => void;
  onPlayerRemoved: (playerId: number) => void;
};

export function PlayerSearch({
  players: selectedPlayers,
  onPlayerAdded,
  onPlayerRemoved,
}: PlayerSearchProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [availablePlayers, setAvailablePlayers] = React.useState<Player[]>([]);

  React.useEffect(() => {
    const fetchPlayers = async () => {
      if (searchTerm) {
        const result = await searchPlayersByIgn(searchTerm);
        setAvailablePlayers(result);
      } else {
        setAvailablePlayers([]);
      }
    };

    const debounce = setTimeout(() => {
      fetchPlayers();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchTerm]);

  const handleSelect = (player: Player) => {
    if (
      selectedPlayers.length < 5 &&
      !selectedPlayers.some((p) => p.id === player.id)
    ) {
      onPlayerAdded(player);
    }
    setOpen(false);
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full md:w-[300px] justify-between"
            disabled={selectedPlayers.length >= 5}
          >
            {selectedPlayers.length >= 5
              ? "Maximum players selected"
              : "Select players..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full md:w-[300px] p-0">
          <Command>
            <CommandInput
              placeholder="Search player..."
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>No player found.</CommandEmpty>
              <CommandGroup>
                {availablePlayers.map((player) => (
                  <CommandItem
                    key={player.id}
                    value={player.ign}
                    onSelect={() => handleSelect(player)}
                    disabled={selectedPlayers.some((p) => p.id === player.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedPlayers.some((p) => p.id === player.id)
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    {player.ign}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="flex flex-wrap gap-2 mt-2">
        {selectedPlayers.map((player) => (
          <Badge key={player.id} variant="secondary">
            {player.ign}
            <button
              onClick={() => onPlayerRemoved(player.id)}
              className="ml-2 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
