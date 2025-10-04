"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ArrowRight, TrendingUp, Target, BarChart3, BookOpen, Zap, Users, User } from "lucide-react";

const features = [
  {
    title: "Math",
    description:
      "Deep dive into the mathematical models, algorithms, and statistical methods powering our analytics platform.",
    video: "/videos/Simulations.mp4", // Placeholder - you can create a video for this too
    link: "/math-blog",
    icon: BookOpen,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-slate-600 to-slate-700",
  },
  {
    title: "Rankings",
    description:
      "View up to date team Elo ratings for each individual map.",
    video: "/videos/Rankings.mp4",
    link: "/rankings",
    icon: TrendingUp,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-blue-600 to-blue-700",
  },
  {
    title: "Match Predictions",
    description:
      "Explore match predictions using win probabilities from our Elo system. Create custom map pools and see optimal team selections.",
    video: "/videos/Predictions.mp4",
    link: "/predictions",
    icon: Target,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-purple-600 to-purple-700",
  },
  {
    title: "Map Pools",
    description:
      "Compare the strength of any teams map pools using our Elo rating system.",
    video: "/videos/Pools.mp4",
    link: "/map-stats",
    icon: BarChart3,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-green-600 to-green-700",
  },
  {
    title: "Pick & Ban Analysis",
    description:
      "Analyze pick and ban patterns across teams and tournaments. Understand strategic map selection trends.",
    video: "/videos/Pick.mp4",
    link: "/pick-ban",
    icon: Target,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-rose-600 to-rose-700",
  },
  {
    title: "Player Ratings",
    description:
      "View individual player Elo ratings and performance metrics. Track player progression over time.",
    video: "/videos/Players.mp4",
    link: "/player-ratings",
    icon: User,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-teal-600 to-teal-700",
  },
  {
    title: "Teams",
    description:
      "Explore detailed team profiles with comprehensive statistics, match history, and performance analytics.",
    video: "/videos/Teams.mp4",
    link: "/teams",
    icon: Users,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-violet-600 to-violet-700",
  },
  {
    title: "Elo History",
    description:
      "Track the Elo rating history of any VCT team across any season. Visualize their performance over time with interactive charts.",
    video: "/videos/History.mp4",
    link: "/history",
    icon: TrendingUp,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-orange-600 to-orange-700",
  },
  {
    title: "Record Book",
    description:
      "View our VCT record book, including the greatest and worst teams of all time. Longest Winning Streaks, Longest Losing Streaks, 13-0's, and more.",
    video: "/videos/Book.mp4",
    link: "/record-book",
    icon: BookOpen,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-indigo-600 to-indigo-700",
  },
  {
    title: "Simulations",
    description:
      "Run Monte Carlo simulations of VCT tournaments. See round by round probabilities for each team.",
    video: "/videos/Simulations.mp4",
    link: "/simulations",
    icon: Zap,
    color: "from-slate-600 to-slate-700",
    accentColor: "from-amber-600 to-amber-700",
  }
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-black dark:via-black dark:to-gray-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <div className="animate-fade-in-up">
              <Logo className="mx-auto text-5xl sm:text-6xl lg:text-7xl mb-8" />
            </div>
            <div className="animate-fade-in-up animation-delay-200">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-5xl mb-6">
                Valorant ELO Dashboard
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 max-w-4xl mx-auto leading-relaxed">
                Explore in-depth statistics, predictions, and rankings for Valorant's VCT league using our custom Elo rating system.
              </p>
              <p className="text-lg text-gray-500 dark:text-gray-400 max-w-3xl mx-auto mt-4">
                Get an accurate picture of each team's strength at the map level with data-driven insights.
              </p>
            </div>
          </div>
        </div>
        
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-r from-blue-400/20 to-purple-400/20 dark:from-blue-400/10 dark:to-purple-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-gradient-to-l from-green-400/20 to-cyan-400/20 dark:from-green-400/10 dark:to-cyan-400/10 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Individual Feature Sections */}
      {features.map((feature, index) => {
        const IconComponent = feature.icon;
        const isEven = index % 2 === 0;
        
        return (
          <section 
            key={feature.title}
            className={`relative overflow-hidden px-6 py-20 sm:px-8 lg:px-12 ${
              isEven ? 'bg-white/50 dark:bg-black/50' : 'bg-slate-50/50 dark:bg-gray-900/50'
            }`}
          >
            <div className="mx-auto max-w-7xl">
              <div className={`flex flex-col lg:flex-row items-center gap-12 ${
                isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'
              }`}>
                {/* Content */}
                <div className="flex-1 space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full bg-gradient-to-br ${feature.accentColor} shadow-lg`}>
                        <IconComponent className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {feature.title}
                      </h2>
                    </div>
                    <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                  
                  <Link href={feature.link}>
                    <Button 
                      size="lg"
                      className={`group/btn border-2 border-gray-300 dark:border-gray-600 hover:border-transparent bg-gradient-to-r ${feature.accentColor} hover:from-white hover:to-white text-white hover:text-gray-900 transition-all duration-300 hover:shadow-lg px-8 py-4 text-lg`}
                    >
                      Explore {feature.title}
                      <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover/btn:translate-x-1" />
                    </Button>
                  </Link>
                </div>

                {/* Video */}
                <div className="flex-1">
                  <div className="relative group">
                    <div className="relative aspect-video overflow-hidden rounded-2xl shadow-2xl">
                      <video
                        src={feature.video}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => e.currentTarget.pause()}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section background decoration */}
            <div className="absolute inset-0 -z-10">
              <div className={`absolute top-1/2 w-96 h-96 bg-gradient-to-r ${feature.accentColor} opacity-3 dark:opacity-2 rounded-full blur-3xl ${
                isEven ? 'left-0 -translate-y-1/2' : 'right-0 -translate-y-1/2'
              }`} />
            </div>
          </section>
        );
      })}

      {/* CTA Section */}
      <section className="relative px-6 py-20 sm:px-8 lg:px-12 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black overflow-hidden">
        <div className="mx-auto max-w-4xl text-center relative z-10">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-6">
            Ready to Dive In?
          </h2>
          <p className="text-xl text-slate-300 mb-8">
            Start exploring VCT data with our comprehensive analytics platform
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/rankings">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-4 bg-white text-slate-900 hover:bg-slate-100">
                View Rankings
              </Button>
            </Link>
            <Link href="/predictions">
              <Button size="lg" variant="outline" className="text-lg px-8 py-4 border-slate-600 text-white hover:bg-white hover:text-slate-900">
                Make Predictions
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-slate-700/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-slate-600/10 rounded-full blur-3xl" />
        </div>
      </section>
    </main>
  );
}
