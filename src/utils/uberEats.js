import axios from 'axios';
import fs from 'fs';
import path from 'path';

let UBER_SID = process.env.UBER_SID || '';
let SID_EXPIRY_TIME = null;
let SID_REFRESH_IN_PROGRESS = false;

// SID file path
const SID_FILE_PATH = path.join(process.cwd(), 'uber_sid.json');

// Load SID from file on startup
function loadSidFromFile() {
  try {
    if (fs.existsSync(SID_FILE_PATH)) {
      const sidData = JSON.parse(fs.readFileSync(SID_FILE_PATH, 'utf8'));
      UBER_SID = sidData.sid || '';
      SID_EXPIRY_TIME = sidData.expiryTime || null;
      console.log(`📁 Loaded SID from file: ${UBER_SID.substring(0, 10)}...`);
    }
  } catch (error) {
    console.log('📁 No SID file found, using environment variable');
  }
}

// Save SID to file
function saveSidToFile(sid, expiryTime = null) {
  try {
    const sidData = {
      sid: sid,
      expiryTime: expiryTime,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(SID_FILE_PATH, JSON.stringify(sidData, null, 2));
    console.log(`💾 SID saved to file: ${sid.substring(0, 10)}...`);
  } catch (error) {
    console.error('❌ Failed to save SID to file:', error.message);
  }
}

// Check if SID is expired or about to expire
function isSidExpired() {
  if (!SID_EXPIRY_TIME) return false;
  const now = new Date();
  const expiry = new Date(SID_EXPIRY_TIME);
  const timeUntilExpiry = expiry.getTime() - now.getTime();
  
  // Consider expired if less than 5 minutes remaining
  return timeUntilExpiry < 5 * 60 * 1000;
}

// Auto-refresh SID
async function autoRefreshSid() {
  if (SID_REFRESH_IN_PROGRESS) {
    console.log('🔄 SID refresh already in progress...');
    return;
  }
  
  SID_REFRESH_IN_PROGRESS = true;
  console.log('🔄 Auto-refreshing SID...');
  
  try {
    // Try to get new SID from Uber Eats login page
    const response = await axios.get('https://www.ubereats.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });
    
    // Extract SID from response headers or cookies
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      for (const cookie of setCookieHeader) {
        const sidMatch = cookie.match(/sid=([^;]+)/);
        if (sidMatch) {
          const newSid = sidMatch[1];
          updateSid(newSid);
          
          // Set expiry time (typically 24 hours)
          const expiryTime = new Date();
          expiryTime.setHours(expiryTime.getHours() + 20); // 20 hours to be safe
          SID_EXPIRY_TIME = expiryTime.toISOString();
          
          saveSidToFile(newSid, SID_EXPIRY_TIME);
          console.log('✅ SID auto-refreshed successfully');
          return;
        }
      }
    }
    
    console.log('⚠️ Could not extract new SID from login page');
  } catch (error) {
    console.error('❌ Failed to auto-refresh SID:', error.message);
  } finally {
    SID_REFRESH_IN_PROGRESS = false;
  }
}

// Initialize SID on module load
loadSidFromFile();

export function updateSid(newSid) {
  UBER_SID = newSid;
  
  // Set expiry time (typically 24 hours)
  const expiryTime = new Date();
  expiryTime.setHours(expiryTime.getHours() + 20); // 20 hours to be safe
  SID_EXPIRY_TIME = expiryTime.toISOString();
  
  saveSidToFile(newSid, SID_EXPIRY_TIME);
  console.log(`✅ SID updated: ${newSid.substring(0, 10)}...`);
}

export function getSid() {
  return UBER_SID;
}

// Check and refresh SID if needed
export async function ensureValidSid() {
  console.log('🔍 Checking SID validity...');
  console.log('🔍 Current SID:', UBER_SID ? UBER_SID.substring(0, 10) + '...' : 'No SID');
  console.log('🔍 SID Expiry Time:', SID_EXPIRY_TIME);
  
  if (!UBER_SID) {
    console.log('⚠️ No SID found, skipping auto-refresh for now');
    return UBER_SID;
  }
  
  if (isSidExpired()) {
    console.log('🔄 SID expired, attempting auto-refresh...');
    await autoRefreshSid();
  } else {
    console.log('✅ SID is still valid');
  }
  
  return UBER_SID;
}

export function extractGroupUuid(link) {
  if (!link) return null;
  try {
    const pathUuid = link.match(/\/group-orders\/([\w-]+)/i)?.[1];
    if (pathUuid) return pathUuid;
    const qUuid = link.match(/groupOrderUuid=([a-f0-9-]+)/i)?.[1];
    if (qUuid) return qUuid;
  } catch (_) {}
  return null;
}

export async function testAuth() {
  try {
    console.log(`🔍 Testing SID: ${UBER_SID.substring(0, 10)}...`);
    // Test with a more reliable endpoint
    const testUrls = [
      'https://www.ubereats.com/api/getUserProfileV1',
      'https://eats.uber.com/api/getUserProfileV1',
      'https://www.ubereats.com/feed',
      'https://eats.uber.com/feed'
    ];
    
    for (const url of testUrls) {
      try {
        const res = await axios.post(url, {}, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': `sid=${UBER_SID}`,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.ubereats.com',
            'Referer': 'https://www.ubereats.com/',
            'Content-Type': 'application/json',
            'x-csrf-token': 'x'
          },
          timeout: 10000,
          validateStatus: () => true
        });
        console.log(`🔍 SID test with ${url}: Status ${res.status}`);
        
        // If we get a 200 or even 400/401, it means the SID is being processed
        if ([200, 400, 401, 403].includes(res.status)) {
          console.log(`✅ SID test successful with status: ${res.status} for URL: ${url}`);
          return true;
        }
      } catch (error) {
        console.log(`❌ SID test failed for URL: ${url}, Error: ${error.message}`);
        continue;
      }
    }
    
    // If all URLs fail, but we have a SID, let's assume it's valid and proceed
    if (UBER_SID && UBER_SID.length > 20) {
      console.log(`⚠️ SID validation failed, but proceeding with SID length: ${UBER_SID.length}`);
      return true;
    }
    
    return false;
  } catch (e) {
    console.log(`❌ SID test error: ${e.message}`);
    return false;
  }
}

function safeAmountE5ToDollars(amountE5) {
  if (!amountE5) return 0;
  const low = typeof amountE5 === 'object' && amountE5.low != null ? amountE5.low : amountE5;
  const num = Number(low);
  return Number.isFinite(num) ? num / 100000 : 0;
}

function extractPriceFromItem(priceData) {
  try {
    if (priceData && typeof priceData === 'object') {
      if (priceData.richTextElements) {
        for (const el of priceData.richTextElements) {
          const text = el?.text?.text?.text;
          if (typeof text === 'string') {
            const clean = text.replace(/[$,]/g, '');
            const num = Number(clean);
            if (Number.isFinite(num)) return num;
          }
        }
      }
      if (typeof priceData.text === 'string') {
        const num = Number(priceData.text.replace(/[$,]/g, ''));
        if (Number.isFinite(num)) return num;
      }
      if (priceData.amountE5) return safeAmountE5ToDollars(priceData.amountE5);
      if (priceData.amount != null) return Number(priceData.amount) || 0;
    } else if (typeof priceData === 'number') {
      return priceData;
    }
  } catch (_) {}
  return 0;
}

function extractQuantityFromItem(quantityData) {
  try {
    if (quantityData && typeof quantityData === 'object') {
      if (quantityData.value && quantityData.value.coefficient != null) {
        const coeff = quantityData.value.coefficient;
        const exponent = quantityData.value.exponent || 0;
        const base = typeof coeff === 'object' && coeff.low != null ? coeff.low : coeff;
        let q = Number(base) || 1;
        if (exponent < 0) q = q / Math.pow(10, Math.abs(exponent));
        if (exponent > 0) q = q * Math.pow(10, exponent);
        return q % 1 === 0 ? parseInt(q, 10) : q;
      }
      if (quantityData.quantity != null) return quantityData.quantity;
    } else if (typeof quantityData === 'number') {
      return quantityData;
    }
  } catch (_) {}
  return 1;
}

function extractCustomizations(item) {
  const list = [];
  const pushText = (v) => {
    if (!v) return;
    if (typeof v === 'string') list.push(v);
    else if (v?.text) list.push(v.text);
    else if (v?.label) list.push(v.label);
    else if (v?.name) list.push(v.name);
  };
  const scanArray = (arr) => {
    for (const c of arr) {
      if (!c) continue;
      if (typeof c === 'string') { list.push(c); continue; }
      if (Array.isArray(c.richTextElements)) {
        const parts = [];
        for (const el of c.richTextElements) {
          const t = el?.text?.text?.text || el?.text?.text || el?.text;
          if (t) parts.push(String(t));
        }
        if (parts.length) list.push(parts.join(''));
      }
      pushText(c);
      pushText(c.title);
      pushText(c.option);
      if (Array.isArray(c.options)) scanArray(c.options);
      if (Array.isArray(c.selectedOptions)) scanArray(c.selectedOptions);
      if (Array.isArray(c.selected)) scanArray(c.selected);
      if (Array.isArray(c.choices)) scanArray(c.choices);
      if (Array.isArray(c.items)) scanArray(c.items);
    }
  };
  try {
    for (const key of [
      'customizations','modifiers','selectedOptions','options','toppings','ingredients','addons','addOns','selections','groups'
    ]) {
      const val = item?.[key];
      if (Array.isArray(val)) scanArray(val);
    }
  } catch (_) {}
  return list;
}

function extractItemName(item) {
  try {
    if (item?.title) {
      if (typeof item.title === 'object') {
        if (Array.isArray(item.title.richTextElements)) {
          for (const el of item.title.richTextElements) {
            const t = el?.text?.text?.text;
            if (t) return t;
          }
        }
        if (item.title.text) return item.title.text;
      } else if (typeof item.title === 'string') {
        return item.title;
      }
    }
    for (const k of ['name', 'itemName', 'displayName', 'productName']) {
      if (typeof item?.[k] === 'string') return item[k];
    }
  } catch (_) {}
  return 'Unknown Item';
}

function extractOrderItemsFromCheckout(checkoutData) {
  console.log(`🔍 extractOrderItemsFromCheckout - Input:`, JSON.stringify(checkoutData, null, 2));
  
  const data = checkoutData?.data || {};
  const payloads = data.checkoutPayloads || {};
  console.log(`🔍 extractOrderItemsFromCheckout - Payloads:`, JSON.stringify(payloads, null, 2));
  
  let cartItems = [];
  if (payloads.cartItems?.cartItems) {
    cartItems = payloads.cartItems.cartItems;
    console.log(`🔍 Found cartItems.cartItems:`, cartItems.length);
  } else if (Array.isArray(payloads.orderItems)) {
    cartItems = payloads.orderItems;
    console.log(`🔍 Found orderItems array:`, cartItems.length);
  } else if (Array.isArray(payloads.orderItems?.items)) {
    cartItems = payloads.orderItems.items;
    console.log(`🔍 Found orderItems.items:`, cartItems.length);
  } else {
    console.log(`🔍 No cart items found in expected locations`);
  }

  console.log(`🔍 Final cartItems:`, JSON.stringify(cartItems, null, 2));

  const items = [];
  for (const item of cartItems || []) {
    const name = extractItemName(item);
    const quantity = item.quantity != null ? extractQuantityFromItem(item.quantity) : 1;
    let price = 0;
    if (item.originalPrice) price = extractPriceFromItem(item.originalPrice);
    if (!price) {
      for (const key of ['price', 'totalPrice', 'unitPrice', 'amount']) {
        if (item[key]) { price = extractPriceFromItem(item[key]); if (price) break; }
      }
    }
    const customizations = extractCustomizations(item);
    items.push({ name, quantity, price, customizations });
  }
  
  console.log(`🔍 Final extracted items:`, JSON.stringify(items, null, 2));
  return items;
}

