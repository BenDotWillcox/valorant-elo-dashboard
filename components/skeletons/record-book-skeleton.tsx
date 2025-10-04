export function RecordBookSkeleton() {
  return (
    <div className="container mx-auto p-4 space-y-8 animate-pulse">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="h-10 bg-muted rounded w-1/3 mx-auto" />
        <div className="h-4 bg-muted rounded w-2/3 mx-auto" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-card rounded-lg border p-6 space-y-4">
            <div className="h-6 bg-muted rounded w-2/3" />
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Carousels */}
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-lg border p-6 space-y-4">
            <div className="h-6 bg-muted rounded w-1/4" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-32 bg-muted rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Perfect Games */}
      <div className="bg-card rounded-lg border p-6 space-y-4">
        <div className="h-6 bg-muted rounded w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>

      {/* Map Popularity Chart */}
      <div className="bg-card rounded-lg border p-6 space-y-4">
        <div className="h-6 bg-muted rounded w-1/4" />
        <div className="h-80 bg-muted rounded" />
      </div>
    </div>
  );
}

