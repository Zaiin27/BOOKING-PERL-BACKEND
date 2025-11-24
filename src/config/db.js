import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Optimized connection options for better performance
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    const conn = await mongoose.connect(
      process.env.MONGO_URI,
      options
    );

    console.log(`MongoDB Connected: ${conn.connection.name}`);
    
    // Optimize query performance
    mongoose.set('strictQuery', true);
    
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