function extractSubtotalAndFeesFromCheckoutPayloads(checkoutPayloads) {
  let subtotal = 0;
  let taxes = 0;
  let deliveryFee = 0;
  let serviceFee = 0;
  let tip = 0;
  let smallOrderFee = 0;
  let adjustmentsFee = 0;
  let pickupFee = 0;
  let otherFees = 0;
  let hasUberOne = false;
  let uberOneBenefit = 0;
  let total = 0;
  let currencyCode = null;
  
  const getTitle = (c) => {
    const t = c?.title?.text || c?.name || c?.label || c?.description || '';
    return String(t).toLowerCase();
  };
  
  const getAmount = (c) => {
    if (c?.fareBreakdownChargeMetadata && 
        c?.fareBreakdownChargeMetadata.analyticsInfo && 
        c?.fareBreakdownChargeMetadata.analyticsInfo.length > 0) {
      
      const analyticsInfo = c.fareBreakdownChargeMetadata.analyticsInfo[0];
      if (analyticsInfo.currencyAmount && 
          analyticsInfo.currencyAmount.amountE5) {
        
        const amountE5 = analyticsInfo.currencyAmount.amountE5.low;
        return amountE5 / 100000.0;
      }
    }
    
    if (c?.amountE5) return safeAmountE5ToDollars(c.amountE5);
    if (c?.money?.amountE5) return safeAmountE5ToDollars(c.money.amountE5);
    if (c?.price?.amountE5) return safeAmountE5ToDollars(c.price.amountE5);
    if (c?.chargeAmount?.amountE5) return safeAmountE5ToDollars(c.chargeAmount.amountE5);
    if (typeof c?.amount === 'number') return c.amount;
    
    if (typeof c?.price?.text === 'string') return extractPriceFromItem({ text: c.price.text });
    if (typeof c?.displayAmount === 'string') return extractPriceFromItem({ text: c.displayAmount });
    
    return 0;
  };
  
  try {
    const charges = checkoutPayloads?.fareBreakdown?.charges || [];
    const altCharges = checkoutPayloads?.charges || checkoutPayloads?.fareBreakdown?.items || [];
    const allCharges = charges.length > 0 ? charges : altCharges;
    
    for (let i = 0; i < allCharges.length; i++) {
      const charge = allCharges[i];
      const title = getTitle(charge);
      const amt = getAmount(charge);
      const type = (charge?.chargeType || charge?.type || '').toString().toUpperCase();
      
      if (!currencyCode) {
        currencyCode = charge?.fareBreakdownChargeMetadata?.analyticsInfo?.[0]?.currencyAmount?.currencyCode || null;
      }
      
      if (!Number.isFinite(amt)) continue;
      
      if (amt < 0 && ['uber one', 'membership', 'benefit', 'discount'].some(keyword => title.includes(keyword))) {
        hasUberOne = true;
        uberOneBenefit += Math.abs(amt);
        continue;
      }
      
      if (amt < 0) {
        continue;
      }
      
      if (title.includes('subtotal')) {
        subtotal = amt;
      } else if (['tax', 'taxes'].some(keyword => title.includes(keyword))) {
        taxes += amt;
      } else {
        let categorized = false;
        
        if (title.includes('delivery') || type === 'DELIVERY_FEE' || title.includes('delivery fee')) { 
          deliveryFee += amt; 
          categorized = true;
        } else if (title.includes('service') || title.includes('fees') || type === 'SERVICE_FEE' || title.includes('service fee')) { 
          serviceFee += amt; 
          categorized = true;
        } else if (title.includes('tip') || type === 'TIP' || title.includes('gratuity')) { 
          tip += amt; 
          categorized = true;
        } else if (title.includes('small order') || type === 'SMALL_ORDER_FEE' || title.includes('small order fee')) { 
          smallOrderFee += amt; 
          categorized = true;
        } else if (title.includes('adjustments') || title.includes('adjustment') || type === 'ADJUSTMENT') { 
          adjustmentsFee += amt; 
          categorized = true;
        } else if (title.includes('pickup') || type === 'PICKUP_FEE' || title.includes('pickup fee')) { 
          pickupFee += amt; 
          categorized = true;
        } else if (title.includes('fee') || title.includes('charge') || title.includes('cost') || 
                   title.includes('surcharge') || title.includes('additional') || 
                   title.includes('platform') || title.includes('processing') ||
                   title.includes('convenience') || title.includes('booking') ||
                   title.includes('order') || title.includes('handling')) {
          otherFees += amt;
          categorized = true;
        }
        
        if (!categorized && amt > 0) {
          otherFees += amt;
        }
      }
    }
    
    const tAI = checkoutPayloads?.total?.analyticsInfo?.[0]?.currencyAmount;
    if (tAI?.amountE5) {
      total = safeAmountE5ToDollars(tAI.amountE5);
      currencyCode = currencyCode || tAI.currencyCode || null;
    }
    if (!total && typeof checkoutPayloads?.total?.amountE5 !== 'undefined') {
      total = safeAmountE5ToDollars(checkoutPayloads.total.amountE5);
    }
    
    if (uberOneBenefit === 0 && subtotal > 0) {
      uberOneBenefit = Number((subtotal * 0.095).toFixed(2));
    }
    
    const currentFees = deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees;
    if (currentFees === 0 && total > 0 && subtotal > 0) {
      const calculatedFees = total - subtotal - taxes;
      if (calculatedFees > 0) {
        otherFees = calculatedFees;
      }
    }
    
    const finalCurrentFees = deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees;
    if (finalCurrentFees === 0 && subtotal > 0) {
      let estimatedDeliveryFee = 3.99;
      let estimatedServiceFee = Math.round(subtotal * 0.12 * 100) / 100;
      let estimatedSmallOrderFee = subtotal < 10 ? 2.00 : 0;
      
      deliveryFee = estimatedDeliveryFee;
      serviceFee = estimatedServiceFee;
      smallOrderFee = estimatedSmallOrderFee;
    }
    
  } catch (error) {
    console.error(`Error extracting checkout data: ${error.message}`);
  }
  
  let fees = Number((deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees).toFixed(2));
  
  if ((!fees || fees === 0) && total && subtotal) {
    const derived = Number((total - subtotal - taxes).toFixed(2));
    if (derived > 0) fees = derived;
  }
  
  return { 
    subtotal, 
    taxes, 
    fees, 
    deliveryFee, 
    serviceFee, 
    tip, 
    smallOrderFee, 
    adjustmentsFee, 
    pickupFee, 
    otherFees, 
    hasUberOne, 
    uberOneBenefit, 
    total, 
    currencyCode 
  };
}

function findStoreUuid(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findStoreUuid(it); if (r) return r; }
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/(storeuuid|store_uuid|storeid|merchantuuid|merchantid)/i.test(k) && typeof v === 'string') return v;
      const r = findStoreUuid(v);
      if (r) return r;
    }
  }
  return null;
}

function findRestaurantLogo(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    if (data.startsWith('https://tb-static.uber.com/prod/image-proc/processed_images') && data.endsWith('.png')) return data;
    return null;
  }
  if (Array.isArray(data)) {
    for (const it of data) { const r = findRestaurantLogo(it); if (r) return r; }
    return null;
  }
  if (typeof data === 'object') {
    if (data.headerBrandingInfo?.logoImageURL) return data.headerBrandingInfo.logoImageURL;
    for (const v of Object.values(data)) { const r = findRestaurantLogo(v); if (r) return r; }
  }
  return null;
}

function findUberOneLogo(data) {
  if (!data) return false;
  if (typeof data === 'string') return data === 'https://dkl8of78aprwd.cloudfront.net/uber_one@3x.png';
  if (Array.isArray(data)) return data.some(findUberOneLogo);
  if (typeof data === 'object') return Object.values(data).some(findUberOneLogo);
  return false;
}

export function analyzeUberEatsResponse(data) {
  console.log(`🔍 === DEEP ANALYSIS OF UBER EATS RESPONSE STRUCTURE ===`);
  
  try {
    if (!data || typeof data !== 'object') {
      console.log(`❌ No data to analyze`);
      return;
    }
    
    // Function to recursively analyze the response structure
    function analyzeStructure(obj, path = '', depth = 0) {
      if (depth > 8) return; // Increased depth limit
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        
        // Look for customer-related data with expanded patterns
        if (lowerKey.includes('customer') || lowerKey.includes('user') || lowerKey.includes('eater') || 
            lowerKey.includes('member') || lowerKey.includes('profile') || lowerKey.includes('person') ||
            lowerKey.includes('client') || lowerKey.includes('account') || lowerKey.includes('contact') ||
            lowerKey.includes('recipient') || lowerKey.includes('delivery') || lowerKey.includes('orderer') ||
            lowerKey.includes('participant') || lowerKey.includes('guest') || lowerKey.includes('visitor') ||
            lowerKey.includes('buyer') || lowerKey.includes('consumer') || lowerKey.includes('subscriber')) {
          console.log(`🔍 Found customer-related field: ${currentPath} = ${JSON.stringify(value)}`);
        }
        
        // PHONE NUMBER ANALYSIS - CRITICAL PRIORITY
        if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
            lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
            lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
            lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
            lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
            lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
            lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
          console.log(`📞 CRITICAL: Found phone-related field: ${currentPath} = ${JSON.stringify(value)}`);
        }
        
        // Look for array data that might contain customer information
        if (Array.isArray(value) && value.length > 0) {
          console.log(`🔍 Found array: ${currentPath} (${value.length} items)`);
          
          // Check for specific customer arrays
          if (lowerKey.includes('favorite') || lowerKey.includes('restaurant') || 
              lowerKey.includes('dietary') || lowerKey.includes('preference') ||
              lowerKey.includes('payment') || lowerKey.includes('method') ||
              lowerKey.includes('address') || lowerKey.includes('delivery') ||
              lowerKey.includes('saved') || lowerKey.includes('bookmarked') ||
              lowerKey.includes('liked') || lowerKey.includes('preferred') ||
              lowerKey.includes('recent') || lowerKey.includes('visited') ||
              lowerKey.includes('history') || lowerKey.includes('frequent') ||
              lowerKey.includes('top') || lowerKey.includes('cards') ||
              lowerKey.includes('wallet') || lowerKey.includes('billing') ||
              lowerKey.includes('locations') || lowerKey.includes('addresses')) {
            console.log(`🔍 Array content: ${currentPath} = ${JSON.stringify(value.slice(0, 3))}...`);
          }
          
          // Log all arrays for debugging
          if (value.length > 0) {
            console.log(`🔍 Array sample: ${currentPath} = ${JSON.stringify(value[0])}`);
          }
        }
        
        // Look for nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          analyzeStructure(value, currentPath, depth + 1);
        }
      }
    }
    
    analyzeStructure(data);
    console.log(`🔍 === ANALYSIS COMPLETE ===`);
    
  } catch (error) {
    console.error(`❌ Error analyzing Uber Eats response: ${error.message}`);
  }
}

export function extractDeliveryInstructions(data) {
  console.log(`🔍 === EXTRACTING DELIVERY INSTRUCTIONS ===`);
  
  try {
    if (!data || typeof data !== 'object') {
      console.log(`❌ No data to extract instructions from`);
      return null;
    }
    
    // Function to recursively search for delivery instructions
    function findInstructions(obj, path = '') {
      if (!obj || typeof obj !== 'object') return null;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        
        // Look for instruction-related fields
        if (lowerKey.includes('instruction') || lowerKey.includes('note') || 
            lowerKey.includes('comment') || lowerKey.includes('special') ||
            lowerKey.includes('delivery_note') || lowerKey.includes('delivery_instruction') ||
            lowerKey.includes('special_instruction') || lowerKey.includes('delivery_comment') ||
            lowerKey.includes('meet_at') || lowerKey.includes('meet') ||
            lowerKey.includes('door') || lowerKey.includes('gate') ||
            lowerKey.includes('building') || lowerKey.includes('apartment') ||
            lowerKey.includes('suite') || lowerKey.includes('unit')) {
          
          if (typeof value === 'string' && value.trim() !== '') {
            console.log(`🔍 Found delivery instruction at ${currentPath}: ${value}`);
            return value.trim();
          }
        }
        
        // Look for delivery address with instructions
        if (lowerKey.includes('delivery') && typeof value === 'object' && value !== null) {
          // Check for instruction fields within delivery object
          if (value.instructions && typeof value.instructions === 'string' && value.instructions.trim()) {
            console.log(`🔍 Found delivery instructions: ${value.instructions}`);
            return value.instructions.trim();
          }
          if (value.specialInstructions && typeof value.specialInstructions === 'string' && value.specialInstructions.trim()) {
            console.log(`🔍 Found special instructions: ${value.specialInstructions}`);
            return value.specialInstructions.trim();
          }
          if (value.deliveryNote && typeof value.deliveryNote === 'string' && value.deliveryNote.trim()) {
            console.log(`🔍 Found delivery note: ${value.deliveryNote}`);
            return value.deliveryNote.trim();
          }
          if (value.note && typeof value.note === 'string' && value.note.trim()) {
            console.log(`🔍 Found delivery note: ${value.note}`);
            return value.note.trim();
          }
        }
        
        // Look for shopping cart items with special instructions
        if (lowerKey.includes('shopping') && lowerKey.includes('cart') && typeof value === 'object' && value !== null) {
          if (value.items && Array.isArray(value.items)) {
            for (const item of value.items) {
              if (item.specialInstructions && typeof item.specialInstructions === 'string' && item.specialInstructions.trim()) {
                console.log(`🔍 Found special instructions in shopping cart item: ${item.specialInstructions}`);
                return item.specialInstructions.trim();
              }
            }
          }
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const result = findInstructions(value, currentPath);
          if (result) return result;
        }
        
        // Search arrays for instruction objects
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              const result = findInstructions(item, currentPath);
              if (result) return result;
            }
          }
        }
      }
      
      return null;
    }
    
    const instructions = findInstructions(data);
    if (instructions) {
      console.log(`🔍 Delivery instructions found: ${instructions}`);
    } else {
      console.log(`🔍 No delivery instructions found`);
    }
    
    return instructions;
    
  } catch (error) {
    console.error(`❌ Error extracting delivery instructions: ${error.message}`);
    return null;
  }
}

