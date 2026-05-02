import mongoose from 'mongoose';
import User from './src/models/userModel.js';

const uri = "mongodb+srv://zaintanveer271_db_user:QnPENGsXaUh4Hax4@cluster0.lndiijt.mongodb.net/bookingsystem?retryWrites=true&w=majority&appName=Cluster0";

async function test() {
  await mongoose.connect(uri);
  console.log("Connected");

  const email = "teststaff999@test.com";
  const password = "password123";

  // Clean up existing
  await User.deleteOne({ email });

  // 1. Create User
  const userData = {
    email,
    password,
    role: "staff",
    isVerified: true
  };
  const user = new User(userData);
  await user.save();
  console.log("Created User:", user.email, "Hash:", user.password);

  // 2. Try Login
  const foundUser = await User.findOne({ email, isActive: true }).select("+password");
  if (!foundUser) {
    console.log("User not found or inactive!");
    process.exit(1);
  }

  const isMatch = await foundUser.comparePassword(password);
  console.log("Password Match:", isMatch);

  process.exit(0);
}

test().catch(console.error);
