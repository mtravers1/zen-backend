
import request from 'supertest';
import app from '../app.js';
import mongoose from 'mongoose';
import User from '../database/models/User.js';

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/signup', () => {
    it('should create a new user and return 201', async () => {
      const newUser = {
        data: {
          email: `testuser_${Date.now()}@example.com`,
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        },
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(newUser);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('email', newUser.data.email);
      expect(res.body).toHaveProperty('name.firstName', newUser.data.firstName);
      expect(res.body).toHaveProperty('name.lastName', newUser.data.lastName);
    });
  });
});
