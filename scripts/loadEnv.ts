// Side-effect module: import this FIRST in scripts so env is loaded before lib/tableNames resolves the suffix.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true } as any);

// Safety guard: these match-leaderboard scripts only run against the -dev tables.
const env = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || "").toLowerCase();
if (env !== "dev" && env !== "develop") {
  console.error(`Refusing to run: APP_ENV is "${env || "(unset)"}", expected "dev". Not touching non-dev tables.`);
  process.exit(1);
}
