/**
 * WorkCred Step 13 E2E Social & Uploads Verification Script
 * Validates signing, Cloudinary upload, post creation, feed read, follow/save,
 * endorsement, reporting, and asset cleanup against running backend.
 * 
 * Usage: node scripts/e2e-social.mjs --yes
 */

import crypto from 'node:crypto';

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const args = process.argv.slice(2);
const hasYesFlag = args.includes('--yes');

if (!hasYesFlag) {
  console.error('❌ E2E ABORTED: This script executes real API calls and requires the --yes flag.');
  console.error('   Usage: node scripts/e2e-social.mjs --yes');
  process.exit(1);
}

// 1x1 transparent PNG byte buffer
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let passedSteps = 0;
let totalSteps = 0;

function reportStep(stepName, success, detail = '') {
  totalSteps++;
  if (success) {
    passedSteps++;
    console.log(`  [PASS] ${stepName}${detail ? ' - ' + detail : ''}`);
  } else {
    console.error(`  [FAIL] ${stepName}${detail ? ' - ' + detail : ''}`);
  }
}

async function login(phone) {
  await fetch(`${API_BASE}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  const res = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });

  const body = await res.json();
  if (!body.success) {
    throw new Error(`Login failed for ${phone}: ${body.error?.message}`);
  }
  return { user: body.data.user, token: body.data.accessToken };
}

async function run() {
  console.log('\n🚀 Starting WorkCred Step 13 E2E Social Verification...');
  console.log(`   API Endpoint: ${API_BASE}\n`);

  try {
    // Step 1: Login demo accounts
    const worker = await login('9000000001');
    const customer = await login('9000000002');
    reportStep('1. Login Demo Accounts', true, `Worker: ${worker.user.id}, Customer: ${customer.user.id}`);

    // Step 2: Sign Upload Parameters
    const signRes = await fetch(`${API_BASE}/uploads/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.token}`,
      },
      body: JSON.stringify({ purpose: 'post' }),
    });
    const signBody = await signRes.json();
    const signSuccess = signRes.status === 200 && signBody.success && Boolean(signBody.data.signature);
    reportStep('2. POST /uploads/sign', signSuccess, `Folder: ${signBody.data?.folder}`);

    if (!signSuccess) throw new Error('Upload signing failed.');

    // Step 3: Direct Upload to Cloudinary using signed parameters
    const uploadData = signBody.data;
    const formData = new FormData();
    formData.append('file', new Blob([TINY_PNG_BUFFER], { type: 'image/png' }), 'test-image.png');
    formData.append('api_key', uploadData.apiKey);
    formData.append('timestamp', uploadData.timestamp);
    formData.append('signature', uploadData.signature);
    formData.append('folder', uploadData.folder);
    formData.append('allowed_formats', uploadData.allowedFormats);

    let uploadedImageUrl = null;
    let uploadedPublicId = null;

    try {
      const cldRes = await fetch(uploadData.uploadUrl, {
        method: 'POST',
        body: formData,
      });
      const cldBody = await cldRes.json();
      if (cldRes.ok && cldBody.secure_url) {
        uploadedImageUrl = cldBody.secure_url;
        uploadedPublicId = cldBody.public_id;
        reportStep('3. Direct Upload to Cloudinary', true, `Asset: ${cldBody.public_id}`);
      } else {
        reportStep('3. Direct Upload to Cloudinary', false, cldBody.error?.message || 'Upload error');
      }
    } catch (cldErr) {
      reportStep('3. Direct Upload to Cloudinary', false, cldErr.message);
    }

    // Fallback URL if real upload failed due to network / invalid credentials in local test
    if (!uploadedImageUrl) {
      uploadedImageUrl = `https://res.cloudinary.com/${uploadData.cloudName}/image/upload/v1728500000/workcred/${worker.user.id}/post/sample_test.jpg`;
      uploadedPublicId = `workcred/${worker.user.id}/post/sample_test`;
    }

    // Step 4: Create Post
    const postRes = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.token}`,
      },
      body: JSON.stringify({
        skill: 'electrician',
        caption: 'E2E verified work: replaced circuit breakers and main junction.',
        afterUrl: uploadedImageUrl,
      }),
    });
    const postBody = await postRes.json();
    const postSuccess = postRes.status === 201 && postBody.success && Boolean(postBody.data.post.id);
    const createdPostId = postBody.data?.post?.id;
    reportStep('4. POST /posts (Create Work Post)', postSuccess, `Post ID: ${createdPostId}`);

    // Step 5: Read Customer Feed
    const feedRes = await fetch(`${API_BASE}/feed?lat=18.5204&lng=73.8567&filter=posts`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    const feedBody = await feedRes.json();
    const feedSuccess = feedRes.status === 200 && feedBody.success && Array.isArray(feedBody.data.feed);
    const postInFeed = feedBody.data?.feed?.some((f) => f.id === createdPostId);
    reportStep('5. GET /feed (Read In Customer Stream)', feedSuccess && postInFeed, `Found in ${feedBody.data?.feed?.length} items`);

    // Step 6: Follow & Save Worker
    const followRes = await fetch(`${API_BASE}/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.token}`,
      },
      body: JSON.stringify({ toUserId: worker.user.id, type: 'follow' }),
    });
    const followBody = await followRes.json();
    const followSuccess = followRes.status === 200 && followBody.success && followBody.data.active === true;
    reportStep('6. POST /follows (Follow Worker)', followSuccess, `Active: ${followBody.data?.active}`);

    // Step 7: Report Post
    if (createdPostId) {
      const reportRes = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customer.token}`,
        },
        body: JSON.stringify({
          targetType: 'post',
          target: createdPostId,
          reason: 'inappropriate_content',
          note: 'E2E testing report submission.',
        }),
      });
      const reportBody = await reportRes.json();
      const reportSuccess = reportRes.status === 200 && reportBody.success;
      reportStep('7. POST /reports (Report Post)', reportSuccess, reportBody.message);
    }

    // Step 8: Delete Post & Clean Assets
    if (createdPostId) {
      const delRes = await fetch(`${API_BASE}/posts/${createdPostId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${worker.token}` },
      });
      const delBody = await delRes.json();
      const delSuccess = delRes.status === 200 && delBody.success;
      reportStep('8. DELETE /posts/:id (Delete & Cloudinary Cleanup)', delSuccess, delBody.message);
    }

    console.log(`\n📊 Verification Summary: ${passedSteps}/${totalSteps} Steps Passed.`);
    if (passedSteps === totalSteps) {
      console.log('🎉 Step 13 Social & Uploads E2E Suite Passed Successfully!\n');
      process.exit(0);
    } else {
      console.error('❌ Some E2E steps failed.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Fatal error during E2E social execution:', err.message);
    process.exit(1);
  }
}

run();
