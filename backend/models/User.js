const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  // Common fields for both riders and drivers
  email: {
    type: String,
    required: function() { return !this.phoneNumber; },
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
    sparse: true
  },
  phoneNumber: {
    type: String,
    required: function() { return !this.email; },
    sparse: true
  },
  password: {
    type: String,
    required: function() { return !this.isSocialLogin; },
    minlength: 6
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  userType: {
    type: String,
    enum: ['rider', 'driver'],
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isSocialLogin: {
    type: Boolean,
    default: false
  },
  socialProvider: {
    type: String,
    enum: ['google', 'facebook'],
    required: function() { return this.isSocialLogin; }
  },
  socialId: {
    type: String,
    required: function() { return this.isSocialLogin; }
  },
  
  // Driver-specific fields
  driverLicense: {
    type: String,
    required: function() { return this.userType === 'driver'; }
  },
  vehicleType: {
    type: String,
    enum: ['sedan', 'suv', 'luxury', 'van'],
    required: function() { return this.userType === 'driver'; }
  },
  vehicleYear: {
    type: Number,
    required: function() { return this.userType === 'driver'; }
  },
  isApproved: {
    type: Boolean,
    default: function() { return this.userType === 'rider'; } // Riders are auto-approved
  },
  
  // OTP fields
  otp: {
    code: String,
    expiresAt: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
userSchema.index({ email: 1 }, { sparse: true });
userSchema.index({ phoneNumber: 1 }, { sparse: true });
userSchema.index({ socialId: 1 }, { sparse: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || this.isSocialLogin) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.isSocialLogin) return true; // Social logins don't use password
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);