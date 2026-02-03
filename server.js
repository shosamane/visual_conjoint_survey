// Visual Conjoint Survey - Server
const express = require("express");
const compression = require("compression");
const path = require("path");
let MongoClient = null;
try { ({ MongoClient } = require('mongodb')); } catch (e) { /* mongodb optional until installed */ }

// ============================================
// Configuration
// ============================================
const app = express();
const base = "/webhook3";
const root = __dirname;
const port = 9089;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const mongoDbName = process.env.MONGODB_DB || 'immigrant_visual_conjoint';
const mongoCollSubmissions = 'submissions';
const mongoCollCodes = 'completion_codes';

let mongoClient = null;

// ============================================
// MongoDB Connection
// ============================================
async function getMongo() {
  if (!MongoClient) throw new Error('mongodb driver not installed. Run: npm install mongodb');
  if (mongoClient && mongoClient.topology?.isConnected()) return mongoClient;
  mongoClient = new MongoClient(mongoUri, { ignoreUndefined: true });
  await mongoClient.connect();
  console.log('[MongoDB] Connected to', mongoDbName);
  return mongoClient;
}

// ============================================
// Express Setup
// ============================================
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());
app.use(`${base}/api/`, express.json({ limit: "5mb" }));

// Static files under /webhook3
app.use(base, express.static(root, { extensions: ["html"] }));

// ============================================
// API: Store Conjoint Survey Data
// ============================================
app.post(`${base}/api/store-conjoint`, async (req, res) => {
  try {
    const payload = req.body || {};

    // Validate required fields
    if (!payload.sessionId) {
      return res.status(400).json({ error: 'missing_sessionId' });
    }

    const sessionId = payload.sessionId;
    const now = new Date().toISOString();

    // Set timestamps
    if (!payload.createdAt) payload.createdAt = now;
    payload.updatedAt = now;
    payload.serverReceivedAt = now;
    payload.remote = { ip: req.ip };

    const client = await getMongo();
    const db = client.db(mongoDbName);
    const coll = db.collection(mongoCollSubmissions);

    console.log(`[store-conjoint] Saving to ${mongoCollSubmissions}, sessionId: ${sessionId}, status: ${payload.progressStatus}`);

    // Extract createdAt to avoid conflict
    const { createdAt, ...updateFields } = payload;

    // Upsert document
    const result = await coll.updateOne(
      { sessionId: sessionId },
      {
        $set: updateFields,
        $setOnInsert: { createdAt: createdAt || now }
      },
      { upsert: true }
    );

    console.log(`[store-conjoint] Result - matched: ${result.matchedCount}, modified: ${result.modifiedCount}, upserted: ${result.upsertedCount}`);

    return res.json({
      ok: true,
      sessionId: sessionId,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount
    });
  } catch (err) {
    console.error('store-conjoint error:', err);
    if (/mongodb driver not installed/i.test(String(err))) {
      return res.status(500).json({ error: 'driver_missing', hint: 'Install with: npm install mongodb' });
    }
    return res.status(500).json({ error: 'store_failed' });
  }
});

// ============================================
// API: Get Completion Code
// ============================================
app.post(`${base}/api/get-code`, async (req, res) => {
  try {
    const { platform, userId } = req.body || {};

    // Validate platform
    const validPlatforms = ['clickworker', 'prolific', 'referral'];
    if (!platform || !validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'invalid_platform' });
    }

    // Validate userId
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'missing_userId' });
    }

    const client = await getMongo();
    const db = client.db(mongoDbName);
    const coll = db.collection(mongoCollCodes);

    // Find and claim an available code
    const result = await coll.findOneAndUpdate(
      {
        platform: platform,
        sharedWithPlatform: true,
        sharedWithParticipant: { $ne: true }
      },
      {
        $set: {
          sharedWithParticipant: true,
          userId: userId,
          usedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    const document = result.value || result;

    if (!document || !document.code) {
      // No codes available - generate one based on session
      const generatedCode = 'VCS-' + Date.now().toString(36).toUpperCase();
      return res.json({ code: generatedCode, generated: true });
    }

    console.log('[get-code] Successfully retrieved code:', document.code);
    return res.json({ code: document.code });
  } catch (err) {
    console.error('get-code error:', err);
    // Return a generated code on error
    const fallbackCode = 'VCS-' + Date.now().toString(36).toUpperCase();
    return res.json({ code: fallbackCode, generated: true });
  }
});

