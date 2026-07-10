"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


export default function MathBlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-black dark:via-black dark:to-gray-900">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            The Mathematics Behind Valomapped
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            A comprehensive deep-dive into the mathematical models, algorithms, and statistical methods 
            powering my Valorant competitive analytics platform.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            <Badge variant="secondary">Elo Rating Systems</Badge>
            <Badge variant="secondary">Monte Carlo Simulations</Badge>
            <Badge variant="secondary">Game Theory</Badge>
            <Badge variant="secondary">Statistical Analysis</Badge>
            <Badge variant="secondary">Probability Theory</Badge>
            <Badge variant="secondary">Machine Learning</Badge>
          </div>
        </div>

        {/* Table of Contents */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Table of Contents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Core Systems</h4>
                <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <li>• <a href="#elo-system" className="hover:text-blue-600">Elo Rating System</a></li>
                  <li>• <a href="#match-predictions" className="hover:text-blue-600">Match Predictions</a></li>
                  <li>• <a href="#map-selection" className="hover:text-blue-600">Greedy Map Recommendations</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Advanced Analytics</h4>
                <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <li>• <a href="#monte-carlo" className="hover:text-blue-600">Monte Carlo Simulations</a></li>
                  <li>• <a href="#tournament-modeling" className="hover:text-blue-600">Tournament Modeling</a></li>
                  <li>• <a href="#statistical-methods" className="hover:text-blue-600">Player Rating Modeling</a></li>
                  <li>• <a href="#pick-ban-analysis" className="hover:text-blue-600">Pick/Ban Decision Analysis</a></li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Elo Rating System */}
        <section id="elo-system" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">1. Elo Rating System</CardTitle>
              <br />
              <p className="text-gray-600 dark:text-gray-300">
                The core of this website is a custom Elo rating system modified from the standard Elo formula made famous in chess. Each team is given an independent rating for each map so the model can represent map-specific strength. That extra detail is a modeling hypothesis, not a proven performance advantage: the published chronological holdout does not establish that the deployed map model predicts better than plain overall-team Elo.
              </p>
              <br />
              <p className="text-gray-600 dark:text-gray-300"> 
                A typical Elo formula first calculates the expected probability of winning the match for each player as follows:
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <code className="text-sm">
                expected_probability = 1 / (1 + 10^((opponent_rating - player_rating) / 400))
                </code>
              </div>
              <br />
              <p className="text-gray-600 dark:text-gray-300">
                Then the Elo rating is updated based on the actual outcome of the match.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <code className="text-sm">
                new_elo_rating = old_elo_rating + k * (actual_outcome - expected_probability)
                </code>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                <em>K is a constant used to control the magnitude of the rating change.</em>
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Valomapped&apos;s Custom Elo Formula</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    expected_probability = 1 / (1 + 10^((opponent_rating - player_rating) / 1000))
                    <br /> 
                    <br />
                    elo_rating = elo_rating + 74 * margin_factor * (actual_outcome - expected_probability)
                  </code>
                </div>
                <br />
                <p className="text-gray-600 dark:text-gray-300">
                  The margin factor is calculated as follows:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    margin_factor = ln(5.95 * sqrt(score_difference + 1))
                  </code>
                </div>
                <br />
                <h4 className="font-semibold mb-3">Parameters</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  There are essentially 3 main parameters that can be adjusted to fit the needs of the specific use case.
                </p>
                <br />
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <li>1. Rating Scale</li>
                  <li>2. Margin of Victory Adjustment</li>
                  <li>3. K-Factor</li>
                </ul>
                <br />
                <h4 className="font-semibold mb-3">1. Rating Scale</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  The rating scale acts as the divisor that controls the spread of Elo ratings in the system. 
                  Increasing this value widens the Elo gap required to achieve the same win probability. 
                  In traditional chess Elo (400-point scale), a 400-point gap yields ~91% win probability 
                  (e.g., 1600 vs 1200). In my 1000-point scale, that same 91% probability requires a 
                  1000-point gap (e.g., 1600 vs 600). 
                  <br />
                  <br />
                  The deployed model uses the wider scale as a legacy modeling and presentation choice.
                  The original selection record is not reproducible, so the scale should not be interpreted
                  as independently calibrated or as evidence that displayed rating gaps are more predictive.
                </p>
                <br />
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    Expected Probability = 1 / (1 + 10^((opponent_rating - player_rating) / <strong>1000</strong>))
                  </code>
                </div>
              </div>

              <div className="border-2 border-blue-500/30 dark:border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20 p-6 rounded-lg">
                <h4 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">Current Parameters and Validation Status</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  The production model currently uses the legacy parameter set shown below. Earlier exploratory work used a grid search,
                  but the repository did not preserve enough evidence—exact split dates, scores, candidate results, or a data snapshot—to
                  independently reproduce the selection. These values should therefore be treated as an implementation choice, not a
                  validated performance claim. The published retrospective backtest evaluates the fixed configuration but does not
                  establish an improvement over plain overall-team Elo.
                </p>
                
                <h5 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">Production configuration:</h5>
                <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1 mb-3">
                  <li>Initial map rating: 1000</li>
                  <li>Rating scale: 1000</li>
                  <li>K-factor: 74</li>
                  <li>Margin factor: ln(5.95 × √(score difference + 1))</li>
                  <li>Hard rating reset at the start of each calendar year</li>
                </ul>

                <h5 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">Evidence standard:</h5>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  The reproducible retrospective evaluation publishes chronological train, validation, and test dates and enforces
                  validation-only selection within each run; it is not described as a preregistered or untouched holdout. It also publishes
                  a plain-Elo baseline, Brier score, log loss, reliability, confidence-band accuracy, sample sizes, and uncertainty intervals.
                  Experimental results will not silently replace the production model.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">2. Margin of Victory Adjustment</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  The margin of victory adjustment adds critical context by incorporating the score differential 
                  into the rating calculation. This ensures that dominant victories yield larger rating changes 
                  than narrow wins.
                </p>
                <br />
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    margin_factor = ln(5.95 × √(score_difference + 1))
                  </code>
                </div>
                <br />
                <p className="text-gray-600 dark:text-gray-300">
                  The logarithmic scaling grows more slowly than a linear margin multiplier. For example,
                  a 13-5 victory yields a greater reward than a 13-11 victory, but the marginal increase in reward 
                  for winning 13-10 vs 13-11 is higher than the increase for 13-5 vs 13-6. That limits growth relative
                  to a linear rule, but it does not make the deployed updates small.
                </p>
                <br />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  At equal 1000 ratings, the deployed formula moves each team by about 86.3 points after 13-11 and
                  114.8 points after 13-0. Those aggressive magnitudes are disclosed and compared in the published
                  backtest; the holdout does not establish that they are superior.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">3. K-Factor</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  The K-factor controls the base sensitivity of each update. Because the deployed formula also
                  multiplies by margin of victory, K is not a hard maximum on the point change.
                  <br />
                  <br />
                  Tuning the K-factor involves finding a balance in how responsive the rating system is to new data.
                  <br />
                  <br />
                  A higher K-factor will result in more volatile rating changes, while a lower K-factor will result in more stable rating changes.
                  <br />
                  <br />
                  The deployed legacy configuration uses a K-factor of 74. The repository does not preserve enough evidence to reproduce
                  the earlier parameter search, so this value is not presented as a validated optimum. It is substantially higher than
                  values commonly used in traditional chess-style Elo systems.
                  <br />
                  <br />
                  The motivating intuition was that a rapidly evolving esport may benefit from faster updates. The holdout results show
                  why that intuition still needs calibration evidence rather than being treated as proof.
                  <br />
                  <br />
                </p>
                <h4 className="font-semibold mb-3">Final Formula</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    expected_probability = 1 / (1 + 10^((opponent_rating - player_rating) / 1000))
                    <br />
                    <br />
                    new_rating = old_rating + (74 × ln(5.95 × sqrt(score_difference + 1)) × (Actual_Result - Expected_Probability))
                  </code>
                </div>
              </div>
              <div className="border-2 border-blue-500/30 dark:border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20 p-6 rounded-lg">
                <h4 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">Alternative Methods</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  The notes below describe earlier exploratory ideas whose datasets, splits, and scores were not preserved well enough for
                  independent verification. The reproducible comparison on the methodology page supersedes them as the project&apos;s public evidence.
                </p>
                <h5 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">Hybrid Global Offset</h5>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  The hybrid global offset method is a modification of my custom Elo formula that creates a global Elo rating for each team and then adds a map-specific offset to the rating for each map, rather than having completely independent ratings per map.
                  Earlier exploratory work suggested this might help at the beginning of seasons, but that result is not reproducible from
                  the current repository and is not a published performance claim. The deployed implementation retained independent map ratings.
                </p>
                <h5 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">Model K-Factor Updating Confidence</h5>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  I also experimented with a K-Factor updating confidence approach. This means the model would dynamically adjust the K-Factor based on the amount of time between matches. So the K-factor would start higher at the beginning of the season and gradually shrink as it got more data. The model starts updating more quickly while it has low confidence in the team&apos;s skill level and then updates more slowly as it gets more data. The K-Factor would then increase again after long breaks within the season as the teams have time to make changes.
                  <br />
                  <br />
                  Earlier exploratory notes reported that this version did not perform as well, but the underlying comparison is not
                  reproducible and should be treated as design history rather than evidence.
                  <br />
                  <br />
                  I was quite surprised by this result, however my best guess as to why is some combination of factors: the data is sparse as is, and decaying the K-Factor was ultimately causing more harm than good. As well as that teams are able to make significant changes to their playstyle and strategy even in the middle of a season and our reduced K-Factor more slowly adjusted to these mid-season changes.
                </p>
                <h5 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">Regional Elo Multiplier</h5>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  I plan on testing a regional Elo multiplier for each map in the future. This is because teams play so many of their matches regionally that the model is at risk of not fully accounting for differences in skill level between regions.
                  <br />
                  <br />
                  Differences between regions are currently sorted out between teams competing internationally where teams from stronger regions will win more often and therefore &quot;bring back&quot; the gained Elo to the regional events.
                  <br />
                  <br />
                  I however am not convinced this is sufficient to calibrate the regional differences fully. 
                  A thought I plan on exploring is giving each region a multiplier that is impacted by the result of each international match, weighting the Elos of every team in the region based on the result rather than just relying on individual team Elo gains/losses waterfalling down to the rest of the region. This would also be map-independent, as regions may have better strategies on some maps and not others.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Match Predictions */}
        <section id="match-predictions" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">2. Match Prediction Models</CardTitle>
              <p className="text-gray-600 dark:text-gray-300">
                Probability calculations for Best-of-3 and Best-of-5 matches using probability theory.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Single Map Win Probability</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    P(Team A wins) = 1 / (1 + 10^((Elo_B - Elo_A) / 1000))
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  The probability of a team winning a given map is calculated directly from the win probability implied by our Elo ratings.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Best-of-3 Match Probability</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    P(BO3 Win) = P₁P₂ + P₁(1-P₂)P₃ + (1-P₁)P₂P₃
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  Where P₁, P₂, P₃ are the win probabilities for each map in the match sequence.  
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Best-of-5 Match Probability</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  A team wins a BO5 by winning 3 maps before their opponent does. There are 10 distinct 
                  scenarios for achieving this victory:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                  <div>
                    <p className="text-xs font-semibold mb-1">3-0 Victory (1 scenario):</p>
                    <code className="text-xs">P₁P₂P₃</code>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1">3-1 Victory (3 scenarios):</p>
                    <code className="text-xs">
                      P₁P₂(1-P₃)P₄ + P₁(1-P₂)P₃P₄ + (1-P₁)P₂P₃P₄
                    </code>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1">3-2 Victory (6 scenarios):</p>
                    <code className="text-xs">
                      P₁P₂(1-P₃)(1-P₄)P₅ + P₁(1-P₂)P₃(1-P₄)P₅ + P₁(1-P₂)(1-P₃)P₄P₅ + 
                      (1-P₁)P₂P₃(1-P₄)P₅ + (1-P₁)P₂(1-P₃)P₄P₅ + (1-P₁)(1-P₂)P₃P₄P₅
                    </code>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                    <p className="text-xs font-semibold mb-1">Full Formula:</p>
                    <code className="text-xs">P(BO5 Win) = [sum of all 10 terms above]</code>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  Where P₁, P₂, P₃, P₄, P₅ are the win probabilities for each map in the match sequence. 
                  Each scenario represents a unique path through the match where the team wins exactly 3 maps.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Greedy Map Selection */}
        <section id="map-selection" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">3. Greedy Elo Map Recommendation Algorithm</CardTitle>
              <p className="text-gray-600 dark:text-gray-300">
                A local map-Elo heuristic used to simulate pick/ban processes in competitive Valorant.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Strategic Assumptions</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <li>The heuristic bans the map with the acting team&apos;s lowest modeled win probability</li>
                  <li>The heuristic picks the map with the acting team&apos;s highest modeled win probability</li>
                  <li>Alternating selection order follows standard competitive rules</li>
                  <li>The simulation treats current Elo estimates as its complete input and does not observe private strategic information</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-3">BO3 Selection Process</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    1. Team A bans its lowest-probability map<br/>
                    2. Team B bans its lowest-probability map<br/>
                    3. Team A picks its highest-probability map<br/>
                    4. Team B picks its highest-probability map<br/>
                    5. Team A bans its lowest-probability remaining map<br/>
                    6. Team B bans its lowest-probability remaining map<br/>
                    7. Remaining map becomes decider
                  </code>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">BO5 Selection Process</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    1. Team A bans its lowest-probability map<br/>
                    2. Team B bans its lowest-probability map<br/>
                    3. Team A picks its highest-probability map<br/>
                    4. Team B picks its highest-probability map<br/>
                    5. Team A picks its highest-probability remaining map<br/>
                    6. Team B picks its highest-probability remaining map<br/>
                    7. Remaining map becomes decider<br/>
                  </code>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Zero-Sum Model Assumption</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  This algorithm uses a strict zero-sum abstraction. For any given map, Team A&apos;s modeled win probability is exactly (1 - Team B&apos;s modeled win probability). Within that abstraction, one team&apos;s lowest-probability map is the opponent&apos;s highest-probability map, and vice versa.
                  <br />
                  <br />
                  The implementation therefore makes a greedy local recommendation: ban the lowest modeled probability and pick the highest.
                  That recommendation is internally consistent with the current Elo estimates, but it is not proof of the best full-sequence veto strategy.
                  Later veto choices, format constraints, side selection, opponent behavior, roster plans, and private preparation can all matter beyond this model.
                  <br />
                  <br />
                  Modeling how an opponent may depart from the same greedy rule is beyond the current system; the simulator assumes both teams follow it.
                  <br />
                  <br />
                  A potential future addition would be to model each team&apos;s actual historical map choice patterns 
                  and provide an option to use predicted map selection based on past behavior, rather than assuming both teams follow the same greedy recommendation.
                  <br />
                  <br />
                  With a model for each team&apos;s historical choice patterns, we could create a predicted map pool for a matchup and a policy-aware recommendation that responds to likely opponent choices.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Monte Carlo Simulations */}
        <section id="monte-carlo" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">4. Monte Carlo Tournament Simulations</CardTitle>
              <p className="text-gray-600 dark:text-gray-300">
                Large-scale statistical modeling of tournament outcomes using probabilistic match simulation.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Simulation Process</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    for i = 1 to N_simulations (default: 10,000):<br/>
                    &nbsp;&nbsp;for each match in tournament:<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;simulate_match_result(team1, team2, match_type)<br/>
                    &nbsp;&nbsp;record tournament outcomes<br/>
                    calculate final probabilities
                  </code>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  The (simulate_match_result) function simulates the map selection phase with both teams following the greedy Elo recommendations, then gets the modeled win probabilities for each map using the match probability calculator.
                  <br />
                  <br />
                  Then all that is left is to design the tournament structure and simulate the tournament using a Monte Carlo simulation approach.
                  <br />
                  <br />
                  For each iteration, we simulate each match using the given win probabilities from our simulate_match_result function. Using the calculated probabilities, we generate a random outcome from the distribution. We record that result for each match, moving on to the next until we complete the full tournament.
                  <br />
                  <br />
                  Once we simulate the tournament in its entirety N times (we currently use 10,000), we aggregate the number of times each team made it to each stage of the tournament, giving us the probability of each team making it to each stage of the tournament.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Tournament Modeling */}
        <section id="tournament-modeling" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">5. Tournament Structure Modeling</CardTitle>
              <p className="text-gray-600 dark:text-gray-300">
                Accurate representation of complex tournament formats including group stages, playoffs, and bracket structures.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Bracket Traversal Algorithm</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    function simulate_bracket(teams, bracket_structure):<br/>
                    &nbsp;&nbsp;current_round = teams<br/>
                    &nbsp;&nbsp;for each round in bracket_structure:<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;next_round = []<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;for each match in current_round:<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;winner = simulate_match(match)<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;next_round.append(winner)<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;current_round = next_round<br/>
                    &nbsp;&nbsp;return current_round[0]  # Tournament winner
                  </code>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Group Stage Modeling</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  For tournaments with group stages, I simulate round-robin play within each group, 
                  then advance teams based on win-loss records and tiebreakers (head-to-head, map differential).
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Dynamic Tournament Updates</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  The daily pipeline incorporates completed match results. Tournament projections can then be rerun on demand against
                  the latest successfully processed map-Elo snapshot; they are not a streaming, real-time feed.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Multiple Tournament Formats</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <li>Single Elimination Brackets</li>
                  <li>Double Elimination Brackets</li>
                  <li>Swiss System Tournaments</li>
                  <li>Round Robin Groups</li>
                  <li>Hybrid Group + Bracket Formats</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Player Rating Modeling */}
        <section id="statistical-methods" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">6. Player Rating Modeling</CardTitle>
              <p className="text-gray-600 dark:text-gray-300">
                The inspiration for my player rating systems comes as an attempt to create a Valorant version of the NBA&apos;s {""}
                <a 
                  href="https://apanalytics.shinyapps.io/DARKO/_w_40abdb2cb7f34fb4a4710727dacf07d4/#tab-7016-2" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  DARKO metric
                </a>.
                <br />
                <br />
                The DARKO metric uses a combination of classic statistics and modern machine learning techniques that updates after each game. You can read more about it in the link above.
                <br />
                <br />
                Specifically I am modeling after the DPM (DARKO Plus Minus) statistic.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Overview: VPM (Valorant Plus Minus)</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  VPM is a composite player rating metric that combines traditional box score statistics with 
                  time-series modeling to estimate a player&apos;s true skill level in relation to rounds won or lost for their team compared to an average replacement player.
                  <br />
                  <br />
                  The system processes every map a player has ever played and outputs a single number that 
                  represents their current skill level, normalized to a standard 24-round map. The rating 
                  updates after each game, adapting to recent form while maintaining historical context.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Step 1: Statistical Components</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  The foundation of VPM consists of 7 per-round box-score statistics that capture different aspects of player performance:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    <li><strong>KPR</strong> (Kills Per Round): kills / total_rounds</li>
                    <li><strong>DPR</strong> (Deaths Per Round): deaths / total_rounds</li>
                    <li><strong>APR</strong> (Assists Per Round): assists / total_rounds</li>
                    <li><strong>FK Attempt Rate</strong>: (first_kills + first_deaths) / total_rounds</li>
                    <li><strong>FK Win Rate</strong>: first_kills / (first_kills + first_deaths)</li>
                    <li><strong>ADR</strong>: average damage per round (already normalized)</li>
                    <li><strong>KAST</strong>: Kill/Assist/Survive/Trade percentage (0-1 scale)</li>
                  </ul>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  These components were selected because they correlate strongly with winning rounds while 
                  remaining relatively independent from each other, capturing distinct skill dimensions.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Step 2: Exponentially Weighted Moving Average (EMA)</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  Rather than treating all games equally, the system uses time-decay to emphasize recent performance. 
                  Each component maintains its own decay factor (β) tuned to how quickly that skill changes:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    EMA_component = (Σ weight_i × value_i) / (Σ weight_i)
                    <br />
                    <br />
                    weight_i = rounds_played × β^(days_since_game)
                  </code>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Step 3: Linear Regression Model</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  The 7 EMA components are combined using Ridge regression weights trained on historical data. 
                  The model predicts team round-winning probability based on player statistics:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    VPM_raw = w₁×EMA_kpr + w₂×EMA_dpr + w₃×EMA_apr + w₄×EMA_fk_att_rate + 
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;w₅×EMA_fk_win_rate + w₆×EMA_adr + w₇×EMA_kast
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  Ridge regularization (L2 penalty) prevents overfitting and ensures the model generalizes well 
                  to unseen matches. The weights are trained to maximize predictive accuracy on out-of-sample data.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Step 4: Kalman Filtering & Smoothing</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  The raw VPM values are noisy due to small sample sizes and variance in individual game performance. 
                  A Kalman filter provides optimal smoothing by modeling player skill as a latent state that evolves over time:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                  <div>
                    <p className="text-xs font-semibold mb-1">State Evolution:</p>
                    <code className="text-xs">
                      x_t = a × x_(t-1) + process_noise
                    </code>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1">Observation Model:</p>
                    <code className="text-xs">
                      y_t = x_t + measurement_noise
                    </code>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1">Kalman Gain:</p>
                    <code className="text-xs">
                      K_t = P_prior / (P_prior + R_t)
                    </code>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1">Update:</p>
                    <code className="text-xs">
                      x_t = x_prior + K_t × (y_t - x_prior)
                    </code>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  The filter accounts for variable game lengths (longer games provide more information) and time gaps 
                  between matches (uncertainty increases during inactivity). The Rauch-Tung-Striebel (RTS) smoother 
                  then performs a backward pass to refine historical estimates using future information.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Step 5: Centering & Normalization</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  The final VPM values are optionally centered by subtracting the league-average on each date. 
                  This ensures ratings are comparable across different eras and accounts for meta shifts that 
                  affect overall scoring levels. A VPM of +2.0 means the player provides 2 rounds worth of value 
                  above average per 24-round map.
                </p>
              </div>

              <div className="border-2 border-blue-500/30 dark:border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20 p-6 rounded-lg">
                <h4 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">Model Parameters</h4>
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
                  <div>
                    <p className="font-semibold mb-1">EMA Decay Factors (β):</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>KPR, DPR, APR: 0.992</li>
                      <li>FK Attempt Rate: 0.990</li>
                      <li>FK Win Rate: 0.985 (most volatile)</li>
                      <li>ADR: 0.993 (most stable)</li>
                      <li>KAST: 0.991</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Kalman Filter Parameters:</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong>a</strong> = 1.0 (state transition coefficient)</li>
                      <li><strong>q</strong> = 0.05 (process noise per day)</li>
                      <li><strong>r₀</strong> = 1.0 (base measurement noise)</li>
                      <li><strong>use_days</strong> = true (time-aware dynamics)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Advantages Over Traditional Metrics</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <li><strong>Temporal Awareness</strong>: Recent performance weighted more heavily than old data</li>
                  <li><strong>Uncertainty Quantification</strong>: Confidence intervals provided for each rating</li>
                  <li><strong>Sample Size Adjustment</strong>: Smoothing prevents overreaction to small samples</li>
                  <li><strong>Multi-dimensional</strong>: Captures combat, trading, impact, and consistency</li>
                  <li><strong>Predictive</strong>: Trained to maximize correlation with team success</li>
                  <li><strong>Adaptive</strong>: Model can be retrained as the game evolves</li>
                </ul>
              </div>

              <div className="border-2 border-amber-500/30 dark:border-amber-400/30 bg-amber-50/50 dark:bg-amber-950/20 p-6 rounded-lg">
                <h4 className="font-semibold mb-3 text-amber-900 dark:text-amber-100">Future Improvements</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  While the current VPM system provides strong predictive performance, several enhancements are planned:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <li><strong>Map-specific models</strong>: Different weights for different maps (Jett better on Icebox, etc.)</li>
                  <li><strong>Agent adjustments</strong>: Normalize for expected agent performance (duelists vs sentinels)</li>
                  <li><strong>Additional Features</strong>: Incorporate additional features such as clutch percentage (1vX), Utility Efficiency, and in-game economy data.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Pick/Ban Analysis */}
        <section id="pick-ban-analysis" className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">7. Pick/Ban Decision Analysis</CardTitle>
              <p className="text-gray-600 dark:text-gray-300">
                Describing how closely historical choices align with a greedy map-Elo recommendation.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Overview</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  Every competitive Valorant match begins with a pick/ban phase where teams alternately select and
                  eliminate maps. This analysis compares each observed choice with a greedy recommendation derived from map Elo ratings; it does not observe private coaching inputs or the result of an unplayed alternative.
                  <br />
                  <br />
                  The leakage-safe rebuild uses ratings strictly before the recorded match completion cutoff, excludes ratings produced by that same match, and defaults missing team/map ratings to 1000. Completion time is the proxy because match start is not stored.
                  The resulting model-regret score measures alignment with that heuristic, not proven coaching quality or causal win lift.
                  Ban comparisons are specifically counterfactual because a banned map is never played.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Greedy Pick Recommendation</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  For a pick, the heuristic recommends the available map with the acting team&apos;s largest Elo advantage:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    Greedy Pick = argmax(Elo_Team(map) - Elo_Opponent(map))
                    <br />
                    <br />
                    Elo Advantage = Elo_Team(picked_map) - Elo_Opponent(picked_map)
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  Pick model regret is the Elo-gap difference between the greedy recommendation and the observed pick. It measures departure from the heuristic, not a realized loss.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Greedy Ban Recommendation</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  For a ban, the heuristic recommends eliminating the available map where the acting team has the smallest Elo advantage (or largest disadvantage):
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <code className="text-sm">
                    Greedy Ban = argmin(Elo_Team(map) - Elo_Opponent(map))
                    <br />
                    <br />
                    Model Regret = Observed_Advantage - Recommended_Advantage
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  This is a counterfactual Elo comparison: the banned map has no observed match result. A positive gap means the choice differed from the model&apos;s greedy recommendation, not that the veto was a demonstrated strategic error.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Analysis Process</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold mb-2">For each completed match:</p>
                  <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1 ml-2">
                    <li>Retrieve ratings strictly before the recorded match completion cutoff, excluding rows produced by that same match; use 1000 when a team/map rating is missing</li>
                    <li>Replay the pick/ban phase step-by-step in chronological order</li>
                    <li>At each step, calculate the greedy Elo recommendation from the available maps</li>
                    <li>Compare the observed choice with that recommendation</li>
                    <li>Calculate local model regret, with zero for a recommendation-aligned choice</li>
                    <li>Accumulate the local Elo-gap differences across the veto phase</li>
                    <li>Store analysis results for aggregation and visualization</li>
                  </ol>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Cumulative Model Regret</h4>
                <p className="text-gray-600 dark:text-gray-300">
                  Cumulative model regret sums the local Elo-gap differences throughout the veto phase.
                  A value of zero means every evaluated choice matched the greedy recommendation; a larger value means the sequence departed from it more often or by larger Elo gaps.
                  It does not measure surrendered competitive advantage, realized probability loss, or coaching skill.
                  <br />
                  <br />
                  Teams can be ranked by their average model regret across analyzed matches, but that ranking describes model alignment only and should not be interpreted as causal evidence of better preparation.
                </p>
              </div>

            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}




