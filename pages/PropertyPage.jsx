/**
 * Properties API — Node.js + Express + MongoDB + S3 (user-scoped images)
 * ----------------------------------------------------------------------
 * Images are stored in Amazon S3 with keys partitioned by userId and propertyId:
 *   s3://<S3_BUCKET>/<userId>/<propertyId>/images/<filename>
 *
 * Endpoints:
 *   POST   /api/properties        -> create property (multipart/form-data with images)
 *   GET    /api/properties        -> list properties (optional ?userId=...)
 *   GET    /api/properties/:id    -> fetch single property
 *
 * Quick start:
 *   npm init -y
 *   npm i express mongoose multer cors dotenv morgan @aws-sdk/client-s3
 *
 * .env (example)
 *   PORT=4000
 *   MONGO_URI=mongodb://localhost:27017/pms
 *   BASE_URL=http://localhost:4000
 *   AWS_REGION=us-east-1
 *   AWS_ACCESS_KEY_ID=YOUR_KEY
 *   AWS_SECRET_ACCESS_KEY=YOUR_SECRET
 *   S3_BUCKET=your-bucket-name
 *   # Optional: use CloudFront or custom domain for public URLs
 *   # S3_PUBLIC_BASE=https://cdn.yourdomain.com
 */

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

dotenv.config();

// --- Config ---
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pms';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const AWS_REGION = process.env.AWS_REGION;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_BASE = process.env.S3_PUBLIC_BASE; // optional CDN/base

if (!AWS_REGION || !S3_BUCKET) {
  console.warn('[WARN] Missing AWS_REGION or S3_BUCKET. Set them in .env for image upload.');
}

// Multer memory storage (we'll stream buffers to S3)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// --- DB ---
mongoose
  .connect(MONGO_URI, { autoIndex: true })
  .then(() => console.log('Mongo connected'))
  .catch((e) => {
    console.error('Mongo connection failed', e);
    process.exit(1);
  });

const ImageSchema = new mongoose.Schema(
  {
    key: String,        // S3 object key
    url: String,        // public URL
    mimetype: String,
    size: Number,
    caption: { type: String }, // optional per-image caption/note
  },
  { _id: false }
);

const PropertySchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, required: true }, // who owns this property

    title: { type: String },
    address1: String,
    address2: String,
    city: String,
    state: String,
    zip: String,
    country: { type: String, default: 'USA' },

    propertyType: String,
    status: String,
    bedrooms: Number,
    bathrooms: Number,
    sqft: Number,
    lotSqft: Number,
    yearBuilt: String,
    rent: Number,
    deposit: Number,
    availableOn: Date,

    utilitiesIncluded: [String],
    amenities: [String],
    notes: String,

    // Structured notes by category
    inspectionNotes: [
      {
        text: String,
        createdAt: { type: Date, default: Date.now },
        authorId: String,
      }
    ],
    maintenanceNotes: [
      {
        text: String,
        createdAt: { type: Date, default: Date.now },
        authorId: String,
      }
    ],
    marketingNotes: [
      {
        text: String,
        createdAt: { type: Date, default: Date.now },
        authorId: String,
      }
    ],

    images: [ImageSchema],

    attributes: { type: Map, of: mongoose.Schema.Types.Mixed, default: undefined },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
  },
  { timestamps: true }
);

PropertySchema.index({ createdAt: -1 });
PropertySchema.index({ location: '2dsphere' }, { sparse: true });
const Property = mongoose.model('Property', PropertySchema);

// --- App ---
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));

// --- AWS S3 Client ---
const s3 = new S3Client({ region: AWS_REGION });

const toNumber = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};
const toDate = (v) => (!v ? undefined : (isNaN(new Date(v).getTime()) ? undefined : new Date(v)));
const toArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function publicUrlForKey(key) {
  if (S3_PUBLIC_BASE) return `${S3_PUBLIC_BASE}/${key}`;
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

async function uploadBufferToS3({ buffer, key, contentType }) {
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
    ACL: 'public-read', // optional: use bucket policy or signed URLs instead in production
  });
  await s3.send(cmd);
  return publicUrlForKey(key);
}

