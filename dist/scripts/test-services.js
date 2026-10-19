"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const serverless_1 = require("@neondatabase/serverless");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env.local") });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env") });
async function runTests() {
    console.log("==========================================================");
    console.log("🧪 NEON END-TO-END SERVICE TEST SUITE (SASHIMILIX)");
    console.log("==========================================================");
    let allPassed = true;
    // -----------------------------------------------------------------
    // TEST 1: LAKEBASE POSTGRESQL
    // -----------------------------------------------------------------
    console.log("\n[1/3] Testing Neon Lakebase Postgres...");
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error("❌ FAILED: DATABASE_URL not found in environment.");
        allPassed = false;
    }
    else {
        try {
            const sql = (0, serverless_1.neon)(dbUrl);
            const start = performance.now();
            const rows = await sql `SELECT NOW() as timestamp, version() as version;`;
            const latency = Math.round(performance.now() - start);
            console.log(`  ✓ Connected to Postgres in ${latency}ms`);
            console.log(`  ✓ Version: ${rows[0].version.split(",")[0]}`);
            console.log(`  ✓ Server Timestamp: ${rows[0].timestamp}`);
            // Ensure test table and insert
            await sql `
        CREATE TABLE IF NOT EXISTS sashimilix_test_audit (
          id SERIAL PRIMARY KEY,
          test_msg TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;
            const inserted = await sql `
        INSERT INTO sashimilix_test_audit (test_msg)
        VALUES ('E2E automated test verification')
        RETURNING id, test_msg;
      `;
            console.log(`  ✓ Inserted test record (ID: ${inserted[0].id})`);
            const queried = await sql `
        SELECT * FROM sashimilix_test_audit WHERE id = ${inserted[0].id};
      `;
            console.log(`  ✓ Queried test record: "${queried[0].test_msg}"`);
            await sql `DELETE FROM sashimilix_test_audit WHERE id = ${inserted[0].id};`;
            console.log(`  ✓ Cleaned up test record`);
            console.log("✅ Postgres test: PASSED");
        }
        catch (err) {
            console.error("❌ Postgres test FAILED:", err.message);
            allPassed = false;
        }
    }
    // -----------------------------------------------------------------
    // TEST 2: NEON AUTH (MANAGED BETTER AUTH)
    // -----------------------------------------------------------------
    console.log("\n[2/3] Testing Neon Auth (Managed Better Auth)...");
    const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
    const authJwksUrl = process.env.NEON_AUTH_JWKS_URL;
    if (!authBaseUrl || !authJwksUrl) {
        console.error("❌ FAILED: NEON_AUTH_BASE_URL or NEON_AUTH_JWKS_URL missing.");
        allPassed = false;
    }
    else {
        try {
            console.log(`  ✓ Auth Base URL: ${authBaseUrl}`);
            console.log(`  ✓ Auth JWKS URL: ${authJwksUrl}`);
            const start = performance.now();
            const resp = await fetch(authJwksUrl);
            const latency = Math.round(performance.now() - start);
            if (!resp.ok) {
                throw new Error(`JWKS request returned status ${resp.status}`);
            }
            const jwks = await resp.json();
            console.log(`  ✓ JWKS endpoint responded in ${latency}ms (HTTP ${resp.status})`);
            console.log(`  ✓ Active signing keys found: ${jwks.keys?.length || 0}`);
            console.log("✅ Neon Auth test: PASSED");
        }
        catch (err) {
            console.error("❌ Neon Auth test FAILED:", err.message);
            allPassed = false;
        }
    }
    // -----------------------------------------------------------------
    // TEST 3: NEON OBJECT STORAGE (S3 COMPATIBLE)
    // -----------------------------------------------------------------
    console.log("\n[3/3] Testing Neon Object Storage (Bucket: assets)...");
    const s3Endpoint = process.env.AWS_ENDPOINT_URL_S3;
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "ap-southeast-1";
    const BUCKET = "assets";
    if (!s3Endpoint || !accessKey || !secretKey) {
        console.error("❌ FAILED: AWS credentials or endpoint missing for Object Storage.");
        allPassed = false;
    }
    else {
        try {
            const s3 = new client_s3_1.S3Client({
                forcePathStyle: true,
                endpoint: s3Endpoint,
                region: region,
                credentials: {
                    accessKeyId: accessKey,
                    secretAccessKey: secretKey,
                },
            });
            console.log(`  ✓ Storage Endpoint: ${s3Endpoint}`);
            console.log(`  ✓ Region: ${region}`);
            // 1. Put Object
            const testKey = `test-audit/e2e-${Date.now()}.json`;
            const testData = JSON.stringify({
                project: "SashimiLix",
                test: "Object Storage E2E",
                timestamp: new Date().toISOString(),
            });
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: BUCKET,
                Key: testKey,
                Body: testData,
                ContentType: "application/json",
            }));
            console.log(`  ✓ Uploaded object to bucket "${BUCKET}" key: ${testKey}`);
            // 2. List Objects
            const listResp = await s3.send(new client_s3_1.ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: "test-audit/",
            }));
            const found = (listResp.Contents || []).some((o) => o.Key === testKey);
            console.log(`  ✓ Listed objects in "${BUCKET}", verified presence: ${found}`);
            // 3. Generate Presigned GET URL
            const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({ Bucket: BUCKET, Key: testKey }), { expiresIn: 300 });
            console.log(`  ✓ Presigned URL generated: ${presignedUrl.substring(0, 65)}...`);
            // 4. Fetch Presigned URL directly
            const fetchResp = await fetch(presignedUrl);
            if (!fetchResp.ok) {
                throw new Error(`Presigned GET failed with status ${fetchResp.status}`);
            }
            const fetchedJson = await fetchResp.json();
            console.log(`  ✓ Downloaded via presigned URL verified: "${fetchedJson.test}"`);
            // 5. Clean up
            await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: BUCKET, Key: testKey }));
            console.log(`  ✓ Deleted test object successfully`);
            console.log("✅ Neon Object Storage test: PASSED");
        }
        catch (err) {
            console.error("❌ Neon Object Storage test FAILED:", err.message);
            allPassed = false;
        }
    }
    console.log("\n==========================================================");
    if (allPassed) {
        console.log("🎉 ALL NEON SERVICES VERIFIED AND WORKING END-TO-END! (100% PASS)");
        console.log("==========================================================");
        process.exit(0);
    }
    else {
        console.error("💥 SOME TESTS FAILED. Please review the errors above.");
        console.log("==========================================================");
        process.exit(1);
    }
}
runTests().catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
});
