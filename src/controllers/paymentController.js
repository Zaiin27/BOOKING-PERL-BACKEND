import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Order from "../models/orderModel.js";
import Payment from "../models/paymentModel.js";
import Ticket from "../models/ticketModel.js";
import { generateTicketId } from "../helpers/index.js";
import stripe from "../config/stripe.js";
import { jazzcashAPI } from "../config/jazzcash.js";
import { easypaisaAPI } from "../config/easypaisa.js";

export const createPaymentIntent = catchAsyncErrors(async (req, res, next) => {
  const { amount, currency = 'usd', order_id, orderId } = req.body;

  if (!amount) {
    return next(new ErrorHandler("Amount is required", 400));
  }

  // Check if Stripe is initialized
  if (!stripe) {
    return next(new ErrorHandler("Stripe payment service is not available. Please configure STRIPE_SECRET_KEY.", 503));
  }

  console.log('🔍 Payment Intent Request:', {
    amount,
    currency,
    order_id: order_id || orderId,
    user_id: req.user?.id
  });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      metadata: {
        order_id: order_id || orderId || '',
        user_id: req.user?.id ? String(req.user.id) : ''
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });
  } catch (error) {
    console.error('❌ Stripe payment intent creation error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      decline_code: error.decline_code
    });
    
    return res.status(500).json({
      success: false,
      message: "Failed to create payment intent",
      error: error.message,
      details: {
        type: error.type,
        code: error.code
      }
    });
  }
});

