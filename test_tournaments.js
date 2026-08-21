const axios = require('axios');
const PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "RS_P_2090338271178657795";
const API_KEY = process.env.ROANUZ_API_KEY || "RS5:42ec043b5cfbaa566f1060d11bbc8a98";
const BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${PROJECT_KEY}`;

async function run() {
  try {
    const authRes = await axios.post(`https://api.sports.roanuz.com/v5/core/${PROJECT_KEY}/auth/`, { api_key: API_KEY });
    const token = authRes.data.data.token;
    console.log("Token generated.");
    
    // Let's try to get schedule for a known tournament key from featured matches
    // From my earlier response: "badge": "India tour of Sri Lanka 2026"
    // Let's first fetch featured matches to get a tournament key
    const featuredRes = await axios.get(`${BASE_URL}/featured-matches-2/`, { headers: { 'rs-token': token } });
    const match = featuredRes.data.data.matches[0];
    const tournamentKey = match.tournament.key;
    console.log("Found Tournament Key:", tournamentKey);
    
    try {
        const fixtureRes = await axios.get(`${BASE_URL}/tournament/${tournamentKey}/fixtures/`, { headers: { 'rs-token': token } });
        console.log("Fixtures URL:", `${BASE_URL}/tournament/${tournamentKey}/fixtures/`);
        console.log("Data size:", JSON.stringify(fixtureRes.data).length);
    } catch(e) {
        console.log("Fixtures endpoint failed:", e.response?.status, e.response?.data?.error?.msg);
    }
  } catch (err) {
    console.error(err.message);
  }
}
run();
