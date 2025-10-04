export function PlayerRatingsSkeleton() {
  return (
    <main className="container mx-auto flex flex-col gap-4 p-4 animate-pulse">
      {/* Header */}
      <div className="h-10 bg-muted rounded w-1/3 mx-auto mb-4" />

      {/* Player Graph Section */}
      <div className="mb-8 space-y-4">
        <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
        
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="h-10 bg-muted rounded flex-1" />
          <div className="h-10 w-24 bg-muted rounded" />
        </div>

        {/* Selected Players */}
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 bg-muted rounded-full" />
          ))}
        </div>

        {/* Graph */}
        <div className="h-96 bg-card rounded-lg border p-4">
          <div className="h-full bg-muted rounded" />
        </div>

        {/* Controls */}
        <div className="flex gap-4 justify-center">
          <div className="h-10 w-32 bg-muted rounded" />
          <div className="h-10 w-32 bg-muted rounded" />
        </div>
      </div>

      {/* Player Ratings Table */}
      <div className="space-y-4">
        <div className="h-8 bg-muted rounded w-1/4" />
        
        {/* Table Header */}
        <div className="bg-card rounded-lg border">
          <div className="grid grid-cols-5 gap-4 p-4 border-b">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-muted rounded" />
            ))}
          </div>
          
          {/* Table Rows */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="grid grid-cols-5 gap-4 p-4 border-b last:border-b-0">
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="h-4 bg-muted rounded" />
              ))}
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-10 bg-muted rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}

