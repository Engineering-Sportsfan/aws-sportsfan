// api/admin/automate-engagements/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import axios from "axios";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

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

const QUIZ_BANK: Record<string, Record<string, Array<{ question: string; options: string[]; correctAnswer: string; points: number }>>> = {
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

const DEFAULT_QUIZ_BANK: Record<string, Array<{ question: string; options: string[]; correctAnswer: string; points: number }>> = {
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
  // Try DynamoDB SportsData first
  try {
    const scanRes = await docClient.send(new ScanCommand({
      TableName: "IdentityAndAccess",
      FilterExpression: "begins_with(entityId, :p)",
      ExpressionAttributeValues: { ":p": "PROFILE_PLAYER#" },
      Limit: 10
    }));
    if (scanRes.Items && scanRes.Items.length > 0) {
      return scanRes.Items.map(item => ({
        id: (item.entityId as string).replace(/^PROFILE_PLAYER#/, ""),
        name: item.name || item.playerName || "Unknown Player"
      }));
    }
  } catch (e) {
    console.warn("DynamoDB getRealPlayerIds notice:", e);
  }

  // Fallback to Firestore
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
  // Try DynamoDB SportsData first
  try {
    const scanRes = await docClient.send(new ScanCommand({
      TableName: "IdentityAndAccess",
      FilterExpression: "begins_with(entityId, :p)",
      ExpressionAttributeValues: { ":p": "PROFILE_CLUB#" },
      Limit: 10
    }));
    if (scanRes.Items && scanRes.Items.length > 0) {
      return scanRes.Items.map(item => ({
        id: (item.entityId as string).replace(/^PROFILE_CLUB#/, ""),
        name: item.name || item.clubName || "Unknown Club"
      }));
    }
  } catch (e) {
    console.warn("DynamoDB getRealClubIds notice:", e);
  }

  // Fallback to Firestore
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

// ─── Route Handlers ───────────────────────────────────────────────────────────

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

    const nowEpoch = Date.now();

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

    // Check existing poll in DynamoDB
    let pollExists = false;
    try {
      const scanPolls = await docClient.send(new ScanCommand({
        TableName: "SocialAndContent",
        FilterExpression: "begins_with(contentId, :p) AND title = :title",
        ExpressionAttributeValues: {
          ":p": "POLL#",
          ":title": pollData.title
        }
      }));
      if (scanPolls.Items && scanPolls.Items.length > 0) {
        pollExists = true;
      }
    } catch (e) {
      console.warn("DynamoDB poll exists scan notice:", e);
    }

    if (!pollExists) {
      const existingPollFS = await db
        .collection("polls")
        .where("title", "==", pollData.title)
        .get();
      if (!existingPollFS.empty) {
        pollExists = true;
      }
    }

    if (!pollExists) {
      const pollId = uuidv4();
      const options = pollData.options.map((o: any, i: number) => ({
        id: `opt_${i + 1}`,
        label: o.label,
        votes: 0,
        ...(pollData.type === "quiz" ? { isCorrect: !!o.isCorrect } : {}),
      }));

      const endsAtEpoch = nowEpoch + 24 * 60 * 60 * 1000;

      // Put to DynamoDB
      try {
        await docClient.send(new PutCommand({
          TableName: "SocialAndContent",
          Item: {
            contentId: `POLL#${pollId}`,
            sk: "POLL#META",
            id: pollId,
            title: pollData.title,
            type: pollData.type,
            options,
            active: true,
            endsAt: endsAtEpoch,
            createdAt: nowEpoch,
            updatedAt: nowEpoch
          }
        }));
      } catch (dynErr) {
        console.warn("DynamoDB write poll failed:", dynErr);
      }

      // Sync to Firestore
      try {
        const fsEndsAt = Timestamp.fromDate(new Date(endsAtEpoch));
        const fsCreatedAt = Timestamp.fromDate(new Date(nowEpoch));
        await db.collection("polls").doc(pollId).set({
          title: pollData.title,
          type: pollData.type,
          options,
          active: true,
          endsAt: fsEndsAt,
          createdAt: fsCreatedAt,
        });
      } catch (fsErr) {
        console.warn("Firestore sync poll failed:", fsErr);
      }

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
        const quizId = uuidv4();
        const totalPoints = quizQuestions.reduce((sum: number, q: any) => sum + q.points, 0);

        // Put in DynamoDB GamificationAndWallet
        try {
          await docClient.send(new PutCommand({
            TableName: "GamificationAndWallet",
            Item: {
              userId: `USER#${quizId}`,
              sk: `BATTLE_QUIZ#${quizId}#${nowEpoch}`,
              id: quizId,
              level,
              category,
              questions: quizQuestions,
              totalQuestions: quizQuestions.length,
              totalPoints,
              createdAt: nowEpoch,
              updatedAt: nowEpoch
            }
          }));
        } catch (dynErr) {
          console.warn("DynamoDB write fanBattleQuiz failed:", dynErr);
        }

        // Sync to Firestore
        try {
          await db.collection("fanBattleQuizzes").doc(quizId).set({
            level,
            category,
            questions: quizQuestions,
            totalQuestions: quizQuestions.length,
            totalPoints,
            createdAt: nowEpoch,
            updatedAt: nowEpoch,
          });
        } catch (fsErr) {
          console.warn("Firestore sync fanBattleQuiz failed:", fsErr);
        }

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

      // Check existing in DynamoDB
      let battleExists = false;
      try {
        const scanBattles = await docClient.send(new ScanCommand({
          TableName: "GamificationAndWallet",
          FilterExpression: "begins_with(sk, :p) AND battleName = :name",
          ExpressionAttributeValues: {
            ":p": "BATTLE_FAN#",
            ":name": battleName
          }
        }));
        if (scanBattles.Items && scanBattles.Items.length > 0) {
          battleExists = true;
        }
      } catch (e) {
        console.warn("DynamoDB scan battles notice:", e);
      }

      if (!battleExists) {
        const existingBattleFS = await db
          .collection("fanBattles")
          .where("battleName", "==", battleName)
          .get();
        if (!existingBattleFS.empty) {
          battleExists = true;
        }
      }

      if (!battleExists) {
        const battleId = uuidv4();

        // Put to DynamoDB
        try {
          await docClient.send(new PutCommand({
            TableName: "GamificationAndWallet",
            Item: {
              userId: "USER#admin",
              sk: `BATTLE_FAN#${battleId}#${nowEpoch}`,
              id: battleId,
              battleName,
              battleType: type,
              selectedPlayers,
              selectedClubs,
              invitedFriends: [],
              userIdAdmin: "admin",
              userName: "Admin User",
              createdAt: nowEpoch,
              updatedAt: nowEpoch
            }
          }));
        } catch (dynErr) {
          console.warn("DynamoDB write fanBattle failed:", dynErr);
        }

        // Sync to Firestore
        try {
          await db.collection("fanBattles").doc(battleId).set({
            battleName,
            battleType: type,
            selectedPlayers,
            selectedClubs,
            invitedFriends: [],
            userId: "admin",
            userName: "Admin User",
            createdAt: nowEpoch,
            updatedAt: nowEpoch,
          });
        } catch (fsErr) {
          console.warn("Firestore sync fanBattle failed:", fsErr);
        }

        results.battlesCreated++;
      }
    }

    // 4. Generate Predictions for Active Matches
    let matchesList: any[] = [];
    let fetchedMatches = false;

    // Try DynamoDB SportsData first
    try {
      const scanMatches = await docClient.send(new ScanCommand({
        TableName: "SportsData",
        FilterExpression: "sk = :skMeta AND (begins_with(entityId, :matchPrefix) OR begins_with(entityId, :watchPrefix))",
        ExpressionAttributeValues: {
          ":skMeta": "MATCH#META",
          ":matchPrefix": "MATCH#",
          ":watchPrefix": "WATCHALONG_MATCH#"
        }
      }));
      if (scanMatches.Items && scanMatches.Items.length > 0) {
        matchesList = scanMatches.Items.map(item => ({
          id: (item.entityId as string).replace(/^(MATCH#|WATCHALONG_MATCH#)/, ""),
          ...item
        }));
        fetchedMatches = true;
      }
    } catch (e) {
      console.warn("DynamoDB watchAlongMatches scan notice:", e);
    }

    // Fallback to Firestore
    if (!fetchedMatches || matchesList.length === 0) {
      try {
        const matchesSnapshot = await db.collection("watchAlongMatches").get();
        matchesList = matchesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (e) {
        console.error("Firestore get matches list failed:", e);
      }
    }

    for (const match of matchesList) {
      const matchId = match.id;
      const home = match.homeTeam || "Home Team";
      const away = match.awayTeam || "Away Team";

      // Check if predictions already exist in DynamoDB
      let predictionExists = false;
      try {
        const qPreds = await docClient.send(new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :pfx)",
          ExpressionAttributeValues: {
            ":uid": `MATCH#${matchId}`,
            ":pfx": "PREDICTION#"
          },
          Limit: 1
        }));
        if (qPreds.Items && qPreds.Items.length > 0) {
          predictionExists = true;
        }
      } catch (e) {
        console.warn("DynamoDB match predictions query notice:", e);
      }

      if (!predictionExists) {
        // Fallback check in Firestore
        try {
          const predsSnap = await db.collection("watchAlongMatches").doc(matchId).collection("predictions").limit(1).get();
          if (!predsSnap.empty) {
            predictionExists = true;
          }
        } catch (e) {}
      }

      if (!predictionExists) {
        let predictionsList: any = null;

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
          const predictionId = uuidv4();
          const votes: Record<string, number> = {};
          t.options.forEach((opt: string) => {
            votes[opt] = 0;
          });

          const closesAtEpoch = nowEpoch + 12 * 60 * 60 * 1000;

          // Put to DynamoDB
          try {
            await docClient.send(new PutCommand({
              TableName: "GamificationAndWallet",
              Item: {
                userId: `MATCH#${matchId}`,
                sk: `PREDICTION#${predictionId}`,
                id: predictionId,
                question: t.question,
                options: t.options,
                votes,
                totalVotes: 0,
                closesAt: closesAtEpoch,
                isOpen: true,
                createdAt: nowEpoch,
                updatedAt: nowEpoch
              }
            }));
          } catch (dynErr) {
            console.warn("DynamoDB write prediction failed:", dynErr);
          }

          // Sync to Firestore
          try {
            await db.collection("watchAlongMatches").doc(matchId).collection("predictions").doc(predictionId).set({
              question: t.question,
              options: t.options,
              votes,
              totalVotes: 0,
              closesAt: closesAtEpoch,
              isOpen: true,
              createdAt: nowEpoch,
              updatedAt: nowEpoch,
            });
          } catch (fsErr) {
            console.warn("Firestore sync prediction failed:", fsErr);
          }
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
