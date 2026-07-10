const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// ─── Load Environment Variables ────────────────────────────────────────────────
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  });
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();
db.settings({
  ignoreUndefinedProperties: true,
  databaseId: "(default)",
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

// ─── Static Fallback Banks ────────────────────────────────────────────────────

const POLL_TEMPLATES = [
  {
    title: "Who is currently the most complete all-rounder in modern cricket?",
    type: "poll",
    options: [
      { label: "Ravindra Jadeja", isCorrect: false },
      { label: "Ben Stokes", isCorrect: false },
      { label: "Hardik Pandya", isCorrect: false },
      { label: "Shakib Al Hasan", isCorrect: false },
    ],
  },
  {
    title: "Which team will dominate the IPL powerplay overs this season?",
    type: "poll",
    options: [
      { label: "Mumbai Indians", isCorrect: false },
      { label: "Chennai Super Kings", isCorrect: false },
      { label: "Royal Challengers Bengaluru", isCorrect: false },
      { label: "Kolkata Knight Riders", isCorrect: false },
    ],
  },
];

const QUIZ_BANK = {
  Cricket: {
    easy: [
      { question: "How many players are there on a cricket field from one team?", options: ["9", "10", "11", "12"], correctAnswer: "11", points: 10 },
      { question: "What is the length of a standard cricket pitch in yards?", options: ["20 yards", "22 yards", "24 yards", "26 yards"], correctAnswer: "22 yards", points: 10 },
    ],
    medium: [
      { question: "Who was the first batsman to score a double century in ODI cricket?", options: ["Virender Sehwag", "Sachin Tendulkar", "Rohit Sharma", "Chris Gayle"], correctAnswer: "Sachin Tendulkar", points: 15 },
    ],
    difficult: [
      { question: "Who is the only player to score 100 international centuries?", options: ["Sachin Tendulkar", "Virat Kohli", "Ricky Ponting", "Jacques Kallis"], correctAnswer: "Sachin Tendulkar", points: 20 },
    ],
  },
};

const DEFAULT_QUIZ_BANK = {
  easy: [
    { question: "Which sport uses a shuttlecock?", options: ["Tennis", "Badminton", "Squash", "Table Tennis"], correctAnswer: "Badminton", points: 10 },
  ],
  medium: [
    { question: "Who is the legendary sprinter with the world record in 100m?", options: ["Tyson Gay", "Yohan Blake", "Usain Bolt", "Justin Gatlin"], correctAnswer: "Usain Bolt", points: 15 },
  ],
  difficult: [
    { question: "What is the distance of a standard marathon race in miles?", options: ["24.2 miles", "25 miles", "26.2 miles", "27.5 miles"], correctAnswer: "26.2 miles", points: 20 },
  ],
};

const PREDICTION_TEMPLATES = [
  { question: "Who will win the match?", options: ["Home Team", "Away Team", "Draw/No Result"] },
];

// ─── Gemini AI API Client ─────────────────────────────────────────────────────

async function generateWithGemini(prompt, responseSchema = null) {
  if (!GEMINI_API_KEY) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    if (responseSchema) {
      payload.generationConfig.responseSchema = responseSchema;
    }

    const response = await axios.post(url, payload, { timeout: 10000 });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return JSON.parse(text);
    }
  } catch (error) {
    console.error("❌ Gemini API request failed:", error.message);
  }
  return null;
}

// ─── Helper to Fetch Real IDs ─────────────────────────────────────────────────

async function getRealPlayerIds() {
  try {
    const snapshot = await db.collection("PlayerProfiles").limit(10).get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name || doc.data().playerName || "Unknown Player",
    }));
  } catch (e) {
    console.error("Error fetching real player IDs:", e.message);
    return [];
  }
}

async function getRealClubIds() {
  try {
    const snapshot = await db.collection("clubProfiles").limit(10).get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name || doc.data().clubName || "Unknown Club",
    }));
  } catch (e) {
    console.error("Error fetching real club IDs:", e.message);
    return [];
  }
}

// ─── Engagement Generation Functions ──────────────────────────────────────────

