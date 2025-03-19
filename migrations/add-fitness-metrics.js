require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find all users that have stepCount but no fitnessMetrics
    const users = await User.find({
      stepCount: { $exists: true, $ne: null },
      'fitnessMetrics.steps': { $exists: false }
    });
    
    console.log(`Found ${users.length} users to migrate`);
    
    let migratedCount = 0;
    
    for (const user of users) {
      try {
        // Copy step count to the new fitnessMetrics field
        if (user.stepCount && user.stepCount.count) {
          await User.updateOne(
            { _id: user._id },
            { 
              $set: {
                fitnessMetrics: {
                  steps: user.stepCount.count,
                  calories: 0,  // Default value until next refresh
                  activeMinutes: 0,  // Default value until next refresh
                  lastUpdated: user.stepCount.lastUpdated || new Date()
                }
              }
            }
          );
          migratedCount++;
          console.log(`Migrated user ${user.displayName}`);
        }
      } catch (userError) {
        console.error(`Error migrating user ${user._id}:`, userError);
      }
    }
    
    console.log(`Migration complete. Migrated ${migratedCount} users.`);
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateUsers();
