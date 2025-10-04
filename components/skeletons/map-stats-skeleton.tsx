export function MapStatsSkeleton() {
  return (
    <div className="container mx-auto p-4 space-y-6 animate-pulse">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="h-10 bg-muted rounded w-1/3 mx-auto" />
        <div className="h-4 bg-muted rounded w-2/3 mx-auto" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 justify-center items-center">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-32" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-40" />
        </div>
        <div className="h-10 w-32 bg-muted rounded" />
        <div className="h-10 w-32 bg-muted rounded" />
      </div>

      {/* Team List */}
      <div className="bg-card rounded-lg border p-4">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-muted rounded" />
              <div className="h-3 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-lg border p-6">
        <div className="h-6 bg-muted rounded w-1/4 mb-4" />
        <div className="h-96 bg-muted rounded" />
      </div>
    </div>
  );
}

