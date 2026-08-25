import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  }
});

const TEST_EMAIL = "test_dynamo_auth@sportsfan360.com";
const TEST_PASSWORD = "Password@12345";
const TEST_FIRST_NAME = "Dynamo";
const TEST_LAST_NAME = "Tester";

async function runAuthFlowTest() {
  console.log("======================================================================");
  console.log("🧪 TESTING FULL SIGNUP & LOGIN FLOW DIRECTLY ON AWS DYNAMODB");
  console.log("======================================================================\n");

  const cleanEmail = TEST_EMAIL.trim().toLowerCase();
  const consistentUserId = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
  const now = Date.now();

  // --------------------------------------------------------------------------
  // STEP 0: Clean up any prior test artifacts
  // --------------------------------------------------------------------------
  console.log("🧹 Step 0: Cleaning up any previous test records in DynamoDB...");
  await docClient.send(new DeleteCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" }
  })).catch(() => {});
  await docClient.send(new DeleteCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" }
  })).catch(() => {});
  console.log("   ✅ Initial cleanup complete.\n");

  // --------------------------------------------------------------------------
  // STEP 1: SEND OTP (Simulates POST /api/auth/send-otp)
  // --------------------------------------------------------------------------
  console.log("📨 Step 1: Simulating [SEND-OTP]...");
  const otp = "847291";
  const expiresAt = now + 5 * 60 * 1000;

  // 1a. Create Unverified User in DynamoDB
  const userItem = {
    entityId: `USER#${cleanEmail}`,
    sk: "USER#META",
    email: cleanEmail,
    userId: consistentUserId,
    firstName: TEST_FIRST_NAME,
    lastName: TEST_LAST_NAME,
    role: "user",
    status: "active",
    isVerified: false,
    totalPoints: 0,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({
    TableName: "IdentityAndAccess",
    Item: userItem
  }));

  // 1b. Store OTP in DynamoDB
  const otpItem = {
    entityId: `OTP#${cleanEmail}`,
    sk: "OTP#ACTIVE",
    email: cleanEmail,
    otp,
    createdAt: now,
    expiresAt,
  };

  await docClient.send(new PutCommand({
    TableName: "IdentityAndAccess",
    Item: otpItem
  }));

  console.log(`   ✅ User created in DynamoDB: entityId=[USER#${cleanEmail}], sk=[USER#META]`);
  console.log(`   ✅ OTP saved in DynamoDB   : entityId=[OTP#${cleanEmail}], sk=[OTP#ACTIVE] (OTP: ${otp})\n`);

  // --------------------------------------------------------------------------
  // STEP 2: VERIFY OTP (Simulates POST /api/auth/verify-otp)
  // --------------------------------------------------------------------------
  console.log("🔐 Step 2: Simulating [VERIFY-OTP]...");
  
  // 2a. Fetch OTP from DynamoDB
  const otpRes = await docClient.send(new GetCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" }
  }));

  if (!otpRes.Item || otpRes.Item.otp !== otp) {
    throw new Error("OTP verification failed in DynamoDB!");
  }

  // 2b. Mark User as Verified in DynamoDB
  await docClient.send(new UpdateCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
    UpdateExpression: "SET isVerified = :v, verifiedAt = :va",
    ExpressionAttributeValues: { ":v": true, ":va": Date.now() }
  }));

  // 2c. Delete Used OTP
  await docClient.send(new DeleteCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" }
  }));

  console.log("   ✅ OTP verified and deleted from DynamoDB.");
  console.log("   ✅ User status updated to 'isVerified: true' in DynamoDB.\n");

  // --------------------------------------------------------------------------
  // STEP 3: SET PASSWORD (Simulates POST /api/auth/set-password)
  // --------------------------------------------------------------------------
  console.log("🔑 Step 3: Simulating [SET-PASSWORD]...");
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

  await docClient.send(new UpdateCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
    UpdateExpression: "SET password = :p, updatedAt = :u",
    ExpressionAttributeValues: { ":p": hashedPassword, ":u": Date.now() }
  }));

  console.log("   ✅ Password securely hashed with bcrypt and saved in DynamoDB.\n");

  // --------------------------------------------------------------------------
  // STEP 4: LOGIN WITH EMAIL & PASSWORD (Simulates POST /api/auth/login)
  // --------------------------------------------------------------------------
  console.log("🚀 Step 4: Simulating [LOGIN] via DynamoDB email-index...");

  // 4a. Query DynamoDB using email-index
  const emailQuery = await docClient.send(new QueryCommand({
    TableName: "IdentityAndAccess",
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": cleanEmail },
    Limit: 1
  }));

  if (!emailQuery.Items || emailQuery.Items.length === 0) {
    throw new Error("Login failed: User not found in DynamoDB email-index!");
  }

  const dbUser = emailQuery.Items[0];
  console.log(`   ✅ Found user in DynamoDB via email-index: entityId=[${dbUser.entityId}]`);

  // 4b. Verify Password
  const isMatch = await bcrypt.compare(TEST_PASSWORD, dbUser.password as string);
  if (!isMatch) {
    throw new Error("Login failed: Password mismatch!");
  }
  console.log("   ✅ Password matched successfully!");

  // 4c. Generate JWT Token
  const jwtSecret = process.env.JWT_SECRET || "sportsfan360_secret_key";
  const token = jwt.sign(
    {
      email: dbUser.email,
      userId: dbUser.userId,
      name: `${dbUser.firstName} ${dbUser.lastName}`,
      role: dbUser.role,
      status: dbUser.status
    },
    jwtSecret,
    { expiresIn: "7d" }
  );

  console.log("   ✅ JWT Session Token generated successfully!\n");

  // --------------------------------------------------------------------------
  // STEP 5: AUTHENTICATED SESSION CHECK (Simulates getUser / /api/auth/me)
  // --------------------------------------------------------------------------
  console.log("👤 Step 5: Simulating [AUTHENTICATED PROFILE LOOKUP] via Token...");
  const decoded = jwt.verify(token, jwtSecret) as any;

  const profileRes = await docClient.send(new GetCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `USER#${decoded.email}`, sk: "USER#META" }
  }));

  if (!profileRes.Item) {
    throw new Error("Profile lookup failed in DynamoDB!");
  }

  console.log("   ✅ Authenticated Profile Data Retrieved:");
  console.log(`      • Email    : ${profileRes.Item.email}`);
  console.log(`      • User ID  : ${profileRes.Item.userId}`);
  console.log(`      • Name     : ${profileRes.Item.firstName} ${profileRes.Item.lastName}`);
  console.log(`      • Role     : ${profileRes.Item.role}`);
  console.log(`      • Verified : ${profileRes.Item.isVerified}\n`);

  // --------------------------------------------------------------------------
  // STEP 6: CLEANUP TEST ACCOUNT
  // --------------------------------------------------------------------------
  console.log("🧹 Step 6: Cleaning up test account from DynamoDB...");
  await docClient.send(new DeleteCommand({
    TableName: "IdentityAndAccess",
    Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" }
  }));
  console.log("   ✅ Test account removed.\n");

  console.log("======================================================================");
  console.log("🎉 ALL DYNAMODB AUTHENTICATION TESTS PASSED WITH 100% SUCCESS!");
  console.log("======================================================================");
  console.log("✔️  Send OTP      ➔ Works in DynamoDB");
  console.log("✔️  Verify OTP    ➔ Works in DynamoDB");
  console.log("✔️  Set Password  ➔ Works in DynamoDB");
  console.log("✔️  Login         ➔ Works in DynamoDB via email-index");
  console.log("✔️  Session/JWT   ➔ Works in DynamoDB");
  console.log("======================================================================\n");
}

runAuthFlowTest().catch(err => {
  console.error("❌ DynamoDB Auth Test Failed:", err);
  process.exit(1);
});
