const http = require("http");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

// Load .env
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[match[1].trim()] = val;
  }
});

const secret = env.JWT_SECRET;
if (!secret) {
  console.error("No JWT_SECRET found in .env!");
  process.exit(1);
}

// Sign token for yadav962160_gmail_com
const token = jwt.sign(
  {
    email: "yadav962160@gmail.com",
    userId: "yadav962160_gmail_com",
    name: "Rahul Yadav",
    role: "user",
  },
  secret,
  { expiresIn: "7d" }
);

// Make HTTP request to local backend on port 3001
const options = {
  hostname: "localhost",
  port: 3001,
  path: "/api/chats",
  method: "GET",
  headers: {
    "Cookie": `token=${token}`,
  },
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    console.log("Status Code:", res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log("Response Body:", JSON.stringify(parsed, null, 2));
    } catch {
      console.log("Raw Response:", data);
    }
  });
});

req.on("error", (e) => {
  console.error("Request error:", e);
});

req.end();
