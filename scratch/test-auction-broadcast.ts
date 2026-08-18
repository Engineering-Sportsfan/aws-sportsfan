import axios from "axios";

async function main() {
  try {
    console.log("Triggering auction starting soon broadcast notification...");
    const url = "http://localhost:3001/api/notifications/store";
    const payload = {
      userId: "all_users",
      notificationType: "store.auction_starting_soon",
      ctaTarget: "/MainModules/AtheleteStore/StoreAuctions",
      variables: {
        product_name: "Signed MSD Jersey"
      }
    };
    const res = await axios.post(url, payload);
    console.log("✅ Response Status:", res.status);
    console.log("Response Data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    if (err.response) {
      console.error("❌ Error response:", err.response.status, err.response.data);
    } else {
      console.error("❌ Request failed:", err.message);
    }
  }
}

main();
