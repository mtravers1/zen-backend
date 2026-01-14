import User from '../database/models/User.js';

export const requireActiveSubscription = async (req, res, next) => {
    try {
        // Assuming req.user.userId is available from a previous auth middleware
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(401).json({ error: "unauthorized", message: "User not found." });
        }

        // Define what constitutes an inactive subscription.
        // This could be a "Free" plan, or a specific expired state.
        const isInactive = user.account_type === 'Free' || 
                             (user.subscription_metadata && user.subscription_metadata.state === 'expired');

        if (isInactive) {
            return res.status(403).json({
                error: 'subscription_expired',
                message: 'Your subscription has expired. Please renew to perform this action.'
            });
        }

        // If subscription is active, proceed to the next middleware/handler.
        next();
    } catch (error) {
        console.error("Error in requireActiveSubscription middleware:", error);
        res.status(500).json({ error: 'server_error', message: 'An internal server error occurred.' });
    }
};