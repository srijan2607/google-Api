xrequire("dotenv").config();
const mongoose = require("mongoose");
const { google } = require("googleapis");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Load User model
const User = require("./models/User");

async function debugTokens() {
  try {
    // Get a user from database
    const users = await User.find();

    if (!users || users.length === 0) {
      console.log("No users found in the database");
      process.exit(0);
    }

    // Find a user with fitness tokens
    const user = users.find((u) => u.fitnessTokens);

    if (!user) {
      console.log("No user with fitness tokens found");
      process.exit(0);
    }

    console.log("User found:", user.displayName);
    console.log("Token info:", {
      hasAccessToken: !!user.fitnessTokens.access_token,
      hasRefreshToken: !!user.fitnessTokens.refresh_token,
      tokenType: user.fitnessTokens.token_type,
      expiryDate: user.fitnessTokens.expiry_date
        ? new Date(user.fitnessTokens.expiry_date).toISOString()
        : "No expiry date",
    });

    // Try to use the token
    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.FIT_CALLBACK_URL
    );

    oauth2Client.setCredentials(user.fitnessTokens);

    // Check if token is valid
    if (
      user.fitnessTokens.expiry_date &&
      Date.now() > user.fitnessTokens.expiry_date
    ) {
      console.log("Token is expired, attempting to refresh...");

      if (!user.fitnessTokens.refresh_token) {
        console.log(
          "No refresh token available, cannot refresh. User needs to reconnect."
        );
      } else {
        try {
          const result = await oauth2Client.refreshAccessToken();
          console.log("Token refreshed successfully:", {
            newExpiryDate: result.credentials.expiry_date
              ? new Date(result.credentials.expiry_date).toISOString()
              : "Unknown",
          });

          // Update user tokens
          user.fitnessTokens = result.credentials;
          await user.save();
          console.log("User tokens updated in database");
        } catch (refreshErr) {
          console.error("Error refreshing token:", refreshErr);
        }
      }
    } else {
      console.log("Token is still valid or has no expiry date");
    }
  } catch (error) {
    console.error("Debug error:", error);
  } finally {
    mongoose.disconnect();
  }
}

debugTokens();
