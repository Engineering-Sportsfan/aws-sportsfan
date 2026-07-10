const jwt = require("jsonwebtoken");
const axios = require("axios");

const JWT_SECRET = "346d72f1890406d60f48fa664d4af31febf5cc8f0350489e62c3cab084f312a3";
const BACKEND_URL = "http://localhost:3000";

const testUser = {
  email: "new_test_boss_user@sportsfan360.com",
  userId: "new_test_boss_user_sportsfan360_com",
  name: "Test Boss User",
  role: "user"
};

const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: "1h" });

async function run() {
  console.log("=== SIMULATING NEW USER ROAR FLOW ===");
  console.log("Mock Token:", token);
  
  // 1. Check profile (should return 404 not onboarded)
  console.log("\n1. Fetching profile for new user...");
  try {
    const res = await axios.get(`${BACKEND_URL}/api/roar/profile`, {
      headers: {
        Cookie: `token=${token}`
      }
    });
    console.log("GET profile response status:", res.status);
    console.log("GET profile response data:", res.data);
  } catch (err) {
    if (err.response) {
      console.log("GET profile failed as expected!");
      console.log("Status:", err.response.status);
      console.log("Data:", err.response.data);
    } else {
      console.error("Network error fetching profile:", err.message);
      return;
    }
  }

  // 2. Submit onboarding
  console.log("\n2. Submitting onboarding for new user...");
  try {
    const res = await axios.post(`${BACKEND_URL}/api/roar/onboarding`, {
      sports: ["cricket"],
      teams: ["India", "MI"],
      tenure: "seasoned",
      badge: "SEASONED_FAN",
      firstContribution: "agree"
    }, {
      headers: {
        Cookie: `token=${token}`
      }
    });
    console.log("POST onboarding response status:", res.status);
    console.log("POST onboarding response data:", res.data);
  } catch (err) {
    if (err.response) {
      console.log("POST onboarding failed!");
      console.log("Status:", err.response.status);
      console.log("Data:", err.response.data);
      return;
    } else {
      console.error("Network error submitting onboarding:", err.message);
      return;
    }
  }

  // 3. Check profile again (should return 200 onboarded)
  console.log("\n3. Fetching profile again after onboarding...");
  try {
    const res = await axios.get(`${BACKEND_URL}/api/roar/profile`, {
      headers: {
        Cookie: `token=${token}`
      }
    });
    console.log("GET profile response status:", res.status);
    console.log("GET profile success! User data:", res.data.user);
  } catch (err) {
    if (err.response) {
      console.log("GET profile failed after onboarding!");
      console.log("Status:", err.response.status);
      console.log("Data:", err.response.data);
    } else {
      console.error("Network error fetching profile:", err.message);
    }
  }
}

run().catch(console.error);
