function resolveEnv(): string {
  const explicit = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || "").toLowerCase().trim();
  if (explicit && explicit !== "prod" && explicit !== "production") {
    return explicit;
  }
  if (explicit === "prod" || explicit === "production") {
    return "prod";
  }

  // AWS Amplify automatic branch environment detection
  const awsBranch = (process.env.AWS_BRANCH || "").toLowerCase().trim();
  if (awsBranch === "develop" || awsBranch === "dev") return "dev";
  if (awsBranch === "release") return "release";

  return "prod";
}

const ENV = resolveEnv();
const suffix = ENV === "prod" || ENV === "production" ? "" : `-${ENV}`;

export const TABLES = {
  GamificationAndWallet: `GamificationAndWallet${suffix}`,
  IdentityAndAccess: `IdentityAndAccess${suffix}`,
  MS_Clubs: `MS_Clubs${suffix}`,
  MS_Leagues: `MS_Leagues${suffix}`,
  MS_LevelFormat: `MS_LevelFormat${suffix}`,
  MS_Players: `MS_Players${suffix}`,
  MS_Sports: `MS_Sports${suffix}`,
  MS_Transactions: `MS_Transactions${suffix}`,
  RealTimeChat: `RealTimeChat${suffix}`,
  Notifications: `sf360-notifications${suffix}`,
  "sf360-notifications": `sf360-notifications${suffix}`,
  SocialAndContent: `SocialAndContent${suffix}`,
  SportsData: `SportsData${suffix}`,
  StoreAndCommerce: `StoreAndCommerce${suffix}`,
} as const;

export type TableKey = keyof typeof TABLES;

/**
 * Returns the resolved DynamoDB table name for the active environment.
 * @param baseName The base table name (e.g. 'SocialAndContent')
 */
export function getTableName(baseName: TableKey | string): string {
  if (baseName in TABLES) {
    return TABLES[baseName as TableKey];
  }
  return suffix ? `${baseName}${suffix}` : baseName;
}

export default TABLES;
