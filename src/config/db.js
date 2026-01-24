import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Check if MONGO_URI is defined
    if (!process.env.MONGO_URI) {
      console.error("MongoDB connection error: MONGO_URI is not defined in environment variables");
      console.error("Please set MONGO_URI in your .env file");
      process.exit(1);
    }

    // Optimized connection options for better performance
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      serverSelectionTimeoutMS: 10000, // Increased timeout for DNS resolution
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Connection timeout
    };

    const mongoUri = process.env.MONGO_URI;

    const conn = await mongoose.connect(mongoUri, options);
    console.log(`MongoDB Connected: ${conn.connection.name}`);

    // Optimize query performance
    mongoose.set('strictQuery', true);

  } catch (error) {
    console.error("\n❌ MongoDB connection error:", error.message);

    // Provide more helpful error messages for common issues
    if (error.message.includes('querySrv ENOTFOUND')) {
      console.error("\n📋 DNS Lookup Failure - Possible Solutions:");
      console.error("1. Check your internet connection");
      console.error("2. Verify MongoDB Atlas cluster is running (not paused)");
      console.error("3. Use direct connection string instead of SRV:");
      console.error("   - Go to MongoDB Atlas Dashboard");
      console.error("   - Click 'Connect' on your cluster");
      console.error("   - Choose 'Connect your application'");
      console.error("   - Select 'Standard connection string' (not SRV)");
      console.error("   - Update MONGO_URI in your .env file");
      console.error("\n4. Check if your network/firewall blocks DNS SRV records");
      console.error("5. Try using Google DNS (8.8.8.8) or Cloudflare DNS (1.1.1.1)");
    } else if (error.message.includes('authentication failed')) {
      console.error("\n📋 Authentication Error - Possible Solutions:");
      console.error("1. Verify username and password in connection string");
      console.error("2. Check if database user has proper permissions");
      console.error("3. Ensure IP address is whitelisted in MongoDB Atlas");
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
      console.error("\n📋 Network Error - Possible Solutions:");
      console.error("1. Check your internet connection");
      console.error("2. Verify MongoDB Atlas cluster URL is correct");
      console.error("3. Check firewall settings");
      console.error("4. Ensure IP address is whitelisted in MongoDB Atlas Network Access");
    }

    console.error("\n💡 Current connection string format:",
      process.env.MONGO_URI?.substring(0, 30) + '...' || 'Not set');

    process.exit(1);
  }
};

export default connectDB;
