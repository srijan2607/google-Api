require("dotenv").config();
const { google } = require("googleapis");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Create OAuth client
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.FIT_CALLBACK_URL || process.env.CALLBACK_URL
);

// Generate authorization URL with the required scopes
const scopes = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.location.read",
  "profile",
  "email",
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
  include_granted_scopes: true,
});

console.log("Authorize this app by visiting this url:", authUrl);

// Get the authorization code from the user
rl.question("Enter the code from that page here: ", async (code) => {
  try {
    // Exchange the authorization code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    console.log("✅ Successfully retrieved tokens:");
    console.log(
      "Access token:",
      tokens.access_token ? `${tokens.access_token.substr(0, 10)}...` : "None"
    );
    console.log(
      "Refresh token:",
      tokens.refresh_token ? `${tokens.refresh_token.substr(0, 10)}...` : "None"
    );
    console.log("Token type:", tokens.token_type);
    console.log(
      "Expires at:",
      tokens.expiry_date
        ? new Date(tokens.expiry_date).toLocaleString()
        : "No expiration"
    );

    // Set the credentials
    oAuth2Client.setCredentials(tokens);

    // Try a simple API request to verify the token works
    console.log("\nTesting the token with a fitness API request...");

    try {
      const fitness = google.fitness({
        version: "v1",
        auth: oAuth2Client,
      });

      // Get today's step count
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);

      const stepResponse = await fitness.users.dataset.aggregate({
        userId: "me",
        requestBody: {
          aggregateBy: [
            {
              dataTypeName: "com.google.step_count.delta",
              dataSourceId:
                "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
            },
          ],
          bucketByTime: { durationMillis: now.getTime() - midnight.getTime() },
          startTimeMillis: midnight.getTime(),
          endTimeMillis: now.getTime(),
        },
      });

      console.log("✅ API request successful!");
      console.log("Response data:", JSON.stringify(stepResponse.data, null, 2));

      // Calculate steps
      let steps = 0;
      if (
        stepResponse.data.bucket &&
        stepResponse.data.bucket[0] &&
        stepResponse.data.bucket[0].dataset &&
        stepResponse.data.bucket[0].dataset[0] &&
        stepResponse.data.bucket[0].dataset[0].point
      ) {
        stepResponse.data.bucket[0].dataset[0].point.forEach((point) => {
          if (point.value && point.value[0]) {
            steps += point.value[0].intVal || 0;
          }
        });
      }

      console.log(`\n👟 Today's step count: ${steps} steps`);
    } catch (apiError) {
      console.error("❌ API request failed:", apiError.message);
      if (apiError.response) {
        console.error("Error data:", apiError.response.data);
      }
    }
  } catch (tokenError) {
    console.error("❌ Error getting tokens:", tokenError.message);
    if (tokenError.response) {
      console.error("Error data:", tokenError.response.data);
    }
  }

  rl.close();
});
