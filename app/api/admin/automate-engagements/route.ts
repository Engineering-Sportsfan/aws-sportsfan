import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import axios from "axios";

// ─── Static Fallbacks ─────────────────────────────────────────────────────────

const POLL_TEMPLATES = [
  {
    title: "Who is currently the most complete all-rounder in modern cricket?",
    type: "poll" as const,
    options: [
      { label: "Ravindra Jadeja", isCorrect: false },
      { label: "Ben Stokes", isCorrect: false },
      { label: "Hardik Pandya", isCorrect: false },
      { label: "Shakib Al Hasan", isCorrect: false },
    ],
  },
  {
    title: "Which team will dominate the IPL powerplay overs this season?",
    type: "poll" as const,
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

// ─── Gemini Client ────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

async function generateWithGemini(prompt: string, responseSchema: any = null) {
  if (!GEMINI_API_KEY) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload: any = {
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
    console.error("❌ Gemini API request failed in route:", error);
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
    console.error("Error fetching real player IDs in route:", e);
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
    console.error("Error fetching real club IDs in route:", e);
    return [];
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return handleAutomation();
}

export async function POST(req: NextRequest) {
  return handleAutomation();
}

async function handleAutomation() {
  try {
    const results = {
      pollCreated: false,
      quizzesCreated: 0,
      battlesCreated: 0,
      matchesPredicted: 0,
    };

    // 1. Generate Poll / Quiz
    let pollData: any = null;
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

    if (!pollData) {
      pollData = POLL_TEMPLATES[Math.floor(Math.random() * POLL_TEMPLATES.length)];
    }

    const existingPoll = await db
      .collection("polls")
      .where("title", "==", pollData.title)
      .get();

    if (existingPoll.empty) {
      const options = pollData.options.map((o: any, i: number) => ({
        id: `opt_${i + 1}`,
        label: o.label,
        votes: 0,
        ...(pollData.type === "quiz" ? { isCorrect: !!o.isCorrect } : {}),
      }));

      const now = Timestamp.now();
      const endsAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

      await db.collection("polls").add({
        title: pollData.title,
        type: pollData.type,
        options,
        active: true,
        endsAt,
        createdAt: now,
      });
      results.pollCreated = true;
    }

    // 2. Generate Fan Battle Quizzes
    const levels = ["easy", "medium", "difficult"] as const;
    const categories = ["Cricket", "Football"] as const;

    for (const level of levels) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      let quizQuestions: any = null;

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
          quizQuestions = result.questions.map((q: any, i: number) => ({
            questionNumber: i + 1,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            points: q.points,
          }));
        }
      }

      if (!quizQuestions) {
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

      if (quizQuestions.length > 0) {
        await db.collection("fanBattleQuizzes").add({
          level,
          category,
          questions: quizQuestions,
          totalQuestions: quizQuestions.length,
          totalPoints: quizQuestions.reduce((sum: number, q: any) => sum + q.points, 0),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        results.quizzesCreated++;
      }
    }

    // 3. Generate Fan Battles
    const types = ["PLAYERS", "CLUBS"] as const;
    const realPlayers = await getRealPlayerIds();
    const realClubs = await getRealClubIds();

    for (const type of types) {
      let battleName = "";
      let selectedPlayers: string[] = [];
      let selectedClubs: string[] = [];

      if (type === "PLAYERS") {
        if (realPlayers.length < 2) continue;
        const shuffled = [...realPlayers].sort(() => 0.5 - Math.random());
        battleName = `${shuffled[0].name} vs ${shuffled[1].name}`;
        selectedPlayers = [shuffled[0].id, shuffled[1].id];
      } else {
        if (realClubs.length < 2) continue;
        const shuffled = [...realClubs].sort(() => 0.5 - Math.random());
        battleName = `${shuffled[0].name} vs ${shuffled[1].name}`;
        selectedClubs = [shuffled[0].id, shuffled[1].id];
      }

      const existingBattle = await db
        .collection("fanBattles")
        .where("battleName", "==", battleName)
        .get();

      if (existingBattle.empty) {
        await db.collection("fanBattles").add({
          battleName,
          battleType: type,
          selectedPlayers,
          selectedClubs,
          invitedFriends: [],
          userId: "admin",
          userName: "Admin User",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        results.battlesCreated++;
      }
    }

    // 4. Generate Predictions for Active Matches
    const matchesSnapshot = await db.collection("watchAlongMatches").get();
    for (const matchDoc of matchesSnapshot.docs) {
      const matchId = matchDoc.id;
      const matchData = matchDoc.data() || {};
      const predictionsSnap = await matchDoc.ref.collection("predictions").limit(1).get();

      if (predictionsSnap.empty) {
        let predictionsList: any = null;
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
          }`;

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

        if (!predictionsList) {
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
          const votes: Record<string, number> = {};
          t.options.forEach((opt: string) => {
            votes[opt] = 0;
          });

          await matchDoc.ref.collection("predictions").add({
            question: t.question,
            options: t.options,
            votes,
            totalVotes: 0,
            closesAt: Date.now() + 12 * 60 * 60 * 1000,
            isOpen: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        results.matchesPredicted++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Automated engagements created successfully!",
      results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
