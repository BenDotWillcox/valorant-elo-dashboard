export function PickBanSkeleton() {
  return (
    <div className="container mx-auto p-4 animate-pulse">
      {/* Veto Analysis Section */}
      <div className="mb-12">
        <div className="h-9 bg-muted rounded w-1/3 mx-auto mb-4" />
        
        {/* Team & Event Selectors */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <div className="h-10 w-64 bg-muted rounded" />
          <div className="h-10 w-64 bg-muted rounded" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-4">
              <div className="h-6 bg-muted rounded w-1/2 mx-auto" />
              <div className="bg-card rounded-lg border p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="flex justify-between items-center">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-4 bg-muted rounded w-1/4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pick/Ban Elo Efficiency Section */}
      <div className="flex flex-col items-center mb-8">
        <div className="h-10 bg-muted rounded w-1/2 mx-auto mb-2" />
        <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-4" />
        
        {/* Event Filter */}
        <div className="w-full max-w-xs">
          <div className="h-10 bg-muted rounded" />
        </div>
      </div>

      {/* Analysis Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-5 gap-4 p-4 border-b bg-muted/50">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 bg-muted rounded" />
          ))}
        </div>

        {/* Table Rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="grid grid-cols-5 gap-4 p-4 border-b last:border-b-0 hover:bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-muted rounded" />
              <div className="h-4 bg-muted rounded flex-1" />
            </div>
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

