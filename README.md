# Valorant ELO Dashboard

A comprehensive analytics platform for Valorant Champions Tour (VCT) data, featuring custom Elo rating systems, match predictions, and in-depth statistical analysis.

## 🎯 Features

### Core Analytics

- **Team Rankings** - Map-specific Elo ratings for all VCT teams
- **Match Predictions** - Win probability calculations with custom map pools
- **Player Ratings** - Individual player performance metrics and progression tracking
- **Map Pool Analysis** - Compare team strengths across different maps

### Advanced Insights

- **Pick & Ban Analysis** - Strategic map selection patterns and trends
- **Elo History** - Interactive charts showing team performance over time
- **Tournament Simulations** - Monte Carlo simulations for VCT tournaments
- **Record Book** - Historical achievements, streaks, and statistical records

### Data Visualization

- Interactive charts and graphs using Chart.js and Recharts
- Real-time data updates and filtering
- Responsive design with dark/light mode support
- Video previews for each feature section

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, Radix UI components
- **Database**: PostgreSQL with Drizzle ORM
- **Data Processing**: Custom Elo algorithms, statistical analysis
- **Visualization**: Chart.js, Recharts, Framer Motion
- **Web Scraping**: Puppeteer for data collection

## 📊 Data Processing

### Elo Rating System

The platform uses a custom Elo rating system with the following features:

- **Map-specific ratings** - Separate Elo ratings for each Valorant map
- **Margin of victory** - Accounts for score differential in rating changes
- **Configurable parameters** - K-factor, rating scale, and margin scaling
- **Initial rating**: 1000 points per map

## 🏗️ Project Structure

```
valorant-elo-dashboard/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── rankings/          # Team rankings page
│   ├── predictions/       # Match predictions page
│   ├── player-ratings/    # Player analytics page
│   ├── teams/            # Team profiles
│   └── ...
├── components/           # Reusable React components
│   ├── ui/              # Radix UI components
│   ├── charts/          # Data visualization components
│   ├── filters/         # Data filtering components
│   └── ...
├── db/                  # Database configuration and schemas
│   ├── schema/          # Drizzle schema definitions
│   ├── queries/         # Database query functions
│   └── migrations/      # Database migration files
├── lib/                 # Utility libraries
│   ├── elo/            # Elo rating calculations
│   ├── predictions/    # Match prediction algorithms
│   └── simulation/     # Tournament simulation logic
├── scripts/            # Data processing and migration scripts
├── types/              # TypeScript type definitions
└── public/             # Static assets (images, videos)
```

## 📈 Key Algorithms

### Elo Rating Calculation

```typescript
// Map-specific Elo with margin of victory
const expectedProbability =
  1 / (1 + Math.pow(10, (loserRating - winnerRating) / ratingScale));
const marginFactor = marginScale * Math.log(5.95 * Math.sqrt(scoreDiff + 1));
const eloChange = kFactor * marginFactor * (1 - expectedProbability);
```

### Match Prediction

- Uses current Elo ratings to calculate win probabilities
- Supports custom map pools for tournament simulations
- Accounts for map-specific team strengths

### Tournament Simulation

- Monte Carlo simulation engine
- Round-by-round probability calculations
- Support for various tournament formats (GSL, Swiss, etc.)

## 🎮 Supported Data

### Tournaments

- VCT 2023-2025 (Americas, EMEA, Pacific, China)
- International tournaments (Masters, Champions)
- Regional leagues and qualifiers

### Teams & Players

- All VCT franchised teams
- Individual player statistics
- Historical roster changes

### Maps

- All competitive Valorant maps
- Map-specific performance metrics
- Pick/ban analysis and trends
