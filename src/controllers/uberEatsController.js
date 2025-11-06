import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Order from "../models/orderModel.js";
import { generateOrderId } from "../helpers/index.js";
import { SiteSettings } from "../models/siteSettingsModel.js";
import { getOrderDetails, testAuth, updateSid, ensureValidSid, getSid } from "../utils/uberEats.js";

export const scrapeUberEatsGroupOrderLink = catchAsyncErrors(
  async (req, res, next) => {
    const setting = await SiteSettings.findOne().lean();

    if (!setting?.ServiceAvavailable) {
      throw new ErrorHandler(
        "Service is currently unavailable. Please try again later.",
        400
      );
    }

    // Check service availability time (UTC)
    if (setting?.startTime && setting?.endTime) {
      const now = new Date();
      const currentTime = now.toISOString().slice(11, 16);
      
      const startTime = setting.startTime;
      const endTime = setting.endTime;
      
      // Convert times to minutes for comparison
      const currentMinutes = parseInt(currentTime.split(':')[0]) * 60 + parseInt(currentTime.split(':')[1]);
      const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
      const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
      
      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        throw new ErrorHandler(
          `Service is only available between ${startTime} and ${endTime} UTC. Please try again during service hours.`,
          400
        );
      }
    }

    let { url, sid } = req.body;
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new ErrorHandler("URL is required", 400);
    }
    
    // Check if URL contains placeholder
    if (url.includes('your-group-order-id')) {
      throw new ErrorHandler("Please provide a real Uber Eats group order link, not a placeholder", 400);
    }
    
        // Handle SID update if provided
        if (sid && typeof sid === 'string' && sid.length >= 20) {
          updateSid(sid);
        }
        
    url = url.replace("https://eats.uber.com", "https://www.ubereats.com");
        
        // Ensure we have a valid SID (auto-refresh if needed)
        await ensureValidSid();
        
        // Check if SID is valid (with more lenient validation)
        const authResult = await testAuth();
        if (!authResult) {
          console.log("⚠️ SID validation failed, but proceeding anyway...");
          // Don't throw error, just log and continue
        } else {
          console.log("✅ SID validation successful");
        }

    // Check if user has already used this link 3 times
    const existingOrdersCount = await Order.countDocuments({
      user_id: req.user.id,
      cart_url: url,
    });
    
    if (existingOrdersCount >= 3) {
      throw new ErrorHandler("You have already used this link 3 times. Maximum usage limit reached.", 400);
    }
    
    // Check if user has 3 active orders with this link
    const activeOrdersCount = await Order.countDocuments({
      user_id: req.user.id,
      cart_url: url,
      status: { $in: ["PLACED", "DELIVERED"] }
    });
    
    if (activeOrdersCount >= 3) {
      throw new ErrorHandler("You already have 3 active orders with this link. Maximum active orders limit reached.", 400);
    }
    
    // Find existing order for update (if any)
    let order = await Order.findOne({
      user_id: req.user.id,
      cart_url: url,
    });

    try {
      // Get order details using the working implementation
      const orderDetails = await getOrderDetails(url);
      
      if (!orderDetails.success) {
        return res.status(400).json({ 
          success: false, 
          message: orderDetails.error || "Failed to fetch order details. Please check the link and try again." 
        });
      }

      const {
        subtotal,
        fees,
        taxes,
        delivery_fee,
        service_fee,
        tip,
        small_order_fee,
        adjustments_fee,
        pickup_fee,
        other_fees,
        has_uber_one,
        uber_one_benefit,
        total,
        currency,
        items,
        restaurant_name,
        restaurant_address,
        restaurant_hours,
        delivery_address,
        delivery_instructions,
        restaurant_image_url,
        is_uber_one_eligible,
        customer_details
      } = orderDetails;

      // Basic validation
      if (typeof subtotal !== "number") {
        throw new ErrorHandler(
          "Failed to extract order subtotal. Please check the Uber Eats link and try again.",
          400
        );
      }

      if (subtotal <= 0 && (!items || items.length === 0)) {
        throw new ErrorHandler(
          "No items found in the order. Please make sure the Uber Eats group order has items added.",
          400
        );
      }

      // Check minimum and maximum order amount
      const minimumOrderAmount = 25;
      const maximumOrderAmount = 32;

      if (subtotal < minimumOrderAmount) {
        const remainingAmount = minimumOrderAmount - subtotal;
        throw new ErrorHandler(
          `Your cart subtotal is $${subtotal.toFixed(2)}, but the minimum order amount is $${minimumOrderAmount}. Please add $${remainingAmount.toFixed(2)} more to your cart to proceed.`,
          400
        );
      }

      if (subtotal > maximumOrderAmount) {
        const excessAmount = subtotal - maximumOrderAmount;
        throw new ErrorHandler(
          `Your cart subtotal is $${subtotal.toFixed(2)}, but the maximum order amount is $${maximumOrderAmount}. Please remove $${excessAmount.toFixed(2)} from your cart to proceed.`,
          400
        );
      }

      if (order) {
        // Update existing order
        order.subtotal = subtotal;
        order.fees = fees;
        order.taxes = taxes;
        order.delivery_fee = delivery_fee;
        order.service_fee = service_fee;
        order.tip = tip;
        order.small_order_fee = small_order_fee;
        order.adjustments_fee = adjustments_fee;
        order.pickup_fee = pickup_fee;
        order.other_fees = other_fees;
        order.has_uber_one = has_uber_one;
        order.uber_one_benefit = uber_one_benefit;
        order.total = total;
        order.currency = currency;
        order.items = items;
        order.restaurant_name = restaurant_name;
        order.restaurant_address = restaurant_address;
        order.restaurant_hours = restaurant_hours;
        order.delivery_address = delivery_address;
        order.delivery_instructions = delivery_instructions;
        order.restaurant_image_url = restaurant_image_url;
        order.is_uber_one_eligible = is_uber_one_eligible;
        order.customer_details = customer_details;
        await order.save();
      } else {
        // Create new order
        order = await Order.create({
          order_id: generateOrderId(),
          user_id: req.user.id,
          cart_url: url,
          status: "PENDING",
          subtotal,
          fees,
          taxes,
          delivery_fee,
          service_fee,
          tip,
          small_order_fee,
          adjustments_fee,
          pickup_fee,
          other_fees,
          has_uber_one,
          uber_one_benefit,
          total,
          currency,
          items,
          restaurant_name,
          restaurant_address,
          restaurant_hours,
          delivery_address,
          delivery_instructions,
          restaurant_image_url,
          is_uber_one_eligible,
          customer_details
        });
      }

      // Return comprehensive response with all data
      return res.status(200).json({
        message: "Cart parsed and order created successfully",
        success: true,
        data: {
          // Order details
          order_id: order.order_id,
          status: order.status,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          
          // Pricing breakdown
          pricing: {
            subtotal: subtotal,
            fees: fees,
            taxes: taxes,
            delivery_fee: delivery_fee,
            service_fee: service_fee,
            tip: tip,
            small_order_fee: small_order_fee,
            adjustments_fee: adjustments_fee,
            pickup_fee: pickup_fee,
            other_fees: other_fees,
            total: total,
            currency: currency
          },
          
          // Uber One details
          uber_one: {
            has_uber_one: has_uber_one,
            uber_one_benefit: uber_one_benefit,
            is_uber_one_eligible: is_uber_one_eligible
          },
          
          // Restaurant information
          restaurant: {
            name: restaurant_name,
            address: restaurant_address,
            hours: restaurant_hours,
            image_url: restaurant_image_url
          },
          
          // Delivery information
          delivery: {
            address: delivery_address,
            instructions: delivery_instructions
          },
          
          // Order items
          items: items,
          
          // Customer details
          customer_details: customer_details,
          
          // Full order object for backward compatibility
          order: order
        }
      });
    } catch (err) {
      console.error("❌ Uber Eats order processing failed:", err.message);
      throw err;
    }
    }
  );

export const refreshSid = catchAsyncErrors(
  async (req, res, next) => {
    try {
  
      
      // Simple response without auto-refresh for now
      const currentSid = getSid();
      res.status(200).json({
        success: true,
        message: "SID refresh endpoint working",
        sid: currentSid || "No SID found",
        sid_preview: currentSid ? currentSid.substring(0, 10) + "..." : "No SID found",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("❌ SID refresh failed:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to refresh SID",
        error: error.message
      });
    }
  }
);


