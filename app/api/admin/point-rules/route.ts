import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// GET: Read all rules
export async function GET(req: NextRequest) {
  try {
    const snapshot = await db.collection("pointRules").get();
    const rules = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    rules.sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({
      success: true,
      rules,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching point rules:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Create or Update rule (CRUD - Create & Update)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ruleId, points, dailyLimit, status } = body;

    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const docRef = db.collection("pointRules").doc(ruleId);
    const doc = await docRef.get();

    const writeData: Record<string, any> = {
      updatedAt: Date.now()
    };

    if (typeof points === "number") writeData.points = points;
    if (typeof dailyLimit === "number") writeData.dailyLimit = dailyLimit;
    if (status && ["active", "inactive", "suspended"].includes(status)) {
      writeData.status = status;
    }

    if (!doc.exists) {
      // Create new rule
      if (writeData.points === undefined) writeData.points = 10; // Default fallback
      if (writeData.dailyLimit === undefined) writeData.dailyLimit = 5; // Default fallback
      if (writeData.status === undefined) writeData.status = "active";
      
      await docRef.set(writeData);
      return NextResponse.json({
        success: true,
        message: `Rule ${ruleId} created successfully`,
        rule: { id: ruleId, ...writeData }
      });
    } else {
      // Update existing rule
      await docRef.update(writeData);
      return NextResponse.json({
        success: true,
        message: `Rule ${ruleId} updated successfully`,
        rule: { id: ruleId, ...doc.data(), ...writeData }
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error saving point rule:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Delete point rule (CRUD - Delete)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const docRef = db.collection("pointRules").doc(ruleId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: `Rule ${ruleId} not found` }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: `Rule ${ruleId} deleted successfully`
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting point rule:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
