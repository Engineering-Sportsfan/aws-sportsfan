// app/api/admin/flipline-bots/route.ts — API to fetch and manage FlipLine bot profiles in IdentityAndAccess table
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export const DEFAULT_FLIPLINE_BOTS = [
  {
    id: "bot_kabir_sharma",
    userId: "bot_kabir_sharma",
    name: "Kabir Sharma",
    firstName: "Kabir",
    lastName: "Sharma",
    displayName: "Kabir Sharma (SF360)",
    handle: "@kabir_sf360",
    email: "kabir.sharma@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Senior Analyst",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Verified Analyst",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    bio: "Senior Sports Analyst & Commentator at SF360. Breaking down tactical gameplay, match stats, and live insights across all sports.",
    status: "active",
  },
  {
    id: "bot_riya_kapoor",
    userId: "bot_riya_kapoor",
    name: "Riya Kapoor",
    firstName: "Riya",
    lastName: "Kapoor",
    displayName: "Riya Kapoor (SF360)",
    handle: "@riya_sf360",
    email: "riya.kapoor@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Sports Insider",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Verified Insider",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    bio: "Official SF360 Sports Insider. Bringing you locker room updates, tournament highlights, and live ground reports.",
    status: "active",
  },
  {
    id: "bot_neha_iyer",
    userId: "bot_neha_iyer",
    name: "Neha Iyer",
    firstName: "Neha",
    lastName: "Iyer",
    displayName: "Neha Iyer (SF360)",
    handle: "@neha_sf360",
    email: "neha.iyer@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Community Host",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Community Lead",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    bio: "Community Host at SF360. Connecting fans across cricket, football, athletics, and general sports discussions.",
    status: "active",
  },
  {
    id: "bot_arjun_mehta",
    userId: "bot_arjun_mehta",
    name: "Arjun Mehta",
    firstName: "Arjun",
    lastName: "Mehta",
    displayName: "Arjun Mehta (SF360)",
    handle: "@arjun_sf360",
    email: "arjun.mehta@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Tactical Specialist",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Tactical Specialist",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    bio: "Tactical Specialist & Match Form Analyst. Sharing in-depth player statistics, key matchups, and game breakdowns.",
    status: "active",
  },
];

// ─── GET /api/admin/flipline-bots — Fetch all bot profiles (auto-seeds if missing) ─
export async function GET() {
  try {
    const botsMap = new Map<string, any>();

    // 1. Fetch from DynamoDB IdentityAndAccess
    try {
      for (const defaultBot of DEFAULT_FLIPLINE_BOTS) {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${defaultBot.email}`, sk: "USER#META" },
          })
        );

        if (getRes.Item) {
          botsMap.set(defaultBot.id, {
            ...defaultBot,
            ...getRes.Item,
          });
        } else {
          // Auto-seed this bot into IdentityAndAccess
          const itemData = {
            entityId: `USER#${defaultBot.email}`,
            sk: "USER#META",
            ...defaultBot,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          await docClient.send(
            new PutCommand({
              TableName: "IdentityAndAccess",
              Item: itemData,
            })
          );

          await docClient.send(
            new PutCommand({
              TableName: "IdentityAndAccess",
              Item: {
                ...itemData,
                entityId: `USER#${defaultBot.userId}`,
                sk: "USER#META",
              },
            })
          );

          if (db) {
            try {
              await db.collection("users").doc(defaultBot.email).set(itemData, { merge: true });
            } catch {}
          }

          botsMap.set(defaultBot.id, itemData);
        }
      }
    } catch (dynErr: any) {
      console.warn("DynamoDB bots fetch notice:", dynErr?.message || dynErr);
    }

    // Fallback: Ensure all 4 bots exist in array
    const bots = DEFAULT_FLIPLINE_BOTS.map((base) => botsMap.get(base.id) || base);

    return NextResponse.json({
      success: true,
      bots,
      total: bots.length,
    });
  } catch (error: unknown) {
    console.error("GET /api/admin/flipline-bots error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch bot profiles";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
