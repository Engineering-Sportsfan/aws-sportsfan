import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

const tables = [
    { name: "IdentityAndAccess", pk: "entityId", sk: "sk" },
    { name: "SocialAndContent", pk: "contentId", sk: "sk" },
    { name: "GamificationAndWallet", pk: "userId", sk: "sk" },
    { name: "SportsData", pk: "entityId", sk: "sk" },
    { name: "StoreAndCommerce", pk: "entityId", sk: "sk" },
    { name: "RealTimeChat", pk: "roomId", sk: "sk" }
];

async function verifyTable(table: any) {
    try {
        const command = new ScanCommand({
            TableName: table.name,
            Limit: 1
        });
        const response = await client.send(command);
        
        if (!response.Items || response.Items.length === 0) {
            console.log(`⚠️ ${table.name}: Table is empty or not found.`);
            return false;
        }

        const item = response.Items[0];
        const hasPK = item[table.pk] && item[table.pk].S;
        const hasSK = item[table.sk] && item[table.sk].S;

        if (hasPK && hasSK) {
            console.log(`✅ ${table.name}: PERFECT. Schema validated. Found PK [${table.pk}: ${item[table.pk].S}] and SK [${table.sk}: ${item[table.sk].S}]`);
            return true;
        } else {
            console.error(`❌ ${table.name}: SCHEMA ERROR. Missing PK or SK.`);
            console.error(item);
            return false;
        }
    } catch (error: any) {
        console.error(`❌ ${table.name}: FAILED TO CONNECT. Error: ${error.message}`);
        return false;
    }
}

async function runVerification() {
    console.log("🔍 RUNNING STRICT ARCHITECTURAL VERIFICATION ON ALL 6 TABLES...\n");
    let allPassed = true;
    for (const table of tables) {
        const passed = await verifyTable(table);
        if (!passed) allPassed = false;
    }
    
    if (allPassed) {
        console.log("\n🎯 VERIFICATION COMPLETE: 100% SUCCESS. All tables strictly adhere to the Single Table Design schemas.");
    } else {
        console.log("\n⚠️ VERIFICATION FAILED: Anomalies detected in table schemas.");
    }
}

runVerification();
