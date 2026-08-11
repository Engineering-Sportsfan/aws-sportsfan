import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SR_API_URL = "https://api.sportradar.com/cricket-t2/en/schedules";

async function testSafe() {
  const apiKey = process.env.SPORTRADAR_API_KEY;
  if (!apiKey) {
    console.error("Missing SPORTRADAR_API_KEY in .env.local");
    process.exit(1);
  }

  const today = new Date().toISOString().split("T")[0];
  const url = `${SR_API_URL}/${today}/schedule.json?api_key=${apiKey}`;
  
  console.log(`\n🛡️  Testing Sportradar API Safely (Read-Only) 🛡️`);
  console.log(`Hitting URL: ${SR_API_URL}/${today}/schedule.json`);

  try {
    // We are only reading from the API. No database writes are happening here.
    const response = await fetch(url);
    
    if (response.ok) {
       const data = await response.json();
       const events = data.sport_events || [];
       console.log(`✅ Success! Fetched ${events.length} live/scheduled matches for today.`);
       
       if (events.length > 0) {
           const match = events[0];
           const team1 = match.competitors?.[0]?.name || "Unknown";
           const team2 = match.competitors?.[1]?.name || "Unknown";
           console.log(`🏏 Sample Match Found: ${team1} vs ${team2}`);
           console.log(`🏟️  Venue: ${match.venue?.name || "Unknown"}`);
           console.log(`\n📦 RAW JSON PAYLOAD (What Sportradar actually gives us):`);
           console.log(JSON.stringify(match, null, 2));
       }
    } else {
       console.warn(`❌ Sportradar fetch failed with HTTP status: ${response.status}`);
       console.log(await response.text());
    }
  } catch (e) {
    console.error("❌ Network error connecting to Sportradar API:", e);
  }
}

testSafe();
