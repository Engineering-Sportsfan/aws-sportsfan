const axios = require('axios');
const PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "RS_P_2090338271178657795";
const API_KEY = process.env.ROANUZ_API_KEY || "RS5:42ec043b5cfbaa566f1060d11bbc8a98";
const BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${PROJECT_KEY}`;

async function run() {
  try {
    const authRes = await axios.post(`https://api.sports.roanuz.com/v5/core/${PROJECT_KEY}/auth/`, { api_key: API_KEY });
    const token = authRes.data.data.token;
    
    const endpoints = [
      "association/icc/featured-tournaments/",
      "association/a-rz--cricket--icc/featured-tournaments/",
      "association/a-rz--cricket--icc/featured-tournament/",
      "board/icc/featured-tournaments/",
      "association/icc/tournaments/",
      "association-featured-tournaments/icc/",
      "association-featured-tournaments/"
    ];
    
    for (const ep of endpoints) {
        try {
            const r = await axios.get(`${BASE_URL}/${ep}`, { headers: { 'rs-token': token } });
            console.log("SUCCESS:", ep);
        } catch(e) {
            console.log("FAILED:", ep, e.response?.status, e.response?.data?.error?.msg);
        }
    }
  } catch (err) {
    console.error(err.message);
  }
}
run();
