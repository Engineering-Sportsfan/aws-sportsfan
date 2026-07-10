// src/models/AudioProgress.ts
import { db } from "@/lib/firebaseAdmin";


// ─── Schema / Interface 
export interface IAudioProgress {
  id?: string;
  audioId: string;
  userId: string;
  title: string;
  subtitle?: string;
  elapsed: number;           // seconds listened
  durationSeconds: number;   // total duration
  pct: number;               // percentage (0-100)
  url?: string;
  isCompleted: boolean;      // true if pct >= 95
  pausedAt: number;          // timestamp of last update
  pointsAwarded: boolean;    // whether points already given
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

// ─── Constants ────────────────────────────────────────────────────────────────
const COLLECTION = "audioProgress" as const;
const SUB_COLLECTION = "tracks" as const;
const LISTEN_COMPLETE_THRESHOLD = 95; // % to consider as completed

// ─── Validation Function (no 'any') ──────────────────────────────────────────
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

// ─── Model with CRUD Operations ──────────────────────────────────────────────
export const AudioProgressModel = {
  /**
   * Get user's track progress
   */
  async getTrack(userId: string, audioId: string): Promise<IAudioProgress | null> {
    const doc = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUB_COLLECTION)
      .doc(encodeURIComponent(audioId))
      .get();

    if (!doc.exists) return null;
    
    const data = doc.data();
    if (!data) return null;
    
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
  },

  /**
   * Get all in-progress tracks for user (for Continue Listening)
   * Returns tracks between 2% and 95% completed
   */
  async getUserInProgressTracks(userId: string, limit = 10): Promise<IAudioProgress[]> {
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
  },

  /**
   * Save or update track progress
   */
  async saveProgress(userId: string, input: IAudioProgressInput): Promise<IAudioProgress> {
    const now = Date.now();
    const encodedId = encodeURIComponent(input.audioId);
    const docRef = db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUB_COLLECTION)
      .doc(encodedId);

    const existing = await docRef.get();
    const isCompleted = input.pct >= LISTEN_COMPLETE_THRESHOLD;

    if (!existing.exists) {
      // New record
      const newData: IAudioProgressData = {
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
      await docRef.set(newData);
      
      const created = await docRef.get();
      const createdData = created.data();
      if (!createdData) throw new Error("Failed to create progress record");
      
      return {
        id: created.id,
        audioId: createdData.audioId,
        userId: createdData.userId,
        title: createdData.title,
        subtitle: createdData.subtitle,
        elapsed: createdData.elapsed,
        durationSeconds: createdData.durationSeconds,
        pct: createdData.pct,
        url: createdData.url,
        isCompleted: createdData.isCompleted,
        pausedAt: createdData.pausedAt,
        pointsAwarded: createdData.pointsAwarded,
        createdAt: createdData.createdAt,
        updatedAt: createdData.updatedAt,
      };
    }

    // Update existing
    const updateData: Partial<IAudioProgressData> = {
      title: input.title,
      subtitle: input.subtitle || "",
      elapsed: input.elapsed || 0,
      durationSeconds: input.durationSeconds || 0,
      pct: input.pct || 0,
      url: input.url || "",
      isCompleted,
      pausedAt: now,
      updatedAt: now,
    };
    
    await docRef.update(updateData);
    
    const updated = await docRef.get();
    const updatedData = updated.data();
    if (!updatedData) throw new Error("Failed to update progress record");
    
    return {
      id: updated.id,
      audioId: updatedData.audioId,
      userId: updatedData.userId,
      title: updatedData.title,
      subtitle: updatedData.subtitle,
      elapsed: updatedData.elapsed,
      durationSeconds: updatedData.durationSeconds,
      pct: updatedData.pct,
      url: updatedData.url,
      isCompleted: updatedData.isCompleted,
      pausedAt: updatedData.pausedAt,
      pointsAwarded: updatedData.pointsAwarded,
      createdAt: updatedData.createdAt,
      updatedAt: updatedData.updatedAt,
    };
  },

  /**
   * Mark track as completed (pct >= 95) and delete from progress
   */
  async markCompleted(userId: string, audioId: string): Promise<void> {
    const encodedId = encodeURIComponent(audioId);
    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUB_COLLECTION)
      .doc(encodedId)
      .delete();
  },

  /**
   * Delete track progress (user dismissed or finished)
   */
  async deleteProgress(userId: string, audioId: string): Promise<void> {
    const encodedId = encodeURIComponent(audioId);
    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUB_COLLECTION)
      .doc(encodedId)
      .delete();
  },

  /**
   * Check if points already awarded for this track
   */
  async hasPointsAwarded(userId: string, audioId: string): Promise<boolean> {
    const doc = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUB_COLLECTION)
      .doc(encodeURIComponent(audioId))
      .get();

    if (!doc.exists) return false;
    const data = doc.data();
    if (!data) return false;
    return data.pointsAwarded === true;
  },

  /**
   * Mark points as awarded for this track
   */
  async markPointsAwarded(userId: string, audioId: string): Promise<void> {
    const encodedId = encodeURIComponent(audioId);
    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUB_COLLECTION)
      .doc(encodedId)
      .update({
        pointsAwarded: true,
        updatedAt: Date.now(),
      });
  },

  /**
   * Get or create transaction record for points awarding
   */
  async getOrCreateTransaction(
    transactionId: string,
    audioId: string,
    userId: string,
    title: string,
    pct: number
  ): Promise<{ exists: boolean; created: boolean }> {
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
  },
};