const express = require("express");
const session = require("express-session");
const passport = require("passport");
const dotenv = require("dotenv");
const connectDB = require("./db/connect");
const fitService = require("./services/fitService");
const User = require("./models/User");
const path = require("path");
const fs = require("fs");
const { google } = require("googleapis"); // Added this for the debug route

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Connect to MongoDB and handle potential connection failure
(async () => {
  const dbConnected = await connectDB();

  if (dbConnected) {
    // Only load passport config if DB connection is successful
    require("./config/passport");

    // Session middleware
    app.use(
      session({
        secret: "keyboard cat",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 1 day
      })
    );

    // Passport middleware
    app.use(passport.initialize());
    app.use(passport.session());

    app.get(
      "/auth/google",
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    app.get(
      "/google/callback",
      passport.authenticate("google", { failureRedirect: "/" }),
      (req, res) => {
        res.redirect("/success");
      }
    );

    // Success page - Updated to show multiple metrics
    app.get("/success", ensureAuthenticated, (req, res) => {
      // Check if user has connected fitness data
      const hasConnectedFitness = !!req.user.fitnessTokens;
      const stepCount = req.user.stepCount ? req.user.stepCount.count : null;
      const lastUpdated = req.user.stepCount
        ? new Date(req.user.stepCount.lastUpdated)
        : null;

      // Format last updated time if available
      let lastUpdatedText = "";
      if (lastUpdated) {
        const now = new Date();
        const minutesAgo = Math.floor((now - lastUpdated) / 60000);

        if (minutesAgo < 1) {
          lastUpdatedText = "just now";
        } else if (minutesAgo === 1) {
          lastUpdatedText = "1 minute ago";
        } else if (minutesAgo < 60) {
          lastUpdatedText = `${minutesAgo} minutes ago`;
        } else {
          const hoursAgo = Math.floor(minutesAgo / 60);
          if (hoursAgo === 1) {
            lastUpdatedText = "1 hour ago";
          } else {
            lastUpdatedText = `${hoursAgo} hours ago`;
          }
        }
      }

      res.send(`
        <h1>Authentication Successful!</h1>
        <h2>User Profile Information:</h2>
        <p><strong>Name:</strong> ${req.user.displayName}</p>
        <p><strong>Email:</strong> ${req.user.email}</p>
        <img src="${
          req.user.photo
        }" alt="Profile Picture" style="border-radius: 50%; width: 100px; height: 100px;">
        <br><br>
        ${
          !hasConnectedFitness
            ? `<a href="/connect/fitness" style="display: inline-block; background-color: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Connect Health</a>`
            : `
                <div style="padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; background-color: #f9f9f9;">
                  <h1 style="margin-top: 0;">Today's Step Count: ${
                    stepCount !== null ? stepCount : "Loading..."
                  }</h1>
                  ${
                    lastUpdated
                      ? `<p style="color: #666;">Last updated: ${lastUpdatedText}</p>`
                      : ""
                  }
                  <p style="font-size: 14px; color: #666;">Data from Google Fitness API (always showing the latest data)</p>
                  <p style="font-size: 12px; color: #999;">Steps not matching your Google Fit app? <a href="/step-sync-help">See why</a></p>
                </div>
                
                <div>
                  <!-- Renamed to just "Update Step Count" since all updates are forced now -->
                  <a href="/force-sync/fitness" style="display: inline-block; background-color: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-right: 10px;">Update Step Count</a>
                  <a href="/step-history" style="display: inline-block; background-color: #FBBC05; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">View History</a>
                </div>
                <div style="margin-top: 10px;">
                  <a href="/debug/step-data" style="color: #666;">View detailed step data sources</a>
                </div>
              `
        }
        <br><br>
        <a href="/logout">Logout</a>
      `);
    });

    // Add a help route for step count sync issues
    app.get("/step-sync-help", ensureAuthenticated, (req, res) => {
      const helpPath = path.join(__dirname, "views", "step-sync-help.html");
      fs.readFile(helpPath, "utf8", (err, data) => {
        if (err) {
          console.error("Error reading step sync help file:", err);
          return res.status(500).send("Error loading help guide");
        }
        res.send(data);
      });
    });

    // Add a new force-sync route that's more aggressive about getting fresh data
    app.get("/force-sync/fitness", ensureAuthenticated, async (req, res) => {
      try {
        // Show a loading page first so user knows something is happening
        res.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Syncing Fitness Data</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                margin-top: 100px;
              }
              .spinner {
                border: 6px solid #f3f3f3;
                border-top: 6px solid #4285F4;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 2s linear infinite;
                margin: 20px auto;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
            <script>
              // After 8 seconds, complete the request and redirect
              setTimeout(() => {
                window.location.href = '/refresh/fitness?timestamp=${Date.now()}';
              }, 8000);
            </script>
          </head>
          <body>
            <h2>Syncing with Google Fitness</h2>
            <div class="spinner"></div>
            <p>Please wait while we get your latest step data...</p>
            <p><small>We're doing everything possible to get the freshest data</small></p>
          </body>
          </html>
        `);

        // End the response - client will be redirected by JS
        res.end();

        // Meanwhile, on the server side, we'll pre-fetch data
        try {
          const user = await User.findById(req.user._id);

          if (!user.fitnessTokens) {
            console.log("No fitness tokens for pre-fetch");
            return;
          }

          console.log(
            "Pre-fetching fitness data while displaying loading screen"
          );
          const oauth2Client = fitService.getOAuthClient();

          // Wait 5 seconds before fetching to give Google Fit API time to sync
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Force refresh is true by default now
          await fitService.getStepCount(
            oauth2Client,
            user.fitnessTokens,
            user._id,
            User
          );

          console.log("Pre-fetch completed");
        } catch (error) {
          console.error("Pre-fetch error:", error);
        }
      } catch (error) {
        console.error("Force sync error:", error);
        res.redirect("/success");
      }
    });

    // Graph page route
    app.get("/step-history", ensureAuthenticated, (req, res) => {
      const graphPath = path.join(__dirname, "views", "graph.html");
      fs.readFile(graphPath, "utf8", (err, data) => {
        if (err) {
          console.error("Error reading graph file:", err);
          return res.status(500).send("Error loading step history graph");
        }
        res.send(data);
      });
    });

    // API endpoint for step history data
    app.get("/api/steps/history", ensureAuthenticated, async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const validDays = Math.min(Math.max(days, 1), 30);
        const user = await User.findById(req.user._id);

        if (!user.fitnessTokens) {
          return res
            .status(400)
            .json({ error: "Fitness connection not established" });
        }

        const oauth2Client = fitService.getOAuthClient();
        const historyData = await fitService.getHistoricalStepData(
          oauth2Client,
          validDays,
          user.fitnessTokens,
          user._id,
          User
        );

        res.json(historyData.reverse());
      } catch (error) {
        console.error("Error fetching step history:", error);
        res.status(500).json({ error: "Failed to fetch step history" });
      }
    });

    // Fitness connection route
    app.get("/connect/fitness", ensureAuthenticated, (req, res) => {
      const oauth2Client = fitService.getOAuthClient();
      const authUrl = fitService.getAuthUrl(oauth2Client);
      res.redirect(authUrl);
    });

    // Fitness callback route
    app.get("/fitness/callback", ensureAuthenticated, async (req, res) => {
      // Check for error parameter which indicates OAuth error
      if (req.query.error) {
        console.error("OAuth error:", req.query.error);
        return res.redirect("/oauth-error");
      }

      const code = req.query.code;
      if (code) {
        try {
          const oauth2Client = fitService.getOAuthClient();
          const tokens = await fitService.getTokens(oauth2Client, code);

          // Store the tokens in the user document
          await User.findByIdAndUpdate(req.user._id, {
            fitnessTokens: tokens,
          });

          res.redirect("/refresh/fitness");
        } catch (error) {
          console.error("Error getting fitness tokens:", error);
          // Check if this is an authorization error
          if (
            error.message &&
            (error.message.includes("access_denied") ||
              error.message.includes("not authorized"))
          ) {
            return res.redirect("/oauth-error");
          }
          res.redirect("/success");
        }
      } else {
        res.redirect("/success");
      }
    });

    // Simplify the refresh route to always use force fetch
    app.get("/refresh/fitness", ensureAuthenticated, async (req, res) => {
      try {
        const user = await User.findById(req.user._id);

        if (!user.fitnessTokens) {
          console.log("User has no fitness tokens, redirecting to connect");
          return res.redirect("/connect/fitness");
        }

        console.log(
          `Refreshing fitness data for ${user.displayName} with forced sync`
        );

        try {
          const oauth2Client = fitService.getOAuthClient();

          // Always force refresh now (forceRefresh parameter is true by default)
          const stepCount = await fitService.getStepCount(
            oauth2Client,
            user.fitnessTokens,
            user._id,
            User
          );

          console.log(`Successfully retrieved ${stepCount} steps`);

          await User.findByIdAndUpdate(user._id, {
            stepCount: {
              count: stepCount,
              lastUpdated: new Date(),
            },
          });

          res.redirect("/success");
        } catch (error) {
          console.error("Error refreshing fitness data:", error.message);

          if (
            error.message.includes("token") ||
            error.message.includes("auth")
          ) {
            console.log("Token issue detected, redirecting to reconnect");
            return res.redirect("/reconnect/fitness");
          }

          res.status(500).send(`
            <h1>Fitness Data Error</h1>
            <p>There was a problem accessing your fitness data: ${error.message}</p>
            <p><a href="/debug/step-data">View debug information</a></p>
            <p><a href="/success">Return to your profile</a></p>
          `);
        }
      } catch (dbError) {
        console.error("Database error in /refresh/fitness:", dbError);
        res.status(500).send("Database error occurred");
      }
    });

    // Add a reconnect route for when tokens are invalid
    app.get("/reconnect/fitness", ensureAuthenticated, async (req, res) => {
      try {
        // Clear existing tokens
        await User.findByIdAndUpdate(req.user._id, {
          fitnessTokens: null,
          stepCount: null,
        });

        res.send(`
          <h1>Reconnect Your Google Fitness Account</h1>
          <p>Your fitness connection needs to be reauthorized.</p>
          <div style="background-color: #f8f9fa; border-left: 4px solid #4285F4; padding: 16px; margin: 20px 0;">
            <h3>For successful connection:</h3>
            <ol>
              <li>Make sure you're signed in to Google with the account that has your fitness data</li>
              <li>When the permission screen appears, <strong>you must grant all requested permissions</strong></li>
              <li>Don't skip any permissions or the connection will fail</li>
              <li>Have the Google Fit app installed and synced on your mobile device</li>
            </ol>
          </div>
          <div style="margin: 30px 0;">
            <a href="/connect/fitness" style="display: inline-block; background-color: #4285F4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
              Reconnect to Google Fitness
            </a>
          </div>
          <p><a href="/success">Return to profile without reconnecting</a></p>
        `);
      } catch (error) {
        console.error("Error in reconnect route:", error);
        res.status(500).send("An error occurred during reconnection");
      }
    });

    // Add a detailed step data debug endpoint
    app.get("/debug/step-data", ensureAuthenticated, async (req, res) => {
      try {
        const user = await User.findById(req.user._id);

        if (!user.fitnessTokens) {
          return res.send(
            "No fitness tokens found. Please connect fitness first."
          );
        }

        const oauth2Client = fitService.getOAuthClient();
        oauth2Client.setCredentials(user.fitnessTokens);

        // Get today's detailed step data
        const fitness = google.fitness({ version: "v1", auth: oauth2Client });

        // Set time range for today
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);

        const startTimeMillis = midnight.getTime();
        const endTimeMillis = now.getTime();

        // Get detailed step data from multiple sources
        const response = await fitness.users.dataset.aggregate({
          userId: "me",
          requestBody: {
            aggregateBy: [
              {
                dataTypeName: "com.google.step_count.delta",
                // No dataSourceId to get all sources
              },
            ],
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
            startTimeMillis,
            endTimeMillis,
          },
        });

        // Process response to show all data sources
        let html = `
          <h1>Detailed Step Data</h1>
          <h2>User: ${user.displayName}</h2>
          <p>Time period: ${new Date(
            startTimeMillis
          ).toLocaleString()} to ${new Date(endTimeMillis).toLocaleString()}</p>
          <hr>
        `;

        let totalSteps = 0;
        const stepsBySource = {};

        if (response.data.bucket && response.data.bucket.length > 0) {
          const bucket = response.data.bucket[0];

          if (bucket.dataset) {
            html += `<h3>Found ${bucket.dataset.length} data sources:</h3>`;

            bucket.dataset.forEach((dataset, index) => {
              html += `<div style="margin: 15px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">`;
              html += `<p><strong>Data Source ${index + 1}:</strong> ${
                dataset.dataSourceId || "Unknown"
              }</p>`;

              let sourceSteps = 0;

              if (dataset.point && dataset.point.length > 0) {
                html += `<p>Data points: ${dataset.point.length}</p>`;
                html += `<ul>`;

                dataset.point.forEach((point) => {
                  if (point.value && point.value.length > 0) {
                    const steps = point.value[0].intVal || 0;
                    sourceSteps += steps;

                    const startTime = new Date(
                      parseInt(point.startTimeNanos / 1000000)
                    );
                    const endTime = new Date(
                      parseInt(point.endTimeNanos / 1000000)
                    );

                    html += `<li>${steps} steps from ${startTime.toLocaleTimeString()} to ${endTime.toLocaleTimeString()}</li>`;
                  }
                });

                html += `</ul>`;
              } else {
                html += `<p>No data points found</p>`;
              }

              html += `<p><strong>Total from this source: ${sourceSteps} steps</strong></p>`;
              html += `</div>`;

              totalSteps += sourceSteps;
              stepsBySource[dataset.dataSourceId || "Unknown"] = sourceSteps;
            });
          } else {
            html += `<p>No datasets found</p>`;
          }
        } else {
          html += `<p>No data buckets found</p>`;
        }

        html += `<div style="margin-top: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">`;
        html += `<h2>Summary:</h2>`;
        html += `<p>Total steps across all sources: ${totalSteps}</p>`;
        html += `</div>`;

        html += `<div style="margin-top: 20px;">`;
        html += `<a href="/success" style="color: #4285F4;">Back to Profile</a>`;
        html += `</div>`;

        res.send(html);
      } catch (error) {
        console.error("Error fetching detailed step data:", error);
        res.status(500).send(`Error: ${error.message}`);
      }
    });

    // Reset fitness route
    app.get("/reset/fitness", ensureAuthenticated, async (req, res) => {
      try {
        const user = await User.findById(req.user._id);

        if (!user) {
          return res.status(404).send("User not found");
        }

        await User.findByIdAndUpdate(req.user._id, {
          fitnessTokens: null,
          stepCount: null,
        });

        res.send(`
          <h1>Fitness Connection Reset</h1>
          <p>Your fitness connection has been reset.</p>
          <p>You'll need to reconnect to continue tracking your steps.</p>
          <div style="margin: 20px 0;">
            <a href="/connect/fitness" style="display: inline-block; background-color: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Connect to Google Fitness</a>
          </div>
          <a href="/success">Back to Profile</a>
        `);
      } catch (error) {
        console.error("Error during fitness reset:", error);
        res.status(500).send(`Error: ${error.message}`);
      }
    });

    // Protected route example
    app.get("/protected", ensureAuthenticated, (req, res) => {
      res.send("Protected route - You are authenticated!");
    });

    // Logout route
    app.get("/logout", (req, res) => {
      req.logout(function (err) {
        if (err) {
          return next(err);
        }
        res.redirect("/");
      });
    });

    // Middleware to check if user is authenticated
    function ensureAuthenticated(req, res, next) {
      if (req.isAuthenticated()) {
        return next();
      }
      res.redirect("/");
    }
  } else {
    console.log("Running in limited mode due to database connection failure");
  }

  // Add a new route to guide the user through API setup
  app.get("/api-setup", (req, res) => {
    const setupPath = path.join(__dirname, "views", "api-setup-guide.html");
    fs.readFile(setupPath, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading api setup file:", err);
        return res.status(500).send("Error loading API setup guide");
      }
      res.send(data);
    });
  });

  // Add a route to show the OAuth error guide
  app.get("/oauth-error", (req, res) => {
    const errorGuidePath = path.join(
      __dirname,
      "views",
      "oauth-error-guide.html"
    );
    fs.readFile(errorGuidePath, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading oauth error guide:", err);
        return res.status(500).send("Error loading OAuth error guide");
      }
      res.send(data);
    });
  });

  app.get("/", (req, res) => {
    if (!dbConnected) {
      res.send(`
        <h1>Database Connection Error</h1>
        <p>MongoDB connection failed. Please check if MongoDB is running and try again.</p>
        <p>Steps to fix:</p>
        <ul>
          <li>Ensure MongoDB is installed and running</li>
          <li>Check that the connection string in .env file is correct</li>
          <li>Verify network settings allow connection to MongoDB</li>
        </ul>
      `);
    } else {
      res.send(`
        <h1>Welcome to the Google Fitness Integration App</h1>
        <div style="margin: 20px 0">
          <a href="/auth/google" style="display: inline-block; background-color: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Authenticate with Google</a>
        </div>
        <p>Having issues with the Google Fitness API? <a href="/api-setup">View the API Setup Guide</a></p>
      `);
    }
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
})();
