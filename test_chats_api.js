const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (!fs.existsSync(envPath)) {
  console.error("Could not find backend .env file at:", envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[match[1].trim()] = val;
  }
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

async function getChatsForUser(CURRENT_USER_ID) {
  console.log(`\n=== GET CHATS FOR USER: ${CURRENT_USER_ID} ===`);
  const snapshot = await db
    .collection("chats")
    .where("participantIds", "array-contains", CURRENT_USER_ID)
    .orderBy("updatedAt", "desc")
    .get();

  const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const otherParticipantIds = new Set();
  chats.forEach((chat) => {
    if (chat.type === "dm" && Array.isArray(chat.participantIds)) {
      const otherId = chat.participantIds.find((id) => id !== CURRENT_USER_ID);
      if (otherId) otherParticipantIds.add(otherId);
    }
  });

  const userProfiles = {};
  if (otherParticipantIds.size > 0) {
    const idsArray = Array.from(otherParticipantIds);
    
    // 1. Fetch by document ID (emails / exact IDs)
    const docRefs = idsArray.map(id => db.collection("users").doc(id));
    const docSnaps = await db.getAll(...docRefs);
    docSnaps.forEach(doc => {
      if (doc.exists) {
        const udata = doc.data();
        const fullName = udata.name || [udata.firstName, udata.lastName].filter(Boolean).join(" ").trim() || "";
        const avatarUrl = udata.avatarUrl || udata.avatar || "";
        userProfiles[doc.id] = { name: fullName, avatarUrl };
        if (udata.userId) {
          userProfiles[udata.userId] = { name: fullName, avatarUrl };
        }
      }
    });

    // 2. Query by userId field
    const unresolvedIds = idsArray.filter(id => !userProfiles[id]);
    if (unresolvedIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < unresolvedIds.length; i += 30) {
        chunks.push(unresolvedIds.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const snap = await db.collection("users").where("userId", "in", chunk).get();
        snap.docs.forEach((doc) => {
          const udata = doc.data();
          const fullName = udata.name || [udata.firstName, udata.lastName].filter(Boolean).join(" ").trim() || "";
          const avatarUrl = udata.avatarUrl || udata.avatar || "";
          if (udata.userId) {
            userProfiles[udata.userId] = { name: fullName, avatarUrl };
          }
          userProfiles[doc.id] = { name: fullName, avatarUrl };
        });
      }
    }
  }

  const enrichedChats = chats.map((chat) => {
    if (chat.type === "dm" && Array.isArray(chat.participantIds)) {
      const otherId = chat.participantIds.find((id) => id !== CURRENT_USER_ID);
      if (otherId && userProfiles[otherId]) {
        return {
          id: chat.id,
          type: chat.type,
          originalName: chat.name,
          resolvedName: userProfiles[otherId].name || chat.name,
          participantIds: chat.participantIds,
        };
      }
    }
    return { id: chat.id, type: chat.type, originalName: chat.name };
  });

  console.log(JSON.stringify(enrichedChats, null, 2));
}

async function run() {
  await getChatsForUser("rahul_yadav_sportsfan360_com");
  await getChatsForUser("prisha_dureja_sportsfan360_com");
  await getChatsForUser("raghav_guptaraghav1375_gmail_com");
  await getChatsForUser("yadav962160_gmail_com");
}

run().catch(console.error);
