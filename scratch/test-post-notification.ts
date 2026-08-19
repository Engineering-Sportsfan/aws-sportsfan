import axios from "axios";

async function main() {
  const payload = {
    userId: "u_8841",
    notificationType: "store.order_confirmed",
    category: "merch",
    title: "Order Confirmed!",
    variables: {
      product_name: "India Cricket Jersey",
      reward_coins: 75
    },
    ctaTarget: "/profile/orders"
  };

  try {
    console.log("Sending POST request to backend notifications endpoint...");
    const res = await axios.post("http://localhost:3001/api/notifications/store", payload);
    console.log("✅ Success! Response status:", res.status);
    console.log("Response data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    if (err.response) {
      console.error("❌ Error response from server:", err.response.status, err.response.data);
    } else {
      console.error("❌ Request failed (is backend server running on 3001?):", err.message);
    }
  }
}

main();
