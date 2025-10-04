export function TeamsListSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 animate-pulse">
      <div className="mb-8">
        <div className="h-10 bg-muted rounded w-1/4 mx-auto mb-2" />
        <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
      </div>

      <div className="space-y-8">
        {/* Repeat for each region */}
        {[1, 2, 3, 4].map((region) => (
          <div key={region}>
            <div className="h-8 bg-muted rounded w-1/4 mx-auto mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                <div key={i} className="bg-card rounded-lg border p-4">
                  <div className="flex flex-col items-center space-y-3">
                    <div className="w-16 h-16 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

