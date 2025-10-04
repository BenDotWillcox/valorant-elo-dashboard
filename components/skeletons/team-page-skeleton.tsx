export function TeamPageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-8 animate-pulse">
        {/* Header Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Content - 2/3 width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Team Name */}
            <div className="space-y-3">
              <div className="h-14 bg-muted rounded-lg w-1/2" />
              <div className="flex items-center gap-3">
                <div className="h-6 w-24 bg-muted rounded-md" />
                <div className="h-1 w-1 rounded-full bg-muted" />
                <div className="h-8 w-8 bg-muted rounded" />
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 bg-card rounded-lg border">
                  <div className="h-8 bg-muted rounded mb-2" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </div>
              ))}
            </div>

            {/* Recent Roster Section */}
            <div className="space-y-4 mt-16">
              <div className="space-y-2">
                <div className="h-8 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-4 bg-card rounded-lg border">
                    <div className="space-y-3">
                      <div className="h-6 bg-muted rounded mx-auto w-3/4" />
                      <div className="h-8 bg-muted rounded mx-auto w-1/2" />
                      <div className="h-16 bg-muted rounded" />
                      <div className="h-4 bg-muted rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar - 1/3 width */}
          <div className="lg:col-span-1">
            <div className="h-full p-6 bg-card rounded-lg border">
              <div className="flex flex-col items-center space-y-6">
                {/* Logo */}
                <div className="w-32 h-32 bg-muted rounded-2xl" />
                
                {/* Trophy Badges */}
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-8 h-8 bg-muted rounded" />
                  ))}
                </div>

                {/* Stats Sections */}
                <div className="w-full space-y-6">
                  <div className="space-y-3">
                    <div className="h-6 bg-muted rounded w-1/2 mx-auto" />
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex justify-between">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-4 bg-muted rounded w-1/4" />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="h-6 bg-muted rounded w-1/2 mx-auto" />
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-4 bg-muted rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Map Rankings Section */}
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-10 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
          
          <div className="grid gap-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="p-6 bg-card rounded-lg border">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-muted rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-6 bg-muted rounded w-1/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-10 bg-muted rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

