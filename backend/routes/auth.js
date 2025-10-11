const express = require('express');
const {
  sendOTP,
  verifyOTP,
  login,
  socialAuth,
  driverApplication
} = require('../controllers/authController');

const router = express.Router();

// @route   POST /api/auth/send-otp
// @desc    Send OTP for verification
// @access  Public
router.post('/send-otp', sendOTP);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and complete registration
// @access  Public
router.post('/verify-otp', verifyOTP);

// @route   POST /api/auth/login
// @desc    Login with email/phone and password
// @access  Public
router.post('/login', login);

// @route   POST /api/auth/social
// @desc    Social login/registration
// @access  Public
router.post('/social', socialAuth);

// @route   POST /api/auth/driver-application
// @desc    Submit driver application
// @access  Public
router.post('/driver-application', driverApplication);

module.exports = router;