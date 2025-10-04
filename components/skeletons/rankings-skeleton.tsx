export function RankingsSkeleton() {
  return (
    <div className="container mx-auto p-4 animate-pulse">
      {/* Header */}
      <div className="mb-4">
        <div className="h-10 bg-muted rounded w-1/3 mx-auto mb-4" />
      </div>

      {/* Filter Checkbox */}
      <div className="flex justify-center items-center space-x-2 mb-8">
        <div className="h-5 w-5 bg-muted rounded" />
        <div className="h-4 w-48 bg-muted rounded" />
      </div>

      {/* Map Cards Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-8">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="bg-card rounded-lg overflow-hidden shadow-lg border">
            {/* Map Image */}
            <div className="w-full aspect-[32/9] bg-muted" />
            
            {/* Status Badge */}
            <div className="px-4 py-2 bg-muted/50">
              <div className="h-5 bg-muted rounded w-16 mx-auto" />
            </div>
            
            {/* Team Rankings */}
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => (
                <div key={rank} className="flex justify-between items-center p-2 rounded bg-muted/60">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-4 w-6 bg-muted rounded" />
                    <div className="w-6 h-6 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded flex-1 max-w-[150px]" />
                  </div>
                  <div className="h-4 w-12 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

