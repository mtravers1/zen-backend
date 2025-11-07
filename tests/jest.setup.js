import { jest } from "@jest/globals";
import dotenv from 'dotenv';
dotenv.config({ path: './.env.test' });

console.log('Executing tests/jest.setup.js');

jest.mock('../database/encryption.js', () => ({
  __esModule: true,
  ...jest.requireActual('../database/encryption.js'), // Import and retain default behavior
  getUserDek: jest.fn(() => ([Buffer.from('fake-dek-32bytes-long-0123456789')])), // Return a consistent fake DEK
  getUserDekForSignup: jest.fn(() => ([Buffer.from('fake-dek-32bytes-long-0123456789')])), // Return a consistent fake DEK
  encryptValue: jest.fn((value) => `encrypted_${JSON.stringify(value)}`), // Simple prefix for testing
  decryptValue: jest.fn((value) => {
    if (typeof value === 'string' && value.startsWith('encrypted_')) {
      return JSON.parse(value.substring(10));
    }
    return value; // Return as is if not "encrypted"
  }),
  hashEmail: jest.fn((email) => `hashed_${email}`), // Simple prefix for testing
  hashValue: jest.fn((value) => `hashed_${value}`), // Simple prefix for testing
  // Mock getBucket to prevent actual GCS calls
  getBucket: jest.fn(() => ({
    name: 'test-bucket',
    file: jest.fn(() => ({
      save: jest.fn(),
      download: jest.fn(() => ([Buffer.from('fake-encrypted-dek')])),
      move: jest.fn(),
    })),
    exists: jest.fn(() => ([true])),
    getFiles: jest.fn(() => ([[]])),
  })),
}));

// Mock the @google-cloud/kms and @google-cloud/storage to prevent actual calls
jest.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: jest.fn(() => ({
    encrypt: jest.fn(() => ([{ ciphertext: Buffer.from('fake-encrypted-dek') }])),
    decrypt: jest.fn(() => ([{ plaintext: Buffer.from('fake-dek-32bytes-long-0123456789') }])),
    cryptoKeyPath: jest.fn((projectId, location, keyRing, keyName) => 
      `projects/${projectId}/locations/${location}/keyRings/${keyRing}/cryptoKeys/${keyName}`
    ),
  })),
}));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      exists: jest.fn(() => ([true])),
      file: jest.fn(() => ({
        save: jest.fn(),
        download: jest.fn(() => ([Buffer.from('fake-encrypted-dek')])),
        move: jest.fn(),
      })),
      getFiles: jest.fn(() => ([[]])), // Return empty array for files
    })),
  })),
}));