const axios = require('axios');
const PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "RS_P_2090338271178657795";
const API_KEY = process.env.ROANUZ_API_KEY || "RS5:42ec043b5cfbaa566f1060d11bbc8a98";
const BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${PROJECT_KEY}`;

async function run() {
  try {
    console.log("1. Fetching Auth Token...");
    const authRes = await axios.post(`https://api.sports.roanuz.com/v5/core/${PROJECT_KEY}/auth/`, { api_key: API_KEY });
    const token = authRes.data.data.token;
    console.log("Token:", token.substring(0, 20) + "...");

    console.log("\n2. Fetching Association List API...");
    // The exact URL for association list? Let's check docs or guess: association-list/ or associations/
    let assocRes;
    try {
       assocRes = await axios.get(`${BASE_URL}/association-list/`, { headers: { 'rs-token': token } });
       console.log("Found Association List.");
    } catch(e) {
       console.log("association-list failed:", e.response?.status);
       // let's try association/
       try {
         assocRes = await axios.get(`${BASE_URL}/association/`, { headers: { 'rs-token': token } });
         console.log("Found association.");
       } catch(e2) {
         console.log("association failed:", e2.response?.status);
       }
    }
    
    if (assocRes) {
        console.log(JSON.stringify(assocRes.data, null, 2).substring(0, 500));
    }

  } catch (err) {
    console.error(err.message);
  }
}
run();
