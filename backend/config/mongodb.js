const { MongoClient, GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_NAME = 'ai_pdf_retrieval';
const DEFAULT_COLLECTION_NAME = 'documents';
const DEFAULT_PDF_BUCKET_NAME = 'pdfUploads';
const LOCAL_DATA_FILE = path.join(__dirname, '../data/documents-index.json');
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../uploads');
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000;

let client;
let db;
let localMode = false;
let localCollection;
let lastConnectionError = null;
let pdfBucket = null;

function allowLocalJsonFallback() {
  const value = (process.env.ALLOW_LOCAL_JSON_FALLBACK || 'false').trim().toLowerCase();
  return value === 'true';
}

function getMongoUri() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) {
    throw new Error('MONGODB_URI is missing.');
  }
  return uri;
}

async function connectToDatabase() {
  if (db) {
    return db;
  }

  try {
    client = new MongoClient(getMongoUri(), {
      serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT_MS
    });
    await client.connect();

    const dbName = (process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME).trim();
    db = client.db(dbName);
    await db.command({ ping: 1 });

    const collectionName = (process.env.MONGODB_COLLECTION_NAME || DEFAULT_COLLECTION_NAME).trim();
    const documentsCollection = db.collection(collectionName);
    await documentsCollection.createIndex({ fileName: 1 }, { unique: true });
    pdfBucket = new GridFSBucket(db, {
      bucketName: DEFAULT_PDF_BUCKET_NAME
    });

    localMode = false;
    lastConnectionError = null;
    console.log(`MongoDB connected: db="${dbName}", collection="${collectionName}"`);
    return db;
  } catch (error) {
    lastConnectionError = error;
    if (!allowLocalJsonFallback()) {
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
    console.warn(`MongoDB unavailable, using local JSON store: ${error.message}`);
    localMode = true;
    db = { mode: 'local-json' };
    localCollection = createLocalCollection();
    pdfBucket = null;
    return db;
  }
}

function getDocumentsCollection() {
  if (!db) {
    throw new Error('Database is not connected. Call connectToDatabase first.');
  }

  if (localMode) {
    return localCollection;
  }

  const collectionName = (process.env.MONGODB_COLLECTION_NAME || DEFAULT_COLLECTION_NAME).trim();
  return db.collection(collectionName);
}

function getDatabaseStatus() {
  const collectionName = (process.env.MONGODB_COLLECTION_NAME || DEFAULT_COLLECTION_NAME).trim();
  const dbName = (process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME).trim();

  return {
    connected: Boolean(db),
    localMode,
    dbName,
    collectionName,
    pdfBucketName: DEFAULT_PDF_BUCKET_NAME,
    lastConnectionError: lastConnectionError ? lastConnectionError.message : null
  };
}

function ensureLocalUploadDir() {
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

function ensureLocalFile() {
  const dir = path.dirname(LOCAL_DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOCAL_DATA_FILE)) {
    fs.writeFileSync(LOCAL_DATA_FILE, '[]', 'utf8');
  }
}

function readLocalDocs() {
  ensureLocalFile();
  try {
    const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDocs(docs) {
  ensureLocalFile();
  fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(docs, null, 2), 'utf8');
}

function applyProjection(doc, projection) {
  if (!projection || typeof projection !== 'object') {
    return { ...doc };
  }
  const keys = Object.keys(projection).filter((key) => key !== '_id');
  if (keys.length === 0) {
    return { ...doc };
  }

  const includeMode = keys.some((key) => projection[key]);
  if (!includeMode) {
    const clone = { ...doc };
    keys.forEach((key) => {
      if (projection[key] === 0) {
        delete clone[key];
      }
    });
    return clone;
  }

  const selected = {};
  keys.forEach((key) => {
    if (projection[key]) {
      selected[key] = doc[key];
    }
  });
  return selected;
}

function createLocalCollection() {
  return {
    async createIndex() {
      return null;
    },
    find(filter = {}, options = {}) {
      const docs = readLocalDocs();
      const filtered = docs.filter((doc) =>
        Object.entries(filter).every(([key, value]) => doc[key] === value)
      );
      const projected = filtered.map((doc) => applyProjection(doc, options.projection));
      return {
        async toArray() {
          return projected;
        }
      };
    },
    async findOne(filter = {}, options = {}) {
      const docs = readLocalDocs();
      const found = docs.find((doc) =>
        Object.entries(filter).every(([key, value]) => doc[key] === value)
      );
      return found ? applyProjection(found, options.projection) : null;
    },
    async updateOne(filter = {}, update = {}, options = {}) {
      const docs = readLocalDocs();
      const index = docs.findIndex((doc) =>
        Object.entries(filter).every(([key, value]) => doc[key] === value)
      );
      const setPayload = update.$set || {};

      if (index >= 0) {
        docs[index] = { ...docs[index], ...setPayload };
        writeLocalDocs(docs);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }

      if (options.upsert) {
        const next = { ...filter, ...setPayload };
        docs.push(next);
        writeLocalDocs(docs);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }

      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    },
    async deleteOne(filter = {}) {
      const docs = readLocalDocs();
      const before = docs.length;
      const next = docs.filter(
        (doc) => !Object.entries(filter).every(([key, value]) => doc[key] === value)
      );
      writeLocalDocs(next);
      return { deletedCount: before - next.length };
    }
  };
}

function getPdfBucket() {
  if (!db) {
    throw new Error('Database is not connected. Call connectToDatabase first.');
  }

  if (localMode) {
    return null;
  }

  if (!pdfBucket) {
    pdfBucket = new GridFSBucket(db, {
      bucketName: DEFAULT_PDF_BUCKET_NAME
    });
  }

  return pdfBucket;
}

function writeStreamAsync(stream, buffer) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(buffer);
  });
}

