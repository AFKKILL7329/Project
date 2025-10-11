const User = require('../models/User');
const { generateOTP, sendEmailOTP, sendSMSOTP } = require('../utils/otpGenerator');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'ridesync_secret', {
    expiresIn: '30d'
  });
};

// Send OTP for verification
exports.sendOTP = async (req, res) => {
  try {
    const { email, phoneNumber, fullName, userType } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Check if user already exists
    let user = await User.findOne({
      $or: [
        { email: email?.toLowerCase() },
        { phoneNumber }
      ]
    });

    if (user && user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'User already exists and is verified'
      });
    }

    if (!user) {
      // Create new unverified user
      user = new User({
        email: email?.toLowerCase(),
        phoneNumber,
        fullName,
        userType,
        isVerified: false,
        otp: {
          code: otp,
          expiresAt
        }
      });
    } else {
      // Update existing user's OTP
      user.otp = {
        code: otp,
        expiresAt
      };
    }

    await user.save();

    // Send OTP
    let otpSent = false;
    if (email) {
      otpSent = await sendEmailOTP(email, otp, fullName);
    } else if (phoneNumber) {
      otpSent = await sendSMSOTP(phoneNumber, otp);
    }

    if (!otpSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP'
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      userId: user._id,
      method: email ? 'email' : 'sms'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { userId, otp, password, userType } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP exists and is valid
    if (!user.otp || !user.otp.code || !user.otp.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired'
      });
    }

    // Check OTP expiration
    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired'
      });
    }

    // Verify OTP
    if (user.otp.code !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Update user verification status
    user.isVerified = true;
    user.otp = undefined; // Clear OTP after verification

    // Set password if provided (for new registrations)
    if (password) {
      user.password = password;
    }

    // Set user type if provided
    if (userType) {
      user.userType = userType;
    }

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        userType: user.userType,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Login with email/phone and password
exports.login = async (req, res) => {
  try {
    const { email, phoneNumber, password } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { email: email?.toLowerCase() },
        { phoneNumber }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your account first'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        userType: user.userType,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Social login/register
exports.socialAuth = async (req, res) => {
  try {
    const { socialId, provider, email, fullName, userType } = req.body;

    if (!socialId || !provider) {
      return res.status(400).json({
        success: false,
        message: 'Social ID and provider are required'
      });
    }

    // Check if user exists with this social ID
    let user = await User.findOne({
      socialId,
      socialProvider: provider
    });

    if (user) {
      // User exists, generate token
      const token = generateToken(user._id);
      
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          userType: user.userType,
          isVerified: user.isVerified
        }
      });
    }

    // Check if user exists with this email
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists with different login method'
        });
      }
    }

    // Create new user for social login
    user = new User({
      socialId,
      socialProvider: provider,
      email: email?.toLowerCase(),
      fullName,
      userType,
      isSocialLogin: true,
      isVerified: true // Social logins are auto-verified
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Social auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Driver application
exports.driverApplication = async (req, res) => {
  try {
    const { userId, driverLicense, vehicleType, vehicleYear } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.userType !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    // Update driver-specific fields
    user.driverLicense = driverLicense;
    user.vehicleType = vehicleType;
    user.vehicleYear = vehicleYear;
    user.isApproved = false; // Needs admin approval

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Driver application submitted successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        userType: user.userType,
        isApproved: user.isApproved
      }
    });

  } catch (error) {
    console.error('Driver application error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};