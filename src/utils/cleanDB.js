import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const cleanDatabase = async () => {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        console.log("Collections found:", collectionNames.join(", "));

        // 1. Find the admin to keep
        const usersCollection = db.collection("users");
        const adminToKeep = await usersCollection.findOne({ role: "admin" });

        if (!adminToKeep) {
            console.log("No admin found in the 'users' collection. Cleanup aborted.");
            process.exit(1);
        }

        console.log(`Keeping admin: ${adminToKeep.email} (${adminToKeep._id})`);

        // 2. Clear all collections except users, plans, and sitesettings
        const ignoreCollections = ["users", "plans", "sitesettings", "site-settings"]; // Add any other system collections

        for (const name of collectionNames) {
            if (ignoreCollections.includes(name)) continue;

            const result = await db.collection(name).deleteMany({});
            console.log(`Cleared ${name}: ${result.deletedCount} documents deleted.`);
        }

        // 3. Clear users except the chosen admin
        const userResult = await usersCollection.deleteMany({ _id: { $ne: adminToKeep._id } });
        console.log(`Cleared users: ${userResult.deletedCount} documents deleted (excluding the kept admin).`);

        console.log("\nDatabase cleanup completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error during database cleanup:", error);
        process.exit(1);
    }
};

cleanDatabase();