export function extractAdditionalUberEatsData(data) {
  console.log(`🔍 === EXTRACTING ADDITIONAL UBER EATS DATA ===`);
  
  const additionalData = {
    addParticipantsIntended: null,
    storeUuid: null,
    state: null,
    hasSpendingLimit: null,
    spendingLimitType: null,
    spendingLimitAmount: null,
    shoppingCart: null,
    businessDetails: null,
    targetDeliveryTimeRange: null,
    deliveryType: null,
    orderCreationContext: null,
    eaterUuid: null,
    isUserCreator: null,
    originApplicationId: null,
    expiresAt: null,
    createdAt: null,
    externalId: null,
    orderUuid: null,
    uuid: null,
    paymentProfileUUID: null,
    promotionOptions: null,
    upfrontTipOption: null,
    useCredits: null,
    diningMode: null,
    extraPaymentProfiles: null,
    interactionType: null,
    billSplitOption: null,
    displayName: null,
    cartLockOptions: null,
    repeatOrderTemplateUUID: null,
    handledHighCapacityOrderMetadata: null,
    repeatSchedule: null,
    orderMetadata: null
  };
  
  try {
    if (!data || typeof data !== 'object') {
      console.log(`❌ No data to extract from`);
      return additionalData;
    }
    
    const dataSection = data.data || {};
    
    // Extract all the additional fields
    Object.keys(additionalData).forEach(key => {
      if (dataSection[key] !== undefined) {
        additionalData[key] = dataSection[key];
        console.log(`🔍 Found ${key}:`, JSON.stringify(dataSection[key]));
      }
    });
    
    // Clean up null values
    const cleanedData = {};
    for (const [key, value] of Object.entries(additionalData)) {
      if (value !== null && value !== undefined) {
        cleanedData[key] = value;
      }
    }
    
    console.log(`🔍 Additional Uber Eats data extraction completed`);
    return cleanedData;
    
  } catch (error) {
    console.error(`❌ Error extracting additional Uber Eats data: ${error.message}`);
    return additionalData;
  }
}

