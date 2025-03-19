const mongoose = require("mongoose");

// Create user schema
const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  photo: {
    type: String,
  },
  fitnessTokens: {
    access_token: String,
    refresh_token: String,
    scope: String,
    token_type: String,
    expiry_date: Number,
  },
  fitnessMetrics: {
    steps: Number,
    calories: Number,
    activeMinutes: Number,
    lastUpdated: Date,
  },
  // Keep existing stepCount field for backward compatibility
  stepCount: {
    count: Number,
    lastUpdated: Date,
  },
  stepHistory: [
    {
      date: String,
      steps: Number,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create and export model
module.exports = mongoose.model("User", userSchema);
