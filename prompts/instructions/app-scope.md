Ok I am building a web-friendly version of a streamlit dashboard that I made a couple months ago.

Here is the overview of the app, The core function of the app is to rank professional valorant teams using an elo calculation I created similar to elo calculations in chess with some adjustments made for valorant such as accounting for margin of victory and a more variable movement in power level.

Also I make a specific unique adjustment in that I calculate elo independently by the map the team is playing so a team would have a different elo for Map A compared to Map B based on their performance on those given maps. This is because each map provides a unique enough game play that a team may have far different ability on each map.

The dashboard I originally built then took these calculations and displayed the information it contains in various ways, A Live leaderboard of each map, A historical elo graph of each team, and a prediction screen where you can pair two teams and assign maps for the match and it would determine the probability of each team winning using the elo rating for predicting.

With this new app I want a couple things, one it will be much more web friendly as I am building it as a nextjs app using ts rather than a python streamlit dashboard. Two I want o connect it with an api so I don't have to manually update my dbs when matches complete and update my elo calculation, three we will add more interesting features using the information we gather like more predictive measures and utitilities, four I want to improve the elo calculation using the data I collected from my dashboard.
