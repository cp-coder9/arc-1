import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../../api/index';

describe('Vercel API CORS for static Architex domains', () => {
  it('allows test.architex.co.za to preflight auth API requests before auth handling', async () => {
    const response = await request(app)
      .options('/api/auth/check-admin')
      .set('Origin', 'https://test.architex.co.za')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://test.architex.co.za');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('keeps unauthenticated auth API responses as JSON instead of SPA HTML', async () => {
    const response = await request(app)
      .post('/api/auth/check-admin')
      .set('Origin', 'https://test.architex.co.za')
      .send({});

    expect(response.status).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe('https://test.architex.co.za');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.error).toBe('Missing authorization header');
  });
});
