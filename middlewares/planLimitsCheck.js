import User from '../database/models/User.js';
import Business from '../database/models/Businesses.js';
import permissions from '../config/permissions.js';

export const checkPlanLimit = (resource) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(401).json({ error: "unauthorized", message: "User not found." });
      }

      const plan = user.account_type || 'Free';
      const planLimits = permissions[plan];

      if (!planLimits) {
        return res.status(403).json({ error: "forbidden", message: "Invalid plan configuration." });
      }

      const limit = planLimits[resource];

      if (limit === undefined || limit === null) {
        return res.status(403).json({ error: "forbidden", message: `Resource limit for '${resource}' is not defined for your plan.` });
      }

      // -1 means unlimited
      if (limit === -1) {
        return next();
      }

      let currentCount = 0;
      if (resource === 'businesses_max') {
        currentCount = await Business.countDocuments({ userId: req.user.userId });
      }
      // Add other resource counts here as needed in the future

      if (currentCount >= limit) {
        return res.status(403).json({
          error: 'limit_exceeded',
          message: `You have reached your limit for this resource. Please upgrade your plan to add more.`,
          limits: {
            [resource]: {
              limit: limit,
              current: currentCount
            }
          }
        });
      }

      next();
    } catch (error) {
      console.error(`Error in checkPlanLimit middleware for resource: ${resource}` , error);
      res.status(500).json({ error: 'server_error', message: 'An internal server error occurred.' });
    }
  };
};