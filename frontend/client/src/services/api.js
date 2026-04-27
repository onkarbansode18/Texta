import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// PDF Upload (single or multiple via same endpoint)
export const uploadPDFs = async (files) => {
  const formData = new FormData();
  const relativePaths = (files || []).map((file) => file.webkitRelativePath || file.name);
  (files || []).forEach((file) => formData.append('pdf', file));
  formData.append('relativePaths', JSON.stringify(relativePaths));
  
  try {
    const response = await axios.post(`${API_URL}/pdf/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      // Large PDFs can take several minutes to parse + embed.
      // Keep request open until backend finishes.
      timeout: 0
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Upload timed out while processing PDF.');
    }
    throw error;
  }
};

export const uploadPDF = async (file) => {
  const response = await uploadPDFs([file]);
  if (response?.results && Array.isArray(response.results)) {
    const firstSuccess = response.results.find((item) => item.success);
    if (firstSuccess) {
      return firstSuccess;
    }
  }
  return response;
};

// Get all documents
export const getDocuments = async () => {
  const response = await axios.get(`${API_URL}/pdf/documents`);
  return response.data;
};

// Delete document
export const deleteDocument = async (fileName) => {
  const response = await axios.delete(`${API_URL}/pdf/documents/${encodeURIComponent(fileName)}`);
  return response.data;
};

// Text query
export const textQuery = async (queryOrQueries, selectedFiles = []) => {
  const hasMultiple = Array.isArray(queryOrQueries);
  const safeSelectedFiles = Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : [];

  if (!hasMultiple) {
    const response = await axios.post(`${API_URL}/query/text`, { query: queryOrQueries, selectedFiles: safeSelectedFiles });
    return response.data;
  }

  const queries = queryOrQueries
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (queries.length === 0) {
    throw new Error('At least one query is required');
  }

  try {
    const response = await axios.post(`${API_URL}/query/text`, { queries, selectedFiles: safeSelectedFiles });
    return response.data;
  } catch (error) {
    const backendError = String(error?.response?.data?.error || '').toLowerCase();
    const missingSingleQueryField = backendError.includes('query is required');

    // Backward compatibility: older backend versions only accept { query }.
    if (!missingSingleQueryField) {
      throw error;
    }

    const responses = await Promise.all(
      queries.map(async (query) => {
        const single = await axios.post(`${API_URL}/query/text`, { query, selectedFiles: safeSelectedFiles });
        return single.data;
      })
    );

    return {
      isBatch: true,
      totalQueries: responses.length,
      results: responses.map((item, index) => ({
        query: item?.query || queries[index],
        answer: item?.answer || 'No answer generated.',
        sources: Array.isArray(item?.sources) ? item.sources : [],
        retrievedCount: item?.retrievedCount || 0,
        inputMethod: item?.inputMethod || 'text'
      }))
    };
  }
};

// Voice query
export const voiceQuery = async (query, selectedFiles = []) => {
  const response = await axios.post(`${API_URL}/query/voice`, {
    query,
    selectedFiles: Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : []
  });
  return response.data;
};

const getFileNameFromDisposition = (contentDisposition) => {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (asciiMatch && asciiMatch[1]) {
    return asciiMatch[1];
  }

  return null;
};

export const exportQueryResultPdf = async ({ query, answer, sources = [], inputMethod = 'text' }) => {
  try {
    const safePayload = {
      query: String(query || ''),
      answer: String(answer || ''),
      inputMethod: String(inputMethod || 'text'),
      sources: Array.isArray(sources)
        ? sources.map((source) => ({
            chunkId: source?.chunkId || '',
            fileName: source?.fileName || '',
            originalName: source?.originalName || '',
            page: source?.page ?? '-',
            paragraph: source?.paragraph ?? '-',
            startLine: source?.startLine ?? '-',
            endLine: source?.endLine ?? '-',
            text: String(source?.text || '')
          }))
        : []
    };

    const response = await axios.post(
      `${API_URL}/query/export-pdf`,
      safePayload,
      { responseType: 'blob' }
    );

    return {
      blob: response.data,
      fileName: getFileNameFromDisposition(response.headers['content-disposition']) || 'query-result.pdf'
    };
  } catch (error) {
    // Axios returns blob even for JSON error payload when responseType is blob.
    if (error?.response?.data instanceof Blob) {
      let message = 'PDF export failed';
      try {
        const text = await error.response.data.text();
        const parsed = JSON.parse(text);
        if (parsed?.error) {
          message = parsed.error;
        } else if (text) {
          message = text;
        }
      } catch {
        // Keep default message when response body is not JSON.
      }
      throw new Error(message);
    }

    throw new Error(error?.response?.data?.error || error?.message || 'PDF export failed');
  }
};
