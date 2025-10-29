import dotenv from "dotenv";

console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

let envPath;
if (process.env.NODE_ENV === 'production') {
  envPath = './.env/.env.prod';
} else if (process.env.NODE_ENV === 'staging') {
  envPath = './.env/.env.staging';
} else if (process.env.NODE_ENV === 'development') {
  envPath = './.env/.env.development';
} else {
  envPath = './.env/.env.local';
}

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file', result.error);
}

console.log('Loaded .env file:', envPath);
console.log('FIREBASE_SERVICE_ACCOUNT_PATH:', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
