import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import sendEmail from "../utils/sendEmail.js";
import ContactMessage from "../models/contactMessageModel.js";

export const contactSupport = catchAsyncErrors(async (req, res, next) => {
  const name = (req.body?.name || "").trim();
  const email = (req.body?.email || "").trim();
  const subject = (req.body?.subject || "").trim();
  const message = (req.body?.message || "").trim();

  if (!name || !email || !message) {
    return next(new ErrorHandler("name, email and message are required", 400));
  }

  // Save to DB
  const contactMessage = await ContactMessage.create({
    name,
    email,
    subject,
    message
  });

  const to = process.env.SUPPORT_MAIL_TO || process.env.SMPT_MAIL;

  try {
    await sendEmail({
      email: to,
      subject: `[Support] Message from ${name}: ${subject || 'New Inquiry'}`,
      templatePath: "src/templates/supportContact.ejs",
      templateData: {
        appName: "Booking Pearl",
        name,
        email,
        message,
      },
    });
  } catch (error) {
    console.error("Email sending failed:", error);
    // Continue even if email fails, since we saved it to DB
  }

  res.json({ success: true, message: "Your message has been sent successfully." });
});

// Get all contact messages (Admin Only)
export const getAllContactMessages = catchAsyncErrors(async (req, res, next) => {
  const messages = await ContactMessage.find().sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: messages,
  });
});
