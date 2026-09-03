// // lib/auth.config.ts
// import NextAuth from "next-auth";
// import GoogleProvider from "next-auth/providers/google";
// import { db } from "@/lib/firebaseAdmin";

// export const { handlers, auth, signIn, signOut } = NextAuth({
//   providers: [
//     GoogleProvider({
//       clientId:     process.env.GOOGLE_CLIENT_ID!,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
//     }),
//   ],

//   callbacks: {
//     async signIn({ user }) {
//       try {
//         const email = user.email!;
//         const userRef = db.collection("users").doc(email);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//           const nameParts = (user.name ?? "").split(" ");
//           await userRef.set({
//             email,
//             firstName:  nameParts[0]  ?? "",
//             lastName:   nameParts.slice(1).join(" ") ?? "",
//             userId: `google_${email.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`,
//             avatar:     user.image    ?? "",
//             provider:   "google",
//             isVerified: true,
//             status:     "active",
//             role:       "user",
//             createdAt:  Date.now(),
//             updatedAt:  Date.now(),
//           });
//         } else {
//           const data = userDoc.data()!;
//           if (data.status === "disabled") return false;
//           await userRef.update({
//             lastLoginAt: Date.now(),
//             updatedAt:   Date.now(),
//           });
//         }
//         return true;
//       } catch (error) {
//         console.error("Google signIn error:", error);
//         return false;
//       }
//     },

//     async jwt({ token, user, account }) {
//       if (account?.provider === "google" && user?.email) {
//         try {
//           const userDoc = await db.collection("users").doc(user.email).get();
//           if (userDoc.exists) {
//             const data = userDoc.data()!;
//             token.role   = data.role   ?? "user";
//             token.status = data.status ?? "active";
//             token.dbUser = {
//               email:     data.email,
//               firstName: data.firstName,
//               lastName:  data.lastName,
//               role:      data.role   ?? "user",
//               status:    data.status ?? "active",
//                userId:    data.userId,
//             };
//           }
//         } catch (error) {
//           console.error("JWT callback error:", error);
//         }
//       }
//       return token;
//     },

//     async session({ session, token }) {
//       if (token.dbUser) {
//         session.user = {
//           ...session.user,
//           ...(token.dbUser as object),
//         };
//       }
//       return session;
//     },
//   },

//   pages: {
//     signIn: "/auth/login",
//     error:  "/auth/login",
//   },

//   session: { strategy: "jwt" },
// });




//lib/auth.config.ts - Admin panel



import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

// Helper for consistent user ID
function generateConsistentUserId(email: string): string {
    return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
}

console.log("RUNTIME CHECK - GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "PRESENT" : "MISSING")

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      try {
        const email = user.email!;
        const cleanEmail = email.trim().toLowerCase();
        const consistentUserId = generateConsistentUserId(email);
        const nameParts = (user.name ?? "").split(" ");
        const firstName = nameParts[0] ?? "";
        const lastName = nameParts.slice(1).join(" ") ?? "";

        // 1. Check if user exists in DynamoDB first
        let exists = false;
        let existingData: any = null;

        try {
          const uRes = await docClient.send(new GetCommand({
            TableName: TABLES.IdentityAndAccess,
            Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" }
          }));
          if (uRes.Item) {
            exists = true;
            existingData = uRes.Item;
          }
        } catch (dynErr) {
          console.warn("DynamoDB signin user check failed:", dynErr);
        }

        // Fallback check to Firestore
        if (!exists) {
          try {
            const userDoc = await db.collection("users").doc(cleanEmail).get();
            if (userDoc.exists) {
              exists = true;
              existingData = userDoc.data();
            }
          } catch (fsErr) {
            console.warn("Firestore signin user check failed:", fsErr);
          }
        }

        if (!exists) {
          // Create new user with consistent ID
          const newUserData = {
            email: cleanEmail,
            userId: consistentUserId,
            firstName,
            lastName,
            avatar: user.image ?? "",
            provider: "google",
            authProviders: { google: true, emailPassword: false },
            isVerified: true,
            status: "active",
            role: "user",
            totalPoints: 0,
            pointsBreakdown: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastLoginAt: Date.now(),
          };

          const dynamoUserItem = {
            entityId: `USER#${cleanEmail}`,
            sk: "USER#META",
            ...newUserData
          };

          await dualWrite("users", cleanEmail, "IdentityAndAccess", dynamoUserItem);
          console.log(`[DynamoDB Auth] ⚡ SUCCESS: NextAuth Google created new user in DynamoDB -> entityId: [USER#${cleanEmail}], sk: [USER#META]`);
        } else {
          if (existingData.status === "disabled") return false;
          
          // Update existing user
          const updateData: Record<string, unknown> = {
            lastLoginAt: Date.now(),
            updatedAt: Date.now(),
          };
          
          if (existingData.userId && existingData.userId.startsWith("google_")) {
            updateData.userId = consistentUserId;
          }
          
          // Add Google as auth provider if not already
          const authProviders = existingData.authProviders || {};
          if (!authProviders.google) {
            updateData.authProviders = {
              ...authProviders,
              google: true
            };
          }
          
          const updatedDynamoUser = {
            ...existingData,
            ...updateData
          };

          await dualWrite("users", cleanEmail, "IdentityAndAccess", updatedDynamoUser);
          console.log(`[DynamoDB Auth] ⚡ SUCCESS: NextAuth Google linked & updated existing user in DynamoDB -> entityId: [USER#${cleanEmail}]`);
        }
        return true;
      } catch (error) {
        console.error("Google signIn error:", error);
        return false;
      }
    },

    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        try {
          const cleanEmail = user.email.trim().toLowerCase();
          let exists = false;
          let data: any = null;

          // 1. Try DynamoDB first
          try {
            const uRes = await docClient.send(new GetCommand({
              TableName: TABLES.IdentityAndAccess,
              Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" }
            }));
            if (uRes.Item) {
              data = uRes.Item;
              exists = true;
            }
          } catch (dynErr) {
            console.warn("DynamoDB jwt callback check failed:", dynErr);
          }

          // 2. Fallback to Firestore
          if (!exists) {
            const userDoc = await db.collection("users").doc(cleanEmail).get();
            if (userDoc.exists) {
              data = userDoc.data()!;
              exists = true;
            }
          }

          if (exists && data) {
            token.role   = data.role   ?? "user";
            token.status = data.status ?? "active";
            token.dbUser = {
              email:     data.email,
              firstName: data.firstName,
              lastName:  data.lastName,
              role:      data.role   ?? "user",
              status:    data.status ?? "active",
              userId:    data.userId,
            };
          }
        } catch (error) {
          console.error("JWT callback error:", error);
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.dbUser) {
        session.user = {
          ...session.user,
          ...(token.dbUser as object),
        };
      }
      return session;
    },
  },

  pages: {
    signIn: "/admin/login",
    error:  "/admin/login",
  },

  session: { strategy: "jwt" },
});