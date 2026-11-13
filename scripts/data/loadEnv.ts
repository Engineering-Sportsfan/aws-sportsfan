// Side-effect import: must be the FIRST import of a script so env vars exist before lib/dynamodb creates its client.
import { config } from "dotenv";

config({ path: ".env.local" }); // same file the Next app uses; never overrides variables already set in the shell
config();