// ============================================
// API: Get Study Statistics (Admin)
// ============================================
app.get(`${base}/api/stats`, async (req, res) => {
  try {
    const client = await getMongo();
    const db = client.db(mongoDbName);
    const coll = db.collection(mongoCollSubmissions);

    const totalSubmissions = await coll.countDocuments();
    const completedSubmissions = await coll.countDocuments({ progressStatus: 'demographics_complete' });
    const attentionCheckPassed = await coll.countDocuments({
      progressStatus: 'demographics_complete',
      attentionCheckPassed: true
    });

    // Get submission breakdown by status
    const statusBreakdown = await coll.aggregate([
      { $group: { _id: '$progressStatus', count: { $sum: 1 } } }
    ]).toArray();

    // Get recruitment source breakdown
    const sourceBreakdown = await coll.aggregate([
      { $group: { _id: '$recruitment.source', count: { $sum: 1 } } }
    ]).toArray();

    return res.json({
      totalSubmissions,
      completedSubmissions,
      attentionCheckPassed,
      attentionCheckRate: completedSubmissions > 0 ? (attentionCheckPassed / completedSubmissions * 100).toFixed(1) + '%' : 'N/A',
      statusBreakdown: Object.fromEntries(statusBreakdown.map(s => [s._id || 'unknown', s.count])),
      sourceBreakdown: Object.fromEntries(sourceBreakdown.map(s => [s._id || 'unknown', s.count]))
    });
  } catch (err) {
    console.error('stats error:', err);
    return res.status(500).json({ error: 'stats_failed' });
  }
});

// ============================================
// API: Export Data (Admin)
// ============================================
app.get(`${base}/api/export`, async (req, res) => {
  try {
    const client = await getMongo();
    const db = client.db(mongoDbName);
    const coll = db.collection(mongoCollSubmissions);

    // Get all completed submissions
    const submissions = await coll.find({
      progressStatus: 'demographics_complete'
    }).toArray();

    // Flatten data for analysis
    const flatData = [];

    for (const sub of submissions) {
      const baseRow = {
        sessionId: sub.sessionId,
        participantId: sub.recruitment?.participantId,
        recruitmentSource: sub.recruitment?.source,
        attentionCheckPassed: sub.attentionCheckPassed,
        attentionCheckPosition: sub.attentionCheckPosition,
        age: sub.demographics?.age,
        gender: sub.demographics?.gender,
        education: sub.demographics?.education,
        country: sub.demographics?.country,
        politicalLeaning: sub.demographics?.politicalLeaning,
        consentTimestamp: sub.timestamps?.consentComplete,
        completionTimestamp: sub.timestamps?.demographicsComplete
      };

      // Add each comparison as a separate row
      if (sub.comparisons && sub.comparisons.length > 0) {
        for (const comp of sub.comparisons) {
          flatData.push({
            ...baseRow,
            trialNumber: comp.trialNumber,
            isAttentionCheck: comp.isAttentionCheck,
            imageLeft: comp.imageLeft,
            imageRight: comp.imageRight,
            response: comp.response,
            responseValue: comp.responseValue,
            responseTimestamp: comp.responseTimestamp
          });
        }
      }
    }

    return res.json({
      exportDate: new Date().toISOString(),
      totalParticipants: submissions.length,
      totalRows: flatData.length,
      data: flatData
    });
  } catch (err) {
    console.error('export error:', err);
    return res.status(500).json({ error: 'export_failed' });
  }
});

// ============================================
// SPA Fallback
// ============================================
app.use(base, (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

// ============================================
// Start Server
// ============================================
app.listen(port, "127.0.0.1", () => {
  console.log(`Visual Conjoint Survey listening at http://127.0.0.1:${port}${base}`);
  console.log(`Database: ${mongoDbName}`);
});
