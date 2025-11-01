
import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import mongoose from 'mongoose';
import User from '../database/models/User.js';
import fetch from 'node-fetch';

describe('Auth Endpoints', () => {
  beforeEach(async () => {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  });

  afterEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
  });

  describe('POST /api/auth/signup', () => {
    it('should create a new user and return 201 with legacy response format', async () => {
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

    it('should create a new user and return 201 with new response format', async () => {
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
        .set('X-API-Version', '2')
        .send(newUser);

      expect(res.statusCode).toEqual(201);
      expect(res.body.email[0].email).toEqual(newUser.data.email);
      expect(res.body).toHaveProperty('name.firstName', newUser.data.firstName);
      expect(res.body).toHaveProperty('name.lastName', newUser.data.lastName);
    });
  });

  describe('POST /api/auth/signin', () => {
    it('should sign in a user and return 200', async () => {
      const user = {
        email: `testuser_${Date.now()}@example.com`,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/signup')
        .send({ data: user });

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ localId: 'test-uid' }),
        })
      );

      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: user.email, password: user.password });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('email', user.email);

      fetchSpy.mockRestore();
    });

    it('should not sign in a user with incorrect password and return 401', async () => {
      const user = {
        email: `testuser_${Date.now()}@example.com`,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/signup')
        .send({ data: user });

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'INVALID_PASSWORD' } }),
        })
      );

      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: user.email, password: 'incorrectpassword' });

      expect(res.statusCode).toEqual(401);

      fetchSpy.mockRestore();
    });
  });
});
