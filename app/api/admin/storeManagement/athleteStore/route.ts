import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * GET Handler
 * - Query parameters:
 *   - `id`: string (optional) -> returns a single order
 *   - `category`: string (optional) -> filter by category (e.g. Athletes, Merchandise, Events, etc.)
 *   - `status`: string (optional) -> filter by order status
 *   - `search`: string (optional) -> search across orderId, userId, title, athleteName
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.toLowerCase().trim();

    if (id) {
      const docSnap = await db.collection("storeOrders").doc(id).get();
      if (!docSnap.exists) {
        return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
      }
      const data = docSnap.data();
      const createdAt = data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data?.createdAt || null;
      const updatedAt = data?.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data?.updatedAt || null;

      return NextResponse.json({
        success: true,
        data: { id: docSnap.id, ...data, createdAt, updatedAt },
      });
    }

    const snapshot = await db.collection("storeOrders").get();
    let orders = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null;
      const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null;

      return {
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      };
    });

    // Apply Category Filter
    if (category && category !== "all") {
      orders = orders.filter((o: any) => {
        const cat = (o.category || o.productType || "").toLowerCase();
        return cat === category.toLowerCase();
      });
    }

    // Apply Status Filter
    if (status && status !== "all") {
      orders = orders.filter((o: any) => {
        const st = (o.status || "").toLowerCase();
        return st === status.toLowerCase();
      });
    }

    // Apply Search Filter
    if (search) {
      orders = orders.filter((o: any) => {
        const orderIdMatch = (o.orderId || o.id || "").toLowerCase().includes(search);
        const userIdMatch = (o.userId || "").toLowerCase().includes(search);
        const titleMatch = (o.title || o.listingTitle || "").toLowerCase().includes(search);
        const athleteMatch = (o.athleteName || "").toLowerCase().includes(search);
        return orderIdMatch || userIdMatch || titleMatch || athleteMatch;
      });
    }

    // Sort by createdAt descending
    orders.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json({
      success: true,
      total: orders.length,
      data: orders,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/admin/storeManagement/athleteStore:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT Handler
 * - Updates order status, delivery status, notes, or checked-in state
 */
export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const body = await req.json();
    const orderIdToUpdate = id || body.id || body.orderId;

    if (!orderIdToUpdate) {
      return NextResponse.json({ success: false, error: "Order ID is required" }, { status: 400 });
    }

    const docRef = db.collection("storeOrders").doc(orderIdToUpdate);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const updateFields: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.status !== undefined) updateFields.status = body.status;
    if (body.deliveryStatus !== undefined) updateFields.deliveryStatus = body.deliveryStatus;
    if (body.trackingNumber !== undefined) updateFields.trackingNumber = body.trackingNumber;
    if (body.adminNotes !== undefined) updateFields.adminNotes = body.adminNotes;
    if (body.checkedIn !== undefined) {
      updateFields.checkedIn = Boolean(body.checkedIn);
      if (body.checkedIn === true && !docSnap.data()?.checkedInAt) {
        updateFields.checkedInAt = FieldValue.serverTimestamp();
      }
    }

    await docRef.update(updateFields);

    return NextResponse.json({
      success: true,
      message: "Order updated successfully",
      id: orderIdToUpdate,
    });
  } catch (error: unknown) {
    console.error("Error in PUT /api/admin/storeManagement/athleteStore:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE Handler
 * - Deletes an order by ID
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Order ID is required" }, { status: 400 });
    }

    const docRef = db.collection("storeOrders").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: "Order deleted successfully",
      id,
    });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/admin/storeManagement/athleteStore:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
