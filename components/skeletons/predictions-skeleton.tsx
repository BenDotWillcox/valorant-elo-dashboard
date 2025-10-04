export function PredictionsSkeleton() {
  return (
    <div className="container mx-auto p-4 space-y-8 animate-pulse">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="h-10 bg-muted rounded w-1/3 mx-auto" />
        <div className="h-4 bg-muted rounded w-2/3 mx-auto" />
      </div>

      {/* Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Team Selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-20" />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted rounded-full" />
              <div className="h-10 bg-muted rounded flex-1" />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-20" />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted rounded-full" />
              <div className="h-10 bg-muted rounded flex-1" />
            </div>
          </div>
        </div>

        {/* Match Settings */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-10 bg-muted rounded" />
          </div>
          
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-40" />
          </div>

          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-48" />
          </div>
        </div>
      </div>

      {/* Map Selection */}
      <div className="bg-card rounded-lg border p-6 space-y-4">
        <div className="h-6 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="aspect-video bg-muted rounded-lg" />
          ))}
        </div>
      </div>

      {/* Results Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-6 space-y-4">
          <div className="h-6 bg-muted rounded w-1/2" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border p-6 space-y-4">
          <div className="h-6 bg-muted rounded w-1/2" />
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

