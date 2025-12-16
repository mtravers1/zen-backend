
const sanitize = (obj) => {
    if (obj === null || typeof obj !== 'object') {
        return;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (typeof value === 'string' && value === '[object Object]') {
                throw new Error(`Invalid value for key "${key}". Please check the data you are sending.`);
            }
            sanitize(value);
        }
    }
};

const sanitizeRequestBody = (req, res, next) => {
    try {
        sanitize(req.body);
        next();
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export default sanitizeRequestBody;
