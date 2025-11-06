// EasyPaisa API Configuration
// For production, these should be real EasyPaisa API credentials
// For development/testing, we'll use sandbox/test credentials

const easypaisaConfig = {
  // Sandbox/Test Environment (for development)
  sandbox: {
    apiUrl: 'https://sandbox.easypaisa.com.pk/api/v1',
    merchantId: process.env.EASYPAISA_MERCHANT_ID || 'TEST_MERCHANT_ID',
    apiKey: process.env.EASYPAISA_API_KEY || 'TEST_API_KEY',
    secretKey: process.env.EASYPAISA_SECRET_KEY || 'TEST_SECRET_KEY',
    environment: 'sandbox'
  },
  
  // Production Environment
  production: {
    apiUrl: 'https://api.easypaisa.com.pk/api/v1',
    merchantId: process.env.EASYPAISA_MERCHANT_ID,
    apiKey: process.env.EASYPAISA_API_KEY,
    secretKey: process.env.EASYPAISA_SECRET_KEY,
    environment: 'production'
  }
};

// Use sandbox for development, production for live
const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
const config = easypaisaConfig[environment];

// EasyPaisa API Helper Functions
export const easypaisaAPI = {
  // Create payment request
  createPayment: async (paymentData) => {
    try {
      // In a real implementation, you would make an API call to EasyPaisa
      // For now, we'll simulate the response
      console.log('EasyPaisa Payment Request:', paymentData);
      
      // Simulate API response
      return {
        success: true,
        transactionId: paymentData.transactionId,
        paymentUrl: `https://sandbox.easypaisa.com.pk/payment/${paymentData.transactionId}`,
        status: 'pending'
      };
    } catch (error) {
      console.error('EasyPaisa API Error:', error);
      throw error;
    }
  },

  // Verify payment status
  verifyPayment: async (transactionId) => {
    try {
      // In a real implementation, you would call EasyPaisa verification API
      console.log('EasyPaisa Verification Request:', transactionId);
      
      // Simulate verification response
      return {
        success: true,
        transactionId,
        status: 'completed', // or 'pending', 'failed'
        amount: 0, // Would be actual amount from API
        timestamp: new Date()
      };
    } catch (error) {
      console.error('EasyPaisa Verification Error:', error);
      throw error;
    }
  }
};

export default config;
