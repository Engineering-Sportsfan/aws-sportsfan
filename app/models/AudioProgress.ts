// src/models/AudioProgress.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// ─── Schema / Interface 
export interface IAudioProgress {
  id?: string;
  audioId: string;
  userId: string;
  title: string;
  subtitle?: string;
  elapsed: number;
  durationSeconds: number;
  pct: number;
  url?: string;
  isCompleted: boolean;
  pausedAt: number;
  pointsAwarded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface IAudioProgressInput {
  audioId: string;
  title: string;
  subtitle?: string;
  elapsed: number;
  durationSeconds: number;
  pct: number;
  url?: string;
}

export interface IAudioProgressData {
  audioId: string;
  title: string;
  subtitle: string;
  elapsed: number;
  durationSeconds: number;
  pct: number;
  url: string;
  userId: string;
  isCompleted: boolean;
  pointsAwarded: boolean;
  pausedAt: number;
  createdAt?: number;
  updatedAt: number;
}

export interface ITransactionRecord {
  transactionId: string;
  userId: string;
  audioId: string;
  title: string;
  pct: number;
  reason: string;
  createdAt: number;
}

const COLLECTION = "audioProgress" as const;
const SUB_COLLECTION = "tracks" as const;
const LISTEN_COMPLETE_THRESHOLD = 95;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAudioProgressInput(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!data.audioId || typeof data.audioId !== "string") {
    errors.push("audioId is required and must be a string");
  }

  if (!data.title || typeof data.title !== "string") {
    errors.push("title is required and must be a string");
  }

  if (data.elapsed !== undefined && typeof data.elapsed !== "number") {
    errors.push("elapsed must be a number");
  }

  if (data.durationSeconds !== undefined && typeof data.durationSeconds !== "number") {
    errors.push("durationSeconds must be a number");
  }

  if (data.pct !== undefined) {
    if (typeof data.pct !== "number" || data.pct < 0 || data.pct > 100) {
      errors.push("pct must be a number between 0 and 100");
    }
  }

  return { valid: errors.length === 0, errors };
}

