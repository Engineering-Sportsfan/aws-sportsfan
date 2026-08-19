const http = require("http");

const slugs = [
  "doha-diamond-league-2025-neeraj-parul-world-championships",
  "federation-cup-2026-gurindervir-tejaswin-national-records",
  "gurindervir-singh-100m-national-record",
  "india-commonwealth-games-2026-athletics-squad",
  "javelin-duo-cwg-spots",
  "priyanka-goswami-cwg-2022-race-walk-silver",
  "sarvesh-kushare-world-athletics-2025-high-jump",
  "sreeshankar-mamba-mentality-world-athletics-2025",
  "cwg-2026-squad",
  "2-days-2-national-records"
];

function fetchSlug(slug) {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port: 3001,
      path: `/api/v2/articles/${slug}`,
      method: "GET"
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          slug,
          statusCode: res.statusCode,
          success: res.statusCode === 200,
          error: res.statusCode !== 200 ? data : null
        });
      });
    });

    req.on("error", (e) => {
      resolve({ slug, statusCode: 500, success: false, error: e.message });
    });

    req.end();
  });
}

async function run() {
  console.log("Testing backend articles API at localhost:3001...");
  for (const slug of slugs) {
    const res = await fetchSlug(slug);
    if (res.success) {
      console.log(`✅ ${slug}: 200 OK`);
    } else {
      console.log(`❌ ${slug}: ${res.statusCode} Error - ${res.error}`);
    }
  }
}

run().catch(console.error);
