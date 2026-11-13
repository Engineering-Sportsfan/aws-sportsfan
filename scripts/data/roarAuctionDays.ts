// scripts/data/roarAuctionDays.ts
// Auction journey content for the ROAR demo seed (taken from the approved iDemo4 prototype).
// Each day: one poll card + 6 fan messages (stored as comments) + a debate and a prediction card.

export interface AuctionDay {
  date: string; // YYYY-MM-DD (2026)
  phase: "PRE-AUCTION" | "AUCTION DAY" | "POST-AUCTION";
  title: string;
  admin: string;
  poll: string;
  choices: string[];
  msgs: string[]; // exactly 6
}

export const AUCTION_DAYS: AuctionDay[] = [
  {
    date: "2026-12-09", phase: "PRE-AUCTION", title: "Countdown begins",
    admin: "📣 AUCTION WEEK! Who will make the biggest splash? Join your room and lock your first predictions.",
    poll: "Which auction story excites you?",
    choices: ["Big overseas buys", "Uncapped Indian talent", "Franchise strategy"],
    msgs: [
      "MI needs role balance, not headlines.",
      "RCB family! Who's joining my auction room? ❤️",
      "CSK will surprise everyone. Watch uncapped Indian talent.",
      "Every team says 'we need balance' until their favourite player appears. 😂",
      "Overseas availability and role fit decide value.",
      "Following Conway! Explain the auction purse? 😅",
    ],
  },
  {
    date: "2026-12-10", phase: "PRE-AUCTION", title: "Franchise needs debate",
    admin: "🧠 AUCTION SCHOOL: Which role is most difficult to fill?",
    poll: "Which role is hardest to fill?",
    choices: ["Death bowler", "Finisher", "All-rounder"],
    msgs: [
      "Death bowling is expensive because specialist options are scarce.",
      "RCB needs flexibility. All-rounder or finisher?",
      "CSK should buy players who contribute now and grow later.",
      "Making a team-needs comparison card.",
      "Overseas workload matters as much as reputation.",
      "What exactly is an impact player?",
    ],
  },
  {
    date: "2026-12-11", phase: "PRE-AUCTION", title: "Player watch day",
    admin: "⭐ Follow a player and explain why your franchise should target him.",
    poll: "What matters most in a player card?",
    choices: ["Recent form", "Role fit", "Experience"],
    msgs: [
      "Compare players by role, not just average or strike rate.",
      "I've added my RCB watchlist. Who's exciting?",
      "My CSK watchlist separates impact-now from upside.",
      "Player card template: role, strengths, risks, team need.",
      "Check recent form and overseas availability.",
      "Conway followed! Adding players I discover here.",
    ],
  },
  {
    date: "2026-12-12", phase: "PRE-AUCTION", title: "Mock auction challenge",
    admin: "🎮 Build a balanced squad with a virtual budget. No money, stakes or cash prizes.",
    poll: "Which mock squad looks most balanced?",
    choices: ["MI model", "RCB model", "CSK model"],
    msgs: [
      "My model penalises role duplication.",
      "RCB room challenge! I'll host the discussion.",
      "CSK mock squad prioritises Indian all-rounders.",
      "I started sensible. Then one superstar appeared. 😂",
      "Remember overseas-player limits.",
      "I forgot a backup keeper. The builder caught it!",
    ],
  },
  {
    date: "2026-12-13", phase: "PRE-AUCTION", title: "Rumours versus verified news",
    admin: "🔎 CONFIRMED, REPORTED or FAN THEORY. Share responsibly.",
    poll: "Which updates do you want alerts for?",
    choices: ["Official only", "Official + reliable reports", "All auction discussion"],
    msgs: [
      "Don't change a squad model based on an unverified post.",
      "Keep the RCB room clean. Excitement, not fake news. ❤️",
      "I'll change predictions only on confirmed developments.",
      "Three labels, one rule: don't confuse rumours with announcements.",
      "A reported interest isn't a confirmed bid.",
      "I like seeing the source next to the update.",
    ],
  },
  {
    date: "2026-12-14", phase: "PRE-AUCTION", title: "Biggest buy versus best value",
    admin: "📊 BIGGEST BUY ≠ BEST VALUE. Make two separate predictions.",
    poll: "Your biggest-buy prediction?",
    choices: ["Overseas all-rounder", "Specialist bowler", "Uncapped Indian"],
    msgs: [
      "Price must be judged against role and squad gap.",
      "I'm voting best value. ❤️",
      "Premium all-rounder attracts the biggest bidding war.",
      "Biggest price vs biggest impact. Pick one.",
      "Role scarcity can push bidding higher than reputation.",
      "Best value. Surprise buys are more interesting!",
    ],
  },
  {
    date: "2026-12-15", phase: "PRE-AUCTION", title: "Final countdown",
    admin: "⏳ TOMORROW: Abu Dhabi. Choose alerts. Your team room and watchalong are ready.",
    poll: "How will you follow auction day?",
    choices: ["Full live feed", "Key moments only", "Watchalong + alerts"],
    msgs: [
      "Watch remaining slots and purse after every major sale.",
      "RCB watch party confirmed. Everyone welcome! ❤️",
      "My predictions are locked. CSK, let's do this!",
      "Countdown reel posted. Tomorrow's memes will be legendary.",
      "Overseas players and tactical roles are my priority.",
      "Conway alerts on. Please don't send 100 notifications. 😅",
    ],
  },
  {
    date: "2026-12-16", phase: "AUCTION DAY", title: "The auction is LIVE!",
    admin: "🔴 Every confirmed sale updates player cards, team purses, top buys and debate rooms.",
    poll: "Which franchise are you watching most?",
    choices: ["MI / RCB", "CSK / DC", "All franchises"],
    msgs: [
      "Keep remaining slots and purse visible beside each transaction.",
      "RCB family roll call! Watchalong room is OPEN. ❤️",
      "CSK watch party! Locked calls are ready.",
      "Meme studio open. Give me an auction moment. 😂",
      "Following overseas player sets. Role context matters.",
      "Conway and NZ player alerts on!",
    ],
  },
  {
    date: "2026-12-17", phase: "POST-AUCTION", title: "First verdicts",
    admin: "☀️ Your franchise purchases, spend, squad questions and recap are ready.",
    poll: "Which auction story impressed you?",
    choices: ["Big headline buys", "Young Indian talent", "Squad balance"],
    msgs: [
      "Auction price is not impact. I'll judge role coverage.",
      "RCB fans, favourite moment? The room was amazing. ❤️",
      "CSK backed young Indian talent. Strong strategy.",
      "Five buys that changed the conversation. My recap is live!",
      "Overseas market was fascinating; availability is crucial.",
      "Can I follow new players from all teams?",
    ],
  },
  {
    date: "2026-12-18", phase: "POST-AUCTION", title: "Biggest buy versus best value",
    admin: "📊 Compare expensive players with valuable team-fit purchases.",
    poll: "What defines best value?",
    choices: ["Low price", "Role fit", "Long-term impact"],
    msgs: [
      "Value = role fit + price + squad need.",
      "The buy that improves the team matters more than headlines.",
      "Green was the headline; CSK's young buys could be value.",
      "Biggest price versus most useful player. Vote!",
      "Same player can be value for one team, not another.",
      "Now I understand price and value are different!",
    ],
  },
  {
    date: "2026-12-19", phase: "POST-AUCTION", title: "The unsold player conversation",
    admin: "🔎 Unsold is an auction status, not a verdict on a career.",
    poll: "Should unsold players have follow profiles?",
    choices: ["Yes, absolutely", "Yes, for major players", "No preference"],
    msgs: [
      "Squad slots, role overlap and price constraints influence decisions.",
      "Let's respect every player. ❤️",
      "Two of my mock picks went unsold. Prediction record needs work! 😂",
      "What does unsold mean? Explainer for new fans.",
      "Players have opportunities beyond this auction.",
      "I'm following unsold players too.",
    ],
  },
  {
    date: "2026-12-20", phase: "POST-AUCTION", title: "Build your franchise's best XI",
    admin: "🧩 Build your best XI, impact option and surprise selection.",
    poll: "Which team has the most balanced XI?",
    choices: ["MI / RCB", "CSK / DC", "Other franchises"],
    msgs: [
      "My XI starts with role coverage.",
      "RCB fans, post your XI! ❤️",
      "CSK's new players need a role pathway.",
      "I'll make visual cards of the best community XIs.",
      "Remember overseas-player limits and availability.",
      "The builder caught my overseas-player mistake!",
    ],
  },
  {
    date: "2026-12-21", phase: "POST-AUCTION", title: "Prediction report cards",
    admin: "🎯 Prediction accuracy and contribution quality are scored separately.",
    poll: "Which leaderboard matters to you?",
    choices: ["Prediction accuracy", "Community contribution", "Both"],
    msgs: [
      "Predictions must be evaluated against published rules.",
      "Show community contribution scores too! ❤️",
      "Got biggest-buy category right, missed destinations.",
      "Fan predictions versus reality recap coming.",
      "A lucky correct prediction isn't great analysis.",
      "I learned a lot just by participating!",
    ],
  },
  {
    date: "2026-12-22", phase: "POST-AUCTION", title: "Follow your favourite players",
    admin: "⭐ Choose player journeys and control notification frequency.",
    poll: "Which feed will you follow?",
    choices: ["My franchise", "Favourite players", "Cricket across teams"],
    msgs: [
      "I want MI role-specific updates, not generic headlines.",
      "Keep our RCB room active. ❤️",
      "Following new CSK buys through the season.",
      "Starting a sourced New Faces to Watch series.",
      "I'll follow overseas and NZ players.",
      "One weekly digest is enough for me.",
    ],
  },
  {
    date: "2026-12-23", phase: "POST-AUCTION", title: "Community verdict and season bridge",
    admin: "🏁 Your best conversations, team verdicts and player journeys are ready.",
    poll: "What should ROAR focus on next?",
    choices: ["Squad news", "Player journeys", "Season fan communities"],
    msgs: [
      "Keep the role-analysis tracker alive.",
      "Best part was finding rival fans who love cricket. ❤️",
      "Preserve predictions to compare with season impact.",
      "Community recap with permission and contributor credit.",
      "Keep the global perspective alive.",
      "I joined for one player and found my cricket community! 😄",
    ],
  },
];
