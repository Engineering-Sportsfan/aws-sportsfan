const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "../frontend/src/components/ChatComponent/index.tsx");
if (!fs.existsSync(target)) {
  console.log("Not found:", target);
  process.exit(1);
}

const content = fs.readFileSync(target, "utf8");
const lines = content.split("\n");

console.log("=== SEARCH FOR 'sender' ===");
lines.forEach((line, idx) => {
  if (line.includes("sender") || line.includes("senderId")) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

console.log("\n=== SEARCH FOR 'name' ===");
lines.forEach((line, idx) => {
  if (line.includes("name") || line.includes("displayName")) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