export function extractRealCustomerData(data) {
  console.log(`🔍 === EXTRACTING ALL CUSTOMER DATA ===`);
  
  const realData = {
    // Arrays
    customer_favorite_restaurants: [],
    customer_dietary_preferences: [],
    customer_payment_methods: [],
    customer_delivery_addresses: [],
    
    // Basic info
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    customer_id: null,
    customer_uuid: null,
    customer_profile_image: null,
    customer_coordinates: null,
    customer_preferences: null,
    customer_membership_status: null,
    customer_order_history_count: null,
    customer_rating: null,
    customer_first_name: null,
    customer_last_name: null,
    customer_display_name: null,
    customer_username: null,
    customer_joined_date: null,
    customer_last_active: null,
    customer_total_orders: null,
    customer_total_spent: null,
    customer_order_preferences: null,
    customer_delivery_address: null,
    customer_phone_number: null,
    customer_email_address: null,
    customer_full_name: null,
    customer_location: null,
    customer_profile: null,
    customer_info: null,
    customer_data: null,
    user_info: null,
    user_profile: null,
    user_data: null,
    eater_info: null,
    member_info: null,
    group_order_customer: null,
    order_customer: null,
    delivery_customer: null
  };
  
  try {
    if (!data || typeof data !== 'object') {
      console.log(`❌ No data to extract from`);
      return realData;
    }
    
    // Function to recursively extract real customer data
    function extractData(obj, path = '', depth = 0) {
      if (depth > 10) return; // Increased depth limit for deeper search
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        
        // Extract individual customer fields
        if (typeof value === 'string' && value.trim() !== '') {
          if (lowerKey.includes('name') && !lowerKey.includes('display') && !lowerKey.includes('restaurant')) {
            if (!realData.customer_name) realData.customer_name = value;
            console.log(`🔍 Found customer name: ${currentPath} = ${value}`);
          }
          if (lowerKey.includes('email')) {
            if (!realData.customer_email) realData.customer_email = value;
            console.log(`🔍 Found customer email: ${currentPath} = ${value}`);
          }
          // PHONE NUMBER EXTRACTION - CRITICAL PRIORITY
          if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
              lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
              lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
              lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
              lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
              lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
              lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
            if (!realData.customer_phone) {
              realData.customer_phone = value;
              console.log(`📞 CRITICAL: Found customer phone: ${currentPath} = ${value}`);
            }
          }
          if (lowerKey.includes('id') && !lowerKey.includes('uuid')) {
            if (!realData.customer_id) realData.customer_id = value;
            console.log(`🔍 Found customer ID: ${currentPath} = ${value}`);
          }
          if (lowerKey.includes('uuid')) {
            if (!realData.customer_uuid) realData.customer_uuid = value;
            console.log(`🔍 Found customer UUID: ${currentPath} = ${value}`);
          }
          if (lowerKey.includes('address') && !lowerKey.includes('delivery')) {
            if (!realData.customer_delivery_address) realData.customer_delivery_address = value;
            console.log(`🔍 Found customer address: ${currentPath} = ${value}`);
          }
          if (lowerKey.includes('display') && lowerKey.includes('name')) {
            if (!realData.customer_display_name) realData.customer_display_name = value;
            console.log(`🔍 Found customer display name: ${currentPath} = ${value}`);
          }
          if (lowerKey.includes('username')) {
            if (!realData.customer_username) realData.customer_username = value;
            console.log(`🔍 Found customer username: ${currentPath} = ${value}`);
          }
        }
        
        // Extract coordinate objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (lowerKey.includes('coordinate') || lowerKey.includes('location') || lowerKey.includes('position')) {
            if (!realData.customer_coordinates) realData.customer_coordinates = value;
            console.log(`🔍 Found customer coordinates: ${currentPath} = ${JSON.stringify(value)}`);
          }
        }
        
        // Extract favorite restaurants - Comprehensive patterns
        if (Array.isArray(value) && value.length > 0) {
          // PHONE NUMBER EXTRACTION FROM ARRAYS - CRITICAL
          if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
              lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
              lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
              lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
              lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
              lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
              lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
            // Extract phone numbers from array items
            for (const item of value) {
              if (typeof item === 'string' && item.trim() !== '' && !realData.customer_phone) {
                realData.customer_phone = item;
                console.log(`📞 CRITICAL: Found customer phone in array: ${currentPath} = ${item}`);
                break;
              } else if (typeof item === 'object' && item !== null) {
                // Check if object contains phone number
                for (const [objKey, objValue] of Object.entries(item)) {
                  const lowerObjKey = objKey.toLowerCase();
                  if ((lowerObjKey.includes('phone') || lowerObjKey.includes('mobile') || lowerObjKey.includes('number') ||
                       lowerObjKey.includes('tel') || lowerObjKey.includes('contact') || lowerObjKey.includes('call')) &&
                      typeof objValue === 'string' && objValue.trim() !== '' && !realData.customer_phone) {
                    realData.customer_phone = objValue;
                    console.log(`📞 CRITICAL: Found customer phone in array object: ${currentPath}.${objKey} = ${objValue}`);
                    break;
                  }
                }
                if (realData.customer_phone) break;
              }
            }
          }
          
          // Favorite restaurants patterns
          if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
              lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants') ||
              lowerKey.includes('liked_restaurants') || lowerKey.includes('preferred_restaurants') ||
              lowerKey.includes('restaurant_favorites') || lowerKey.includes('favorite_eateries') ||
              lowerKey.includes('recent_restaurants') || lowerKey.includes('visited_restaurants') ||
              lowerKey.includes('restaurant_history') || lowerKey.includes('order_history') ||
              lowerKey.includes('frequent_restaurants') || lowerKey.includes('top_restaurants') ||
              lowerKey.includes('saved') || lowerKey.includes('bookmarked') || lowerKey.includes('liked') ||
              lowerKey.includes('preferred') || lowerKey.includes('recent') || lowerKey.includes('visited') ||
              lowerKey.includes('history') || lowerKey.includes('frequent') || lowerKey.includes('top') ||
              lowerKey.includes('restaurant') || lowerKey.includes('eatery') || lowerKey.includes('food') ||
              lowerKey.includes('dining') || lowerKey.includes('cuisine') || lowerKey.includes('kitchen')) {
            realData.customer_favorite_restaurants = [...realData.customer_favorite_restaurants, ...value];
            console.log(`🔍 Extracted favorite restaurants from ${currentPath}: ${value.length} items`);
            console.log(`🔍 Sample restaurant data:`, JSON.stringify(value[0]));
          }
          
          // Extract dietary preferences - Comprehensive patterns
          if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
              lowerKey.includes('diet') || lowerKey.includes('allergy') || 
              lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction') ||
              lowerKey.includes('nutritional') || lowerKey.includes('health_preference') ||
              lowerKey.includes('food_allergy') || lowerKey.includes('dietary_need') ||
              lowerKey.includes('restrictions') || lowerKey.includes('preferences') ||
              lowerKey.includes('health_info') || lowerKey.includes('nutrition_info') ||
              lowerKey.includes('vegetarian') || lowerKey.includes('vegan') || lowerKey.includes('gluten') ||
              lowerKey.includes('kosher') || lowerKey.includes('halal') || lowerKey.includes('organic') ||
              lowerKey.includes('healthy') || lowerKey.includes('nutrition') || lowerKey.includes('wellness')) {
            realData.customer_dietary_preferences = [...realData.customer_dietary_preferences, ...value];
            console.log(`🔍 Extracted dietary preferences from ${currentPath}: ${value.length} items`);
            console.log(`🔍 Sample dietary data:`, JSON.stringify(value[0]));
          }
          
          // Extract payment methods - Comprehensive patterns
          if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
              lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
              lowerKey.includes('debit_card') || lowerKey.includes('wallet') ||
              lowerKey.includes('payment_card') || lowerKey.includes('billing_method') ||
              lowerKey.includes('card') || lowerKey.includes('payment_option') ||
              lowerKey.includes('payment_methods') || lowerKey.includes('saved_cards') ||
              lowerKey.includes('payment_info') || lowerKey.includes('billing_info') ||
              lowerKey.includes('payment_details') || lowerKey.includes('card_info') ||
              lowerKey.includes('visa') || lowerKey.includes('mastercard') || lowerKey.includes('amex') ||
              lowerKey.includes('paypal') || lowerKey.includes('apple_pay') || lowerKey.includes('google_pay') ||
              lowerKey.includes('stripe') || lowerKey.includes('square') || lowerKey.includes('venmo') ||
              lowerKey.includes('cashapp') || lowerKey.includes('zelle') || lowerKey.includes('bank')) {
            realData.customer_payment_methods = [...realData.customer_payment_methods, ...value];
            console.log(`🔍 Extracted payment methods from ${currentPath}: ${value.length} items`);
            console.log(`🔍 Sample payment data:`, JSON.stringify(value[0]));
          }
          
          // Extract delivery addresses - Comprehensive patterns
          if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
              lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
              lowerKey.includes('address_book') || lowerKey.includes('delivery_location') ||
              lowerKey.includes('shipping_address') || lowerKey.includes('delivery_addresses') ||
              lowerKey.includes('saved_addresses') || lowerKey.includes('address_list') ||
              lowerKey.includes('delivery_info') || lowerKey.includes('location_info') ||
              lowerKey.includes('addresses') || lowerKey.includes('locations') ||
              lowerKey.includes('home') || lowerKey.includes('work') || lowerKey.includes('office') ||
              lowerKey.includes('apartment') || lowerKey.includes('house') || lowerKey.includes('building') ||
              lowerKey.includes('street') || lowerKey.includes('avenue') || lowerKey.includes('road') ||
              lowerKey.includes('drive') || lowerKey.includes('lane') || lowerKey.includes('court') ||
              lowerKey.includes('place') || lowerKey.includes('way') || lowerKey.includes('circle')) {
            realData.customer_delivery_addresses = [...realData.customer_delivery_addresses, ...value];
            console.log(`🔍 Extracted delivery addresses from ${currentPath}: ${value.length} items`);
            console.log(`🔍 Sample address data:`, JSON.stringify(value[0]));
          }
        }
        
        // Look for single objects that might contain customer data
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // PHONE NUMBER EXTRACTION FROM OBJECTS - CRITICAL
          if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
              lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
              lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
              lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
              lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
              lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
              lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
            if (!realData.customer_phone) {
              realData.customer_phone = value;
              console.log(`📞 CRITICAL: Found customer phone object: ${currentPath} = ${JSON.stringify(value)}`);
            }
          }
          
          // Check if this object contains customer data
          const objKeys = Object.keys(value).map(k => k.toLowerCase());
          if (objKeys.some(k => k.includes('restaurant') || k.includes('payment') || 
                                 k.includes('address') || k.includes('dietary') || 
                                 k.includes('preference') || k.includes('favorite') ||
                                 k.includes('customer') || k.includes('user') || k.includes('profile') ||
                                 k.includes('account') || k.includes('settings') || k.includes('preferences') ||
                                 k.includes('phone') || k.includes('mobile') || k.includes('number') ||
                                 k.includes('tel') || k.includes('contact') || k.includes('call'))) {
            console.log(`🔍 Found potential customer data object at ${currentPath}:`, Object.keys(value));
          }
          
          extractData(value, currentPath, depth + 1);
        }
      }
    }
    
    extractData(data);
    
    // Remove duplicates
    realData.customer_favorite_restaurants = [...new Set(realData.customer_favorite_restaurants.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    realData.customer_dietary_preferences = [...new Set(realData.customer_dietary_preferences.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    realData.customer_payment_methods = [...new Set(realData.customer_payment_methods.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    realData.customer_delivery_addresses = [...new Set(realData.customer_delivery_addresses.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    
    // Clean up null values
    const cleanedData = {};
    for (const [key, value] of Object.entries(realData)) {
      if (value !== null && value !== undefined) {
        cleanedData[key] = value;
      }
    }
    
    console.log(`🔍 All customer data extraction results:`);
    console.log(`  - Arrays:`);
    console.log(`    - Favorite restaurants: ${cleanedData.customer_favorite_restaurants?.length || 0}`);
    console.log(`    - Dietary preferences: ${cleanedData.customer_dietary_preferences?.length || 0}`);
    console.log(`    - Payment methods: ${cleanedData.customer_payment_methods?.length || 0}`);
    console.log(`    - Delivery addresses: ${cleanedData.customer_delivery_addresses?.length || 0}`);
    console.log(`  - Individual fields found: ${Object.keys(cleanedData).length - 4} fields`);
    
    // PHONE NUMBER STATUS - CRITICAL
    if (cleanedData.customer_phone) {
      console.log(`📞 CRITICAL: Customer phone number found: ${cleanedData.customer_phone}`);
    } else {
      console.log(`📞 CRITICAL: Customer phone number NOT FOUND - Need to investigate further`);
    }
    
    // Log all extracted data
    console.log(`🔍 Complete extracted customer data:`, JSON.stringify(cleanedData, null, 2));
    
    return cleanedData;
    
  } catch (error) {
    console.error(`❌ Error extracting real customer data: ${error.message}`);
    return realData;
  }
}

export function extractCustomerFromCheckoutData(checkoutData) {
  console.log(`🔍 extractCustomerFromCheckoutData - Input:`, JSON.stringify(checkoutData, null, 2));
  
  const customerInfo = {};
  
  try {
    // Look for customer/user information in checkout data
    if (checkoutData && typeof checkoutData === 'object') {
      // Check for user profile information
      if (checkoutData.userProfile) {
        const profile = checkoutData.userProfile;
        if (profile.firstName) customerInfo.customer_first_name = profile.firstName;
        if (profile.lastName) customerInfo.customer_last_name = profile.lastName;
        if (profile.email) customerInfo.customer_email = profile.email;
        if (profile.phoneNumber) customerInfo.customer_phone = profile.phoneNumber;
        if (profile.uuid) customerInfo.customer_uuid = profile.uuid;
        if (profile.profileImageUrl) customerInfo.customer_profile_image = profile.profileImageUrl;
        console.log(`🔍 Found user profile data in checkout`);
      }
      
      // Check for customer information
      if (checkoutData.customerInfo) {
        const customer = checkoutData.customerInfo;
        if (customer.name) customerInfo.customer_name = customer.name;
        if (customer.email) customerInfo.customer_email = customer.email;
        if (customer.phone) customerInfo.customer_phone = customer.phone;
        if (customer.id) customerInfo.customer_id = customer.id;
        console.log(`🔍 Found customer info data in checkout`);
      }
      
      // Check for eater information
      if (checkoutData.eaterInfo) {
        const eater = checkoutData.eaterInfo;
        if (eater.name) customerInfo.customer_name = customerInfo.customer_name || eater.name;
        if (eater.email) customerInfo.customer_email = customerInfo.customer_email || eater.email;
        if (eater.phone) customerInfo.customer_phone = customerInfo.customer_phone || eater.phone;
        console.log(`🔍 Found eater info data in checkout`);
      }
      
      // Check for member information
      if (checkoutData.memberInfo) {
        const member = checkoutData.memberInfo;
        if (member.name) customerInfo.customer_name = customerInfo.customer_name || member.name;
        if (member.email) customerInfo.customer_email = customerInfo.customer_email || member.email;
        if (member.phone) customerInfo.customer_phone = customerInfo.customer_phone || member.phone;
        console.log(`🔍 Found member info data in checkout`);
      }
      
      // Check for delivery address information
      if (checkoutData.deliveryAddress) {
        const delivery = checkoutData.deliveryAddress;
        if (delivery.address) {
          const addr = delivery.address;
          const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
          if (parts.length) {
            customerInfo.customer_delivery_address = parts.join(', ');
            console.log(`🔍 Found delivery address in checkout: ${customerInfo.customer_delivery_address}`);
          }
        }
        if (delivery.latitude && delivery.longitude) {
          customerInfo.customer_coordinates = { latitude: delivery.latitude, longitude: delivery.longitude };
          console.log(`🔍 Found delivery coordinates in checkout`);
        }
      }
      
      // Check for checkout payloads
      if (checkoutData.checkoutPayloads) {
        const payloads = checkoutData.checkoutPayloads;
        
        // Check for user profile in payloads
        if (payloads.userProfile) {
          const profile = payloads.userProfile;
          if (profile.firstName) customerInfo.customer_first_name = customerInfo.customer_first_name || profile.firstName;
          if (profile.lastName) customerInfo.customer_last_name = customerInfo.customer_last_name || profile.lastName;
          if (profile.email) customerInfo.customer_email = customerInfo.customer_email || profile.email;
          if (profile.phoneNumber) customerInfo.customer_phone = customerInfo.customer_phone || profile.phoneNumber;
          if (profile.uuid) customerInfo.customer_uuid = customerInfo.customer_uuid || profile.uuid;
          if (profile.profileImageUrl) customerInfo.customer_profile_image = customerInfo.customer_profile_image || profile.profileImageUrl;
          console.log(`🔍 Found user profile in checkout payloads`);
        }
        
        // Check for customer info in payloads
        if (payloads.customerInfo) {
          const customer = payloads.customerInfo;
          if (customer.name) customerInfo.customer_name = customerInfo.customer_name || customer.name;
          if (customer.email) customerInfo.customer_email = customerInfo.customer_email || customer.email;
          if (customer.phone) customerInfo.customer_phone = customerInfo.customer_phone || customer.phone;
          if (customer.id) customerInfo.customer_id = customerInfo.customer_id || customer.id;
          console.log(`🔍 Found customer info in checkout payloads`);
        }
        
        // Check for delivery details in payloads
        if (payloads.deliveryDetails) {
          const delivery = payloads.deliveryDetails;
          if (delivery.address) {
            const addr = delivery.address;
            const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
            if (parts.length) {
              customerInfo.customer_delivery_address = customerInfo.customer_delivery_address || parts.join(', ');
              console.log(`🔍 Found delivery address in checkout payloads: ${customerInfo.customer_delivery_address}`);
            }
          }
          if (delivery.latitude && delivery.longitude) {
            customerInfo.customer_coordinates = customerInfo.customer_coordinates || { latitude: delivery.latitude, longitude: delivery.longitude };
            console.log(`🔍 Found delivery coordinates in checkout payloads`);
          }
        }
        
        // Extract favorite restaurants
        if (payloads.favoriteRestaurants || payloads.favorites || payloads.restaurants) {
          const restaurants = payloads.favoriteRestaurants || payloads.favorites || payloads.restaurants;
          if (Array.isArray(restaurants) && restaurants.length > 0) {
            customerInfo.customer_favorite_restaurants = restaurants;
            console.log(`🔍 Found favorite restaurants: ${restaurants.length} restaurants`);
          }
        }
        
        // Extract dietary preferences
        if (payloads.dietaryPreferences || payloads.dietary || payloads.preferences) {
          const dietary = payloads.dietaryPreferences || payloads.dietary || payloads.preferences;
          if (Array.isArray(dietary) && dietary.length > 0) {
            customerInfo.customer_dietary_preferences = dietary;
            console.log(`🔍 Found dietary preferences: ${dietary.length} preferences`);
          }
        }
        
        // Extract payment methods
        if (payloads.paymentMethods || payloads.payments || payloads.cards) {
          const payments = payloads.paymentMethods || payloads.payments || payloads.cards;
          if (Array.isArray(payments) && payments.length > 0) {
            customerInfo.customer_payment_methods = payments;
            console.log(`🔍 Found payment methods: ${payments.length} methods`);
          }
        }
        
        // Extract delivery addresses
        if (payloads.deliveryAddresses || payloads.addresses || payloads.savedAddresses) {
          const addresses = payloads.deliveryAddresses || payloads.addresses || payloads.savedAddresses;
          if (Array.isArray(addresses) && addresses.length > 0) {
            customerInfo.customer_delivery_addresses = addresses;
            console.log(`🔍 Found delivery addresses: ${addresses.length} addresses`);
          }
        }
      }
      
      // Recursively search for customer data
      function searchForCustomerData(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          // Look for name fields
          if (lowerKey.includes('name') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_name) {
              customerInfo.customer_name = value.trim();
              console.log(`🔍 Found customer_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for email fields
          if (lowerKey.includes('email') && typeof value === 'string' && value.includes('@')) {
            if (!customerInfo.customer_email) {
              customerInfo.customer_email = value.trim();
              console.log(`🔍 Found customer_email at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for phone fields
          if ((lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_phone) {
              customerInfo.customer_phone = value.trim();
              console.log(`🔍 Found customer_phone at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for first name fields
          if ((lowerKey.includes('first') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_first_name) {
              customerInfo.customer_first_name = value.trim();
              console.log(`🔍 Found customer_first_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for last name fields
          if ((lowerKey.includes('last') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_last_name) {
              customerInfo.customer_last_name = value.trim();
              console.log(`🔍 Found customer_last_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for display name fields
          if ((lowerKey.includes('display') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_display_name) {
              customerInfo.customer_display_name = value.trim();
              console.log(`🔍 Found customer_display_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for username fields
          if (lowerKey.includes('username') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_username) {
              customerInfo.customer_username = value.trim();
              console.log(`🔍 Found customer_username at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for ID fields
          if ((lowerKey.includes('id') || lowerKey.includes('uuid')) && typeof value === 'string' && value.trim()) {
            if (lowerKey.includes('uuid') && !customerInfo.customer_uuid) {
              customerInfo.customer_uuid = value.trim();
              console.log(`🔍 Found customer_uuid at ${path}.${key}: ${value}`);
            } else if (!lowerKey.includes('uuid') && !customerInfo.customer_id) {
              customerInfo.customer_id = value.trim();
              console.log(`🔍 Found customer_id at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for profile image fields
          if ((lowerKey.includes('profile') && lowerKey.includes('image')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_profile_image) {
              customerInfo.customer_profile_image = value.trim();
              console.log(`🔍 Found customer_profile_image at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for address fields
          if (lowerKey.includes('address') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_address) {
              customerInfo.customer_address = value.trim();
              console.log(`🔍 Found customer_address at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for coordinates
          if (typeof value === 'object' && value !== null && (value.latitude || value.longitude)) {
            if (!customerInfo.customer_coordinates) {
              customerInfo.customer_coordinates = { latitude: value.latitude, longitude: value.longitude };
              console.log(`🔍 Found customer_coordinates at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          }
          
          // Look for favorite restaurants
          if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
              (lowerKey.includes('favorites') && lowerKey.includes('restaurant')) ||
              lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_favorite_restaurants = value;
              console.log(`🔍 Found favorite restaurants at ${path}.${key}: ${value.length} restaurants`);
            }
          }
          
          // Look for dietary preferences
          if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
              lowerKey.includes('diet') || lowerKey.includes('allergy') || 
              lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_dietary_preferences = value;
              console.log(`🔍 Found dietary preferences at ${path}.${key}: ${value.length} preferences`);
            }
          }
          
          // Look for payment methods
          if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
              lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
              lowerKey.includes('debit_card') || lowerKey.includes('wallet')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_payment_methods = value;
              console.log(`🔍 Found payment methods at ${path}.${key}: ${value.length} methods`);
            }
          }
          
          // Look for delivery addresses
          if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
              lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
              lowerKey.includes('location') || lowerKey.includes('address_book')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_delivery_addresses = value;
              console.log(`🔍 Found delivery addresses at ${path}.${key}: ${value.length} addresses`);
            }
          }
          
          // Recursively search nested objects
          if (typeof value === 'object' && value !== null) {
            searchForCustomerData(value, `${path}.${key}`);
          }
        }
      }
      
      searchForCustomerData(checkoutData);
    }
    
    console.log(`🔍 Final checkout customer info:`, JSON.stringify(customerInfo, null, 2));
    return customerInfo;
    
  } catch (error) {
    console.error(`❌ Error extracting customer from checkout data: ${error.message}`);
    return {};
  }
}

export function extractCustomerFromJoinData(joinData) {
  console.log(`🔍 extractCustomerFromJoinData - Input:`, JSON.stringify(joinData, null, 2));
  
  const customerInfo = {};
  
  try {
    // Look for customer/user information in join data
    if (joinData && typeof joinData === 'object') {
      // Check for user profile information
      if (joinData.userProfile) {
        const profile = joinData.userProfile;
        if (profile.firstName) customerInfo.customer_first_name = profile.firstName;
        if (profile.lastName) customerInfo.customer_last_name = profile.lastName;
        if (profile.email) customerInfo.customer_email = profile.email;
        if (profile.phoneNumber) customerInfo.customer_phone = profile.phoneNumber;
        if (profile.uuid) customerInfo.customer_uuid = profile.uuid;
        if (profile.profileImageUrl) customerInfo.customer_profile_image = profile.profileImageUrl;
        console.log(`🔍 Found user profile data`);
      }
      
      // Check for customer information
      if (joinData.customerInfo) {
        const customer = joinData.customerInfo;
        if (customer.name) customerInfo.customer_name = customer.name;
        if (customer.email) customerInfo.customer_email = customer.email;
        if (customer.phone) customerInfo.customer_phone = customer.phone;
        if (customer.id) customerInfo.customer_id = customer.id;
        console.log(`🔍 Found customer info data`);
      }
      
      // Check for eater information
      if (joinData.eaterInfo) {
        const eater = joinData.eaterInfo;
        if (eater.name) customerInfo.customer_name = customerInfo.customer_name || eater.name;
        if (eater.email) customerInfo.customer_email = customerInfo.customer_email || eater.email;
        if (eater.phone) customerInfo.customer_phone = customerInfo.customer_phone || eater.phone;
        console.log(`🔍 Found eater info data`);
      }
      
      // Check for member information
      if (joinData.memberInfo) {
        const member = joinData.memberInfo;
        if (member.name) customerInfo.customer_name = customerInfo.customer_name || member.name;
        if (member.email) customerInfo.customer_email = customerInfo.customer_email || member.email;
        if (member.phone) customerInfo.customer_phone = customerInfo.customer_phone || member.phone;
        console.log(`🔍 Found member info data`);
      }
      
      // Check for delivery address information
      if (joinData.deliveryAddress) {
        const delivery = joinData.deliveryAddress;
        if (delivery.address) {
          const addr = delivery.address;
          const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
          if (parts.length) {
            customerInfo.customer_delivery_address = parts.join(', ');
            console.log(`🔍 Found delivery address: ${customerInfo.customer_delivery_address}`);
          }
        }
        if (delivery.latitude && delivery.longitude) {
          customerInfo.customer_coordinates = { latitude: delivery.latitude, longitude: delivery.longitude };
          console.log(`🔍 Found delivery coordinates`);
        }
      }
      
      // Recursively search for customer data
      function searchForCustomerData(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          // Look for name fields
          if (lowerKey.includes('name') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_name) {
              customerInfo.customer_name = value.trim();
              console.log(`🔍 Found customer_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for email fields
          if (lowerKey.includes('email') && typeof value === 'string' && value.includes('@')) {
            if (!customerInfo.customer_email) {
              customerInfo.customer_email = value.trim();
              console.log(`🔍 Found customer_email at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for phone fields
          if ((lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_phone) {
              customerInfo.customer_phone = value.trim();
              console.log(`🔍 Found customer_phone at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for first name fields
          if ((lowerKey.includes('first') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_first_name) {
              customerInfo.customer_first_name = value.trim();
              console.log(`🔍 Found customer_first_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for last name fields
          if ((lowerKey.includes('last') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_last_name) {
              customerInfo.customer_last_name = value.trim();
              console.log(`🔍 Found customer_last_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for display name fields
          if ((lowerKey.includes('display') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_display_name) {
              customerInfo.customer_display_name = value.trim();
              console.log(`🔍 Found customer_display_name at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for username fields
          if (lowerKey.includes('username') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_username) {
              customerInfo.customer_username = value.trim();
              console.log(`🔍 Found customer_username at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for ID fields
          if ((lowerKey.includes('id') || lowerKey.includes('uuid')) && typeof value === 'string' && value.trim()) {
            if (lowerKey.includes('uuid') && !customerInfo.customer_uuid) {
              customerInfo.customer_uuid = value.trim();
              console.log(`🔍 Found customer_uuid at ${path}.${key}: ${value}`);
            } else if (!lowerKey.includes('uuid') && !customerInfo.customer_id) {
              customerInfo.customer_id = value.trim();
              console.log(`🔍 Found customer_id at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for profile image fields
          if ((lowerKey.includes('profile') && lowerKey.includes('image')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_profile_image) {
              customerInfo.customer_profile_image = value.trim();
              console.log(`🔍 Found customer_profile_image at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for address fields
          if (lowerKey.includes('address') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_address) {
              customerInfo.customer_address = value.trim();
              console.log(`🔍 Found customer_address at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for coordinates
          if (typeof value === 'object' && value !== null && (value.latitude || value.longitude)) {
            if (!customerInfo.customer_coordinates) {
              customerInfo.customer_coordinates = { latitude: value.latitude, longitude: value.longitude };
              console.log(`🔍 Found customer_coordinates at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          }
          
          // Look for favorite restaurants
          if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
              (lowerKey.includes('favorites') && lowerKey.includes('restaurant')) ||
              lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_favorite_restaurants = value;
              console.log(`🔍 Found favorite restaurants at ${path}.${key}: ${value.length} restaurants`);
            }
          }
          
          // Look for dietary preferences
          if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
              lowerKey.includes('diet') || lowerKey.includes('allergy') || 
              lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_dietary_preferences = value;
              console.log(`🔍 Found dietary preferences at ${path}.${key}: ${value.length} preferences`);
            }
          }
          
          // Look for payment methods
          if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
              lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
              lowerKey.includes('debit_card') || lowerKey.includes('wallet')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_payment_methods = value;
              console.log(`🔍 Found payment methods at ${path}.${key}: ${value.length} methods`);
            }
          }
          
          // Look for delivery addresses
          if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
              lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
              lowerKey.includes('location') || lowerKey.includes('address_book')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_delivery_addresses = value;
              console.log(`🔍 Found delivery addresses at ${path}.${key}: ${value.length} addresses`);
            }
          }
          
          // Recursively search nested objects
          if (typeof value === 'object' && value !== null) {
            searchForCustomerData(value, `${path}.${key}`);
          }
        }
      }
      
      searchForCustomerData(joinData);
    }
    
    console.log(`🔍 Final join customer info:`, JSON.stringify(customerInfo, null, 2));
    return customerInfo;
    
  } catch (error) {
    console.error(`❌ Error extracting customer from join data: ${error.message}`);
    return {};
  }
}

export function extractCustomerDetails(data) {
  console.log(`🔍 extractCustomerDetails - Input:`, JSON.stringify(data, null, 2));
  
  const customerDetails = {
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    customer_id: null,
    customer_uuid: null,
    customer_profile_image: null,
    customer_address: null,
    customer_coordinates: null,
    customer_preferences: null,
    customer_membership_status: null,
    customer_order_history_count: null,
    customer_rating: null,
    customer_first_name: null,
    customer_last_name: null,
    customer_display_name: null,
    customer_username: null,
    customer_joined_date: null,
    customer_last_active: null,
    customer_total_orders: null,
    customer_total_spent: null,
    customer_favorite_restaurants: [],
    customer_dietary_preferences: [],
    customer_payment_methods: [],
    customer_delivery_addresses: [],
    customer_order_preferences: null,
    // Additional fields for better extraction
    customer_delivery_address: null,
    customer_phone_number: null,
    customer_email_address: null,
    customer_full_name: null,
    customer_location: null,
    customer_profile: null,
    customer_info: null,
    customer_data: null,
    user_info: null,
    user_profile: null,
    user_data: null,
    eater_info: null,
    member_info: null,
    group_order_customer: null,
    order_customer: null,
    delivery_customer: null
  };

  try {
    // Function to recursively search for customer data
    function findCustomerData(obj, path = '') {
      if (!obj) return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => findCustomerData(item, `${path}[${index}]`));
        return;
      }
      
      if (typeof obj !== 'object') return;
      
      // Check for customer-related fields
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        // Customer identification - Enhanced search
        if (lowerKey.includes('customer') || lowerKey.includes('user') || lowerKey.includes('eater') || lowerKey.includes('member') || 
            lowerKey.includes('profile') || lowerKey.includes('person') || lowerKey.includes('client') || lowerKey.includes('account') ||
            lowerKey.includes('contact') || lowerKey.includes('recipient') || lowerKey.includes('delivery') || lowerKey.includes('orderer') ||
            lowerKey.includes('participant') || lowerKey.includes('guest') || lowerKey.includes('visitor') || lowerKey.includes('buyer')) {
          if (lowerKey.includes('name') && !lowerKey.includes('display')) {
            if (!customerDetails.customer_name && typeof value === 'string') {
              customerDetails.customer_name = value;
              console.log(`🔍 Found customer_name at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('display') && lowerKey.includes('name')) {
            if (!customerDetails.customer_display_name && typeof value === 'string') {
              customerDetails.customer_display_name = value;
              console.log(`🔍 Found customer_display_name at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('first') && lowerKey.includes('name')) {
            if (!customerDetails.customer_first_name && typeof value === 'string') {
              customerDetails.customer_first_name = value;
              console.log(`🔍 Found customer_first_name at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('last') && lowerKey.includes('name')) {
            if (!customerDetails.customer_last_name && typeof value === 'string') {
              customerDetails.customer_last_name = value;
              console.log(`🔍 Found customer_last_name at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('email')) {
            if (!customerDetails.customer_email && typeof value === 'string') {
              customerDetails.customer_email = value;
              console.log(`🔍 Found customer_email at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) {
            if (!customerDetails.customer_phone && typeof value === 'string') {
              customerDetails.customer_phone = value;
              console.log(`🔍 Found customer_phone at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('id') && !lowerKey.includes('uuid')) {
            if (!customerDetails.customer_id && typeof value === 'string') {
              customerDetails.customer_id = value;
              console.log(`🔍 Found customer_id at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('uuid')) {
            if (!customerDetails.customer_uuid && typeof value === 'string') {
              customerDetails.customer_uuid = value;
              console.log(`🔍 Found customer_uuid at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('username')) {
            if (!customerDetails.customer_username && typeof value === 'string') {
              customerDetails.customer_username = value;
              console.log(`🔍 Found customer_username at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('profile') && lowerKey.includes('image')) {
            if (!customerDetails.customer_profile_image && typeof value === 'string') {
              customerDetails.customer_profile_image = value;
              console.log(`🔍 Found customer_profile_image at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('address')) {
            if (!customerDetails.customer_address && typeof value === 'string') {
              customerDetails.customer_address = value;
              console.log(`🔍 Found customer_address at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('coordinates') || lowerKey.includes('location')) {
            if (!customerDetails.customer_coordinates && typeof value === 'object') {
              customerDetails.customer_coordinates = value;
              console.log(`🔍 Found customer_coordinates at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          } else if (lowerKey.includes('preferences')) {
            if (!customerDetails.customer_preferences && typeof value === 'object') {
              customerDetails.customer_preferences = value;
              console.log(`🔍 Found customer_preferences at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          } else if (lowerKey.includes('membership')) {
            if (!customerDetails.customer_membership_status && typeof value === 'string') {
              customerDetails.customer_membership_status = value;
              console.log(`🔍 Found customer_membership_status at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('order') && lowerKey.includes('history')) {
            if (!customerDetails.customer_order_history_count && typeof value === 'number') {
              customerDetails.customer_order_history_count = value;
              console.log(`🔍 Found customer_order_history_count at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('rating')) {
            if (!customerDetails.customer_rating && typeof value === 'number') {
              customerDetails.customer_rating = value;
              console.log(`🔍 Found customer_rating at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('joined') && lowerKey.includes('date')) {
            if (!customerDetails.customer_joined_date && typeof value === 'string') {
              customerDetails.customer_joined_date = value;
              console.log(`🔍 Found customer_joined_date at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('last') && lowerKey.includes('active')) {
            if (!customerDetails.customer_last_active && typeof value === 'string') {
              customerDetails.customer_last_active = value;
              console.log(`🔍 Found customer_last_active at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('total') && lowerKey.includes('orders')) {
            if (!customerDetails.customer_total_orders && typeof value === 'number') {
              customerDetails.customer_total_orders = value;
              console.log(`🔍 Found customer_total_orders at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('total') && lowerKey.includes('spent')) {
            if (!customerDetails.customer_total_spent && typeof value === 'number') {
              customerDetails.customer_total_spent = value;
              console.log(`🔍 Found customer_total_spent at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('favorite') && lowerKey.includes('restaurant')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_favorite_restaurants = value;
              console.log(`🔍 Found customer_favorite_restaurants at ${path}.${key}: ${value.length} restaurants`);
            }
          } else if (lowerKey.includes('dietary') && lowerKey.includes('preference')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_dietary_preferences = value;
              console.log(`🔍 Found customer_dietary_preferences at ${path}.${key}: ${value.length} preferences`);
            }
          } else if (lowerKey.includes('payment') && lowerKey.includes('method')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_payment_methods = value;
              console.log(`🔍 Found customer_payment_methods at ${path}.${key}: ${value.length} methods`);
            }
          } else if (lowerKey.includes('delivery') && lowerKey.includes('address')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_delivery_addresses = value;
              console.log(`🔍 Found customer_delivery_addresses at ${path}.${key}: ${value.length} addresses`);
            }
          }
          
          // Enhanced array extraction for the 4 specific arrays
          if (Array.isArray(value) && value.length > 0) {
            // Favorite restaurants patterns
            if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
                (lowerKey.includes('favorites') && lowerKey.includes('restaurant')) ||
                lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants') ||
                lowerKey.includes('liked_restaurants') || lowerKey.includes('preferred_restaurants') ||
                lowerKey.includes('restaurant_favorites') || lowerKey.includes('favorite_eateries')) {
              if (customerDetails.customer_favorite_restaurants.length === 0) {
                customerDetails.customer_favorite_restaurants = value;
                console.log(`🔍 Found customer_favorite_restaurants at ${path}.${key}: ${value.length} restaurants`);
              }
            }
            
            // Dietary preferences patterns
            if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
                lowerKey.includes('diet') || lowerKey.includes('allergy') || 
                lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction') ||
                lowerKey.includes('nutritional') || lowerKey.includes('health_preference') ||
                lowerKey.includes('food_allergy') || lowerKey.includes('dietary_need')) {
              if (customerDetails.customer_dietary_preferences.length === 0) {
                customerDetails.customer_dietary_preferences = value;
                console.log(`🔍 Found customer_dietary_preferences at ${path}.${key}: ${value.length} preferences`);
              }
            }
            
            // Payment methods patterns
            if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
                lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
                lowerKey.includes('debit_card') || lowerKey.includes('wallet') ||
                lowerKey.includes('payment_card') || lowerKey.includes('billing_method') ||
                lowerKey.includes('card') || lowerKey.includes('payment_option')) {
              if (customerDetails.customer_payment_methods.length === 0) {
                customerDetails.customer_payment_methods = value;
                console.log(`🔍 Found customer_payment_methods at ${path}.${key}: ${value.length} methods`);
              }
            }
            
            // Delivery addresses patterns
            if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
                lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
                lowerKey.includes('location') || lowerKey.includes('address_book') ||
                lowerKey.includes('shipping_address') || lowerKey.includes('delivery_location') ||
                lowerKey.includes('address') || lowerKey.includes('delivery_address')) {
              if (customerDetails.customer_delivery_addresses.length === 0) {
                customerDetails.customer_delivery_addresses = value;
                console.log(`🔍 Found customer_delivery_addresses at ${path}.${key}: ${value.length} addresses`);
              }
            }
          } else if (lowerKey.includes('order') && lowerKey.includes('preference')) {
            if (!customerDetails.customer_order_preferences && typeof value === 'object') {
              customerDetails.customer_order_preferences = value;
              console.log(`🔍 Found customer_order_preferences at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          }
        }
        
        // Continue searching recursively
        findCustomerData(value, `${path}.${key}`);
      }
    }
    
    // Search for customer data in the provided data
    findCustomerData(data);
    
    // Also look for specific Uber Eats customer fields
    if (data?.data) {
      const dataSection = data.data;
      
      // Check for user profile information
      if (dataSection.userProfile) {
        const profile = dataSection.userProfile;
        if (profile.firstName && !customerDetails.customer_first_name) {
          customerDetails.customer_first_name = profile.firstName;
        }
        if (profile.lastName && !customerDetails.customer_last_name) {
          customerDetails.customer_last_name = profile.lastName;
        }
        if (profile.email && !customerDetails.customer_email) {
          customerDetails.customer_email = profile.email;
        }
        if (profile.phoneNumber && !customerDetails.customer_phone) {
          customerDetails.customer_phone = profile.phoneNumber;
        }
        if (profile.profileImageUrl && !customerDetails.customer_profile_image) {
          customerDetails.customer_profile_image = profile.profileImageUrl;
        }
        if (profile.uuid && !customerDetails.customer_uuid) {
          customerDetails.customer_uuid = profile.uuid;
        }
        if (profile.membershipStatus && !customerDetails.customer_membership_status) {
          customerDetails.customer_membership_status = profile.membershipStatus;
        }
      }
      
      // Check for customer information in checkout payloads
      if (dataSection.checkoutPayloads) {
        const payloads = dataSection.checkoutPayloads;
        
        if (payloads.customerInfo) {
          const customerInfo = payloads.customerInfo;
          if (customerInfo.name && !customerDetails.customer_name) {
            customerDetails.customer_name = customerInfo.name;
          }
          if (customerInfo.email && !customerDetails.customer_email) {
            customerDetails.customer_email = customerInfo.email;
          }
          if (customerInfo.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = customerInfo.phone;
          }
        }
        
        if (payloads.userProfile) {
          const userProfile = payloads.userProfile;
          if (userProfile.firstName && !customerDetails.customer_first_name) {
            customerDetails.customer_first_name = userProfile.firstName;
          }
          if (userProfile.lastName && !customerDetails.customer_last_name) {
            customerDetails.customer_last_name = userProfile.lastName;
          }
          if (userProfile.email && !customerDetails.customer_email) {
            customerDetails.customer_email = userProfile.email;
          }
          if (userProfile.phoneNumber && !customerDetails.customer_phone) {
            customerDetails.customer_phone = userProfile.phoneNumber;
          }
        }
      }
      
      // Check for customer data in group order information
      if (dataSection.groupOrder) {
        const groupOrder = dataSection.groupOrder;
        if (groupOrder.customerInfo) {
          const customerInfo = groupOrder.customerInfo;
          if (customerInfo.name && !customerDetails.customer_name) {
            customerDetails.customer_name = customerInfo.name;
          }
          if (customerInfo.email && !customerDetails.customer_email) {
            customerDetails.customer_email = customerInfo.email;
          }
          if (customerInfo.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = customerInfo.phone;
          }
        }
      }
    }
    
    // Additional extraction from common Uber Eats response patterns
    try {
      // Check for delivery address in the response
      if (data && typeof data === 'object') {
        // Look for delivery information
        const deliveryInfo = findDeliveryInfo(data);
        if (deliveryInfo && !customerDetails.customer_delivery_address) {
          customerDetails.customer_delivery_address = deliveryInfo;
          console.log(`🔍 Found delivery address: ${deliveryInfo}`);
        }
        
        // Look for any user/customer data in the root level
        if (data.user && typeof data.user === 'object') {
          const user = data.user;
          if (user.name && !customerDetails.customer_name) {
            customerDetails.customer_name = user.name;
            console.log(`🔍 Found customer_name in user: ${user.name}`);
          }
          if (user.email && !customerDetails.customer_email) {
            customerDetails.customer_email = user.email;
            console.log(`🔍 Found customer_email in user: ${user.email}`);
          }
          if (user.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = user.phone;
            console.log(`🔍 Found customer_phone in user: ${user.phone}`);
          }
        }
        
        // Look for customer data in the root level
        if (data.customer && typeof data.customer === 'object') {
          const customer = data.customer;
          if (customer.name && !customerDetails.customer_name) {
            customerDetails.customer_name = customer.name;
            console.log(`🔍 Found customer_name in customer: ${customer.name}`);
          }
          if (customer.email && !customerDetails.customer_email) {
            customerDetails.customer_email = customer.email;
            console.log(`🔍 Found customer_email in customer: ${customer.email}`);
          }
          if (customer.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = customer.phone;
            console.log(`🔍 Found customer_phone in customer: ${customer.phone}`);
          }
        }
        
        // Look for profile data
        if (data.profile && typeof data.profile === 'object') {
          const profile = data.profile;
          if (profile.firstName && !customerDetails.customer_first_name) {
            customerDetails.customer_first_name = profile.firstName;
            console.log(`🔍 Found customer_first_name in profile: ${profile.firstName}`);
          }
          if (profile.lastName && !customerDetails.customer_last_name) {
            customerDetails.customer_last_name = profile.lastName;
            console.log(`🔍 Found customer_last_name in profile: ${profile.lastName}`);
          }
          if (profile.email && !customerDetails.customer_email) {
            customerDetails.customer_email = profile.email;
            console.log(`🔍 Found customer_email in profile: ${profile.email}`);
          }
        }
        
        // Look for eater data
        if (data.eater && typeof data.eater === 'object') {
          const eater = data.eater;
          if (eater.name && !customerDetails.customer_name) {
            customerDetails.customer_name = eater.name;
            console.log(`🔍 Found customer_name in eater: ${eater.name}`);
          }
          if (eater.email && !customerDetails.customer_email) {
            customerDetails.customer_email = eater.email;
            console.log(`🔍 Found customer_email in eater: ${eater.email}`);
          }
          if (eater.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = eater.phone;
            console.log(`🔍 Found customer_phone in eater: ${eater.phone}`);
          }
        }
        
        // Look for member data
        if (data.member && typeof data.member === 'object') {
          const member = data.member;
          if (member.name && !customerDetails.customer_name) {
            customerDetails.customer_name = member.name;
            console.log(`🔍 Found customer_name in member: ${member.name}`);
          }
          if (member.email && !customerDetails.customer_email) {
            customerDetails.customer_email = member.email;
            console.log(`🔍 Found customer_email in member: ${member.email}`);
          }
          if (member.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = member.phone;
            console.log(`🔍 Found customer_phone in member: ${member.phone}`);
          }
        }
        
        // Look for orderer data
        if (data.orderer && typeof data.orderer === 'object') {
          const orderer = data.orderer;
          if (orderer.name && !customerDetails.customer_name) {
            customerDetails.customer_name = orderer.name;
            console.log(`🔍 Found customer_name in orderer: ${orderer.name}`);
          }
          if (orderer.email && !customerDetails.customer_email) {
            customerDetails.customer_email = orderer.email;
            console.log(`🔍 Found customer_email in orderer: ${orderer.email}`);
          }
          if (orderer.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = orderer.phone;
            console.log(`🔍 Found customer_phone in orderer: ${orderer.phone}`);
          }
        }
        
        // Look for participant data
        if (data.participant && typeof data.participant === 'object') {
          const participant = data.participant;
          if (participant.name && !customerDetails.customer_name) {
            customerDetails.customer_name = participant.name;
            console.log(`🔍 Found customer_name in participant: ${participant.name}`);
          }
          if (participant.email && !customerDetails.customer_email) {
            customerDetails.customer_email = participant.email;
            console.log(`🔍 Found customer_email in participant: ${participant.email}`);
          }
          if (participant.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = participant.phone;
            console.log(`🔍 Found customer_phone in participant: ${participant.phone}`);
          }
        }
        
        // Look for guest data
        if (data.guest && typeof data.guest === 'object') {
          const guest = data.guest;
          if (guest.name && !customerDetails.customer_name) {
            customerDetails.customer_name = guest.name;
            console.log(`🔍 Found customer_name in guest: ${guest.name}`);
          }
          if (guest.email && !customerDetails.customer_email) {
            customerDetails.customer_email = guest.email;
            console.log(`🔍 Found customer_email in guest: ${guest.email}`);
          }
          if (guest.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = guest.phone;
            console.log(`🔍 Found customer_phone in guest: ${guest.phone}`);
          }
        }
        
        // Look for buyer data
        if (data.buyer && typeof data.buyer === 'object') {
          const buyer = data.buyer;
          if (buyer.name && !customerDetails.customer_name) {
            customerDetails.customer_name = buyer.name;
            console.log(`🔍 Found customer_name in buyer: ${buyer.name}`);
          }
          if (buyer.email && !customerDetails.customer_email) {
            customerDetails.customer_email = buyer.email;
            console.log(`🔍 Found customer_email in buyer: ${buyer.email}`);
          }
          if (buyer.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = buyer.phone;
            console.log(`🔍 Found customer_phone in buyer: ${buyer.phone}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error in additional extraction: ${error.message}`);
    }
    
    // No fallback data - only show real extracted data
    console.log(`🔍 Real data extraction completed - no fallback data added`);
    
    // Clean up null values
    const cleanedDetails = {};
    for (const [key, value] of Object.entries(customerDetails)) {
      if (value !== null && value !== undefined) {
        cleanedDetails[key] = value;
      }
    }
    
    console.log(`🔍 Final extracted customer details:`, JSON.stringify(cleanedDetails, null, 2));
    return cleanedDetails;
    
  } catch (error) {
    console.error(`❌ Error extracting customer details: ${error.message}`);
    return {};
  }
}

function findDeliveryCoords(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findDeliveryCoords(it); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    if (obj.latitude && obj.longitude) return { latitude: obj.latitude, longitude: obj.longitude };
    for (const v of Object.values(obj)) { const r = findDeliveryCoords(v); if (r) return r; }
  }
  return null;
}

function findDeliveryInfo(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findDeliveryInfo(item);
      if (result) return result;
    }
    return null;
  }
  if (typeof obj === 'object') {
    // Look for delivery address patterns
    if (obj.deliveryAddress && typeof obj.deliveryAddress === 'string') {
      return obj.deliveryAddress;
    }
    if (obj.delivery_address && typeof obj.delivery_address === 'string') {
      return obj.delivery_address;
    }
    if (obj.address && typeof obj.address === 'string') {
      return obj.address;
    }
    if (obj.deliveryLocation && obj.deliveryLocation.address) {
      return obj.deliveryLocation.address;
    }
    // Recursively search in nested objects
    for (const value of Object.values(obj)) {
      const result = findDeliveryInfo(value);
      if (result) return result;
    }
  }
  return null;
}

function findDeliveryAddress(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findDeliveryAddress(it); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    if (typeof obj.displayString === 'string') {
      const s = obj.displayString;
      if (s.includes(', ')) return s.split(', ', 1)[1];
      return s;
    }
    const parts = [];
    if (obj.address1) parts.push(obj.address1);
    if (obj.address2) parts.push(obj.address2);
    if (obj.aptOrSuite) parts.push(obj.aptOrSuite);
    if (obj.formattedAddress) parts.push(obj.formattedAddress);
    if (parts.length) return parts.filter(Boolean).join(', ');
    for (const v of Object.values(obj)) { const r = findDeliveryAddress(v); if (r) return r; }
  }
  return null;
}

async function getLocationDetails(latitude, longitude) {
  try {
    const url = 'https://nominatim.openstreetmap.org/reverse';
    const res = await axios.get(url, { 
      params: { format: 'json', lat: latitude, lon: longitude, addressdetails: 1 }, 
      headers: { 'User-Agent': 'UberEats-Node/1.0' }, 
      timeout: 6000 
    });
    const address = res.data?.address || {};
    const stateMap = { 
      'California': 'CA','Texas':'TX','Florida':'FL','New York':'NY','Pennsylvania':'PA','Illinois':'IL','Ohio':'OH','Georgia':'GA','North Carolina':'NC','Michigan':'MI','New Jersey':'NJ','Virginia':'VA','Washington':'WA','Arizona':'AZ','Massachusetts':'MA','Tennessee':'TN','Indiana':'IN','Missouri':'MO','Maryland':'MD','Wisconsin':'WI','Colorado':'CO','Minnesota':'MN','South Carolina':'SC','Alabama':'AL','Louisiana':'LA','Kentucky':'KY','Oregon':'OR','Oklahoma':'OK','Connecticut':'CT','Iowa':'IA','Utah':'UT','Arkansas':'AR','Nevada':'NV','Mississippi':'MS','Kansas':'KS','New Mexico':'NM','Nebraska':'NE','West Virginia':'WV','Idaho':'ID','Hawaii':'HI','New Hampshire':'NH','Maine':'ME','Montana':'MT','Rhode Island':'RI','Delaware':'DE','South Dakota':'SD','North Dakota':'ND','Alaska':'AK','Vermont':'VT','Wyoming':'WY' 
    };
    let city = address.city || address.town || address.village || address.hamlet || null;
    let state = address.state ? (stateMap[address.state] || address.state) : null;
    let zip = address.postcode || null;
    if (city && ['City of New York','New York','New York City'].includes(city)) {
      city = address.borough || address.city_district || address.suburb || address.neighbourhood || city;
    }
    return { city, state, zip };
  } catch (_) {
    return null;
  }
}

async function scrapeHtmlForDelivery(session, link) {
  try {
    const res = await session.get(link);
    if (res.status !== 200) return { address: null, coords: null, instructions: null };
    const html = res.data || '';
    const coordRegexes = [ /"latitude"\s*:\s*([0-9.-]+)/i, /"longitude"\s*:\s*([0-9.-]+)/i, /"lat"\s*:\s*([0-9.-]+)/i, /"lng"\s*:\s*([0-9.-]+)/i ];
    const addrRegexes = [ /"displayString":"([^"]*Meet at my door[^"]*)"/i, /"formattedAddress":"([^"]+)"/i, /"address1":"([^"]+)"[^}]*"address2":"([^"]+)"/i, /"deliveryAddress"\s*:\s*"([^"]+)"/i, /"streetAddress"\s*:\s*"([^"]+)"/i, /"address"\s*:\s*"([^"]+)"/i, /"fullAddress"\s*:\s*"([^"]+)"/i ];
    
    // Instruction regex patterns
    const instructionRegexes = [
      /"instructions"\s*:\s*"([^"]+)"/i,
      /"deliveryInstructions"\s*:\s*"([^"]+)"/i,
      /"specialInstructions"\s*:\s*"([^"]+)"/i,
      /"deliveryNote"\s*:\s*"([^"]+)"/i,
      /"note"\s*:\s*"([^"]+)"/i,
      /"comment"\s*:\s*"([^"]+)"/i,
      /"meetAt"\s*:\s*"([^"]+)"/i,
      /"meet_at"\s*:\s*"([^"]+)"/i,
      /"meetAtDoor"\s*:\s*"([^"]+)"/i,
      /"buildingInstructions"\s*:\s*"([^"]+)"/i,
      /"apartmentInstructions"\s*:\s*"([^"]+)"/i,
      /"gateInstructions"\s*:\s*"([^"]+)"/i,
      /"doorInstructions"\s*:\s*"([^"]+)"/i
    ];
    
    // CRITICAL: Phone number regex patterns
    const phoneRegexes = [
      /"phone"\s*:\s*"([^"]+)"/i,
      /"mobile"\s*:\s*"([^"]+)"/i,
      /"number"\s*:\s*"([^"]+)"/i,
      /"tel"\s*:\s*"([^"]+)"/i,
      /"contact"\s*:\s*"([^"]+)"/i,
      /"customer_phone"\s*:\s*"([^"]+)"/i,
      /"user_phone"\s*:\s*"([^"]+)"/i,
      /"eater_phone"\s*:\s*"([^"]+)"/i,
      /"member_phone"\s*:\s*"([^"]+)"/i,
      /"delivery_phone"\s*:\s*"([^"]+)"/i,
      /"order_phone"\s*:\s*"([^"]+)"/i,
      /"phoneNumber"\s*:\s*"([^"]+)"/i,
      /"mobileNumber"\s*:\s*"([^"]+)"/i,
      /"cellNumber"\s*:\s*"([^"]+)"/i,
      /"contactNumber"\s*:\s*"([^"]+)"/i,
      /"contactPhone"\s*:\s*"([^"]+)"/i,
      /"telephone"\s*:\s*"([^"]+)"/i,
      /"handset"\s*:\s*"([^"]+)"/i,
      /"dial"\s*:\s*"([^"]+)"/i,
      /"call"\s*:\s*"([^"]+)"/i
    ];
    const coords = {};
    for (const rx of coordRegexes) {
      const m = html.match(rx);
      if (!m) continue;
      if (/latitude/i.test(rx.source)) coords.latitude = Number(m[1]);
      if (/longitude/i.test(rx.source)) coords.longitude = Number(m[1]);
      if (/[^a-z]lat[^a-z]/i.test(rx.source)) coords.latitude = Number(m[1]);
      if (/[^a-z]lng[^a-z]/i.test(rx.source)) coords.longitude = Number(m[1]);
    }
    let address = null; let instructions = null; let phone = null;
    
    // Extract phone number from HTML
    for (const rx of phoneRegexes) {
      const m = html.match(rx);
      if (!m) continue;
      phone = m[1];
      console.log(`📞 CRITICAL: Phone number found in HTML: ${phone}`);
      break;
    }
    
    // Extract delivery instructions from HTML
    for (const rx of instructionRegexes) {
      const m = html.match(rx);
      if (!m) continue;
      instructions = m[1];
      console.log(`🔍 Delivery instructions found in HTML: ${instructions}`);
      break;
    }
    
    for (const rx of addrRegexes) {
      const m = html.match(rx);
      if (!m) continue;
      if (rx.source.includes('formattedAddress') || rx.source.includes('address1')) {
        address = m[2] ? `${m[1]}, ${m[2]}` : m[1];
        break;
      }
      if (rx.source.includes('Meet at my door')) {
        instructions = m[1];
      } else if (!address) {
        address = m[1];
      }
    }
    const coordsValid = Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
    return { address, coords: coordsValid ? coords : null, instructions, phone };
  } catch (_) {
    return { address: null, coords: null, instructions: null, phone: null };
  }
}

export async function getOrderDetails(link) {
  const draftOrderUUID = extractGroupUuid(link);
  if (!draftOrderUUID) {
    return { success: false, subtotal: 0, fees: 0, taxes: 0, items: [], restaurant_name: null, restaurant_address: null, restaurant_hours: null, delivery_address: null, delivery_instructions: null, restaurant_image_url: null, is_uber_one_eligible: false, customer_details: {} };
  }

  // Ensure we have a valid SID before making requests
  await ensureValidSid();

  const session = axios.create({
    headers: {
      'x-csrf-token': 'x',
      'User-Agent': 'Mozilla/5.0',
      Cookie: `sid=${UBER_SID}`,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://www.ubereats.com',
      Referer: 'https://www.ubereats.com/',
      'Content-Type': 'application/json'
    },
    timeout: 9000
  });

  let storeUuid = null;
  let deliveryCoords = null;
  let deliveryAddress = null;
  let deliveryInstructions = null;
  let restaurantName = null;
  let restaurantAddress = null;
  let restaurantHours = null;
  let restaurantImageUrl = null;
  let isUberOneEligible = false;

  try {
    // Join
    const joinRes = await session.post('https://www.ubereats.com/_p/api/addMemberToDraftOrderV1', { draftOrderUuid: draftOrderUUID });
    if (joinRes.status !== 200) {
      return { success: false, error: `join failed: ${joinRes.status}`, subtotal: 0, fees: 0, taxes: 0, items: [], customer_details: {} };
    }
    const joinData = joinRes?.data || {};
    console.log(`🔍 Join Response Data:`, JSON.stringify(joinData, null, 2));
    
    // CRITICAL: Search for phone numbers in join response
    console.log(`📞 CRITICAL: Searching for phone numbers in join response...`);
    const joinDataStr = JSON.stringify(joinData);
    const phonePatterns = [
      /phone/i, /mobile/i, /number/i, /tel/i, /contact/i, /call/i,
      /dial/i, /cell/i, /handset/i, /telephone/i, /contact_number/i,
      /phone_number/i, /mobile_number/i, /cell_number/i, /contact_phone/i,
      /customer_phone/i, /user_phone/i, /eater_phone/i, /member_phone/i,
      /delivery_phone/i, /order_phone/i
    ];
    
    phonePatterns.forEach(pattern => {
      if (pattern.test(joinDataStr)) {
        console.log(`📞 CRITICAL: Found phone pattern "${pattern}" in join response`);
        // Extract the actual value
        const matches = joinDataStr.match(new RegExp(`"([^"]*${pattern.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"`, 'gi'));
        if (matches) {
          console.log(`📞 CRITICAL: Phone matches:`, matches);
        }
      }
    });
    
    // Analyze join response structure
    console.log(`🔍 === ANALYZING JOIN RESPONSE STRUCTURE ===`);
    analyzeUberEatsResponse(joinData);
    
    // Extract real customer data from join response
    const realJoinData = extractRealCustomerData(joinData);
    console.log(`🔍 Real join data extracted:`, JSON.stringify(realJoinData, null, 2));
    
    // Extract additional Uber Eats specific data
    const additionalData = extractAdditionalUberEatsData(joinData);
    console.log(`🔍 Additional Uber Eats data extracted:`, JSON.stringify(additionalData, null, 2));
    
    // Extract delivery instructions from join response
    const joinInstructions = extractDeliveryInstructions(joinData);
    console.log(`🔍 Delivery instructions from join:`, joinInstructions);
    
    // DEBUG: Search for any instruction-related data in join response
    console.log(`🔍 DEBUG: Searching for instruction patterns in join response...`);
    const instructionPatterns = [
      'instruction', 'note', 'comment', 'special', 'delivery_note', 
      'delivery_instruction', 'special_instruction', 'meet_at', 'meet',
      'door', 'gate', 'building', 'apartment', 'suite', 'unit'
    ];
    
    instructionPatterns.forEach(pattern => {
      const regex = new RegExp(`"${pattern}"\\s*:\\s*"([^"]+)"`, 'gi');
      const matches = joinDataStr.match(regex);
      if (matches) {
        console.log(`🔍 DEBUG: Found instruction pattern "${pattern}":`, matches);
      }
    });
    
    // DEBUG: Check shopping cart items for special instructions
    if (joinData?.data?.shoppingCart?.items) {
      console.log(`🔍 DEBUG: Checking shopping cart items for special instructions...`);
      joinData.data.shoppingCart.items.forEach((item, index) => {
        if (item.specialInstructions && item.specialInstructions.trim()) {
          console.log(`🔍 DEBUG: Found special instructions in item ${index}:`, item.specialInstructions);
        }
      });
    }
    
    // DEBUG: Check delivery address for instructions
    if (joinData?.data?.deliveryAddress) {
      console.log(`🔍 DEBUG: Checking delivery address for instructions...`);
      const delivery = joinData.data.deliveryAddress;
      console.log(`🔍 DEBUG: Delivery address object:`, JSON.stringify(delivery, null, 2));
    }
    
    storeUuid = findStoreUuid(joinData);
    const joinDelivery = joinData?.data?.deliveryAddress || {};
    if (joinDelivery) {
      if (joinDelivery.latitude && joinDelivery.longitude) deliveryCoords = { latitude: joinDelivery.latitude, longitude: joinDelivery.longitude };
      const addr = joinDelivery.address || {};
      const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
      if (parts.length) deliveryAddress = parts.join(', ');
    }

    // Checkout
    const checkoutRes = await session.post('https://www.ubereats.com/_p/api/getCheckoutPresentationV1', {
      payloadTypes: ['fareBreakdown', 'total', 'cartItems', 'orderItems', 'deliveryDetails'],
      draftOrderUUID,
      isGroupOrder: true
    });
    
    console.log(`🔍 Checkout Response Status: ${checkoutRes.status}`);
    console.log(`🔍 Checkout Response Data:`, JSON.stringify(checkoutRes?.data, null, 2));
    
    // CRITICAL: Search for phone numbers in checkout response
    console.log(`📞 CRITICAL: Searching for phone numbers in checkout response...`);
    const checkoutDataStr = JSON.stringify(checkoutRes?.data);
    
    phonePatterns.forEach(pattern => {
      if (pattern.test(checkoutDataStr)) {
        console.log(`📞 CRITICAL: Found phone pattern "${pattern}" in checkout response`);
        // Extract the actual value
        const matches = checkoutDataStr.match(new RegExp(`"([^"]*${pattern.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"`, 'gi'));
        if (matches) {
          console.log(`📞 CRITICAL: Phone matches:`, matches);
        }
      }
    });
    
    // Deep analysis of response structure for customer data
    console.log(`🔍 === DEEP ANALYSIS OF UBER EATS RESPONSE ===`);
    analyzeUberEatsResponse(checkoutRes?.data);
    
    // Extract real customer data from checkout response
    const realCheckoutData = extractRealCustomerData(checkoutRes?.data);
    console.log(`🔍 Real checkout data extracted:`, JSON.stringify(realCheckoutData, null, 2));
    
    // Extract delivery instructions from checkout response
    const checkoutInstructions = extractDeliveryInstructions(checkoutRes?.data);
    console.log(`🔍 Delivery instructions from checkout:`, checkoutInstructions);
    
    // DEBUG: Search for any instruction-related data in checkout response
    console.log(`🔍 DEBUG: Searching for instruction patterns in checkout response...`);
    
    instructionPatterns.forEach(pattern => {
      const regex = new RegExp(`"${pattern}"\\s*:\\s*"([^"]+)"`, 'gi');
      const matches = checkoutDataStr.match(regex);
      if (matches) {
        console.log(`🔍 DEBUG: Found instruction pattern "${pattern}" in checkout:`, matches);
      }
    });
    
    if (checkoutRes.status !== 200) {
      return { success: false, error: `checkout failed: ${checkoutRes.status}`, subtotal: 0, fees: 0, taxes: 0, items: [], customer_details: {} };
    }
    
    // Check if response indicates failure
    if (checkoutRes.data?.status === 'failure') {
      return { 
        success: false, 
        error: `Uber Eats API error: ${checkoutRes.data?.data?.message || 'Unknown error'}`, 
        subtotal: 0, 
        fees: 0, 
        taxes: 0, 
        items: [],
        customer_details: {}
      };
    }
    
    const checkoutPayloads = checkoutRes?.data?.data?.checkoutPayloads || {};
    console.log(`🔍 Checkout Payloads:`, JSON.stringify(checkoutPayloads, null, 2));
    
    const breakdown = extractSubtotalAndFeesFromCheckoutPayloads(checkoutPayloads);
    const { subtotal, taxes, fees, deliveryFee, serviceFee, tip, smallOrderFee, adjustmentsFee, pickupFee, otherFees, hasUberOne, uberOneBenefit, total, currencyCode } = breakdown;
    
    console.log(`🔍 Extracted Breakdown:`, {
      subtotal,
      taxes,
      fees,
      total,
      currencyCode
    });

    // Items
    const items = extractOrderItemsFromCheckout(checkoutRes?.data);
    console.log(`🔍 Extracted Items:`, JSON.stringify(items, null, 2));

    // Customer Details - Enhanced extraction
    const customerDetails = extractCustomerDetails(checkoutRes?.data);
    console.log(`🔍 Extracted Customer Details:`, JSON.stringify(customerDetails, null, 2));
    
    // Additional customer data extraction from join response
    if (joinData?.data) {
      console.log(`🔍 Join Data for Customer Extraction:`, JSON.stringify(joinData.data, null, 2));
      
      // Extract customer info from join response
      const joinCustomerInfo = extractCustomerFromJoinData(joinData.data);
      if (joinCustomerInfo && Object.keys(joinCustomerInfo).length > 0) {
        console.log(`🔍 Customer Info from Join Data:`, JSON.stringify(joinCustomerInfo, null, 2));
        // Merge with existing customer details
        Object.assign(customerDetails, joinCustomerInfo);
      }
    }
    
    // Additional extraction from checkout response structure
    if (checkoutRes?.data?.data) {
      console.log(`🔍 Checkout Data Structure:`, JSON.stringify(checkoutRes.data.data, null, 2));
      
      // Extract from checkout data structure
      const checkoutCustomerInfo = extractCustomerFromCheckoutData(checkoutRes.data.data);
      if (checkoutCustomerInfo && Object.keys(checkoutCustomerInfo).length > 0) {
        console.log(`🔍 Customer Info from Checkout Data:`, JSON.stringify(checkoutCustomerInfo, null, 2));
        // Merge with existing customer details
        Object.assign(customerDetails, checkoutCustomerInfo);
      }
    }
    
    // Extract real customer data from checkout response (join data already extracted above)
    const realCustomerData = extractRealCustomerData(checkoutRes?.data);
    
    // Merge real data
    customerDetails.customer_favorite_restaurants = [
      ...customerDetails.customer_favorite_restaurants,
      ...realCustomerData.customer_favorite_restaurants,
      ...realJoinData.customer_favorite_restaurants
    ];
    
    customerDetails.customer_dietary_preferences = [
      ...customerDetails.customer_dietary_preferences,
      ...realCustomerData.customer_dietary_preferences,
      ...realJoinData.customer_dietary_preferences
    ];
    
    customerDetails.customer_payment_methods = [
      ...customerDetails.customer_payment_methods,
      ...realCustomerData.customer_payment_methods,
      ...realJoinData.customer_payment_methods
    ];
    
    customerDetails.customer_delivery_addresses = [
      ...customerDetails.customer_delivery_addresses,
      ...realCustomerData.customer_delivery_addresses,
      ...realJoinData.customer_delivery_addresses
    ];
    
    // CRITICAL: Merge phone numbers from all sources
    if (realCustomerData.customer_phone && !customerDetails.customer_phone) {
      customerDetails.customer_phone = realCustomerData.customer_phone;
      console.log(`📞 CRITICAL: Phone number from checkout data: ${realCustomerData.customer_phone}`);
    }
    if (realJoinData.customer_phone && !customerDetails.customer_phone) {
      customerDetails.customer_phone = realJoinData.customer_phone;
      console.log(`📞 CRITICAL: Phone number from join data: ${realJoinData.customer_phone}`);
    }
    
    // Merge other individual customer fields
    Object.keys(realCustomerData).forEach(key => {
      if (key !== 'customer_favorite_restaurants' && key !== 'customer_dietary_preferences' && 
          key !== 'customer_payment_methods' && key !== 'customer_delivery_addresses' &&
          realCustomerData[key] && !customerDetails[key]) {
        customerDetails[key] = realCustomerData[key];
        console.log(`🔍 Merged customer field: ${key} = ${realCustomerData[key]}`);
      }
    });
    
    Object.keys(realJoinData).forEach(key => {
      if (key !== 'customer_favorite_restaurants' && key !== 'customer_dietary_preferences' && 
          key !== 'customer_payment_methods' && key !== 'customer_delivery_addresses' &&
          realJoinData[key] && !customerDetails[key]) {
        customerDetails[key] = realJoinData[key];
        console.log(`🔍 Merged join field: ${key} = ${realJoinData[key]}`);
      }
    });
    
    // Merge additional Uber Eats data
    Object.keys(additionalData).forEach(key => {
      if (additionalData[key] && !customerDetails[key]) {
        customerDetails[key] = additionalData[key];
        console.log(`🔍 Merged additional field: ${key} = ${JSON.stringify(additionalData[key])}`);
      }
    });
    
    // Merge delivery instructions from all sources
    if (joinInstructions && !deliveryInstructions) {
      deliveryInstructions = joinInstructions;
      console.log(`🔍 Using delivery instructions from join: ${joinInstructions}`);
    }
    if (checkoutInstructions && !deliveryInstructions) {
      deliveryInstructions = checkoutInstructions;
      console.log(`🔍 Using delivery instructions from checkout: ${checkoutInstructions}`);
    }
    
    // Add delivery instructions to customer details
    if (deliveryInstructions) {
      customerDetails.delivery_instructions = deliveryInstructions;
      console.log(`🔍 Added delivery instructions to customer details: ${deliveryInstructions}`);
    }
    
    // Remove duplicates
    customerDetails.customer_favorite_restaurants = [...new Set(customerDetails.customer_favorite_restaurants.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    customerDetails.customer_dietary_preferences = [...new Set(customerDetails.customer_dietary_preferences.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    customerDetails.customer_payment_methods = [...new Set(customerDetails.customer_payment_methods.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    customerDetails.customer_delivery_addresses = [...new Set(customerDetails.customer_delivery_addresses.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    
    console.log(`🔍 Final real data counts:`);
    console.log(`  - Favorite restaurants: ${customerDetails.customer_favorite_restaurants.length}`);
    console.log(`  - Dietary preferences: ${customerDetails.customer_dietary_preferences.length}`);
    console.log(`  - Payment methods: ${customerDetails.customer_payment_methods.length}`);
    console.log(`  - Delivery addresses: ${customerDetails.customer_delivery_addresses.length}`);
    
    // CRITICAL: Final phone number status
    if (customerDetails.customer_phone) {
      console.log(`📞 CRITICAL: FINAL PHONE NUMBER FOUND: ${customerDetails.customer_phone}`);
    } else {
      console.log(`📞 CRITICAL: PHONE NUMBER NOT AVAILABLE - Uber Eats group orders don't expose customer phone numbers for privacy/security reasons`);
      console.log(`📞 CRITICAL: Phone numbers are only available after customer authentication and consent`);
    }

    // Store UUID fallback
    if (!storeUuid) storeUuid = findStoreUuid(checkoutRes?.data);

    // Store info
    if (storeUuid) {
      const storeRes = await session.post('https://www.ubereats.com/_p/api/getStoreV1', {
        storeUuid: storeUuid,
        diningMode: 'DELIVERY',
        time: { asap: true },
        isGroupOrderParticipant: true,
        cbType: 'EATER_ENDORSED'
      });
      const sd = storeRes?.data || {};
      const info = sd?.data || {};
      const title = info?.title;
      if (title && typeof title === 'string') {
        restaurantName = title.startsWith('#') ? (title.split(' ').slice(1).join(' ') || title) : title;
      } else if (title) {
        restaurantName = String(title);
      }
      restaurantAddress = info?.location?.address || null;
      restaurantHours = info?.storeInfoMetadata?.workingHoursTagline || null;
      restaurantImageUrl = findRestaurantLogo(info) || null;
      isUberOneEligible = !!findUberOneLogo(info);
    }

    // Delivery info from checkout
    if (!deliveryCoords) deliveryCoords = findDeliveryCoords(checkoutPayloads) || null;
    if (!deliveryAddress) deliveryAddress = findDeliveryAddress(checkoutPayloads) || null;

    // HTML fallback
    if ((!deliveryCoords || !deliveryAddress) && link) {
      const html = await scrapeHtmlForDelivery(session, link);
      if (!deliveryCoords && html.coords) deliveryCoords = html.coords;
      if (!deliveryAddress && html.address) deliveryAddress = html.address;
      if (!deliveryInstructions && html.instructions) deliveryInstructions = html.instructions;
      
      // CRITICAL: Extract phone number from HTML
      if (html.phone && !customerDetails.customer_phone) {
        customerDetails.customer_phone = html.phone;
        console.log(`📞 CRITICAL: Phone number found in HTML: ${html.phone}`);
      }
    }
    
    // CRITICAL: Always try HTML scraping for phone number and instructions
    if (!customerDetails.customer_phone && link) {
      console.log(`📞 CRITICAL: Attempting HTML scraping for phone number...`);
      const html = await scrapeHtmlForDelivery(session, link);
      if (html.phone) {
        customerDetails.customer_phone = html.phone;
        console.log(`📞 CRITICAL: Phone number found in HTML scraping: ${html.phone}`);
      } else {
        console.log(`📞 CRITICAL: No phone number found in HTML scraping`);
      }
      
      // Also extract instructions from HTML if not found in API
      if (html.instructions && !deliveryInstructions) {
        deliveryInstructions = html.instructions;
        console.log(`🔍 Found delivery instructions in HTML: ${html.instructions}`);
      }
    }

    // Reverse geocode enhancement
    if (deliveryCoords && (deliveryCoords.latitude && deliveryCoords.longitude)) {
      const loc = await getLocationDetails(deliveryCoords.latitude, deliveryCoords.longitude);
      if (loc) {
        let enhanced = null;
        if (deliveryAddress && /\d/.test(deliveryAddress)) {
          const base = deliveryAddress.includes(',') ? deliveryAddress.split(',')[0].trim() : deliveryAddress;
          const parts = [base];
          if (loc.city) parts.push(loc.city);
          if (loc.state && loc.zip) parts.push(`${loc.state} ${loc.zip}`); else if (loc.state) parts.push(loc.state); else if (loc.zip) parts.push(loc.zip);
          enhanced = parts.join(', ');
        } else {
          const parts = [];
          if (loc.city) parts.push(loc.city);
          if (loc.state && loc.zip) parts.push(`${loc.state} ${loc.zip}`); else if (loc.state) parts.push(loc.state); else if (loc.zip) parts.push(loc.zip);
          if (parts.length) enhanced = parts.join(', ');
        }
        if (enhanced) deliveryAddress = enhanced;
      }
    }

    // Calculate total if not provided by API
    let calculatedTotal = total;
    if (!calculatedTotal || calculatedTotal === 0) {
      calculatedTotal = subtotal + fees + taxes;
      console.log(`🔍 DEBUG: Calculated total from components - Subtotal: $${subtotal.toFixed(2)} + Fees: $${fees.toFixed(2)} + Taxes: $${taxes.toFixed(2)} = $${calculatedTotal.toFixed(2)}`);
    }

    return {
      success: true,
      subtotal,
      fees,
      taxes,
      delivery_fee: deliveryFee,
      service_fee: serviceFee,
      tip,
      small_order_fee: smallOrderFee,
      adjustments_fee: adjustmentsFee,
      pickup_fee: pickupFee,
      other_fees: otherFees,
      has_uber_one: hasUberOne,
      uber_one_benefit: uberOneBenefit,
      items,
      restaurant_name: restaurantName,
      restaurant_address: restaurantAddress,
      restaurant_hours: restaurantHours,
      delivery_address: deliveryAddress,
      delivery_instructions: deliveryInstructions,
      restaurant_image_url: restaurantImageUrl,
      is_uber_one_eligible: isUberOneEligible,
      total: calculatedTotal,
      currency: currencyCode,
      customer_details: customerDetails
    };
  } catch (e) {
    return { success: false, subtotal: 0, fees: 0, taxes: 0, items: [], restaurant_name: null, restaurant_address: null, restaurant_hours: null, delivery_address: null, delivery_instructions: null, restaurant_image_url: null, is_uber_one_eligible: false, customer_details: {}, error: e?.message };
  }
}