// Create payment intent for booking
export const createBookingPaymentIntent = catchAsyncErrors(async (req, res, next) => {
  const { amount, currency = 'usd', booking_reference, booking_id, description } = req.body;

  if (!amount) {
    return next(new ErrorHandler("Amount is required", 400));
  }

  if (!booking_reference) {
    return next(new ErrorHandler("Booking reference is required", 400));
  }

  // Check if Stripe is initialized
  if (!stripe) {
    return next(new ErrorHandler("Stripe payment service is not available. Please configure STRIPE_SECRET_KEY.", 503));
  }

  console.log('🔍 Booking Payment Intent Request:', {
    amount,
    currency,
    booking_reference,
    booking_id
  });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      metadata: {
        booking_reference: booking_reference,
        booking_id: booking_id || '',
        type: 'booking'
      },
      description: description || `Payment for booking ${booking_reference}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id
      }
    });
  } catch (error) {
    console.error('❌ Stripe booking payment intent creation error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      decline_code: error.decline_code
    });
    
    return res.status(500).json({
      success: false,
      message: "Failed to create payment intent",
      error: error.message,
      details: {
        type: error.type,
        code: error.code
      }
    });
  }
});

// Create JazzCash payment
export const createJazzCashPayment = catchAsyncErrors(async (req, res, next) => {
  const { amount, currency = 'PKR', booking_reference, booking_id, mobile_number, description, subscription_id } = req.body;

  if (!amount || !mobile_number) {
    return next(new ErrorHandler("Amount and mobile number are required", 400));
  }

  // Either booking_reference or subscription_id must be provided
  if (!booking_reference && !subscription_id) {
    return next(new ErrorHandler("Either booking reference or subscription ID is required", 400));
  }

  // Validate mobile number format (Pakistani mobile numbers)
  const mobileRegex = /^03[0-9]{9}$/;
  if (!mobileRegex.test(mobile_number)) {
    return next(new ErrorHandler("Please enter a valid Pakistani mobile number (03XXXXXXXXX)", 400));
  }

  try {
    console.log('JazzCash Payment Request:', req.body);
    
    // Generate transaction ID
    const transaction_id = `JC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    console.log('Generated Transaction ID:', transaction_id);
    
    // In a real implementation, you would integrate with JazzCash API here
    // For now, we'll simulate the payment creation
    const paymentData = {
      transaction_id,
      amount: amount * 100, // Convert to paisa
      currency,
      mobile_number,
      booking_reference,
      booking_id,
      description,
      status: 'pending',
      created_at: new Date(),
    };

    console.log('Payment Data to Save:', {
      reference: transaction_id,
      amount: amount * 100,
      currency: currency.toUpperCase(),
      method: 'jazzcash',
      status: 'pending',
      orderId: booking_reference,
      mobile_number: mobile_number,
      transaction_id: transaction_id,
      metadata: {
        booking_id,
        mobile_number,
        transaction_id,
        type: 'booking'
      }
    });

    // Save payment record to database
    const payment = await Payment.create({
      reference: transaction_id,
      amount: amount * 100,
      currency: currency.toUpperCase(),
      method: 'jazzcash',
      status: 'pending',
      orderId: booking_reference || subscription_id,
      mobile_number: mobile_number,
      transaction_id: transaction_id,
      metadata: {
        booking_id,
        subscription_id,
        mobile_number,
        transaction_id,
        type: subscription_id ? 'subscription' : 'booking'
      }
    });

    console.log('Payment Created Successfully:', payment._id);

    // In real implementation, you would call JazzCash API to create payment request
    // For demo purposes, we'll simulate the response
    const jazzcashResponse = await jazzcashAPI.createPayment({
      transactionId: transaction_id,
      amount: amount * 100,
      mobileNumber: mobile_number,
      description: description
    });

    res.status(201).json({
      success: true,
      message: "JazzCash payment initiated successfully",
      data: {
        transaction_id,
        amount: amount,
        currency,
        mobile_number,
        payment_url: jazzcashResponse.paymentUrl,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('JazzCash payment creation error:', error);
    return next(new ErrorHandler("Failed to create JazzCash payment", 500));
  }
});

// Create EasyPaisa payment
export const createEasyPaisaPayment = catchAsyncErrors(async (req, res, next) => {
  const { amount, currency = 'PKR', booking_reference, booking_id, mobile_number, description, subscription_id } = req.body;

  if (!amount || !mobile_number) {
    return next(new ErrorHandler("Amount and mobile number are required", 400));
  }

  // Either booking_reference or subscription_id must be provided
  if (!booking_reference && !subscription_id) {
    return next(new ErrorHandler("Either booking reference or subscription ID is required", 400));
  }

  // Validate mobile number format (Pakistani mobile numbers)
  const mobileRegex = /^03[0-9]{9}$/;
  if (!mobileRegex.test(mobile_number)) {
    return next(new ErrorHandler("Please enter a valid Pakistani mobile number (03XXXXXXXXX)", 400));
  }

  try {
    // Generate transaction ID
    const transaction_id = `EP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // In a real implementation, you would integrate with EasyPaisa API here
    // For now, we'll simulate the payment creation
    const paymentData = {
      transaction_id,
      amount: amount * 100, // Convert to paisa
      currency,
      mobile_number,
      booking_reference,
      booking_id,
      description,
      status: 'pending',
      created_at: new Date(),
    };

    // Save payment record to database
    const payment = await Payment.create({
      reference: transaction_id,
      amount: amount * 100,
      currency: currency.toUpperCase(),
      method: 'easypaisa',
      status: 'pending',
      orderId: booking_reference || subscription_id,
      mobile_number: mobile_number,
      transaction_id: transaction_id,
      metadata: {
        booking_id,
        subscription_id,
        mobile_number,
        transaction_id,
        type: subscription_id ? 'subscription' : 'booking'
      }
    });

    // In real implementation, you would call EasyPaisa API to create payment request
    // For demo purposes, we'll simulate the response
    const easypaisaResponse = await easypaisaAPI.createPayment({
      transactionId: transaction_id,
      amount: amount * 100,
      mobileNumber: mobile_number,
      description: description
    });

    res.status(201).json({
      success: true,
      message: "EasyPaisa payment initiated successfully",
      data: {
        transaction_id,
        amount: amount,
        currency,
        mobile_number,
        payment_url: easypaisaResponse.paymentUrl,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('EasyPaisa payment creation error:', error);
    return next(new ErrorHandler("Failed to create EasyPaisa payment", 500));
  }
});

// Verify payment status (for JazzCash/EasyPaisa)
export const verifyPayment = catchAsyncErrors(async (req, res, next) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    return next(new ErrorHandler("Transaction ID is required", 400));
  }

  try {
    // Find payment record
    const payment = await Payment.findOne({ reference: transactionId });

    if (!payment) {
      return next(new ErrorHandler("Payment not found", 404));
    }

    // In a real implementation, you would call JazzCash/EasyPaisa API to verify payment
    // For demo purposes, we'll simulate different scenarios
    
    // Check if payment status is already updated
    let status = payment.status === 'success' ? 'completed' : 'pending';
    
    // Simulate payment verification based on time elapsed (for demo)
    // In production, this should check actual payment gateway status
    const timeElapsed = Date.now() - payment.createdAt.getTime();
    const minutesElapsed = timeElapsed / (1000 * 60);

    // Simulate payment completion after 2 minutes (for demo)
    // IMPORTANT: In production, only activate when payment gateway confirms payment
    if (minutesElapsed > 2 && payment.status === 'pending') {
      status = 'completed';
      
      // Update payment status to success
      payment.status = 'success';
      await payment.save();
      
      // Update booking status if payment is completed
      if (payment.metadata?.booking_id) {
        const Booking = (await import("../models/bookingModel.js")).default;
        const booking = await Booking.findById(payment.metadata.booking_id);
        
        if (booking) {
          booking.paymentStatus = 'paid';
          booking.bookingStatus = 'confirmed';
          await booking.save();

          // Emit socket event for booking update
          if (req.app?.get) {
            const io = req.app.get("io");
            if (io) {
              // Notify property owner
              const Property = (await import("../models/propertyModel.js")).default;
              const property = await Property.findById(booking.property_id);
              
              if (property) {
                io.to(`user:${property.owner_id}`).emit("booking.payment.success", {
                  booking_id: booking.booking_id,
                  bookingReference: booking.bookingReference,
                  paymentStatus: "paid",
                  bookingStatus: "confirmed",
                });
              }

              // Notify all admins
              io.to("staff:all").emit("booking.payment.success", {
                booking_id: booking.booking_id,
                bookingReference: booking.bookingReference,
                paymentStatus: "paid",
                bookingStatus: "confirmed",
              });
            }
          }
        }
      }

      // Activate subscription if payment is for subscription AND payment is confirmed
      if (payment.metadata?.subscription_id && status === 'completed') {
        try {
          const Subscription = (await import("../models/subscriptionModel.js")).default;
          const subscription = await Subscription.findById(payment.metadata.subscription_id).populate("plan_id");
          
          // Only activate if subscription is pending and payment is confirmed
          if (subscription && subscription.status === "pending" && payment.status === 'success') {
            // Cancel existing active subscriptions
            await Subscription.updateMany(
              {
                user_id: subscription.user_id,
                status: "active",
                _id: { $ne: subscription._id },
              },
              { status: "cancelled", cancelledAt: new Date() }
            );

            // Activate subscription
            subscription.status = "active";
            subscription.paymentStatus = "completed";
            subscription.transactionId = transactionId;
            await subscription.save();

            // Get plan details
            const plan = subscription.plan_id;
            if (plan) {
              // Update user with plan features (for staff - override existing features)
              const User = (await import("../models/userModel.js")).default;
              const user = await User.findById(subscription.user_id);
              
              if (user) {
                user.currentPlan = subscription.planName;
                user.subscriptionId = subscription._id;
                
                // Override plan features in user account (Future-proof structure)
                user.planFeatures = {
                  maxProperties: plan.maxProperties || 1,
                  maxPhotosPerProperty: plan.maxPhotosPerProperty || 3,
                  features: {
                    basicInfoDisplay: plan.features?.basicInfoDisplay ?? true,
                    contactForm: plan.features?.contactForm ?? false,
                    searchResults: plan.features?.searchResults ?? true,
                    priorityVisibility: plan.features?.priorityVisibility ?? false,
                    featuredPlacement: plan.features?.featuredPlacement ?? false,
                    homepageFeatured: plan.features?.homepageFeatured ?? false,
                    socialMediaPromotion: plan.features?.socialMediaPromotion ?? false,
                    emailNotifications: plan.features?.emailNotifications ?? false,
                    reviewManagement: plan.features?.reviewManagement ?? false,
                    bookingManagement: plan.features?.bookingManagement ?? false,
                    discountPromotions: plan.features?.discountPromotions ?? false,
                    customBranding: plan.features?.customBranding ?? false,
                    apiAccess: plan.features?.apiAccess ?? false,
                    teamAccess: plan.features?.teamAccess ?? false,
                    dedicatedAccountManager: plan.features?.dedicatedAccountManager ?? false,
                  },
                  analytics: {
                    basic: plan.analytics?.basic ?? false,
                    advanced: plan.analytics?.advanced ?? false,
                  },
                  badges: {
                    verified: plan.badges?.verified ?? false,
                    trustedHost: plan.badges?.trustedHost ?? false,
                    premium: plan.badges?.premium ?? false,
                  },
                  searchPriority: plan.searchPriority || 1,
                  planName: plan.name,
                  planDisplayName: plan.displayName,
                  planUpdatedAt: new Date(),
                };
                
                await user.save();
              }

              // Apply plan features to user's properties
              const Property = (await import("../models/propertyModel.js")).default;
              const properties = await Property.find({ owner_id: subscription.user_id });

              for (const property of properties) {
                // Apply badges
                if (plan.badges) {
                  property.planFeatures = {
                    verifiedBadge: plan.badges.verified || false,
                    trustedHostBadge: plan.badges.trustedHost || false,
                    premiumBadge: plan.badges.premium || false,
                  };
                }

                // Apply priority/featured
                property.isPriority = plan.features?.priorityVisibility || false;
                property.isFeatured = plan.features?.featuredPlacement || false;
                property.searchPriority = plan.searchPriority || 1;

                await property.save();
              }
            }

            console.log("Subscription activated successfully:", subscription._id);
          }
        } catch (error) {
          console.error("Error activating subscription after payment:", error);
        }
      }
    }

    // Return updated payment status
    res.status(200).json({
      success: true,
      data: {
        transaction_id: transactionId,
        status: payment.status === 'success' ? 'completed' : status,
        amount: payment.amount / 100, // Convert back from paisa
        currency: payment.currency,
        method: payment.method,
        created_at: payment.createdAt,
        // Include subscription activation status if applicable
        subscription_activated: payment.metadata?.subscription_id && payment.status === 'success' ? true : false
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    return next(new ErrorHandler("Failed to verify payment", 500));
  }
});

export const simulatePayment = catchAsyncErrors(async (req, res, next) => {
  const { order_id, method = "card" } = req.body || {};

  if (!order_id) {
    return next(new ErrorHandler("order_id is required", 400));
  }

  const order = await Order.findOne({ order_id, user_id: req.user.id });
  if (!order) {
    return next(new ErrorHandler("Order not found", 404));
  }

  const methodKeyMap = { solana: "sol", token: "spl", card: "card" };
  const key = methodKeyMap[method];
  if (!key) {
    return next(
      new ErrorHandler("Invalid method. Use solana | token | card", 400)
    );
  }

  const amount = order.total
  const requestedMethod = method;
  const effectiveMethod =
    requestedMethod === "create" ? "card" : requestedMethod;

  const validMethods = ["solana", "card", "token"];
  if (!validMethods.includes(effectiveMethod)) {
    return next(
      new ErrorHandler(
        "Invalid method. Use solana | token | card ",
        400
      )
    );
  }

  const currency =
    effectiveMethod === "card"
      ? "usd"
      : effectiveMethod === "solana"
      ? "sol"
      : "usdc";

  let paymentData = {
    orderId: order.order_id,
    method: effectiveMethod,
    status: requestedMethod === "card" ? "pending" : "success",
    amount,
    currency: currency.toUpperCase(),
  };

  if (requestedMethod === "card") {
    // Check if Stripe is available
    if (!stripe) {
      return next(new ErrorHandler("Stripe payment service is not available. Please configure STRIPE_SECRET_KEY.", 503));
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      metadata: { order_id: order.order_id, user_id: String(req.user.id) },
    });
    paymentData = {
      ...paymentData,
      stripe_client_secret: paymentIntent.client_secret,
      stripe_payment_intent_id: paymentIntent.id,
    };
  }

  await Payment.updateOne(
    { orderId: order.order_id },
    {
      $set: {
        amount,
        currency: currency.toUpperCase(),
        method: effectiveMethod,
        status: paymentData.status,
        stripe_payment_intent_id: paymentData.stripe_payment_intent_id,
        updatedAt: new Date(),
        orderId: order.order_id,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  order.status = "PLACED";
  await order.save();

  let ticket = await Ticket.findOne({ order_id: order.order_id });
  if (!ticket) {
    ticket = await Ticket.create({
      ticket_id: generateTicketId(),
      order_id: order.order_id,
      user_id: order.user_id,
      status: "OPEN",
    });
    if (req.app?.get) {
      const io = req.app.get("io");
      if (io) {
        io.to("staff:all").emit("ticket.created", {
          ticket_id: ticket.ticket_id,
          order_id: order.order_id,
          user_id: String(order.user_id),
          createdAt: ticket.createdAt,
        });
      }
    }
  }

  res.json({
    success: true,
    message:
      method === "card"
        ? "Stripe PaymentIntent created, order PLACED, ticket created if absent"
        : "Payment simulated, order PLACED, ticket created if absent",
    data: {
      order_id: order.order_id,
      status: order.status,
      payment: paymentData,
      ticket: { ticket_id: ticket.ticket_id, status: ticket.status },
    },
  });
});
