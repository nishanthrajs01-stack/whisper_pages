import assert from 'assert';
import { spawn } from 'child_process';
import { initDb, dbQuery } from './database.js';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
let serverProcess;

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for making API requests in tests
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch (e) {
    // Non-JSON response
  }
  return { status: res.status, json, text };
}

// Start Server on test port
function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: PORT, JWT_SECRET: 'test-jwt-secret' },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Server stdout] ${output.trim()}`);
      if (output.includes('Whisper Pages Server started')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server stderr] ${data.toString()}`);
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });
  });
}

// Clean up DB records created by tests
async function cleanTestDb() {
  await dbQuery.run("DELETE FROM accounts WHERE id LIKE 'test_%' OR pen_name LIKE 'test_%'");
  await dbQuery.run("DELETE FROM posts WHERE id LIKE 'test_%'");
  await dbQuery.run("DELETE FROM comments WHERE id LIKE 'test_%'");
  await dbQuery.run("DELETE FROM wall_posts WHERE id LIKE 'test_%'");
  await dbQuery.run("DELETE FROM reports WHERE id LIKE 'test_%'");
}

async function runTests() {
  console.log('--- Starting Automated Test Verification Suite ---');
  await startServer();
  await cleanTestDb();

  let testPassed = 0;
  let testFailed = 0;

  const runTest = async (name, fn) => {
    try {
      console.log(`\nRUNNING TEST: ${name}`);
      await fn();
      console.log(`✅ PASSED: ${name}`);
      testPassed++;
    } catch (err) {
      console.error(`❌ FAILED: ${name}`);
      console.error(err);
      testFailed++;
    }
  };

  // Test 1: Password Gating Policy
  await runTest('Password Gating Validation (FR-2.1, FR-2.3)', async () => {
    // Too short
    let res = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_user1', password: 'Short1!', age_bracket: '18_25' })
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.json.error, /Password must be/);

    // No symbol
    res = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_user1', password: 'NoSymbolPassword123', age_bracket: '18_25' })
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.json.error, /Password must be/);

    // Blocklisted password
    res = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_user1', password: 'password123!', age_bracket: '18_25' })
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.json.error, /Password is too common/);
  });

  // Test 2: Username Uniqueness
  await runTest('Username Case-Insensitive Uniqueness (FR-1.2)', async () => {
    // First signup - success
    let res1 = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'TestUniqueUser', password: 'ValidPassword123!', age_bracket: '18_25' })
    });
    assert.strictEqual(res1.status, 201);

    // Second signup with same username lowercased - should fail
    let res2 = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuniqueuser', password: 'ValidPassword123!', age_bracket: '18_25' })
    });
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(res2.json.error, 'Pen name already taken.');
  });

  // Test 3: Age Rating Restrictions (FR-5.3)
  await runTest('Age Certification Gate Enforced Server-Side (FR-5.3)', async () => {
    // 1. Create a minor account
    let minorRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_minor', password: 'ValidPassword123!', age_bracket: 'under_18' })
    });
    const minorToken = minorRes.json.token;

    // 2. Create an adult account
    let adultRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_adult', password: 'ValidPassword123!', age_bracket: '18_25' })
    });
    const adultToken = adultRes.json.token;

    // 3. Publish an 18+ post as adult
    let postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adultToken}` },
      body: JSON.stringify({ content: 'Explicit 18+ secret writing.', content_rating: '18+', tags: 'adult' })
    });
    const postJson = await postRes.json();
    const postId = postJson.id;

    // 4. Request this post with minor token -> should be 403 Forbidden
    let minorPostRequest = await request(`/api/posts/${postId}`, {
      headers: { 'Authorization': `Bearer ${minorToken}` }
    });
    assert.strictEqual(minorPostRequest.status, 403);
    assert.strictEqual(minorPostRequest.json.error, 'Access denied: Content is restricted to 18+ viewers.');

    // 5. Request this post as logged out -> should be 403
    let guestPostRequest = await request(`/api/posts/${postId}`);
    assert.strictEqual(guestPostRequest.status, 403);

    // 6. Request this post with adult token -> should succeed (200)
    let adultPostRequest = await request(`/api/posts/${postId}`, {
      headers: { 'Authorization': `Bearer ${adultToken}` }
    });
    assert.strictEqual(adultPostRequest.status, 200);
  });

  // Test 4: Silent Blocking
  await runTest('Silent Blocking of Likes and Comments (FR-7.1 - 7.3)', async () => {
    // Setup users A and B
    let userARes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_blocker', password: 'ValidPassword123!', age_bracket: '26_35' })
    });
    const tokenA = userARes.json.token;
    const authorA = userARes.json.user.id;

    let userBRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_blocked', password: 'ValidPassword123!', age_bracket: '26_35' })
    });
    const tokenB = userBRes.json.token;
    const userBName = userBRes.json.user.pen_name;

    // A publishes a post
    let postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ content: 'Post that B wants to comment on.', content_rating: 'general' })
    });
    const postJson = await postRes.json();
    const postId = postJson.id;

    // A blocks B
    await fetch(`${BASE_URL}/api/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ blocked_pen_name: userBName })
    });

    // B likes A's post -> server returns 200 silent success
    let likeRes = await fetch(`${BASE_URL}/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` }
    });
    assert.strictEqual(likeRes.status, 200);

    // Verify in database: B's like is NOT saved
    const dbLikes = await dbQuery.all('SELECT * FROM likes WHERE post_id = ?', [postId]);
    assert.strictEqual(dbLikes.length, 0);

    // B comments on A's post -> server returns 201 silent success
    let commentRes = await fetch(`${BASE_URL}/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ content: 'Abusive comment' })
    });
    assert.strictEqual(commentRes.status, 201);

    // Verify in database: B's comment is NOT saved
    const dbComments = await dbQuery.all('SELECT * FROM comments WHERE post_id = ?', [postId]);
    assert.strictEqual(dbComments.length, 0);
  });

  // Test 5: Auto-hide thresholds
  await runTest('Content Auto-Hiding on Threshold Limit (FR-9.2)', async () => {
    // 1. Create a post
    let authorRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_author_mod', password: 'ValidPassword123!', age_bracket: '26_35' })
    });
    const authorToken = authorRes.json.token;

    let postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({ content: 'Post to be flag reported.', content_rating: 'general' })
    });
    const postId = (await postRes.json()).id;

    // Verify initially published
    let postState = await dbQuery.get('SELECT status FROM posts WHERE id = ?', [postId]);
    assert.strictEqual(postState.status, 'published');

    // Report it 5 times from 5 different accounts
    for (let i = 1; i <= 5; i++) {
      let reporterRes = await request('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username: `test_reporter_${i}`, password: 'ValidPassword123!', age_bracket: '26_35' })
      });
      const repToken = reporterRes.json.token;

      await fetch(`${BASE_URL}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${repToken}` },
        body: JSON.stringify({ target_type: 'post', target_id: postId, reason: 'spam' })
      });
    }

    // Verify immediately auto-hidden in DB
    postState = await dbQuery.get('SELECT status FROM posts WHERE id = ?', [postId]);
    assert.strictEqual(postState.status, 'hidden');
  });

  // Test 6: Inactivity 300-Day cascading deletion
  await runTest('Inactivity Hard-Delete Cascading (FR-10.2)', async () => {
    // 1. Signup test user
    let userRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_inactive_user', password: 'ValidPassword123!', age_bracket: '26_35' })
    });
    const token = userRes.json.token;
    const userId = userRes.json.user.id;

    // 2. Publish a post as this user
    let postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content: 'Inactive user post.', content_rating: 'general' })
    });
    const postId = (await postRes.json()).id;

    // 3. Log in as admin
    let adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'adminpassword' })
    });
    const adminToken = adminLogin.json.token;

    // 4. Simulate inactivity of 301 days
    let simRes = await fetch(`${BASE_URL}/api/admin/simulate-inactivity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pen_name: 'test_inactive_user', age_days: 301 })
    });
    const simJson = await simRes.json();
    assert.strictEqual(simJson.success, true);
    assert.ok(simJson.deleted.includes('test_inactive_user'));

    // 5. Verify user and cascading posts are deleted from DB
    const accountRow = await dbQuery.get('SELECT * FROM accounts WHERE id = ?', [userId]);
    assert.strictEqual(accountRow, undefined);

    const postRow = await dbQuery.get('SELECT * FROM posts WHERE id = ?', [postId]);
    assert.strictEqual(postRow, undefined);
  });

  // Shut down server
  console.log('\n--- Test Suite Execution Complete ---');
  console.log(`Passed: ${testPassed} | Failed: ${testFailed}`);
  
  // Clean up
  await cleanTestDb();
  serverProcess.kill();

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner failure:', err);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
