const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load backend/.env as the source of truth, even if the shell has stale values.
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const pdfController = require('./controllers/pdfController');
const pdfRoutes = require('./routes/pdfRoutes');
const queryRoutes = require('./routes/queryRoutes');
const { connectToDatabase, getDatabaseStatus } = require('./config/mongodb');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Stream stored PDFs from MongoDB/GridFS
app.get('/uploads/:fileName', pdfController.streamUploadedPdf);

// Routes
app.use('/api/pdf', pdfRoutes);
app.use('/api/query', queryRoutes);

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Local PDF Knowledge Retrieval API',
    endpoints: {
      health: 'GET /api/query/health',
      uploadPDF: 'POST /api/pdf/upload',
      getDocuments: 'GET /api/pdf/documents',
      deleteDocument: 'DELETE /api/pdf/documents/:fileName',
      textQuery: 'POST /api/query/text',
      voiceQuery: 'POST /api/query/voice'
    }
  });
});

async function startServer() {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      const dbStatus = getDatabaseStatus();
      console.log(`Server running on port ${PORT}`);
      console.log(
        `Storage mode: ${dbStatus.localMode ? 'local-json' : 'mongodb'} (${dbStatus.dbName}.${dbStatus.collectionName})`
      );
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
