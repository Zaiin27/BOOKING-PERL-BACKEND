import mongoose from 'mongoose';

const uri = "mongodb+srv://zaintanveer271_db_user:QnPENGsXaUh4Hax4@cluster0.lndiijt.mongodb.net/bookingsystem?retryWrites=true&w=majority&appName=Cluster0";

const userSchema = new mongoose.Schema({ name: String, email: String });
mongoose.model('User', userSchema);

const propertySchema = new mongoose.Schema({
  status: String,
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Property = mongoose.model('Property', propertySchema);

async function run() {
  await mongoose.connect(uri);
  console.log("Connected to DB");

  const filter = { status: 'active' };
  const sort = { isFeatured: -1, isPriority: -1, searchPriority: -1, createdAt: -1 };

  const selectFields = {
    name: 1, address: 1, roomTypes: 1, status: 1, currency: 1,
    isFeatured: 1, isPriority: 1, owner_id: 1, createdAt: 1,
    contactEmail: 1, amenities: 1, checkInTime: 1, checkOutTime: 1
    // NO PHOTOS AT ALL
  };

  console.time("Find API Without Photos");
  const properties = await Property.find(filter)
      .select(selectFields)
      .populate("owner_id", "name email")
      .sort(sort)
      .skip(0)
      .limit(10)
      .lean();
  console.timeEnd("Find API Without Photos");
  
  console.log("Returned:", properties.length);

  process.exit(0);
}

run().catch(console.error);
