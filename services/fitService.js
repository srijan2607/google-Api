const { google } = require("googleapis");

// Configuration for Google Fit API
const fitService = {
  // Get OAuth2 client for Google Fit
  getOAuthClient: () => {
    return new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.FIT_CALLBACK_URL || process.env.CALLBACK_URL
    );
  },

  // Get authorization URL for Google Fit
  getAuthUrl: (oauth2Client) => {
    // Explicitly request all required scopes
    const scopes = [
      "https://www.googleapis.com/auth/fitness.activity.read",
      "https://www.googleapis.com/auth/fitness.location.read",
      "profile",
      "email",
    ];

    // Must use prompt:consent to get a refresh token every time
    return oauth2Client.generateAuthUrl({
      access_type: "offline", // Gets refresh token
      prompt: "consent", // Forces consent screen to appear
      scope: scopes,
      include_granted_scopes: true,
    });
  },

  // Get tokens from authorization code with detailed logging
  async getTokens(oauth2Client, code) {
    try {
      console.log("Getting tokens with code:", code.substring(0, 10) + "...");

      const response = await oauth2Client.getToken(code);
      const tokens = response.tokens;

      console.log("Token response received:", {
        hasAccessToken: !!tokens.access_token,
        accessTokenStart: tokens.access_token
          ? tokens.access_token.substring(0, 5) + "..."
          : "none",
        hasRefreshToken: !!tokens.refresh_token,
        refreshTokenStart: tokens.refresh_token
          ? tokens.refresh_token.substring(0, 5) + "..."
          : "none",
        tokenType: tokens.token_type,
        expiryDate: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : "none",
      });

      return tokens;
    } catch (error) {
      console.error("Error getting tokens:", error.message);
      if (error.response) {
        console.error("Response details:", error.response.data);
      }
      throw error;
    }
  },

  // Check and refresh token if needed
  async ensureValidToken(oauth2Client, tokens, userId, User) {
    try {
      // First, make sure we set the existing tokens
      oauth2Client.setCredentials(tokens);

      // Check if token is expired or will expire soon (within 5 minutes)
      const now = Date.now();
      const isExpired =
        tokens.expiry_date && tokens.expiry_date <= now + 300000;

      if (isExpired && tokens.refresh_token) {
        console.log("Token expired, refreshing...");

        // Use the refresh token to get new tokens
        const { credentials } = await oauth2Client.refreshAccessToken();
        console.log("Credentials refreshed successfully");

        // Update the user's tokens in the database
        if (userId && User) {
          await User.findByIdAndUpdate(userId, {
            fitnessTokens: credentials,
          });
          console.log("Updated user tokens in database");
        }

        // Return the updated tokens
        return credentials;
      }

      return tokens;
    } catch (error) {
      console.error("Error refreshing token:", error);
      throw error;
    }
  },

  // Add a new method to get multiple fitness metrics at once
  async getFitnessMetrics(
    oauth2Client,
    tokens,
    userId = null,
    User = null,
    forceRefresh = true
  ) {
    try {
      console.log(
        `Starting getFitnessMetrics with force refresh: ${forceRefresh}`
      );

      // Make sure oauth2Client has the tokens
      if (tokens && tokens.access_token) {
        oauth2Client.setCredentials(tokens);
        console.log("Credentials set on oauth2Client");
      } else {
        throw new Error("Invalid token data provided");
      }

      const fitness = google.fitness({
        version: "v1",
        auth: oauth2Client,
      });

      // Set time range for today - using correct dates
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);

      const startTimeMillis = midnight.getTime();
      const endTimeMillis = now.getTime();

      console.log(
        `Making fitness metrics request from ${new Date(
          startTimeMillis
        ).toLocaleString()} to ${new Date(endTimeMillis).toLocaleString()}`
      );

      // Create a unique timestamp for each request to avoid caching
      const timestamp = Date.now();

      // Request step count, calories and active minutes in one API call
      try {
        const response = await fitness.users.dataset.aggregate({
          userId: "me",
          requestHeaders: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
          requestBody: {
            aggregateBy: [
              {
                dataTypeName: "com.google.step_count.delta",
                // No dataSourceId to get all step count sources
              },
              {
                dataTypeName: "com.google.calories.expended",
                // No dataSourceId to get all calories sources
              },
              {
                dataTypeName: "com.google.active_minutes",
                // No dataSourceId to get all activity sources
              },
            ],
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
            startTimeMillis,
            endTimeMillis,
          },
        });

        console.log("Multiple metrics API response received");

        // Initialize metrics with default values
        let metrics = {
          steps: 0,
          calories: 0,
          activeMinutes: 0,
        };

        if (response.data.bucket && response.data.bucket.length > 0) {
          const bucket = response.data.bucket[0];

          if (bucket.dataset) {
            bucket.dataset.forEach((dataset) => {
              // Process each dataset based on its type
              const dataType = dataset.dataSourceId || "";
              console.log(`Processing dataset: ${dataType}`);

              if (dataset.point) {
                if (
                  dataType.includes("step_count") ||
                  dataset.dataSourceId?.includes("estimated_steps")
                ) {
                  // Step count processing
                  dataset.point.forEach((point) => {
                    if (point.value && point.value.length > 0) {
                      metrics.steps += point.value[0].intVal || 0;
                    }
                  });
                } else if (dataType.includes("calories")) {
                  // Calories processing - these are usually floating point values
                  dataset.point.forEach((point) => {
                    if (point.value && point.value.length > 0) {
                      metrics.calories += point.value[0].fpVal || 0;
                    }
                  });
                } else if (dataType.includes("active_minutes")) {
                  // Active minutes processing
                  dataset.point.forEach((point) => {
                    if (point.value && point.value.length > 0) {
                      metrics.activeMinutes += point.value[0].intVal || 0;
                    }
                  });
                }
              }
            });
          }
        }

        // Round calories to 1 decimal place for display purposes
        metrics.calories = Math.round(metrics.calories * 10) / 10;

        console.log(
          `Metrics calculated: Steps: ${metrics.steps}, Calories: ${metrics.calories}, Active Minutes: ${metrics.activeMinutes}`
        );

        return metrics;
      } catch (apiError) {
        console.error("API request error:", apiError.message);
        if (apiError.response) {
          console.error("API error response:", apiError.response.data);
        }
        throw apiError;
      }
    } catch (error) {
      console.error("Error in getFitnessMetrics:", error.message);
      throw error;
    }
  },

  // Existing getStepCount method can now use the metrics function
  async getStepCount(
    oauth2Client,
    tokens,
    userId = null,
    User = null,
    forceRefresh = true
  ) {
    try {
      const metrics = await this.getFitnessMetrics(
        oauth2Client,
        tokens,
        userId,
        User,
        forceRefresh
      );
      return metrics.steps;
    } catch (error) {
      console.error("Error in getStepCount:", error.message);
      throw error;
    }
  },

  // Get historical step data for the past days
  async getHistoricalStepData(
    oauth2Client,
    days = 7,
    tokens = null,
    userId = null,
    User = null
  ) {
    try {
      // Ensure we have valid tokens
      if (tokens && userId && User) {
        tokens = await this.ensureValidToken(
          oauth2Client,
          tokens,
          userId,
          User
        );
        oauth2Client.setCredentials(tokens);
      }

      const fitness = google.fitness({
        version: "v1",
        auth: oauth2Client,
      });

      // Calculate time range with correct dates
      const now = new Date();
      const endTimeMillis = now.getTime();

      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      const startTimeMillis = startDate.getTime();

      console.log(
        `Querying historical steps from ${new Date(
          startTimeMillis
        ).toISOString()} to ${new Date(endTimeMillis).toISOString()}`
      );

      // Add cache-busting headers to historical data requests too
      const response = await fitness.users.dataset.aggregate({
        userId: "me",
        requestHeaders: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
        requestBody: {
          aggregateBy: [
            {
              dataTypeName: "com.google.step_count.delta",
              // Remove the specific dataSourceId to get data from all sources
            },
          ],
          bucketByTime: {
            durationMillis: 86400000, // 1 day in milliseconds
          },
          startTimeMillis,
          endTimeMillis,
        },
      });

      // Process response to get daily step counts
      const dailySteps = [];

      if (response.data && response.data.bucket) {
        response.data.bucket.forEach((bucket) => {
          // Extract date from the start time
          const date = new Date(parseInt(bucket.startTimeMillis));
          const formattedDate = date.toISOString().split("T")[0]; // YYYY-MM-DD format

          // Extract step count from the bucket
          let steps = 0;
          if (bucket.dataset && bucket.dataset[0] && bucket.dataset[0].point) {
            bucket.dataset[0].point.forEach((point) => {
              if (point.value && point.value[0]) {
                steps += point.value[0].intVal || 0;
              }
            });
          }

          dailySteps.push({
            date: formattedDate,
            steps: steps,
          });
        });
      }

      return dailySteps;
    } catch (error) {
      console.error("Error fetching historical step data:", error);
      return [];
    }
  },
};

module.exports = fitService;
