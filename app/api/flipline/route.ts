import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import cloudinary from "@/lib/cloudinary";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const SEED_CARDS = [
  { id: 1, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Morning', timeMs: 642, time: '10:42 AM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "Rohit Sharma looks in excellent touch at the top. His intent to attack the spinners early is exactly what India need on this Galle surface. Watch that sweep shot — he's been working on it.",
    emoji: '🎙️', likes: 1243, isKey: true, tags: ['#RohitSharma', '#IndvsSL'],
    scoreChip: { score: 'IND 48/0 (11 ov)', status: 'Live', statusType: 'live' },
    fomoMsg: "Anand's analysis is getting wild reactions — 312 fans debating in Watch Along right now",
    fomoCount: 312, ctaType: 'watchalong',
    flipResponse: "Rohit's sweep has been his go-to at Galle historically — 68% of his runs against spin here come through that shot. India are targeting the left-arm spinner gap at mid-wicket. Teams batting first here score 15–20% more on Day 1 than Day 3 📊" },

  { id: 2, type: 'fan', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Morning', timeMs: 655, time: '10:55 AM',
    author: 'CricketCrazy_Rohan', handle: '@rohancric22', source: 'ROAR Room',
    content: '🔥🔥 BUMRAH IS UNREAL!!!! That inswinger to dismiss Karunaratne was CINEMA. Someone get this man an Oscar 😤',
    emoji: '😤', likes: 892, isKey: true, tags: [],
    scoreChip: { score: 'SL 22/1 (6.3 ov)', status: 'Live — Wicket!', statusType: 'live' },
    fomoMsg: "892 fans are celebrating Bumrah's wicket right now — the room is going insane",
    fomoCount: 892, ctaType: 'room',
    flipResponse: "Bumrah's inswinger to left-handers has a 78% success rate in Asia over the last 3 years. He pitched it on a perfect 7.5m length from over the wicket — Karunaratne had no answer. This is why he's ranked #1 in Test bowling 🎯" },

  { id: 3, type: 'official', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Morning', timeMs: 675, time: '11:15 AM',
    author: 'SF360', source: 'Official Drop',
    content: "Bumrah's 5th wicket — a classic inswinger that shattered the stumps. Watch the full clip.",
    emoji: '🎬', mediaType: 'video', likes: 5671, isKey: true, tags: [],
    scoreChip: { score: 'SL 76/5 (24 ov)', status: 'Live', statusType: 'live' },
    fomoMsg: "5.6K fans watched this drop in 10 mins — you're missing out on the conversation",
    fomoCount: 5671, ctaType: 'drop',
    flipResponse: "Bumrah's 5-wicket hauls at Galle: this is his 2nd. Historically when India bowl out the opposition under 180 here, they win 89% of the time. Sri Lanka are in serious trouble heading to lunch 📊" },

  { id: 13, type: 'analyst', sport: 'athletics', sportEmoji: '🏃', sportLabel: 'Delhi State Athletics',
    day: 'Day 1 · Morning', timeMs: 676, time: '11:15 AM',
    author: 'Rajaraman G', handle: '@g_rajaraman', source: 'via X',
    content: "The Jawaharlal Nehru Stadium was bereft of spectators, media & influences who throng international sports events. But it was heartening to watch athletes combat the elements – rain on Friday & humidity on Sunday – to deliver their best in the Delhi State Athletics Championships",
    emoji: '🏟️', likes: 1876, isKey: false, tags: ['#DelhiAthletics', '#Athletics'],
    scoreChip: { score: 'Delhi State Athletics', status: 'Completed', statusType: 'final' },
    fomoMsg: "Rajaraman's ground report from JN Stadium is resonating with 245 fans in Athletics room",
    fomoCount: 245, ctaType: 'watchalong',
    flipResponse: "Delhi State Athletics is the breeding ground for national-level talent. Competing in rain and humidity builds mental toughness. Several athletes here will represent India in the Asian Athletics Championships next month 🏆" },

  { id: 8, type: 'analyst', sport: 'athletics', sportEmoji: '🏃', sportLabel: 'Asian Athletics',
    day: 'Day 1 · Morning', timeMs: 677, time: '11:16 AM',
    author: 'Rajaraman G', handle: '@g_rajaraman', source: 'Watch Along',
    content: "Neeraj Chopra is warming up and he looks incredibly focused. His approach run has a different energy today — that step count adjustment he made in training is visible. This could be a massive throw.",
    emoji: '🏟️', likes: 677, isKey: false, tags: ['#NeerajChopra', '#AsianAthletics'],
    scoreChip: { score: 'Javelin Final · Attempt 1', status: 'Upcoming', statusType: 'upcoming' },
    fomoMsg: "Rajaraman's preview is pulling 200+ fans into the Athletics Watch Along — join the room",
    fomoCount: 200, ctaType: 'watchalong',
    flipResponse: "Neeraj's personal best is 89.94m. At this venue, athletes have thrown 1.8% better on average due to altitude. His 2026 form: 3 competitions, 3 wins, avg 87.6m. If he hits 88m+ today, he's on World Championship medal pace 🏆" },

  { id: 4, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Morning', timeMs: 690, time: '11:30 AM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'via X',
    content: 'Sri Lanka 87/4 at lunch. India bowling has been clinical but the pitch has eased. Second session crucial — Chandimal and Dickwella could change this match.',
    emoji: '📊', likes: 2109, isKey: true, tags: ['#GalleTest'],
    scoreChip: { score: 'SL 87/4 (30 ov)', status: 'Lunch Break', statusType: 'break' },
    fomoMsg: "Anand's lunch take sparked a huge debate — 400+ fans arguing about it in Watch Along",
    fomoCount: 400, ctaType: 'watchalong',
    flipResponse: 'Chandimal has a 58 average in the second session at Galle — he thrives when the pitch eases. India need 2 more wickets before tea or Sri Lanka could come back. The key battle: Bumrah vs Chandimal in the first over post-lunch 🎯' },

  { id: 14, type: 'official', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Afternoon', timeMs: 800, time: '1:20 PM',
    author: 'SF360', source: 'Official Drop',
    content: "India's fielding masterclass — Jadeja's direct hit run-out off just 1 stump visible. Sri Lanka 115/5. Watch the full clip.",
    emoji: '🎬', mediaType: 'video', likes: 4102, isKey: true, tags: [],
    scoreChip: { score: 'SL 115/5 (38 ov)', status: 'Live', statusType: 'live' },
    fomoMsg: "4.1K fans are replaying this run-out on loop — join the Watch Along for Jadeja breakdown",
    fomoCount: 4102, ctaType: 'watchalong',
    flipResponse: "Jadeja's direct hit: estimated throw distance of 38m, hit the single stump at 85kph. He only has 1 stump to aim at and still nails it. His run-out rate this year: 7 direct hits from 14 attempts (50%) — elite standard 🎯" },

  { id: 5, type: 'fan', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Afternoon', timeMs: 850, time: '2:10 PM',
    author: 'SriLankaPride', handle: '@sl_superfan', source: 'ROAR Room',
    content: 'Chandimal bhai keeping the ship steady 💪 40 off 88 balls is exactly what they need right now.',
    emoji: '🫡', likes: 344, isKey: false, tags: [],
    scoreChip: { score: 'SL 142/5 (44 ov)', status: 'Live', statusType: 'live' },
    fomoMsg: 'SL fans and India fans are going at it hard in the ROAR Room — 267 fans live',
    fomoCount: 267, ctaType: 'room',
    flipResponse: "Chandimal's 40 off 88 is actually above his usual SR at Galle (39.2). He's converting at 45.4 SR right now — if he stays till tea, Sri Lanka could push 220+. India need to break this partnership in the next 8 overs 📊" },

  { id: 9, type: 'fan', sport: 'football', sportEmoji: '⚽', sportLabel: 'IND vs JPN',
    day: 'Day 1 · Afternoon', timeMs: 851, time: '2:10 PM',
    author: 'GoalMachine_Dev', handle: '@dev_football', source: 'ROAR Room',
    content: 'SUNIL CHHETRI IS BACK AND HE JUST SCORED 😭😭😭 India 1-0 Japan!! The crowd is ERUPTING!! ⚽🇮🇳🔥',
    emoji: '⚽', likes: 1893, isKey: true, tags: ['#IndiaFootball', '#Chhetri'],
    scoreChip: { score: 'IND 1 – 0 JPN', status: 'Live · 67\'', statusType: 'live' },
    fomoMsg: "1.8K fans are going absolutely wild in Football ROAR Room — massive goal!!",
    fomoCount: 1893, ctaType: 'room',
    flipResponse: "Chhetri's 91st international goal! At 41, scoring in a competitive fixture is remarkable. India's win probability just jumped from 28% to 61%. Japan haven't conceded to India since 2019 — this is historic ⚽🏆" },

  { id: 6, type: 'official', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Afternoon', timeMs: 945, time: '3:45 PM',
    author: 'SF360', source: 'Official Drop',
    content: 'Shami breaks through with a sharp off-cutter. Sri Lanka 142/6. India firmly in control. Listen to Shami explain the dismissal himself.',
    emoji: '🎙️', mediaType: 'audio', likes: 3211, isKey: false, tags: [],
    scoreChip: { score: 'SL 142/6 (44.2 ov)', status: 'Live', statusType: 'live' },
    fomoMsg: '3.2K fans reacted to this drop in 4 minutes — join the conversation before it dies',
    fomoCount: 3211, ctaType: 'drop',
    flipResponse: "Shami's off-cutter: released at 134kph, pitched on a good length, cut back sharply. Dickwella went for a drive — classic dismissal. At 142/6, Sri Lanka are likely under 200. India batting target: expect 190–205 💯" },

  { id: 10, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Afternoon', timeMs: 946, time: '3:45 PM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "Shami's off-cutter is simply magnificent. The way he disguises it from his outswinger grip — Dickwella never picked it. India's pace attack now has 6 wickets between them. Complete bowling performance.",
    emoji: '📊', likes: 1876, isKey: true, tags: ['#Shami', '#IndvsSL'],
    scoreChip: { score: 'SL 142/6 (44.2 ov)', status: 'Live', statusType: 'live' },
    fomoMsg: "Anand's breakdown of Shami's grip is causing a riot — 500 fans live in Watch Along",
    fomoCount: 500, ctaType: 'watchalong',
    flipResponse: "Shami's off-cutter is the same one he used to dismantle NZ in 2021. He only bowls it after prepping the batsman with 3 outswingers — pure chess. His off-cutter success rate this year: 4 wickets from 9 attempts (44%) 🎯" },

  { id: 11, type: 'official', sport: 'athletics', sportEmoji: '🏃', sportLabel: 'Asian Athletics',
    day: 'Day 1 · Afternoon', timeMs: 947, time: '3:45 PM',
    author: 'SF360', source: 'Official Drop',
    content: "NEERAJ CHOPRA THROWS 88.72M! 🏆 NEW ASIAN GAMES RECORD! India's golden boy does it again. Watch the throw →",
    emoji: '🏆', mediaType: 'video', likes: 8934, isKey: true, tags: ['#NeerajChopra'],
    scoreChip: { score: 'Neeraj · 88.72m 🥇', status: 'Asian Games Record!', statusType: 'final' },
    fomoMsg: "8.9K fans reacted to Neeraj's record throw — biggest Athletics moment of the year",
    fomoCount: 8934, ctaType: 'drop',
    flipResponse: "88.72m is Neeraj's 3rd-best throw ever! This betters the previous Asian Games record by 1.24m. His next target: 90m at Worlds. Release angle was 33.2° — near-perfect for javelin at this altitude. Absolute specimen 🏆" },

  { id: 15, type: 'fan', sport: 'football', sportEmoji: '⚽', sportLabel: 'IND vs JPN',
    day: 'Day 1 · Evening', timeMs: 1020, time: '5:00 PM',
    author: 'BlueTigers_Fan', handle: '@bluetigers_in', source: 'ROAR Room',
    content: "FULL TIME. INDIA 1-0 JAPAN. I can't believe what I just witnessed 😭🇮🇳 Chhetri you absolute LEGEND. History made tonight!",
    emoji: '🏆', likes: 4291, isKey: true, tags: ['#BlueTigers', '#INDvJPN'],
    scoreChip: { score: 'IND 1 – 0 JPN', status: 'Full Time', statusType: 'final' },
    fomoMsg: "4.2K fans celebrating in Football ROAR — biggest India football moment in years",
    fomoCount: 4291, ctaType: 'room',
    flipResponse: "India's first competitive win over Japan since 2011. Chhetri's goal was India's 91st international goal. Full-time stats: India 38% possession, 6 shots, 3 on target. A classic counter-attack performance by Igor Stimac's men 🏆" },

  { id: 16, type: 'official', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Evening', timeMs: 1080, time: '6:00 PM',
    author: 'SF360', source: 'Official Drop',
    content: 'SRI LANKA ALL OUT FOR 183. India need 184 to win the Galle Test. Play resumes tomorrow 9:30 AM. Key stat: India have never lost chasing under 200 at Galle. SF360 full scorecard →',
    emoji: '📋', likes: 6543, isKey: true, tags: ['#GalleTest', '#INDvSL'],
    scoreChip: { score: 'SL 183 All Out', status: 'Innings Complete', statusType: 'final' },
    fomoMsg: "6.5K fans digesting the scorecard — Anand Vasu's post-day analysis is LIVE in Watch Along",
    fomoCount: 6543, ctaType: 'drop',
    flipResponse: "India's chase of 184 at Galle — historical record: 4 wins from 4 chases under 200. Rohit and Gill open tomorrow. Expected DLS target if rain returns: 165 from 40 overs. The pitch will have more variable bounce on Day 2 📊" },

  { id: 17, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Evening', timeMs: 1110, time: '6:30 PM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "Right. And now this one is hitting the stumps apparently. Gill sweeps and misses. He's bending as he plays the shot. And is hit in the stomach/midriff. But ball tracking shows it's low enough to not go over the stumps. Even Prabhat Jayasuriya has a wry smile after watching the...",
    emoji: '🎙️', likes: 205, isKey: true, tags: ['#INDvSL', '#Gill', '#Jayasuriya'],
    scoreChip: { score: 'IND vs SL', status: 'Live', statusType: 'live' },
    fomoMsg: "Anand's live DRS analysis is drawing big reactions — fans debating in Watch Along right now",
    fomoCount: 205, ctaType: 'watchalong',
    flipResponse: "Ball-tracking confirms height was low enough despite hitting him high on the midriff during the sweep shot bending forward. Jayasuriya continues to create problems." },

  { id: 18, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Evening', timeMs: 1140, time: '7:00 PM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "No review can reprieve Rahul this time. Comes down the track and looks to clear mid on. Doesn't get to the pitch. Prabhat Jayasuriya has the last laugh and the wicket. #INDvSL",
    emoji: '☝️', likes: 197, isKey: true, tags: ['#INDvSL', '#KLRahul', '#Wicket'],
    scoreChip: { score: 'IND vs SL', status: 'Live', statusType: 'live' },
    fomoMsg: "Fans are reacting to KL Rahul's dismissal — Join the breakdown in Watch Along",
    fomoCount: 197, ctaType: 'watchalong',
    flipResponse: "KL Rahul tried stepping down to break the pressure against Jayasuriya, but failed to reach the pitch of the ball, leading to a simple catch at mid-on." },

  { id: 19, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Evening', timeMs: 1150, time: '7:10 PM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "That looked like it was out for all the money in the world. KL Rahul looked set to walk off when Devdutt Padikkal stopped him and told him to review. In the dressing-room Shubman Gill had pulled his gloves on and was ready to walk out. And technology says the ball would have gone...",
    emoji: '📺', likes: 1200, isKey: true, tags: ['#INDvSL', '#DRS', '#KLRahul'],
    scoreChip: { score: 'IND vs SL', status: 'Live', statusType: 'live' },
    fomoMsg: "Over 1.2K fans reacting to that dramatic DRS call saved by Padikkal",
    fomoCount: 1200, ctaType: 'watchalong',
    flipResponse: "Padikkal's intervention saved Rahul after he was given out on-field. Replays showed missing, prompting Gill to unpack his gloves back in the pavilion." },

  { id: 20, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'IND vs SL',
    day: 'Day 1 · Evening', timeMs: 1169, time: '7:29 PM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "Another day where the weather has defied prediction and the cricket has followed suit. Bright sunshine and Yashasvi Jaiswal gives it away early, nicking off. He plays only one format -- not out of choice -- and Jaiswal would have wanted time out in the middle. The runs would have...",
    emoji: '☀️', likes: 540, isKey: true, tags: ['#INDvSL', '#Jaiswal', '#EarlyWicket'],
    scoreChip: { score: 'IND vs SL', status: 'Live', statusType: 'live' },
    fomoMsg: "540 fans discussing Jaiswal's early dismissal in Watch Along",
    fomoCount: 540, ctaType: 'watchalong',
    flipResponse: "Clear weather conditions didn't prevent an early setback as Jaiswal edged behind early in the session, missing out on valuable time at the crease." },

  { id: 21, type: 'analyst', sport: 'cricket', sportEmoji: '🏏', sportLabel: 'Galle Travel',
    day: 'Day 1 · Evening', timeMs: 1180, time: '7:40 PM',
    author: 'Anand Vasu', handle: '@anandvasu', source: 'Watch Along',
    content: "There is no shortage of places to visit in Galle. Allow me to add The South Ceylon Bakery. It's owned by Athula Samarasekara, a hard-hitting batsman and handy medium pacer who played 4 Tests and 39 ODIs for Sri Lanka from 1988-1994. Ironic that he should run a bakery given this...",
    emoji: '🥐', likes: 161, isKey: false, tags: ['#Galle', '#CricketHistory', '#SriLanka'],
    scoreChip: { score: 'Galle Spotlight', status: 'Pinned', statusType: 'info' },
    fomoMsg: "161 fans loving Anand's recommendation on Galle heritage spot",
    fomoCount: 161, ctaType: 'watchalong',
    flipResponse: "Athula Samarasekara played for Sri Lanka between 1988-1994, known for aggressive hitting. He now runs The South Ceylon Bakery in Galle." }
];

