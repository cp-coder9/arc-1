import dotenv from 'dotenv';

const mode = process.env.NODE_ENV || 'production';
dotenv.config({
  path: ['.env.' + mode + '.local', '.env.local', '.env.' + mode, '.env'],
});

const port = Number(process.env.PORT) || 3000;

try {
  const { default: app } = await import('./api/index.ts');
  const server = app.listen(port, '0.0.0.0', () => {
    console.log('Architex API server running on http://localhost:' + port);
    console.log('Environment: ' + (process.env.NODE_ENV || 'production'));
  });

  server.on('error', (error) => {
    console.error('Architex API server failed to start:', error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error('Architex API server failed to initialize:', error);
  process.exitCode = 1;
}
