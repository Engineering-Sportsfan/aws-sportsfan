import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        const {
            bgOpacity,
            color,
            icon,
            key,
            label,
            route,
            sport,
            status,
        } = body;
        
        if (!key || !label || !sport || !status) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const newDoc = {
            bgOpacity: Number(bgOpacity) || 0,
            color: color || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            icon: icon || "",
            key: key || "",
            label: label || "",
            route: route || "",
            sport: sport || "",
            status: status || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection("storeCategories").add(newDoc);

        return NextResponse.json({
            success: true,
            id: docRef.id,
            message: "Category added successfully"
        }, { status: 201 });

    } catch (error: any) {
        console.error("Error adding category:", error);
        return NextResponse.json(
            { error: error.message || "Failed to add category" },
            { status: 500 }
        );
    }
}
