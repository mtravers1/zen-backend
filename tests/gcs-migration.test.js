
  import { jest } from '@jest/globals';

  import { MongoMemoryServer } from 'mongodb-memory-server';

  

  const mockSave = jest.fn();

  const mockLegacyFile = {

    save: mockSave,

    download: async () => [Buffer.from('legacy-dek')],

    exists: async () => [true],

    copy: jest.fn(),

  };

  const mockNewFile = {

    save: mockSave,

    download: async () => [Buffer.from('new-dek')],

    exists: async () => [false], // Simulate new file not existing initially

  };

  

  const mockLegacyBucket = {

    name: 'legacy-bucket',

    file: jest.fn().mockReturnValue(mockLegacyFile),

    getFiles: jest.fn(),

    exists: async () => [true],

  };

  

  const mockNewBucket = {

    name: 'new-bucket',

    file: jest.fn().mockReturnValue(mockNewFile),

    getFiles: jest.fn(),

    exists: async () => [true],

  };

  


  let mongoServer;

  

  beforeAll(async () => {

    mongoServer = await MongoMemoryServer.create();

  });

  

  afterAll(async () => {

    await mongoServer.stop();

  });

  

  describe('GCS Bucket Migration', () => {
    
    let mongoose;

    let User;

    
    beforeEach(async () => {
        
      // 1. Disconnect/clear old connections if they exist
        
        if (mongoose) {
          
          await mongoose.connection.db.dropDatabase();
          
          await mongoose.disconnect();
        
        }

        
        // 2. Clear mocks and RESET MODULES
        
        jest.clearAllMocks();
        
        jest.resetModules();

        
        // 3. FORCE Jest to ignore any __mocks__ folder or global mocks
        
        jest.unmock('@google-cloud/storage');
        
        jest.unmock('@google-cloud/kms');

        
        // 4. SET UP GLOBAL MOCKS **BEFORE** ANY IMPORTS
        
        // These mocks are now in place *before* User.js or encryption.js are imported
        
        jest.unstable_mockModule('@google-cloud/storage', () => ({
          
          Storage: jest.fn(() => ({
            
            bucket: jest.fn((bucketName) => {
              
              if (bucketName === 'legacy-bucket') {
                
                return mockLegacyBucket;
              
              }
              
              return mockNewBucket;
            
            }),
          
          })),
        
        }));

        
        jest.unstable_mockModule('@google-cloud/kms', () => ({
          
          KeyManagementServiceClient: jest.fn(() => ({
            
            decrypt: async ({ ciphertext }) => [{ plaintext: ciphertext }],
            
            cryptoKeyPath: () => 'dummy-path',
          
          })),
        
        }));

        
        // 5. NOW, import modules. User.js can safely import encryption.js
        
        // and encryption.js will pick up the mocks above.
        
        mongoose = (await import('mongoose')).default;
        
        User = (await import('../database/models/User.js')).default;
    
        
        const mongoUri = mongoServer.getUri();
        
        await mongoose.connect(mongoUri);

        
        // 6. Set up environment variables
        
        process.env.GCS_BUCKET_NAME = 'new-bucket';
        
        process.env.LEGACY_GCS_BUCKET_NAME = 'legacy-bucket';
        
        process.env.STORAGE_SERVICE_ACCOUNT = 'test-account';
        
        process.env.GCP_PROJECT_ID = 'test-project';
        
        process.env.KMS_SERVICE_ACCOUNT = 'test-kms-account';
        
        process.env.GCP_KEY_LOCATION = 'test-location';
        
        process.env.GCP_KEY_RING = 'test-ring';
        
        process.env.GCP_KEY_NAME = 'test-key';
      
      });

      afterEach(async () => {
        // Disconnect after each test
        if (mongoose) {
          await mongoose.disconnect();
        }
      });
  

    it('should migrate a DEK from the legacy bucket to the new bucket', async () => {
    // 1. Create the user and get the dynamic key
    // This 'User' variable is the one we imported in beforeEach
    const user = await User.create({
      authUid: 'test-uid',
      emailHash: 'test-email-hash',
      role: 'individual',
      name: {
        firstName: 'John',
        lastName: 'Doe',
      },
      email: [{
        email: 'test@example.com',
        emailType: 'personal'
      }],
    });

    const bucketKey = user._id.toString();

    // 2. Set up the mocks *BEFORE* importing the module
    mockLegacyBucket.getFiles.mockImplementation(({ prefix }) => {
      if (prefix === `keys/${bucketKey}`) {
        // This returns your REAL mock object, which includes .copy
        return Promise.resolve([[mockLegacyFile]]);
      }
      return Promise.resolve([[]]);
    });
    mockNewBucket.getFiles.mockResolvedValue([[]]); // Tell new bucket to be empty

    // 3. NOW, import the module. It will pick up the mocks you just set.
    const { getUserDek } = await import('../database/encryption.js');

    // 4. Call getUserDek, which should trigger the migration
    const deks = await getUserDek('test-uid');

    // 5. Verify the migration happened
    // Check that the legacy bucket was checked for files
    expect(mockLegacyBucket.getFiles).toHaveBeenCalledWith({ prefix: `keys/${bucketKey}` });

    // Check that the new bucket was checked for files
    expect(mockNewBucket.getFiles).toHaveBeenCalledWith({ prefix: `keys/${bucketKey}` });

    // Check that the DEK was copied to the new bucket
    expect(mockLegacyFile.copy).toHaveBeenCalled();

    // 6. Verify the correct DEK is returned
    expect(deks.length).toBe(1);
    expect(deks[0].toString()).toBe('legacy-dek');
  });

  });
