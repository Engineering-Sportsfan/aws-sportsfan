// scripts/migrate_table_names.ts
import * as fs from "fs";
import * as path from "path";

const TARGET_DIRS = [
  path.join(process.cwd(), "app", "api"),
  path.join(process.cwd(), "lib"),
];

const TABLE_MAP: Record<string, string> = {
  '"RealTimeChat"': 'TABLES.RealTimeChat',
  "'RealTimeChat'": 'TABLES.RealTimeChat',
  '"SocialAndContent"': 'TABLES.SocialAndContent',
  "'SocialAndContent'": 'TABLES.SocialAndContent',
  '"IdentityAndAccess"': 'TABLES.IdentityAndAccess',
  "'IdentityAndAccess'": 'TABLES.IdentityAndAccess',
  '"sf360-notifications"': 'TABLES.Notifications',
  "'sf360-notifications'": 'TABLES.Notifications',
  '"StoreAndCommerce"': 'TABLES.StoreAndCommerce',
  "'StoreAndCommerce'": 'TABLES.StoreAndCommerce',
  '"GamificationAndWallet"': 'TABLES.GamificationAndWallet',
  "'GamificationAndWallet'": 'TABLES.GamificationAndWallet',
  '"MS_Players"': 'TABLES.MS_Players',
  "'MS_Players'": 'TABLES.MS_Players',
  '"MS_Clubs"': 'TABLES.MS_Clubs',
  "'MS_Clubs'": 'TABLES.MS_Clubs',
  '"MS_Transactions"': 'TABLES.MS_Transactions',
  "'MS_Transactions'": 'TABLES.MS_Transactions',
  '"MS_Sports"': 'TABLES.MS_Sports',
  "'MS_Sports'": 'TABLES.MS_Sports',
  '"MS_Leagues"': 'TABLES.MS_Leagues',
  "'MS_Leagues'": 'TABLES.MS_Leagues',
  '"MS_LevelFormat"': 'TABLES.MS_LevelFormat',
  "'MS_LevelFormat'": 'TABLES.MS_LevelFormat',
  '"SportsData"': 'TABLES.SportsData',
  "'SportsData'": 'TABLES.SportsData',
};

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      // Avoid modifying tableNames.ts itself
      if (!fullPath.endsWith("tableNames.ts")) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function processFile(filePath: string) {
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  // 1. Check if file contains TableName: "XYZ" or TableName: 'XYZ' or table: "XYZ"
  // or RequestItems: { "IdentityAndAccess": ... }
  // or Responses?.["IdentityAndAccess"]
  
  // Replace TableName: "XYZ" / TableName: 'XYZ'
  for (const [rawTable, dynamicTable] of Object.entries(TABLE_MAP)) {
    const tableBase = rawTable.replace(/['"]/g, '');
    
    // Pattern: TableName: "XYZ" / TableName: 'XYZ'
    const tableNameRegex = new RegExp(`TableName:\\s*['"]${tableBase}['"]`, 'g');
    if (tableNameRegex.test(content)) {
      content = content.replace(tableNameRegex, `TableName: ${dynamicTable}`);
      modified = true;
    }

    // Pattern: tableName: "XYZ" / tableName: 'XYZ'
    const lowerTableNameRegex = new RegExp(`tableName:\\s*['"]${tableBase}['"]`, 'g');
    if (lowerTableNameRegex.test(content)) {
      content = content.replace(lowerTableNameRegex, `tableName: ${dynamicTable}`);
      modified = true;
    }

    // Pattern: TABLE = "XYZ" / TABLE = 'XYZ'
    const constTableRegex = new RegExp(`(const|let|var)\\s+([A-Z_]*TABLE[A-Z_]*)\\s*=\\s*['"]${tableBase}['"]`, 'g');
    if (constTableRegex.test(content)) {
      content = content.replace(constTableRegex, `$1 $2 = ${dynamicTable}`);
      modified = true;
    }

    // Pattern: Responses?.["XYZ"] -> Responses?.[TABLES.XYZ]
    const responseIndexRegex = new RegExp(`Responses\\?\\.\\[['"]${tableBase}['"]\\]`, 'g');
    if (responseIndexRegex.test(content)) {
      content = content.replace(responseIndexRegex, `Responses?.[${dynamicTable}]`);
      modified = true;
    }

    // Pattern: RequestItems: { "XYZ": { -> RequestItems: { [TABLES.XYZ]: {
    const requestItemsRegex = new RegExp(`RequestItems:\\s*\\{\\s*['"]${tableBase}['"]:\\s*\\{`, 'g');
    if (requestItemsRegex.test(content)) {
      content = content.replace(requestItemsRegex, `RequestItems: { [${dynamicTable}]: {`);
      modified = true;
    }

    // Pattern: "XYZ": { Keys: keys } -> [TABLES.XYZ]: { Keys: keys }
    const keysMapRegex = new RegExp(`(['"])${tableBase}\\1:\\s*\\{\\s*Keys:`, 'g');
    if (keysMapRegex.test(content)) {
      content = content.replace(keysMapRegex, `[${dynamicTable}]: { Keys:`);
      modified = true;
    }
  }

  if (modified) {
    // Add import if not present
    if (!content.includes('import { TABLES }') && !content.includes('import TABLES') && !content.includes('TABLES from "@/lib/tableNames"') && !content.includes("TABLES from '@/lib/tableNames'")) {
      // Find suitable place for import at top
      content = `import { TABLES } from "@/lib/tableNames";\n` + content;
    }
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`Updated: ${filePath}`);
  }
}

function main() {
  const allFiles: string[] = [];
  for (const dir of TARGET_DIRS) {
    getAllFiles(dir, allFiles);
  }

  console.log(`Scanning ${allFiles.length} files...`);
  for (const f of allFiles) {
    processFile(f);
  }
  console.log("Migration complete!");
}

main();