export const AudioProgressModel = {
  async getTrack(userId: string, audioId: string): Promise<IAudioProgress | null> {
    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "GamificationAndWallet",
          Key: {
            userId: `USER#${userId}`,
            sk: `AUDIO_PROGRESS#${audioId}`,
          },
        })
      );
      if (getRes.Item) {
        return getRes.Item as IAudioProgress;
      }
    } catch (e) {
      console.warn("[AudioProgressModel.getTrack] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const doc = await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(SUB_COLLECTION)
        .doc(encodeURIComponent(audioId))
        .get();

      if (doc.exists) {
        const data = doc.data();
        if (data) {
          return {
            id: doc.id,
            audioId: data.audioId,
            userId: data.userId,
            title: data.title,
            subtitle: data.subtitle,
            elapsed: data.elapsed,
            durationSeconds: data.durationSeconds,
            pct: data.pct,
            url: data.url,
            isCompleted: data.isCompleted,
            pausedAt: data.pausedAt,
            pointsAwarded: data.pointsAwarded,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as IAudioProgress;
        }
      }
    }

    return null;
  },

  async getUserInProgressTracks(userId: string, limit = 10): Promise<IAudioProgress[]> {
    // 1. Try DynamoDB
    try {
      const queryRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":uid": `USER#${userId}`,
            ":prefix": "AUDIO_PROGRESS#",
          },
        })
      );

      if (queryRes.Items && queryRes.Items.length > 0) {
        const inProgress = queryRes.Items
          .map((item) => item as IAudioProgress)
          .filter((t) => t.pct > 2 && t.pct < LISTEN_COMPLETE_THRESHOLD)
          .sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0))
          .slice(0, limit);

        if (inProgress.length > 0) return inProgress;
      }
    } catch (e) {
      console.warn("[AudioProgressModel.getUserInProgressTracks] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const snapshot = await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(SUB_COLLECTION)
        .where("pct", ">", 2)
        .where("pct", "<", LISTEN_COMPLETE_THRESHOLD)
        .orderBy("pct")
        .orderBy("pausedAt", "desc")
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          audioId: data.audioId,
          userId: data.userId,
          title: data.title,
          subtitle: data.subtitle,
          elapsed: data.elapsed,
          durationSeconds: data.durationSeconds,
          pct: data.pct,
          url: data.url,
          isCompleted: data.isCompleted,
          pausedAt: data.pausedAt,
          pointsAwarded: data.pointsAwarded,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as IAudioProgress;
      });
    }

    return [];
  },

  async saveProgress(userId: string, input: IAudioProgressInput): Promise<IAudioProgress> {
    const now = Date.now();
    const isCompleted = input.pct >= LISTEN_COMPLETE_THRESHOLD;

    const progressData: IAudioProgress = {
      id: input.audioId,
      audioId: input.audioId,
      userId,
      title: input.title,
      subtitle: input.subtitle || "",
      elapsed: input.elapsed || 0,
      durationSeconds: input.durationSeconds || 0,
      pct: input.pct || 0,
      url: input.url || "",
      isCompleted,
      pointsAwarded: false,
      pausedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Dual write to DynamoDB
    try {
      const dynamoItem = {
        ...progressData,
        userId: `USER#${userId}`,
        sk: `AUDIO_PROGRESS#${input.audioId}`,
      };
      await dualWrite("audioProgress", `${userId}_${encodeURIComponent(input.audioId)}`, "GamificationAndWallet", dynamoItem);
    } catch (e) {
      console.warn("[AudioProgressModel.saveProgress] DynamoDB write notice:", e);
    }

    // Write to Firestore
    if (db) {
      const encodedId = encodeURIComponent(input.audioId);
      const docRef = db
        .collection(COLLECTION)
        .doc(userId)
        .collection(SUB_COLLECTION)
        .doc(encodedId);

      await docRef.set(progressData, { merge: true });
    }

    return progressData;
  },

  async markCompleted(userId: string, audioId: string): Promise<void> {
    await this.deleteProgress(userId, audioId);
  },

  async deleteProgress(userId: string, audioId: string): Promise<void> {
    try {
      await dualDelete("audioProgress", `${userId}_${encodeURIComponent(audioId)}`, "GamificationAndWallet", {
        userId: `USER#${userId}`,
        sk: `AUDIO_PROGRESS#${audioId}`,
      });
    } catch (e) {
      console.warn("[AudioProgressModel.deleteProgress] DynamoDB delete notice:", e);
    }

    if (db) {
      const encodedId = encodeURIComponent(audioId);
      await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(SUB_COLLECTION)
        .doc(encodedId)
        .delete();
    }
  },

  async hasPointsAwarded(userId: string, audioId: string): Promise<boolean> {
    const track = await this.getTrack(userId, audioId);
    return track?.pointsAwarded === true;
  },

  async markPointsAwarded(userId: string, audioId: string): Promise<void> {
    const now = Date.now();
    try {
      const dynamoItem = {
        userId: `USER#${userId}`,
        sk: `AUDIO_PROGRESS#${audioId}`,
        pointsAwarded: true,
        updatedAt: now,
      };
      await dualWrite("audioProgress", `${userId}_${encodeURIComponent(audioId)}`, "GamificationAndWallet", dynamoItem);
    } catch (e) {
      console.warn("[AudioProgressModel.markPointsAwarded] DynamoDB write notice:", e);
    }

    if (db) {
      const encodedId = encodeURIComponent(audioId);
      await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(SUB_COLLECTION)
        .doc(encodedId)
        .update({
          pointsAwarded: true,
          updatedAt: now,
        });
    }
  },

  async getOrCreateTransaction(
    transactionId: string,
    audioId: string,
    userId: string,
    title: string,
    pct: number
  ): Promise<{ exists: boolean; created: boolean }> {
    if (db) {
      const txRef = db.collection("userPointTransactions").doc(transactionId);
      const txSnap = await txRef.get();

      if (txSnap.exists) {
        return { exists: true, created: false };
      }

      const transactionRecord: ITransactionRecord = {
        transactionId,
        userId,
        audioId,
        title,
        pct,
        reason: "LISTEN_COMPLETE",
        createdAt: Date.now(),
      };

      await txRef.set(transactionRecord);
      return { exists: false, created: true };
    }

    return { exists: false, created: true };
  },
};