// 1. Generate Poll / Quiz
async function generateDailyPoll() {
  console.log("Generating daily poll...");
  let pollData = null;

  if (GEMINI_API_KEY) {
    const prompt = `Generate a single interesting, trending sports poll (about Cricket, Football, or general sports) as JSON. Use this exact schema:
    {
      "title": "Question text (e.g. Who will win the next Ballon d'Or?)",
      "type": "poll" or "quiz",
      "options": [
        { "label": "Option text 1", "isCorrect": false },
        { "label": "Option text 2", "isCorrect": true }
      ]
    }
    Make sure to provide 2 to 4 options. If type is "quiz", mark one option as "isCorrect": true. If type is "poll", all isCorrect must be false.`;

    const schema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        type: { type: "STRING", enum: ["poll", "quiz"] },
        options: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              label: { type: "STRING" },
              isCorrect: { type: "BOOLEAN" },
            },
            required: ["label", "isCorrect"],
          },
        },
      },
      required: ["title", "type", "options"],
    };

    pollData = await generateWithGemini(prompt, schema);
  }

  // Fallback
  if (!pollData) {
    console.log("💡 Using static fallback for Poll.");
    pollData = POLL_TEMPLATES[Math.floor(Math.random() * POLL_TEMPLATES.length)];
  }

  const existing = await db
    .collection("polls")
    .where("title", "==", pollData.title)
    .get();

  if (!existing.empty) {
    console.log("⏭️  Poll already exists. Skipping.");
    return;
  }

  const options = pollData.options.map((o, i) => ({
    id: `opt_${i + 1}`,
    label: o.label,
    votes: 0,
    ...(pollData.type === "quiz" ? { isCorrect: !!o.isCorrect } : {}),
  }));

  const now = admin.firestore.Timestamp.now();
  const endsAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const newPoll = {
    title: pollData.title,
    type: pollData.type,
    options,
    active: true,
    endsAt,
    createdAt: now,
  };

  const docRef = await db.collection("polls").add(newPoll);
  console.log(`✅ Poll created! ID: ${docRef.id} - "${pollData.title}"`);
}

// 2. Generate Fan Battle Quizzes
async function generateFanBattleQuizzes() {
  console.log("Generating Fan Battle Quizzes...");
  const levels = ["easy", "medium", "difficult"];
  const categories = ["Cricket", "Football", "General"];

  for (const level of levels) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    let quizQuestions = null;

    if (GEMINI_API_KEY) {
      const prompt = `Generate a 5-question trivia quiz on category "${category}" and difficulty level "${level}" as JSON. Use this exact schema:
      {
        "questions": [
          {
            "question": "Question text?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": "Option A (must exactly match one of the options)",
            "points": ${level === "easy" ? 10 : level === "medium" ? 15 : 20}
          }
        ]
      }`;

      const schema = {
        type: "OBJECT",
        properties: {
          questions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                question: { type: "STRING" },
                options: { type: "ARRAY", items: { type: "STRING" } },
                correctAnswer: { type: "STRING" },
                points: { type: "INTEGER" },
              },
              required: ["question", "options", "correctAnswer", "points"],
            },
          },
        },
        required: ["questions"],
      };

      const result = await generateWithGemini(prompt, schema);
      if (result && result.questions && result.questions.length > 0) {
        quizQuestions = result.questions.map((q, i) => ({
          questionNumber: i + 1,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
        }));
      }
    }

    // Fallback
    if (!quizQuestions) {
      console.log(`💡 Using static fallback for Quiz (${level} - ${category}).`);
      let questionPool = [];
      if (QUIZ_BANK[category] && QUIZ_BANK[category][level]) {
        questionPool = QUIZ_BANK[category][level];
      } else {
        questionPool = DEFAULT_QUIZ_BANK[level];
      }

      const shuffled = [...questionPool].sort(() => 0.5 - Math.random()).slice(0, 5);
      quizQuestions = shuffled.map((q, i) => ({
        questionNumber: i + 1,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points,
      }));
    }

    const newQuiz = {
      level,
      category,
      questions: quizQuestions,
      totalQuestions: quizQuestions.length,
      totalPoints: quizQuestions.reduce((sum, q) => sum + q.points, 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("fanBattleQuizzes").add(newQuiz);
    console.log(`✅ Fan Battle Quiz (${level} - ${category}) created! ID: ${docRef.id}`);
  }
}

