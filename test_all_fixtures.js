const axios = require('axios');
const PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "RS_P_2090338271178657795";
const API_KEY = process.env.ROANUZ_API_KEY || "RS5:42ec043b5cfbaa566f1060d11bbc8a98";
const BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${PROJECT_KEY}`;

async function run() {
  const authRes = await axios.post(`https://api.sports.roanuz.com/v5/core/${PROJECT_KEY}/auth/`, { api_key: API_KEY });
  const token = authRes.data.data.token;
  
  const assocRes = await axios.get(`${BASE_URL}/association/icc/featured-tournaments/`, { headers: { 'rs-token': token } });
  const tournaments = assocRes.data.data.tournaments;
  
  let totalUpcoming = 0;
  for (let i = 0; i < Math.min(tournaments.length, 10); i++) {
    const t = tournaments[i];
    try {
        const fixtureRes = await axios.get(`${BASE_URL}/tournament/${t.key}/fixtures/`, { headers: { 'rs-token': token } });
        const matches = fixtureRes.data.data.matches || [];
        const upcoming = matches.filter(m => m.status === 'not_started');
        console.log(`Tournament ${i}: ${t.name} -> ${upcoming.length} upcoming matches out of ${matches.length}`);
        totalUpcoming += upcoming.length;
    } catch(e) { }
  }
  console.log("Total Upcoming in first 10:", totalUpcoming);
}
run();
