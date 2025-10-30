import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

let envPath;
if (process.env.NODE_ENV === 'production') {
  envPath = path.resolve(__dirname, '../.env/.env.prod');
} else if (process.env.NODE_ENV === 'staging') {
  envPath = path.resolve(__dirname, '../.env/.env.staging');
} else if (process.env.NODE_ENV === 'development') {
  envPath = path.resolve(__dirname, '../.env/.env.development');
} else {
  envPath = path.resolve(__dirname, '../.env/.env.local');
}

console.log(`Attempting to load env file from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file', result.error);
}

console.log('Loaded .env file:', envPath);
console.log('FIREBASE_SERVICE_ACCOUNT_PATH:', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
