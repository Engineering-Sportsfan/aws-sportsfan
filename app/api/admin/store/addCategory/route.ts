import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");

        if (id) {
            const doc = await db.collection("storeCategories").doc(id).get();
            if (!doc.exists) {
                return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: { id: doc.id, ...doc.data() } });
        }

        const snapshot = await db.collection("storeCategories").get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error("Error fetching categories:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch categories" },
            { status: 500 }
        );
    }
}

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

export async function PUT(req: Request) {
    try {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }

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

        const docRef = db.collection("storeCategories").doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            return NextResponse.json({ error: "Category not found" }, { status: 404 });
        }

        const updatedDoc = {
            bgOpacity: Number(bgOpacity) || 0,
            color: color || "",
            icon: icon || "",
            key: key || "",
            label: label || "",
            route: route || "",
            sport: sport || "",
            status: status || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await docRef.update(updatedDoc);

        return NextResponse.json({
            success: true,
            id,
            message: "Category updated successfully"
        }, { status: 200 });

    } catch (error: any) {
        console.error("Error updating category:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update category" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }

        const docRef = db.collection("storeCategories").doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            return NextResponse.json({ error: "Category not found" }, { status: 404 });
        }

        await docRef.delete();

        return NextResponse.json({
            success: true,
            message: "Category deleted successfully"
        }, { status: 200 });

    } catch (error: any) {
        console.error("Error deleting category:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete category" },
            { status: 500 }
        );
    }
}
