const { extractTextWithPageNumbers } = require('../utils/textExtractor');
const aiService = require('./aiService');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  getDocumentsCollection,
  savePdfFile,
  deletePdfFile
} = require('../config/mongodb');

function sampleEvenly(items, maxItems) {
  if (!Array.isArray(items) || maxItems <= 0 || items.length <= maxItems) {
    return items || [];
  }

  const sampled = [];
  const step = items.length / maxItems;

  for (let i = 0; i < maxItems; i += 1) {
    const idx = Math.min(items.length - 1, Math.floor(i * step));
    sampled.push(items[idx]);
  }

  return sampled;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value).trim().toLowerCase() === 'true';
}

class PDFService {
  async ensureEmbeddingsForDocument(doc) {
    if (!doc || !Array.isArray(doc.structuredData) || doc.structuredData.length === 0) {
      return;
    }

    const activeProvider = aiService.getEmbeddingProviderTag();
    const missingEmbedding = doc.structuredData.some(
      (chunk) => !Array.isArray(chunk.embedding) || chunk.embedding.length === 0
    );
    const providerMismatch = doc.structuredData.some(
      (chunk) => (chunk.embeddingProvider || 'local') !== activeProvider
    );

    if (!missingEmbedding && !providerMismatch) {
      return;
    }

    const chunkTexts = doc.structuredData.map((chunk) => chunk.text);
    const embeddings = await aiService.embedTexts(chunkTexts);

    doc.structuredData = doc.structuredData.map((chunk, index) => ({
      ...chunk,
      chunkId: chunk.chunkId || `${doc.fileName}::p${chunk.page}::para${chunk.paragraph}`,
      embedding: embeddings[index] || [],
      embeddingProvider: activeProvider
    }));

    await getDocumentsCollection().updateOne(
      { fileName: doc.fileName },
      {
        $set: {
          structuredData: doc.structuredData,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  async ensureAllEmbeddings() {
    const documents = await this.getAllDocumentData();
    for (const doc of documents) {
      await this.ensureEmbeddingsForDocument(doc);
    }
  }

  async applySemanticChunking(chunks) {
    if (!Array.isArray(chunks) || chunks.length < 2) {
      return chunks || [];
    }

    const similarityThreshold = toFiniteNumber(process.env.SEMANTIC_CHUNK_SIMILARITY_THRESHOLD, 0.68);
    const maxChars = Math.max(200, Math.floor(toFiniteNumber(process.env.SEMANTIC_CHUNK_MAX_CHARS, 1200)));
    const minChars = Math.max(80, Math.floor(toFiniteNumber(process.env.SEMANTIC_CHUNK_MIN_CHARS, 260)));
    const byPage = new Map();

    chunks.forEach((chunk) => {
      const page = Number(chunk.page) || 0;
      if (!byPage.has(page)) {
        byPage.set(page, []);
      }
      byPage.get(page).push(chunk);
    });

    const mergedChunks = [];

    for (const [page, pageChunks] of byPage.entries()) {
      const ordered = [...pageChunks].sort((a, b) => (Number(a.paragraph) || 0) - (Number(b.paragraph) || 0));
      if (ordered.length === 1) {
        mergedChunks.push({
          ...ordered[0],
          page,
          paragraph: 1
        });
        continue;
      }

      const vectors = await aiService.embedTexts(ordered.map((chunk) => chunk.text));

      let current = {
        ...ordered[0],
        page,
        paragraph: 1
      };
      let paragraphIndex = 1;

      for (let i = 1; i < ordered.length; i += 1) {
        const next = ordered[i];
        const previousVector = vectors[i - 1];
        const currentVector = vectors[i];
        const semanticScore = aiService.cosineSimilarity(previousVector, currentVector);
        const nextText = String(next.text || '').trim();
        const combinedText = `${String(current.text || '').trim()} ${nextText}`.trim();
        const keepTogether = semanticScore >= similarityThreshold;
        const shouldMergeForSize = String(current.text || '').trim().length < minChars;
        const withinMax = combinedText.length <= maxChars;

        if ((keepTogether || shouldMergeForSize) && withinMax) {
          current = {
            ...current,
            text: combinedText,
            endLine: next.endLine || current.endLine
          };
          continue;
        }

        mergedChunks.push(current);
        paragraphIndex += 1;
        current = {
          ...next,
          page,
          paragraph: paragraphIndex
        };
      }

      mergedChunks.push(current);
    }

    return mergedChunks
      .sort((a, b) => {
        const pageDiff = (Number(a.page) || 0) - (Number(b.page) || 0);
        if (pageDiff !== 0) {
          return pageDiff;
        }
        return (Number(a.paragraph) || 0) - (Number(b.paragraph) || 0);
      })
      .map((chunk, index, all) => {
        const samePageBefore = all
          .slice(0, index)
          .filter((candidate) => (Number(candidate.page) || 0) === (Number(chunk.page) || 0));
        return {
          ...chunk,
          paragraph: samePageBefore.length + 1
        };
      });
  }

  async processPDF(file) {
    let tempFilePath = '';

    try {
      const fileBuffer = file?.buffer;
      if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
        throw new Error('Uploaded PDF buffer is missing.');
      }

      const fileName = file.filename;
      const originalName = file.originalname;
      const relativePath = String(file.relativePath || originalName).replace(/\\/g, '/');
      const displayName = path.basename(relativePath) || originalName;
      const folderPath = path.dirname(relativePath).replace(/\\/g, '/');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-upload-'));
      tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, fileBuffer);

      // Extract text with page and paragraph information
      const extractedData = await extractTextWithPageNumbers(tempFilePath);
      const semanticChunkingEnabled = toBoolean(process.env.SEMANTIC_CHUNKING_ENABLED, true);
      const baseStructuredData = Array.isArray(extractedData.structuredData) ? extractedData.structuredData : [];
      let chunkedData = baseStructuredData;

      if (semanticChunkingEnabled && baseStructuredData.length > 1) {
        try {
          chunkedData = await this.applySemanticChunking(baseStructuredData);
        } catch (error) {
          console.warn(`Semantic chunking fallback to rule-based chunking: ${error.message}`);
          chunkedData = baseStructuredData;
        }
      }

      const originalChunkCount = chunkedData.length;
      const configuredMax = Number(process.env.MAX_CHUNKS_PER_DOCUMENT || 0);
      const maxChunks = Number.isFinite(configuredMax) ? Math.floor(configuredMax) : 0;
      const limitedStructuredData = sampleEvenly(chunkedData, maxChunks);
      const activeProvider = aiService.getEmbeddingProviderTag();
      const embedOnUpload = String(process.env.EMBED_ON_UPLOAD || 'false').trim().toLowerCase() === 'true';
      let embeddings = [];

      if (embedOnUpload) {
        const chunkTexts = limitedStructuredData.map((item) => item.text);
        embeddings = await aiService.embedTexts(chunkTexts);
      }

      const structuredData = limitedStructuredData.map((item, index) => ({
        ...item,
        chunkId: `${fileName}::p${item.page}::para${item.paragraph}`,
        embedding: embedOnUpload ? (embeddings[index] || []) : [],
        embeddingProvider: activeProvider
      }));

      await savePdfFile({
        fileName,
        buffer: fileBuffer,
        contentType: file.mimetype || 'application/pdf',
        metadata: {
          originalName: displayName,
          relativePath,
          folderPath: folderPath === '.' ? '' : folderPath
        }
      });

      const documentRecord = {
        fileName,
        originalName: displayName,
        relativePath,
        folderPath: folderPath === '.' ? '' : folderPath,
        pdfStorage: {
          type: 'mongodb-gridfs',
          fileName
        },
        fullText: extractedData.fullText,
        numPages: extractedData.numPages,
        pages: extractedData.pages,
        extractionSummary: extractedData.extractionSummary || null,
        structuredData,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await getDocumentsCollection().updateOne(
        { fileName },
        { $set: documentRecord },
        { upsert: true }
      );

      return {
        success: true,
        fileName: displayName,
        storedFileName: fileName,
        relativePath,
        numPages: extractedData.numPages,
        extractionSummary: extractedData.extractionSummary || null,
        message: originalChunkCount > structuredData.length
          ? `PDF processed successfully${extractedData.extractionSummary?.ocrUsed ? ' with OCR fallback' : ''} (indexed ${structuredData.length} of ${originalChunkCount} chunks).`
          : (embedOnUpload
              ? `PDF processed successfully${extractedData.extractionSummary?.ocrUsed ? ' with OCR fallback' : ''}`
              : `PDF processed successfully${extractedData.extractionSummary?.ocrUsed ? ' with OCR fallback' : ''}. Embeddings are deferred until query time.`)
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    } finally {
      if (tempFilePath) {
        fs.rmSync(path.dirname(tempFilePath), { recursive: true, force: true });
      }
    }
  }

  async getAllDocuments() {
    const documents = await getDocumentsCollection()
      .find({}, { projection: { _id: 0, fileName: 1, originalName: 1, relativePath: 1, folderPath: 1, numPages: 1, structuredData: 1, uploadedAt: 1 } })
      .toArray();

    return documents.map((doc) => ({
      fileName: doc.fileName,
      originalName: doc.originalName || doc.fileName,
      relativePath: doc.relativePath || doc.originalName || doc.fileName,
      folderPath: doc.folderPath || '',
      numPages: doc.numPages,
      paragraphCount: Array.isArray(doc.structuredData) ? doc.structuredData.length : 0,
      uploadedAt: doc.uploadedAt
    }));
  }

  async getAllDocumentData() {
    return getDocumentsCollection().find({}, { projection: { _id: 0 } }).toArray();
  }

  async getDocument(fileName) {
    return getDocumentsCollection().findOne({ fileName }, { projection: { _id: 0 } });
  }

  async deleteDocument(fileName) {
    const doc = await this.getDocument(fileName);

    if (!doc) {
      return false;
    }

    await getDocumentsCollection().deleteOne({ fileName });
    await deletePdfFile(doc.fileName);

    return true;
  }
}

// Export an instance of the class
const pdfServiceInstance = new PDFService();
module.exports = pdfServiceInstance;
