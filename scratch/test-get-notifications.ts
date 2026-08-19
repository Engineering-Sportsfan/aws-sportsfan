import axios from "axios";

async function main() {
  try {
    console.log("Fetching notifications via GET endpoint...");
    const url = "http://localhost:3001/api/notifications?email=rahul_yadav_sportsfan360_com&uid=rahul_yadav_sportsfan360_com";
    const res = await axios.get(url);
    console.log("✅ GET Response Status:", res.status);
    console.log("Unread Count:", res.data.unreadCount);
    console.log("Notifications found:", res.data.notifications?.length);
    console.log("Notifications:", JSON.stringify(res.data.notifications, null, 2));
  } catch (err: any) {
    if (err.response) {
      console.error("❌ Error response:", err.response.status, err.response.data);
    } else {
      console.error("❌ Request failed:", err.message);
    }
  }
}

main();
