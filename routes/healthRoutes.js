const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/auth');

// Route to receive health data from mobile app
router.post('/sync', ensureAuthenticated, async (req, res) => {
  try {
    const { todaySteps, stepHistory } = req.body;
    
    // Update the user's health data in the database
    await User.findByIdAndUpdate(req.user._id, {
      stepCount: {
        count: todaySteps,
        lastUpdated: new Date()
      },
      stepHistory: stepHistory
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error syncing health data:', error);
    res.status(500).json({ success: false, message: 'Failed to sync health data' });
  }
});

// Route to get user's health data
router.get('/data', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.status(200).json({
      stepCount: user.stepCount || { count: 0, lastUpdated: null },
      stepHistory: user.stepHistory || []
    });
  } catch (error) {
    console.error('Error retrieving health data:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve health data' });
  }
});

module.exports = router;
