const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load .env.local manually from the backend root
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Could not find backend .env.local file at:", envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[match[1].trim()] = val;
  }
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

const RULES = [
  // 1. Creator Points (High Value)
  { id: "CREATE_POST", points: 65, dailyLimit: 5, status: "active", name: "Create Fan Zone Post" },
  { id: "CREATE_DEBATE", points: 80, dailyLimit: 3, status: "active", name: "Create ROAR Debate" },
  { id: "CREATE_PREDICTION", points: 55, dailyLimit: 5, status: "active", name: "Create ROAR Prediction" },
  { id: "CREATE_TRIVIA", points: 80, dailyLimit: 3, status: "active", name: "Create Trivia Game" },
  { id: "CREATE_BATTLE", points: 95, dailyLimit: 3, status: "active", name: "Create Fan Battle" },
  { id: "UPLOAD_IMAGE", points: 25, dailyLimit: 10, status: "active", name: "Upload Image" },
  { id: "UPLOAD_VIDEO", points: 55, dailyLimit: 5, status: "active", name: "Upload Video" },
  { id: "WIN_FEATURED_POST", points: 200, dailyLimit: 1, status: "active", name: "Win Featured Post" },
  { id: "CREATOR_STREAK_BONUS", points: 50, dailyLimit: 1, status: "active", name: "Daily Creator Streak Bonus" },

  // 2. Participation Points (Lower Value)
  { id: "LIKE", points: 2, dailyLimit: 15, status: "active", name: "Like a Post/Content" },
  { id: "REACT", points: 3, dailyLimit: 15, status: "active", name: "React to a Post/Content" },
  { id: "COMMENT", points: 8, dailyLimit: 20, status: "active", name: "Comment on a Post" },
  { id: "VOTE_PREDICTION", points: 8, dailyLimit: 10, status: "active", name: "Vote on a Prediction" },
  { id: "JOIN_TRIVIA", points: 8, dailyLimit: 10, status: "active", name: "Join Trivia Game" },
  { id: "JOIN_BATTLE", points: 15, dailyLimit: 10, status: "active", name: "Join Fan Battle" },
  { id: "SHARE", points: 15, dailyLimit: 10, status: "active", name: "Share Content" },
  { id: "SAVE_POST", points: 3, dailyLimit: 10, status: "active", name: "Save Post" },
  { id: "FOLLOW_USER", points: 3, dailyLimit: 10, status: "active", name: "Follow a User" },
  { id: "DAILY_LOGIN", points: 15, dailyLimit: 1, status: "active", name: "Daily Login" },

  // 3. Watch Along & Fantasy Games
  { id: "WATCH_ALONG_JOIN", points: 10, dailyLimit: 3, status: "active", name: "Join Watch Along Session" },
  { id: "WATCH_ALONG_REACT", points: 2, dailyLimit: 20, status: "active", name: "React during Watch Along" },
  { id: "WATCH_ALONG_CHAT", points: 3, dailyLimit: 30, status: "active", name: "Send Chat in Watch Along" },
  { id: "WATCH_ALONG_HOST", points: 40, dailyLimit: 1, status: "active", name: "Host Watch Along Room" },
  { id: "WATCH_ALONG_COMPLETE", points: 25, dailyLimit: 2, status: "active", name: "Complete Watch Along Match" },
  { id: "FANTASY_CREATE_TEAM", points: 30, dailyLimit: 2, status: "active", name: "Create Fantasy Team" },
  { id: "FANTASY_JOIN_LEAGUE", points: 15, dailyLimit: 5, status: "active", name: "Join Fantasy League" },
  { id: "FANTASY_TOP_SCORE", points: 50, dailyLimit: 1, status: "active", name: "Weekly Top Fantasy Score" },
  { id: "FANTASY_WIN_CONTEST", points: 100, dailyLimit: 1, status: "active", name: "Win Fantasy Contest" },

  // 4. News, Articles & Media Drops
  { id: "ARTICLE_READ", points: 3, dailyLimit: 10, status: "active", name: "Read Article" },
  { id: "ARTICLE_COMMENT", points: 5, dailyLimit: 10, status: "active", name: "Comment on Article" },
  { id: "ARTICLE_SHARE", points: 8, dailyLimit: 10, status: "active", name: "Share Article" },
  { id: "ARTICLE_REACT", points: 2, dailyLimit: 10, status: "active", name: "React to Article" },
  { id: "LISTEN_AUDIO_DROP", points: 5, dailyLimit: 5, status: "active", name: "Listen Audio Drop" },
  { id: "WATCH_VIDEO_DROP", points: 8, dailyLimit: 5, status: "active", name: "Watch Video Drop" },
  { id: "COMPLETE_DROP_SERIES", points: 15, dailyLimit: 1, status: "active", name: "Complete Media Series" },
  { id: "SHARE_DROP", points: 10, dailyLimit: 5, status: "active", name: "Share Audio/Video Drop" },

  // 5. Invite Friends
  { id: "SEND_INVITE", points: 5, dailyLimit: 10, status: "active", name: "Send Friend Invite" },
  { id: "INVITE_SIGNUP", points: 50, dailyLimit: 10, status: "active", name: "Friend Signs Up" },
  { id: "INVITE_CHANT", points: 100, dailyLimit: 5, status: "active", name: "Friend Reaches Chant I" },

  // 6. Store, Auctions & Sessions
  { id: "STORE_PURCHASE", points: 25, dailyLimit: 5, status: "active", name: "Store Purchase" },
  { id: "REDEEM_REWARD", points: 10, dailyLimit: 5, status: "active", name: "Redeem Reward" },
  { id: "WISHLIST_SAVE", points: 2, dailyLimit: 10, status: "active", name: "Save to Wishlist" },
  { id: "AUCTION_BID", points: 5, dailyLimit: 20, status: "active", name: "Place Auction Bid" },
  { id: "AUCTION_JOIN", points: 10, dailyLimit: 5, status: "active", name: "Join Auction" },
  { id: "AUCTION_WIN", points: 150, dailyLimit: 2, status: "active", name: "Win Auction" },
  { id: "BOOK_PLAYER_SESSION", points: 20, dailyLimit: 2, status: "active", name: "Book Player Session" },
  { id: "ATTEND_TRAINING", points: 30, dailyLimit: 2, status: "active", name: "Attend Training Session" },
  { id: "ATTEND_BTS", points: 30, dailyLimit: 2, status: "active", name: "Attend BTS Session" },
  { id: "FEEDBACK_COMPLETE", points: 10, dailyLimit: 2, status: "active", name: "Complete Post-Session Feedback" },
  { id: "AMA_JOIN", points: 15, dailyLimit: 3, status: "active", name: "Join AMA Session" },
  { id: "AMA_ASK_QUESTION", points: 20, dailyLimit: 5, status: "active", name: "Ask AMA Question" },
  { id: "AMA_QUESTION_ANSWERED", points: 75, dailyLimit: 2, status: "active", name: "AMA Question Answered" },

  // 7. Streak Milestone Bonuses
  { id: "STREAK_7", points: 100, dailyLimit: 1, status: "active", name: "7-Day Streak Milestone" },
  { id: "STREAK_30", points: 500, dailyLimit: 1, status: "active", name: "30-Day Streak Milestone" },
  { id: "STREAK_100", points: 2000, dailyLimit: 1, status: "active", name: "100-Day Streak Milestone" },
  { id: "STREAK_365", points: 10000, dailyLimit: 1, status: "active", name: "365-Day Streak Milestone" },

  // 8. Quality Bonuses
  { id: "RECEIVE_10_LIKES", points: 25, dailyLimit: 10, status: "active", name: "Receive 10 Likes" },
  { id: "RECEIVE_50_LIKES", points: 60, dailyLimit: 5, status: "active", name: "Receive 50 Likes" },
  { id: "RECEIVE_25_COMMENTS", points: 50, dailyLimit: 5, status: "active", name: "Receive 25 Comments" },
  { id: "DEBATE_TOP_DISCUSSION", points: 120, dailyLimit: 1, status: "active", name: "Debate Selected Top Discussion" },
  { id: "PREDICTION_ACCURATE", points: 40, dailyLimit: 10, status: "active", name: "Prediction Correct" },
  { id: "TRIVIA_WINNER", points: 90, dailyLimit: 3, status: "active", name: "Win Trivia" },
  { id: "BATTLE_WINNER", points: 125, dailyLimit: 3, status: "active", name: "Win Fan Battle" },
  { id: "POST_TRENDING", points: 180, dailyLimit: 1, status: "active", name: "Post Trending" },
  { id: "EDITORS_PICK", points: 300, dailyLimit: 1, status: "active", name: "Editor's Pick" },
  { id: "POST_VIRAL", points: 500, dailyLimit: 1, status: "active", name: "Post Goes Viral" }
];

async function run() {
  console.log("=== INITIALIZING ALL REWARDS RULES IN FIRESTORE ===");
  const batch = db.batch();

  RULES.forEach((rule) => {
    const docRef = db.collection("pointRules").doc(rule.id);
    batch.set(docRef, {
      name: rule.name,
      points: rule.points,
      dailyLimit: rule.dailyLimit,
      status: rule.status,
      updatedAt: Date.now()
    });
    console.log(`Prepared rule doc: ${rule.id} (${rule.points} pts)`);
  });

  await batch.commit();
  console.log("=== FIRESTORE RULES INITIALIZED SUCCESSFULLY ===");
}

run().catch(console.error);