async function getPdfFileRecord(fileName) {
  if (!db) {
    throw new Error('Database is not connected. Call connectToDatabase first.');
  }

  if (localMode) {
    ensureLocalUploadDir();
    const filePath = path.join(LOCAL_UPLOAD_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = fs.statSync(filePath);
    return {
      _id: fileName,
      filename: fileName,
      length: stats.size,
      contentType: 'application/pdf'
    };
  }

  const bucket = getPdfBucket();
  const files = await bucket.find({ filename: fileName }).sort({ uploadDate: -1 }).limit(1).toArray();
  return files[0] || null;
}

async function savePdfFile({ fileName, buffer, contentType = 'application/pdf', metadata = {} }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Uploaded PDF buffer is empty.');
  }

  if (localMode) {
    ensureLocalUploadDir();
    fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, fileName), buffer);
    return { fileName };
  }

  const bucket = getPdfBucket();
  const existingFiles = await bucket.find({ filename: fileName }).toArray();
  for (const file of existingFiles) {
    await bucket.delete(file._id);
  }

  const uploadStream = bucket.openUploadStream(fileName, {
    contentType,
    metadata
  });

  await writeStreamAsync(uploadStream, buffer);
  return { fileName, fileId: uploadStream.id };
}

async function deletePdfFile(fileName) {
  if (!db) {
    throw new Error('Database is not connected. Call connectToDatabase first.');
  }

  if (localMode) {
    ensureLocalUploadDir();
    const filePath = path.join(LOCAL_UPLOAD_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  const bucket = getPdfBucket();
  const files = await bucket.find({ filename: fileName }).toArray();
  for (const file of files) {
    await bucket.delete(file._id);
  }
}

async function openPdfDownloadStream(fileName) {
  if (!db) {
    throw new Error('Database is not connected. Call connectToDatabase first.');
  }

  if (localMode) {
    ensureLocalUploadDir();
    const filePath = path.join(LOCAL_UPLOAD_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.createReadStream(filePath);
  }

  const file = await getPdfFileRecord(fileName);
  if (!file) {
    return null;
  }

  const bucket = getPdfBucket();
  return bucket.openDownloadStream(file._id);
}

module.exports = {
  connectToDatabase,
  getDocumentsCollection,
  getDatabaseStatus,
  getPdfFileRecord,
  savePdfFile,
  deletePdfFile,
  openPdfDownloadStream
};