// 3. Generate Fan Battles (Player vs Player / Club vs Club)
async function generateFanBattles() {
  console.log("Generating Fan Battles (Player/Club battles)...");
  const types = ["PLAYERS", "CLUBS"];

  // Fetch real document IDs from db to avoid referential errors
  const realPlayers = await getRealPlayerIds();
  const realClubs = await getRealClubIds();

  for (const type of types) {
    let battleName = "";
    let selectedPlayers = [];
    let selectedClubs = [];

    if (type === "PLAYERS") {
      if (realPlayers.length < 2) {
        console.log("⚠️  Not enough real players in PlayerProfiles. Skipping Players Battle.");
        continue;
      }
      // Shuffle & pick 2 distinct players
      const shuffled = [...realPlayers].sort(() => 0.5 - Math.random());
      const p1 = shuffled[0];
      const p2 = shuffled[1];

      battleName = `${p1.name} vs ${p2.name}`;
      selectedPlayers = [p1.id, p2.id];
    } else {
      if (realClubs.length < 2) {
        console.log("⚠️  Not enough real clubs in clubProfiles. Skipping Clubs Battle.");
        continue;
      }
      // Shuffle & pick 2 distinct clubs
      const shuffled = [...realClubs].sort(() => 0.5 - Math.random());
      const c1 = shuffled[0];
      const c2 = shuffled[1];

      battleName = `${c1.name} vs ${c2.name}`;
      selectedClubs = [c1.id, c2.id];
    }

    const existing = await db
      .collection("fanBattles")
      .where("battleName", "==", battleName)
      .get();

    if (!existing.empty) {
      console.log(`⏭️  Battle "${battleName}" already exists. Skipping.`);
      continue;
    }

    const newBattle = {
      battleName,
      battleType: type,
      selectedPlayers,
      selectedClubs,
      invitedFriends: [],
      userId: "admin",
      userName: "Admin User",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("fanBattles").add(newBattle);
    console.log(`✅ Fan Battle (${type}) created! ID: ${docRef.id} - ${battleName}`);
  }
}

// 4. Generate Predictions for Active Matches
async function generatePredictionsForActiveMatches() {
  console.log("Checking active matches for prediction generation...");
  const matchesSnapshot = await db.collection("watchAlongMatches").get();

  if (matchesSnapshot.empty) {
    console.log("⚠️  No matches found in watchAlongMatches.");
    return;
  }

  let predictionsAddedCount = 0;

  for (const matchDoc of matchesSnapshot.docs) {
    const matchId = matchDoc.id;
    const matchData = matchDoc.data() || {};
    const predictionsSnap = await matchDoc.ref.collection("predictions").limit(1).get();

    if (predictionsSnap.empty) {
      console.log(`Generating predictions for match: ${matchId}`);
      let predictionsList = null;

      const home = matchData.homeTeam || "Home Team";
      const away = matchData.awayTeam || "Away Team";

      if (GEMINI_API_KEY) {
        const prompt = `For a live sports match between "${home}" and "${away}", generate 3 highly engaging match prediction questions as JSON. Use this exact schema:
        {
          "predictions": [
            {
              "question": "Prediction Question (e.g. Will ${home} score in the first half?)",
              "options": ["Yes", "No"]
            }
          ]
        }
        Provide 2 to 4 clear prediction options for each question.`;

        const schema = {
          type: "OBJECT",
          properties: {
            predictions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  question: { type: "STRING" },
                  options: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["question", "options"],
              },
            },
          },
          required: ["predictions"],
        };

        const result = await generateWithGemini(prompt, schema);
        if (result && result.predictions && result.predictions.length > 0) {
          predictionsList = result.predictions;
        }
      }

      // Fallback
      if (!predictionsList) {
        console.log("💡 Using static fallback for Predictions.");
        const shuffledTemplates = [...PREDICTION_TEMPLATES].sort(() => 0.5 - Math.random()).slice(0, 3);
        predictionsList = shuffledTemplates.map((t) => {
          let question = t.question
            .replace("Home Team", home)
            .replace("Away Team", away);
          let options = t.options.map((opt) =>
            opt.replace("Home Team", home).replace("Away Team", away)
          );
          return { question, options };
        });
      }

      for (const t of predictionsList) {
        const votes = {};
        t.options.forEach((opt) => {
          votes[opt] = 0;
        });

        const newPrediction = {
          question: t.question,
          options: t.options,
          votes,
          totalVotes: 0,
          closesAt: Date.now() + 12 * 60 * 60 * 1000,
          isOpen: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await matchDoc.ref.collection("predictions").add(newPrediction);
      }
      predictionsAddedCount++;
      console.log(`✅ 3 Predictions created for match: ${matchId}`);
    }
  }

  console.log(`Done! Predictions generated for ${predictionsAddedCount} matches.`);
}

// ─── Orchestrator / Entry ─────────────────────────────────────────────────────
async function runEngagementAutomation() {
  try {
    console.log("\n🚀 Starting Automated Engagement Content Ingestion");
    console.log("=".repeat(60));

    await generateDailyPoll();
    await generateFanBattleQuizzes();
    await generateFanBattles();
    await generatePredictionsForActiveMatches();

    console.log("=".repeat(60));
    console.log("🎉 Automation Run Complete!");
  } catch (error) {
    console.error("❌ Automation Ingestion Error:", error);
  }
}

// Simple scheduling logic (once every 24 hours)
const intervalMs = 24 * 60 * 60 * 1000;
setInterval(runEngagementAutomation, intervalMs);

// Trigger on start
runEngagementAutomation();
