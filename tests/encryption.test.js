
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../database/models/User.js';
import Business from '../database/models/Businesses.js';
import authService from '../services/auth.service.js';
import businessService from '../services/businesses.service.js';
import { getUserDek, hashEmail } from '../database/encryption.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Data Encryption', () => {
  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    jest.clearAllMocks();
    await authService.signUp({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      authUid: 'test-uid',
    });
  });

  it('should encrypt user data on creation and decrypt on retrieval', async () => {
    const user = await User.findOne({ authUid: 'test-uid' });
    const dek = await getUserDek('test-uid');

    // Check that the data is encrypted in the database
    expect(user.name.firstName).not.toBe('John');
    expect(user.name.lastName).not.toBe('Doe');
    expect(user.email[0].email).not.toBe('test@example.com');

    const retrievedUser = await authService.signInWithUid('test-uid');

    // Check that the data is decrypted on retrieval
    expect(retrievedUser.name.firstName).toBe('John');
    expect(retrievedUser.name.lastName).toBe('Doe');
    expect(retrievedUser.email[0].email).toBe('test@example.com');
  });

  it('should encrypt business data on creation and decrypt on retrieval', async () => {
    const businessData = {
      name: 'Test Business',
      industry: 'Test Industry',
      businessLogo: 'test-logo',
      ownership: 50,
      accounts: 2,
      businessOwners: ['John Doe'],
    };

    const user = await User.findOne({ authUid: 'test-uid' });
    await businessService.addBusinesses([businessData], 'test@example.com', 'test-uid');

    const business = await Business.findOne({ userId: user._id });
    const dek = await getUserDek('test-uid');

    // Check that the data is encrypted in the database
    expect(business.name).not.toBe('Test Business');
    expect(business.industryDesc).not.toBe('Test Industry');
    expect(business.businessLogo).not.toBe('test-logo');

    const userProfiles = await businessService.getUserProfiles('test@example.com', 'test-uid');
    const retrievedBusiness = userProfiles.find(p => !p.isPersonal);

    // Check that the data is decrypted on retrieval
    expect(retrievedBusiness.name).toBe('Test Business');
    expect(retrievedBusiness.entityType).toBe('Test Industry');
    expect(retrievedBusiness.photo).toBe('test-logo');
  });
});
