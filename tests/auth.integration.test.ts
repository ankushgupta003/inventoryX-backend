import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('auth integration', () => {
  let createApp: typeof import('../src/app').createApp;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const module = await import('../src/app');
    createApp = module.createApp;
  });

  it('responds on health', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });
});