export async function GET() {
  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :roomId AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":roomId": "FLIPLINE#ALL",
          ":skPrefix": "CARD#",
        },
        ScanIndexForward: false,
      })
    );

    let cards = res.Items || [];

    if (cards.length === 0) {
      console.log("FlipLine cards empty in DynamoDB, auto-seeding default cards...");
      const putPromises = SEED_CARDS.map(async (card) => {
        const item = {
          roomId: "FLIPLINE#ALL",
          sk: `CARD#${card.timeMs}#${card.id}`,
          ...card,
        };
        await docClient.send(
          new PutCommand({
            TableName: "RealTimeChat",
            Item: item,
          })
        );
        return item;
      });

      const seededItems = await Promise.all(putPromises);
      cards = seededItems.sort((a, b) => b.timeMs - a.timeMs);
    }

    return NextResponse.json({ success: true, data: cards });
  } catch (error) {
    console.error("Failed to fetch FlipLine cards:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
const uploadToCloudinary = (
  buffer: Buffer,
  resourceType: "image" | "video"
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "flipline",
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    stream.end(buffer);
  });
};
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const content = formData.get("content") as string;
    const sport = formData.get("sport") as string;
    const type = formData.get("type") as string;
    const author = formData.get("author") as string;
    const handle = (formData.get("handle") as string) || undefined;
    const source = formData.get("source") as string;
    const likes = parseInt((formData.get("likes") as string) || "0");
    const isKey = formData.get("isKey") === "true";
    const emoji = (formData.get("emoji") as string) || undefined;
    const fomoMsg = (formData.get("fomoMsg") as string) || undefined;
    const fomoCount = parseInt((formData.get("fomoCount") as string) || "0");
    const ctaType = (formData.get("ctaType") as string) || "room";
    const flipResponse = (formData.get("flipResponse") as string) || "";
    const userId = (formData.get("userId") as string) || undefined;
    const email = (formData.get("email") as string) || undefined;

    const mediaFiles = formData.getAll("media") as File[];
    console.log(
      "MEDIA FILES:",
      mediaFiles.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        sizeMB: (file.size / 1024 / 1024).toFixed(2),
      }))
    );
    let imageUrl = "";
    let videoUrl = "";

    for (const file of mediaFiles) {
      if (!file || file.size === 0) continue;

      const isVideo = file.type.startsWith("video/");

      console.log("Uploading media:", {
        name: file.name,
        type: file.type,
        sizeMB: (file.size / 1024 / 1024).toFixed(2),
        isVideo,
      });

      if (isVideo && file.size > 100 * 1024 * 1024) {
        return NextResponse.json(
          {
            success: false,
            error: "Video must be smaller than 100 MB",
          },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadRes = await uploadToCloudinary(
        buffer,
        isVideo ? "video" : "image"
      );

      console.log("Cloudinary upload successful:", {
        url: uploadRes.secure_url,
        resourceType: uploadRes.resource_type,
      });

      if (isVideo) {
        videoUrl = uploadRes.secure_url;
      } else {
        imageUrl = uploadRes.secure_url;
      }
    }

    const timeMs = Date.now();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date();
    const h = now.getHours(), mn = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const timeStr = `${h12}:${mn.toString().padStart(2, '0')} ${ampm}`;

    const sportMeta: Record<string, { emoji: string; label: string }> = {
      cricket: { emoji: '🏏', label: 'IND vs SL' },
      football: { emoji: '⚽', label: 'IND vs JPN' },
      athletics: { emoji: '🏃', label: 'Asian Athletics' },
    };

    const tags = content.match(/#[a-zA-Z0-9_]+/g) || [];
    const newCard = {
      roomId: "FLIPLINE#ALL",
      sk: `CARD#${timeMs}#${id}`,
      id,
      type,
      sport,
      sportEmoji: sportMeta[sport]?.emoji || "🏆",
      sportLabel: sportMeta[sport]?.label || "General",
      day: "Just Now",
      time: timeStr,
      timeMs,
      author,
      handle,
      source,
      content,
      emoji,
      likes,
      isKey,
      tags,

      scoreChip:
        sport === "cricket"
          ? {
            score: "Live Match",
            status: "Live",
            statusType: "live",
          }
          : undefined,

      fomoMsg: fomoMsg || "",
      fomoCount,
      ctaType,
      flipResponse,
      isUserPost: true,
      userId,
      email,

      hasAttachedImage: !!imageUrl,
      hasAttachedVideo: !!videoUrl,

      image: imageUrl || undefined,
      videoUrl: videoUrl || undefined,

      mediaType: videoUrl
        ? "video"
        : imageUrl
          ? "image"
          : undefined,
    };
    await docClient.send(
      new PutCommand({
        TableName: "RealTimeChat",
        Item: newCard,
      })
    );

    return NextResponse.json({ success: true, data: newCard });
  } catch (error) {
    console.error("Failed to create FlipLine post:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { sk, action } = await req.json();

    if (!sk || !action) {
      return NextResponse.json({ success: false, error: "Missing sk or action" }, { status: 400 });
    }

    const val = action === "like" ? 1 : -1;

    await docClient.send(
      new UpdateCommand({
        TableName: "RealTimeChat",
        Key: {
          roomId: "FLIPLINE#ALL",
          sk: sk,
        },
        UpdateExpression: "SET likes = if_not_exists(likes, :zero) + :val",
        ExpressionAttributeValues: {
          ":val": val,
          ":zero": 0,
        },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update likes:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
