import User from "../database/models/User.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

const validatePayment = async (platform, receipt, uid) => {
    const user = await User.findOne({ authUid: uid });
    try {
        let result;

        if (platform === 'ios') {
            result = await validateApple(receipt);
        } else if (platform === 'android') {
            result = await validateAndroid(receipt);
        } else {
            return { message: 'Invalid platform' };
        }

        if (result.status === 0) {
            await updateUserSubscription(user._id.toString(), result, platform);
            return { message: "Valid receipt" }
        } else {
            return { message: 'Invalid receipt' };
        }
    } catch (err) {
        console.error(err);
        return { message: 'Server error' };
    }
};

const updateUserSubscription = async (userId, data, platform) => {
    try {
        const productId = data.latest_receipt_info[0].product_id;
        const expiresDateMs = data.latest_receipt_info[0].expires_date_ms;
        
        console.log(`Updating user ${userId} to plan ${productId} valid until ${expiresDateMs}`);
        
        // Get environment from NODE_ENV or default to 'dev'
        const nodeEnv = process.env.NODE_ENV || 'dev';
        const environment = nodeEnv === 'development' ? 'dev' : nodeEnv;
        
        // Get plan name from product mappings
        const planMappings = PRODUCT_MAPPINGS[environment]?.[platform];
        if (!planMappings) {
            console.warn(`No product mappings found for environment: ${environment}, platform: ${platform}`);
        }
        
        let planName = planMappings?.[productId];
        if (!planName) {
            console.warn(`Unknown product ID: ${productId} for environment: ${environment}, platform: ${platform}. Using Free as fallback.`);
            planName = 'Free';
        }
        
        // Find and update user
        const user = await User.findById(userId);
        if (!user) {
            throw new Error(`User not found: ${userId}`);
        }
        
        // Update user subscription info
        user.account_type = planName;
        
        // Save user
        await user.save();
        
        console.log(`✅ Successfully updated user ${userId} to plan: ${planName}`);
        
        return {
            success: true,
            userId: userId,
            planName: planName
        };
        
    } catch (error) {
        console.error(`❌ Error updating user subscription:`, error);
        throw error;
    }
}

const validateApple = async (receipt) => {
    if (!receipt || typeof receipt !== 'string') {
        console.error('❌ Invalid receipt: not a string');
        return { valid: false };
    }

    const body = {
        'receipt-data': receipt,
        'password': 'd26cffb2aba74e87bc31fae2484cfd00',
        'exclude-old-transactions': true,
    };

    const response = await fetch(APPLE_SANDBOX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    try {
        const result = JSON.parse(text);
        console.log('🍏 Apple Receipt Validation Result:', result);
        return result;
    } catch (e) {
        console.error('❌ Could not parse Apple response:', text);
        return { valid: false, parseError: text };
    }
};


const validateAndroid = async (receipt) => {
    const { packageName, productId, purchaseToken } = receipt;
    const url = `https://play.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}:validate`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GOOGLE_PLAY_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(receipt),
    });

    if (!response.ok) {
        throw new Error('Failed to validate purchase');
    }

    return await response.json();
}

const updateUserUUID = async (uuid, uid) => {
    const user = await User.findOne({ authUid: uid });
    user.id_uuid = uuid;
    await user.save();
}


const paymentService = {
    validatePayment,
    updateUserUUID
};

export default paymentService;