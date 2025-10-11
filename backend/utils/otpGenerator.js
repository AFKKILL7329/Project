const nodemailer = require('nodemailer');

// Generate random OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Email transporter (using Gmail for demo)
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send OTP via Email
const sendEmailOTP = async (email, otp, userName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'RideSync Pro - Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">RideSync Pro</h2>
          <p>Hello ${userName},</p>
          <p>Your verification code for RideSync Pro is:</p>
          <div style="background: #f8fafc; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #3B82F6; font-size: 32px; letter-spacing: 5px; margin: 0;">${otp}</h1>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
          <br>
          <p>Best regards,<br>RideSync Pro Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

// For SMS OTP (using Twilio - optional)
const sendSMSOTP = async (phoneNumber, otp) => {
  // This would integrate with Twilio in production
  // For demo, we'll just log it
  console.log(`SMS OTP for ${phoneNumber}: ${otp}`);
  return true;
};

module.exports = {
  generateOTP,
  sendEmailOTP,
  sendSMSOTP
};