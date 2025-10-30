const environmentCheck = (allowedEnvs) => (req, res, next) => {
  const currentEnv = process.env.ENVIRONMENT || 'development';
  if (allowedEnvs.includes(currentEnv)) {
    next();
  } else {
    res.status(403).json({ message: 'This endpoint is not available in the current environment.' });
  }
};

export default environmentCheck;
