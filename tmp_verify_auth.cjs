const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const config = require('./firebase-applet-config.json');

(async () => {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, 'kilo.client.1778189933207@example.com', 'TestPass123!');
  const token = await cred.user.getIdToken();
  const res = await fetch('https://arc-1-orpin.vercel.app/api/auth/check-admin', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'client', displayName: 'Kilo Client Verify', profileData: { projectType: 'Residential' } }),
  });
  console.log(res.status, await res.text());
})().catch(error => {
  console.error(error);
  process.exit(1);
});