// --- Create ---
app.post('/api/properties', upload.array('images'), async (req, res) => {
  try {
    // userId can come from a header (preferred when using auth) or body field
    const userId = req.header('x-user-id') || req.body.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId (provide x-user-id header or form field userId)' });

    const b = req.body;

    // Prepare base doc with a pre-generated _id so we can use it in S3 keys
    const _id = new mongoose.Types.ObjectId();

    const lat = toNumber(b.lat);
    const lng = toNumber(b.lng);

    // Optional attributes JSON
    let attributes;
    if (b.attributes) {
      try { attributes = JSON.parse(b.attributes); } catch (e) {}
    }

    // Upload images (if any) to S3 under userId/propertyId
    const uploaded = [];
    if (req.files && req.files.length) {
      let i = 0;
      for (const f of req.files) {
        const ext = path.extname(f.originalname) || '';
        const key = `${userId}/${_id.toString()}/images/${Date.now()}-${i++}${ext}`;
        const url = await uploadBufferToS3({ buffer: f.buffer, key, contentType: f.mimetype });
        uploaded.push({ key, url, mimetype: f.mimetype, size: f.size });
      }
    }

    const doc = new Property({
      _id,
      userId,
      title: b.title?.trim(),
      address1: b.address1?.trim(),
      address2: b.address2?.trim(),
      city: b.city?.trim(),
      state: b.state?.trim(),
      zip: b.zip?.trim(),
      country: b.country?.trim() || 'USA',

      propertyType: b.propertyType,
      status: b.status,
      bedrooms: toNumber(b.bedrooms),
      bathrooms: toNumber(b.bathrooms),
      sqft: toNumber(b.sqft),
      lotSqft: toNumber(b.lotSqft),
      yearBuilt: b.yearBuilt,
      rent: toNumber(b.rent),
      deposit: toNumber(b.deposit),
      availableOn: toDate(b.availableOn),

      utilitiesIncluded: toArray(b['utilitiesIncluded[]'] ?? b.utilitiesIncluded),
      amenities: toArray(b['amenities[]'] ?? b.amenities),
      notes: b.notes,

      images: uploaded,
      attributes,
      location: lat !== undefined && lng !== undefined ? { type: 'Point', coordinates: [lng, lat] } : undefined,
    });

    const saved = await doc.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create property' });
  }
});

// --- List (optional user filter) ---
app.get('/api/properties', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.userId) filter.userId = String(req.query.userId);

    const [items, total] = await Promise.all([
      Property.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Property.countDocuments(filter),
    ]);

    res.json({ items, page, limit, total, hasMore: skip + items.length < total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list properties' });
  }
});

// --- Get one ---
app.get('/api/properties/:id', async (req, res) => {
  try {
    const item = await Property.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// --- Add a property note (inspection/maintenance/marketing) ---
app.patch('/api/properties/:id/notes', async (req, res) => {
  try {
    const { type = 'inspection', text, authorId } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });
    const fieldMap = {
      inspection: 'inspectionNotes',
      maintenance: 'maintenanceNotes',
      marketing: 'marketingNotes',
    };
    const field = fieldMap[type] || fieldMap.inspection;

    const update = { $push: { [field]: { text: String(text).trim(), authorId, createdAt: new Date() } } };
    const result = await Property.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add note' });
  }
});

// --- Set/Update an image caption ---
app.patch('/api/properties/:id/images/:imageKey/caption', async (req, res) => {
  try {
    const { caption } = req.body || {};
    const propertyId = req.params.id;
    const imageKey = decodeURIComponent(req.params.imageKey);

    const updated = await Property.findOneAndUpdate(
      { _id: propertyId, 'images.key': imageKey },
      { $set: { 'images.$.caption': caption } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Property or image not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update caption' });
  }
});
  }
});

app.listen(PORT, () => console.log(`API running on ${BASE_URL}`));
