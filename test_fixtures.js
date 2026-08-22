const axios = require('axios');
const PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "RS_P_2090338271178657795";
const API_KEY = process.env.ROANUZ_API_KEY || "RS5:42ec043b5cfbaa566f1060d11bbc8a98";
const BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${PROJECT_KEY}`;

async function run() {
  const authRes = await axios.post(`https://api.sports.roanuz.com/v5/core/${PROJECT_KEY}/auth/`, { api_key: API_KEY });
  const token = authRes.data.data.token;
  
  const assocRes = await axios.get(`${BASE_URL}/association/icc/featured-tournaments/`, { headers: { 'rs-token': token } });
  const tournamentKey = assocRes.data.data.tournaments[0].key;
  
  const fixtureRes = await axios.get(`${BASE_URL}/tournament/${tournamentKey}/fixtures/`, { headers: { 'rs-token': token } });
  console.log(JSON.stringify(fixtureRes.data.data, null, 2).substring(0, 1000));
}
run();
