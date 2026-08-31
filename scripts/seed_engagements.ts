// scripts/seed_engagements.ts — Seeds initial 4 engagement widgets into DynamoDB and Firestore
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");
if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
  let body = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").trim().replace(/ /g, "\n");
  privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } catch (e) {
    console.warn("Firebase init notice:", e);
  }
}
const db = admin.apps.length ? admin.firestore() : null;

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const SEED_ENGAGEMENTS = [
  // 1. Fan Battle
  {
    id: "eng_fanbattle_virat_vs_babar",
    type: "fan_battle",
    title: "Fan Battle · Who wins your vote?",
    tags: ["⚔️ FAN BATTLE", "🔥 TRENDING"],
    sport: "cricket",
    status: "active",
    fanBattleData: {
      leftCompetitor: { code: "IN", name: "Virat Kohli", stat: "Avg 58.6 in Tests", votes: 2364 },
      rightCompetitor: { code: "PK", name: "Babar Azam", stat: "Avg 44.8 in Tests", votes: 1448 },
      totalVotes: 3812,
    },
    likes: 1524,
    shares: 312,
    totalEngaged: 3812,
    createdAt: Date.now() - 1000 * 60 * 45,
    updatedAt: Date.now(),
  },

  // 2. Quiz
  {
    id: "eng_quiz_virat_test_centuries",
    type: "quiz",
    title: "Quick Cricket Quiz",
    tags: ["🧠 QUIZ", "⭐ 50 PTS"],
    sport: "cricket",
    status: "active",
    quizData: {
      question: "How many Test centuries has Virat Kohli scored?",
      options: [
        { id: "A", text: "27" },
        { id: "B", text: "29" },
        { id: "C", text: "30" },
        { id: "D", text: "32" },
      ],
      correctOptionId: "B",
      pointsReward: 50,
      explanation: "Correct: 29",
    },
    likes: 856,
    shares: 145,
    totalEngaged: 2140,
    createdAt: Date.now() - 1000 * 60 * 30,
    updatedAt: Date.now(),
  },

  // 3. Poll
  {
    id: "eng_poll_galle_wickets",
    type: "poll",
    title: "Who takes more wickets in Galle?",
    tags: ["📊 POLL"],
    sport: "cricket",
    status: "active",
    pollData: {
      question: "Who takes more wickets in Galle?",
      options: [
        { id: "1", text: "Jasprit Bumrah 🏏", votes: 2485 },
        { id: "2", text: "Maheesh Theekshana 🌀", votes: 1639 },
        { id: "3", text: "Ravindra Jadeja 🍌", votes: 1164 },
      ],
      totalVotes: 5288,
    },
    likes: 2115,
    shares: 420,
    totalEngaged: 5288,
    createdAt: Date.now() - 1000 * 60 * 15,
    updatedAt: Date.now(),
  },

  // 4. Prediction
  {
    id: "eng_pred_galle_test_outcome",
    type: "prediction",
    title: "Predict the outcome!",
    tags: ["🎯 PREDICTION", "💎 POINTS"],
    sport: "cricket",
    status: "active",
    predictionData: {
      question: "India win the 1st Galle Test?",
      leftChoice: { id: "left", text: "Yes, India win", code: "IN", votes: 1351 },
      rightChoice: { id: "right", text: "SL hold / win", code: "LK", votes: 552 },
      coinStake: 25,
      totalVotes: 1903,
      status: "open",
    },
    likes: 761,
    shares: 180,
    totalEngaged: 1903,
    createdAt: Date.now() - 1000 * 60 * 5,
    updatedAt: Date.now(),
  },
];

async function seed() {
  console.log("🌱 Seeding 4 interactive engagements into DynamoDB & Firestore...");

  for (const item of SEED_ENGAGEMENTS) {
    const dynamoItem = {
      contentId: `ENGAGEMENT#${item.id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${item.type.toUpperCase()}`,
      ...item,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: "SocialAndContent",
          Item: dynamoItem,
        })
      );
      console.log(`✅ [DynamoDB SocialAndContent] Seeded: ${item.title} (${item.type})`);
    } catch (err: any) {
      console.warn(`❌ [DynamoDB] Failed to seed ${item.id}:`, err?.message || err);
    }

    if (db) {
      try {
        await db.collection("engagements").doc(item.id).set(item);
        console.log(`✅ [Firestore engagements] Seeded: ${item.id}`);
      } catch (err: any) {
        console.warn(`❌ [Firestore] Failed to seed ${item.id}:`, err?.message || err);
      }
    }
  }

  console.log("✨ Seeding completed successfully!");
}

seed();
