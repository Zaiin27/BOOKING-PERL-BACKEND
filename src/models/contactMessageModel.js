import mongoose from "mongoose";

const contactMessageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            maxLength: [100, "Name cannot exceed 100 characters"]
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
            match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"]
        },
        subject: {
            type: String,
            trim: true,
            maxLength: [200, "Subject cannot exceed 200 characters"]
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
            maxLength: [2000, "Message cannot exceed 2000 characters"]
        },
        status: {
            type: String,
            enum: ["unread", "read", "replied"],
            default: "unread"
        }
    },
    { timestamps: true }
);

const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema);

export default ContactMessage;
