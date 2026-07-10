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

// Helper for consistent user ID
function generateConsistentUserId(email: string): string {
    return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        const userRef = db.collection("users").doc(email);
        const userDoc = await userRef.get();

        const consistentUserId = generateConsistentUserId(email);
        const nameParts = (user.name ?? "").split(" ");
        const firstName = nameParts[0] ?? "";
        const lastName = nameParts.slice(1).join(" ") ?? "";

        if (!userDoc.exists) {
            // Create new user with consistent ID
            await userRef.set({
                email,
                userId: consistentUserId, // Consistent ID, not google_xxx
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
            });
        } else {
            const data = userDoc.data()!;
            if (data.status === "disabled") return false;
            
            // Update existing user
            const updateData: Record<string, unknown> = {
                lastLoginAt: Date.now(),
                updatedAt: Date.now(),
            };
            
            // If userId is inconsistent, fix it
            if (data.userId && data.userId.startsWith("google_")) {
                updateData.userId = consistentUserId;
            }
            
            // Add Google as auth provider if not already
            if (!data.authProviders?.google) {
                updateData['authProviders.google'] = true;
            }
            
            await userRef.update(updateData);
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
          const userDoc = await db.collection("users").doc(user.email).get();
          if (userDoc.exists) {
            const data = userDoc.data()!;
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
    signIn: "/auth/login",
    error:  "/auth/login",
  },

  session: { strategy: "jwt" },
});