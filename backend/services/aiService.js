const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const MAX_RETRIEVED_CHUNKS = 14;
const DEFAULT_LOCAL_EMBED_URL = 'http://127.0.0.1:8000/embed';
const DEFAULT_LOCAL_ANSWER_URL = 'http://127.0.0.1:11434/api/generate';
const DEFAULT_LOCAL_ANSWER_MODEL = 'llama3.1:8b';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const DEFAULT_GEMINI_ANSWER_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_EMBED_CONCURRENCY = 2;
const DEFAULT_GEMINI_EMBED_RETRIES = 4;
const DEFAULT_GEMINI_EMBED_RETRY_BASE_MS = 1200;
const DEFAULT_EMBED_BATCH_SIZE = 64;
const EXACT_MATCH_SCORE_BOOST = 0.35;
const LEXICAL_SCORE_WEIGHT = 0.8;
const RECORD_MATCH_FIELD_BOOST = 0.75;
const MIN_RECORD_SCORE = 1.15;
const MAX_RECORD_MATCHES = 8;
const RECORD_QUERY_HINTS = [
  'roll', 'account', 'loan', 'customer', 'id', 'number', 'no', 'ifsc',
  'mobile', 'contact', 'phone', 'amount', 'prn',
  'pan', 'aadhaar', 'passport', 'registration', 'post', 'post id', 'post name'
];
const PERSON_LOOKUP_STOPWORDS = new Set([
  'what', 'is', 'the', 'of', 'for', 'a', 'an', 'please', 'give', 'me', 'tell',
  'student', 'person', 'customer', 'borrower', 'name', 'mobile', 'contact',
  'phone', 'loan', 'amount', 'number', 'no', 'details', 'prn', 'named',
  'boy', 'girl', 'ladka', 'ladke', 'ladki', 'naam', 'ka', 'ki', 'ke', 'hai',
  'kya', 'studento', 'vidyarthi', 'chhatra'
]);
const PERSON_FIELD_LOOKUPS = [
  {
    key: 'mobile',
    label: 'mobile number',
    hints: ['mobile', 'contact no', 'contact number', 'phone', 'phone number']
  },
  {
    key: 'email',
    label: 'email ID',
    hints: ['email', 'email id', 'mail', 'mail id']
  },
  {
    key: 'roll_no',
    label: 'roll number',
    hints: ['roll no', 'roll number']
  },
  {
    key: 'gr_no',
    label: 'GR number',
    hints: ['gr no', 'gr number', 'gr.no', 'grno']
  },
  {
    key: 'prn_no',
    label: 'PRN number',
    hints: ['prn no', 'prn number', 'prn']
  },
  {
    key: 'loan_amount',
    label: 'loan amount',
    hints: ['loan amount', 'loan amt', 'amount', 'sanction amount']
  }
];
const TOKEN_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how',
  'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'were', 'what', 'when', 'where', 'which', 'with', 'you', 'your'
]);
const NO_ANSWER_MARKERS = [
  'i could not find this in the uploaded documents',
  'i could not find relevant content in the uploaded documents',
  'not found in the uploaded documents'
];
const SUBJECT_QUERY_HINTS = [
  'subject name',
  'name of subject',
  'subject title',
  'course name',
  'name of course'
];
const PROJECT_TITLE_QUERY_HINTS = [
  'project title',
  'what is the title',
  'title of project',
  'document title'
];
const INTERNAL_GUIDE_QUERY_HINTS = [
  'internal guide',
  'guide contact',
  'contact details of internal guide',
  'contact of internal guide',
  'internal guide contact',
  'guide mobile',
  'guide email'
];
const GROUP_NO_QUERY_HINTS = [
  'group no',
  'group number',
  'what is the group no',
  'group of this students',
  'group no of students'
];
const TECH_STACK_QUERY_HINTS = [
  'tech stack',
  'technology stack',
  'technologies used',
  'technology used',
  'tools used',
  'stack used',
  'which technologies',
  'what technologies',
  'framework used',
  'software used'
];
const TECH_STACK_TERMS = [
  { label: 'Artificial Intelligence', pattern: /\bartificial\s+intelligence\b|\bAI\b/i },
  { label: 'Natural Language Processing (NLP)', pattern: /\bnatural\s+language\s+processing\b|\bNLP\b/i },
  { label: 'speech recognition / ASR', pattern: /\bspeech\s+(?:recognition|to\s*text)\b|\bautomatic\s+speech\s+recognition\b|\bASR\b/i },
  { label: 'semantic search / semantic document analysis', pattern: /\bsemantic\s+(?:search|document\s+analysis|understanding|processing)\b/i },
  { label: 'transformer-based language models', pattern: /\btransformer\s*-\s*based\s+language\s+models?\b|\blanguage\s+models?\b/i },
  { label: 'intelligent answer generation', pattern: /\banswer\s+generation\b|\banswer\s+extraction\b/i },
  { label: 'multilingual processing', pattern: /\bmultilingual\b|\btranslation\b/i },
  { label: 'web-based dashboard/frontend interface', pattern: /\bweb\s*-\s*based\s+dashboard\b|\bfrontend\s+interface\b|\buser\s+interface\b/i },
  { label: 'PDF document repository / knowledge base', pattern: /\bPDF\s+documents?\b|\bdocument\s+repository\b|\bknowledge\s+base\b/i },
  { label: 'React', pattern: /\bReact\b/i },
  { label: 'Express API', pattern: /\bExpress\b|\bExpress\s+API\b/i },
  { label: 'Node.js', pattern: /\bNode(?:\.js)?\b/i },
  { label: 'MongoDB / GridFS', pattern: /\bMongoDB\b|\bGridFS\b/i },
  { label: 'Gemini', pattern: /\bGemini\b/i },
  { label: 'Python FastAPI', pattern: /\bFastAPI\b|\bPython\b/i },
  { label: 'Tesseract OCR', pattern: /\bTesseract\b|\bOCR\b/i },
  { label: 'Poppler', pattern: /\bPoppler\b|\bpdftoppm\b/i }
];
const QUERY_CANONICAL_REPLACEMENTS = [
  [/\bdivison\b|\bdivsion\b|\bdivison\s+name\b/gi, ' division '],
  [/\bpost\s*no\b|\bpost\s*number\b/gi, ' post id '],
  [/\breg\s*no\b|\breg\s*number\b|\bregistration\s*number\b/gi, ' registration '],
  [/\bmob(?:ile|ilee|ille|ike|ie|le)\b/gi, ' mobile '],
  [/\bmob\s*no\b|\bmob\s*number\b/gi, ' mobile number '],
  [/\bcontact\s*no\b|\bcontact\s*number\b|\bphone\s*no\b|\bphone\s*number\b|\bcell\s*number\b/gi, ' mobile number '],
  [/\bcell\b|\btelephone\b|\bphone\b/gi, ' mobile '],
  [/\be-?mail\b|\bmail\s*id\b|\bmail\b/gi, ' email '],
  [/\bdept\b|\bbranch\b/gi, ' department '],
  [/\bgrp\b|\bgroup number\b/gi, ' group no '],
  [/\bsem\b/gi, ' semester '],
  [/\bguide details\b|\bguide info\b/gi, ' internal guide contact '],
  [/\bprn number\b|\bprn no\b/gi, ' prn '],
  [/\bgr number\b|\bgr no\b|\bgrno\b/gi, ' gr no '],
  [/\broll number\b|\brollnum\b/gi, ' roll no '],
  [/\btitle of project\b|\bproject name\b/gi, ' project title '],
  [/\barea of project\b|\bdomain of project\b/gi, ' project area ']
];
const LABELED_FIELD_LOOKUPS = [
  {
    key: 'semester',
    label: 'semester',
    hints: ['semester', 'which semester', 'semester of this students'],
    patterns: [/\bSemester\s*:\s*([A-Z0-9 ]{1,20})/i],
    answer: (value) => `The semester is ${value}.`
  },
  {
    key: 'department',
    label: 'department',
    hints: ['department', 'which department', 'department name'],
    patterns: [/\bDepartment\s*:\s*([A-Z&/ ]{2,80})/i],
    answer: (value) => `The department is ${value}.`
  },
  {
    key: 'academic_year',
    label: 'academic year',
    hints: ['academic year', 'year of this project', 'which academic year'],
    patterns: [/\bAcademic\s+Year\s*:\s*([0-9 -]{4,20})/i],
    answer: (value) => `The academic year is ${value}.`
  },
  {
    key: 'project_area',
    label: 'project area',
    hints: ['project area', 'area of project', 'domain of project'],
    patterns: [/\bProject\s+Area\s*:\s*([A-Z&/ \-]{3,120})/i],
    answer: (value) => `The project area is ${value}.`
  },
  {
    key: 'ff_no',
    label: 'FF number',
    hints: ['ff no', 'ff number', 'what is ff no'],
    patterns: [/\bFFNo\.?\s*([A-Z0-9_-]{1,20})/i, /\bFF\s*No\.?\s*:?\s*([A-Z0-9_-]{1,20})/i],
    answer: (value) => `The FF number is ${value}.`
  }
];
const MULTILINGUAL_QUERY_REPLACEMENTS = [
  [/मोबाइल नंबर|मोबाइल नम्बर|मोबाइल no|मोबाइल no\./gi, ' mobile number '],
  [/मोबाइल/gi, ' mobile '],
  [/नंबर|नम्बर/gi, ' number '],
  [/नाम/gi, ' name '],
  [/छात्र|विद्यार्थी/gi, ' student '],
  [/लड़का|लड़के/gi, ' student '],
  [/क्या है|क्या h|क्या/gi, ' what is '],
  [/\bmobile no\b|\bmobile number\b/gi, ' mobile number '],
  [/\bmobille\b|\bmibile\b|\bmoible\b|\bmobilee\b/gi, ' mobile '],
  [/\bstduent\b|\bstudentt\b|\bstudnet\b|\bstudant\b/gi, ' student '],
  [/\bnaam\b/gi, ' name '],
  [/\bladka\b|\bladke\b|\bladki\b/gi, ' student '],
  [/\bvidyarthi\b|\bchhatra\b/gi, ' student '],
  [/\bkya hai\b|\bkya h\b|\bkya\b/gi, ' what is '],
  [/\bkaun sa\b|\bkaunsa\b|\bkon sa\b/gi, ' which '],
  [/\bkitna\b|\bkitne\b/gi, ' how many '],
  [/\bka\b|\bki\b|\bke\b/gi, ' ']
];

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildLooseNumericPattern(token) {
  const digits = String(token || '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  return new RegExp(`(?<!\\d)${digits.split('').join('[\\s_-]*')}(?!\\d)`);
}

function includesLooseNumericToken(text, token) {
  const pattern = buildLooseNumericPattern(token);
  if (!pattern) {
    return false;
  }

  return pattern.test(String(text || ''));
}

function normalizeSemanticText(value) {
  let normalized = normalizeForMatch(value);
  QUERY_CANONICAL_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return compactSpaces(normalized);
}

function getQuotedAndNumericTokens(query) {
  const raw = String(query || '');
  const quoted = [...raw.matchAll(/"([^"]+)"|'([^']+)'/g)]
    .map((match) => (match[1] || match[2] || '').trim())
    .filter(Boolean);
  const numeric = [...raw.matchAll(/\d{6,}/g)].map((match) => match[0]);
  const recordCodes = [...raw.matchAll(/\b[A-Z]\d{8,}\b/gi)].map((match) => match[0]);
  return Array.from(new Set([...quoted, ...numeric, ...recordCodes]));
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g) || [];
}

function extractNumericTokens(value, minLength = 4) {
  const re = new RegExp(`\\d{${minLength},}`, 'g');
  return Array.from(new Set((String(value || '').match(re) || [])));
}

function toTimestamp(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function compactSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanSubjectName(value) {
  const normalized = compactSpaces(value);
  if (!normalized) {
    return '';
  }

  const stopLabels = [
    'COURSE PREREQUISITES',
    'COURSE OBJECTIVES',
    'COURSE RELEVANCE',
    'TEACHING SCHEME',
    'CREDITS',
    'SECTION'
  ];

  let cleaned = normalized;
  stopLabels.forEach((label) => {
    const index = cleaned.toUpperCase().indexOf(label);
    if (index > 0) {
      cleaned = cleaned.slice(0, index).trim();
    }
  });

  return compactSpaces(cleaned);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHintPattern(hint) {
  const normalizedHint = normalizeForMatch(hint);
  if (!normalizedHint) {
    return null;
  }

  const escapedHint = escapeRegExp(normalizedHint).replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${escapedHint}(?=$|[^a-z0-9])`, 'i');
}

function containsHint(text, hint) {
  const pattern = buildHintPattern(hint);
  if (!pattern) {
    return false;
  }

  return pattern.test(normalizeSemanticText(text));
}

function toDisplayName(value) {
  return compactSpaces(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeQueryForRetrieval(query) {
  let normalized = normalizeSemanticText(query);

  MULTILINGUAL_QUERY_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return compactSpaces(normalized);
}

function buildRetrievalQuery(query) {
  const original = compactSpaces(query);
  const normalized = normalizeQueryForRetrieval(query);

  if (!normalized || normalized === normalizeForMatch(original)) {
    return original;
  }

  return `${original}\n${normalized}`;
}

class AIService {
  sortDocumentsByUploadOrder(documents) {
    return [...(Array.isArray(documents) ? documents : [])]
      .sort((a, b) => {
        const diff = toTimestamp(a?.uploadedAt) - toTimestamp(b?.uploadedAt);
        if (diff !== 0) {
          return diff;
        }
        return String(a?.fileName || '').localeCompare(String(b?.fileName || ''));
      });
  }

  isNoAnswerResponse(answer) {
    const normalized = normalizeForMatch(answer);
    return NO_ANSWER_MARKERS.some((marker) => normalized.includes(marker));
  }

  isSubjectNameQuery(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return SUBJECT_QUERY_HINTS.some((hint) => containsHint(normalized, hint));
  }

  isProjectTitleQuery(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return PROJECT_TITLE_QUERY_HINTS.some((hint) => containsHint(normalized, hint));
  }

  isInternalGuideQuery(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return INTERNAL_GUIDE_QUERY_HINTS.some((hint) => containsHint(normalized, hint));
  }

  isGroupNoQuery(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return GROUP_NO_QUERY_HINTS.some((hint) => containsHint(normalized, hint));
  }

  isTechStackQuery(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return TECH_STACK_QUERY_HINTS.some((hint) => containsHint(normalized, hint))
      || (containsHint(normalized, 'stack') && containsHint(normalized, 'project'));
  }

  getLabeledFieldQueryConfig(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return LABELED_FIELD_LOOKUPS.find((field) => field.hints.some((hint) => containsHint(normalized, hint))) || null;
  }

  extractInternalGuideDetailsFromChunks(chunks) {
    for (const chunk of chunks || []) {
      const text = compactSpaces(String(chunk?.text || ''));
      if (!/name\s+of\s+internal\s+guide/i.test(text)) {
        continue;
      }

      const nameMatch = text.match(
        /\bName\s+of\s+Internal\s+Guide\s*:\s*([^:]+?)(?=\s+Contact\s*No|\s+ContactNo|\s+Guide\b|$)/i
      );
      const contactMatch = text.match(
        /\bContact\s*No\s*\.?\s*&?\s*Email\s*ID\s*:\s*([6-9]\d{9})\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i
      );

      const name = compactSpaces(nameMatch?.[1] || '');
      const mobile = compactSpaces(contactMatch?.[1] || '');
      const email = compactSpaces(contactMatch?.[2] || '');

      if (name || mobile || email) {
        return {
          name,
          mobile,
          email,
          chunk
        };
      }
    }

    return null;
  }

  extractGroupNoFromChunks(chunks) {
    for (const chunk of chunks || []) {
      const text = compactSpaces(String(chunk?.text || ''));
      if (!text) {
        continue;
      }

      const groupMatch = text.match(
        /\bSemester\s*:\s*[A-Z0-9 ]+\s+Group\s+No\.?\s*:?\s*([A-Z0-9_ -]{3,40})/i
      ) || text.match(/\bGroup\s+No\.?\s*:?\s*([A-Z0-9_ -]{3,40})/i);

      if (groupMatch && groupMatch[1]) {
        const groupNo = compactSpaces(groupMatch[1])
          .replace(/\s+(Project Title|Project Area|Group Members Details)\b.*$/i, '')
          .trim();
        if (groupNo && !/^date$/i.test(groupNo) && !/^activity$/i.test(groupNo)) {
          return {
            groupNo,
            chunk
          };
        }
      }
    }

    return null;
  }

  extractLabeledFieldFromChunks(chunks, fieldConfig) {
    if (!fieldConfig) {
      return null;
    }

    for (const chunk of chunks || []) {
      const text = compactSpaces(String(chunk?.text || ''));
      if (!text) {
        continue;
      }

      for (const pattern of fieldConfig.patterns || []) {
        const match = text.match(pattern);
        if (!match || !match[1]) {
          continue;
        }

        const value = compactSpaces(match[1])
          .replace(/\s+(Semester|Group No|Project Title|Project Area|Group Members Details|Academic Year)\b.*$/i, '')
          .trim();
        if (!value) {
          continue;
        }

        return { value, chunk };
      }
    }

    return null;
  }

  extractProjectTitleFromChunks(chunks) {
    for (const chunk of chunks || []) {
      const text = compactSpaces(String(chunk?.text || ''));
      if (!text) {
        continue;
      }

      const projectTitleMatch = text.match(
        /\bProject\s+Title\s*:\s*(.+?)(?=\s+Project\s+Area\s*:|\s+Group\s+Members\s+Details\s*:|\s+Department\s*:|$)/i
      );
      if (projectTitleMatch && projectTitleMatch[1]) {
        const projectTitle = compactSpaces(projectTitleMatch[1]);
        if (projectTitle) {
          return { projectTitle, chunk };
        }
      }
    }

    return null;
  }

  extractSubjectNameFromChunks(chunks) {
    for (const chunk of chunks || []) {
      const text = String(chunk?.text || '');
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

      for (const line of lines) {
        const normalizedLine = compactSpaces(line);

        const codeWithNameMatch = normalizedLine.match(/\b([A-Z]{2,}\s*\d{3,5}[A-Z]?)\s*[:\-]\s*([A-Z][A-Z\s&/()\-]{2,})/i);
        if (codeWithNameMatch && codeWithNameMatch[2]) {
          const cleanedName = cleanSubjectName(codeWithNameMatch[2]);
          if (!cleanedName) {
            continue;
          }

          return {
            subjectName: cleanedName,
            subjectCode: compactSpaces(codeWithNameMatch[1]),
            chunk
          };
        }

        const labeledSubjectMatch = normalizedLine.match(/\b(?:subject|course)\s*(?:name|title)?\s*[:\-]\s*([A-Z][A-Z\s&/()\-]{2,})/i);
        if (labeledSubjectMatch && labeledSubjectMatch[1]) {
          const cleanedName = cleanSubjectName(labeledSubjectMatch[1]);
          if (!cleanedName) {
            continue;
          }

          return {
            subjectName: cleanedName,
            subjectCode: '',
            chunk
          };
        }
      }
    }

    return null;
  }

  extractTechStackFromChunks(chunks) {
    const found = new Map();
    const evidenceChunks = [];

    for (const chunk of chunks || []) {
      const text = compactSpaces(String(chunk?.text || ''));
      if (!text) {
        continue;
      }

      const matchedLabels = TECH_STACK_TERMS
        .filter((term) => term.pattern.test(text))
        .map((term) => term.label);

      if (matchedLabels.length === 0) {
        continue;
      }

      matchedLabels.forEach((label) => {
        if (!found.has(label)) {
          found.set(label, chunk);
        }
      });

      if (evidenceChunks.length < 3) {
        evidenceChunks.push(chunk);
      }
    }

    if (found.size === 0) {
      return null;
    }

    return {
      technologies: Array.from(found.keys()),
      chunks: evidenceChunks.length > 0 ? evidenceChunks : Array.from(new Set(found.values())).slice(0, 3)
    };
  }

  get embeddingProvider() {
    const provider = (process.env.EMBEDDING_PROVIDER || 'local').trim().toLowerCase();
    if (!['local', 'gemini'].includes(provider)) {
      throw new Error('Unsupported EMBEDDING_PROVIDER. Use "local" or "gemini".');
    }
    return provider;
  }

  get answerProvider() {
    const provider = (process.env.ANSWER_PROVIDER || 'gemini').trim().toLowerCase();
    if (!['local', 'gemini'].includes(provider)) {
      throw new Error('Unsupported ANSWER_PROVIDER. Use "local" or "gemini".');
    }
    return provider;
  }

  get localEmbeddingUrl() {
    return (process.env.LOCAL_EMBEDDING_URL || DEFAULT_LOCAL_EMBED_URL).trim();
  }

  get localAnswerUrl() {
    return (process.env.LOCAL_ANSWER_URL || DEFAULT_LOCAL_ANSWER_URL).trim();
  }

  get localAnswerModel() {
    return (process.env.LOCAL_ANSWER_MODEL || DEFAULT_LOCAL_ANSWER_MODEL).trim();
  }

  get geminiApiKey() {
    return (process.env.GEMINI_API_KEY || '').trim();
  }

  get geminiEmbeddingModel() {
    return (process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_GEMINI_EMBEDDING_MODEL).trim();
  }

  get geminiAnswerModel() {
    return (process.env.GEMINI_ANSWER_MODEL || DEFAULT_GEMINI_ANSWER_MODEL).trim();
  }

  get geminiEmbedConcurrency() {
    const value = Number(process.env.GEMINI_EMBED_CONCURRENCY || DEFAULT_GEMINI_EMBED_CONCURRENCY);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_GEMINI_EMBED_CONCURRENCY;
  }

  get geminiEmbedRetries() {
    const value = Number(process.env.GEMINI_EMBED_RETRIES || DEFAULT_GEMINI_EMBED_RETRIES);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_GEMINI_EMBED_RETRIES;
  }

  get geminiEmbedRetryBaseMs() {
    const value = Number(process.env.GEMINI_EMBED_RETRY_BASE_MS || DEFAULT_GEMINI_EMBED_RETRY_BASE_MS);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_GEMINI_EMBED_RETRY_BASE_MS;
  }

  get embedBatchSize() {
    const value = Number(process.env.EMBED_BATCH_SIZE || DEFAULT_EMBED_BATCH_SIZE);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_EMBED_BATCH_SIZE;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async embedTextWithGeminiWithRetry(text) {
    let attempt = 0;

    while (true) {
      try {
        const response = await axios.post(
          this.getGeminiEmbedUrl(),
          {
            content: {
              parts: [{ text }]
            }
          },
          {
            params: { key: this.geminiApiKey },
            headers: { 'Content-Type': 'application/json' }
          }
        );

        return response.data?.embedding?.values || [];
      } catch (error) {
        const status = error.response?.status;
        const retryable = status === 429 || status === 500 || status === 503;
        if (!retryable || attempt >= this.geminiEmbedRetries) {
          throw error;
        }

        const delayMs = this.geminiEmbedRetryBaseMs * Math.pow(2, attempt);
        attempt += 1;
        await this.sleep(delayMs);
      }
    }
  }

  requireGeminiApiKey() {
    const key = this.geminiApiKey;
    const looksPlaceholder = /^your[_-]?gemini[_-]?api[_-]?key/i.test(key) || /replace|placeholder|example/i.test(key);
    if (!key || looksPlaceholder) {
      throw new Error('Set a valid GEMINI_API_KEY in backend/.env when provider is "gemini".');
    }
  }

  formatAxiosError(error) {
    if (!error) {
      return 'Unknown request error';
    }

    const status = error.response?.status;
    const payload = error.response?.data;
    const message = error.message || 'Request failed';

    if (!status) {
      return message;
    }

    if (typeof payload === 'string' && payload.trim()) {
      return `HTTP ${status}: ${payload}`;
    }

    if (payload?.error?.message) {
      return `HTTP ${status}: ${payload.error.message}`;
    }

    return `HTTP ${status}: ${message}`;
  }

  isQuotaExceededError(error) {
    const status = error?.response?.status;
    const message = String(error?.response?.data?.error?.message || error?.message || '').toLowerCase();
    return status === 429 || message.includes('quota') || message.includes('rate limit');
  }

  buildExtractiveFallbackAnswer(query, chunks) {
    const queryTokens = new Set(
      tokenize(query)
        .filter((token) => !TOKEN_STOPWORDS.has(token))
        .filter((token) => token.length > 2)
    );
    const selectedChunks = (chunks || []).slice(0, 3);
    const lines = [];

    selectedChunks.forEach((chunk) => {
      const text = compactSpaces(chunk?.text || '');
      if (!text) {
        return;
      }

      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => compactSpaces(sentence))
        .filter(Boolean);
      const candidates = sentences.length > 0 ? sentences : [text];
      const best = candidates
        .map((sentence) => {
          const sentenceTokens = tokenize(sentence);
          const overlap = sentenceTokens.reduce(
            (count, token) => (queryTokens.has(token) ? count + 1 : count),
            0
          );
          return { sentence, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap)[0];

      lines.push((best?.sentence || text).slice(0, 320));
    });

    return {
      answer: lines.length > 0
        ? `Gemini quota is temporarily exhausted, so I used the retrieved document text directly:\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
        : 'Gemini quota is temporarily exhausted, and I could not build a fallback answer from the retrieved text.',
      citations: selectedChunks.map((chunk) => chunk.chunkId).filter(Boolean),
      quotaFallback: true
    };
  }

  getGeminiEmbedUrl() {
    return `${GEMINI_API_BASE}/models/${this.geminiEmbeddingModel}:embedContent`;
  }

  getGeminiGenerateUrl() {
    return `${GEMINI_API_BASE}/models/${this.geminiAnswerModel}:generateContent`;
  }

  getEmbeddingProviderTag() {
    return this.embeddingProvider;
  }

  cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
      return -1;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return -1;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  normalizeLocalEmbeddings(responseData) {
    if (Array.isArray(responseData?.embeddings)) {
      return responseData.embeddings;
    }
    if (Array.isArray(responseData?.embedding)) {
      return [responseData.embedding];
    }
    return [];
  }

  async embedTextsWithLocalModel(texts) {
    const response = await axios.post(
      this.localEmbeddingUrl,
      { texts },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return this.normalizeLocalEmbeddings(response.data);
  }

  async embedTextsWithGemini(texts) {
    this.requireGeminiApiKey();
    const vectors = new Array(texts.length);
    const concurrency = Math.min(this.geminiEmbedConcurrency, texts.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < texts.length) {
        const index = cursor;
        cursor += 1;

        vectors[index] = await this.embedTextWithGeminiWithRetry(texts[index]);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return vectors;
  }

  parseJSONSafely(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return null;
    }

    const jsonBlock = rawText.match(/```json\s*([\s\S]*?)```/i);
    const candidate = jsonBlock ? jsonBlock[1] : rawText;

    try {
      return JSON.parse(candidate.trim());
    } catch (_) {
      const objectMatch = candidate.match(/\{[\s\S]*\}/);
      if (!objectMatch) {
        return null;
      }

      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }
  }

  async embedQuery(text) {
    const vectors = await this.embedTexts([text]);
    return vectors[0] || [];
  }

  async embedTexts(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    const batchSize = this.embedBatchSize;
    const provider = this.embeddingProvider;
    const vectors = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      let batchVectors = [];

      if (provider === 'gemini') {
        batchVectors = await this.embedTextsWithGemini(batch);
      } else {
        batchVectors = await this.embedTextsWithLocalModel(batch);
      }

      vectors.push(...batchVectors);
    }

    return vectors;
  }

  async retrieveRelevantChunks(query, documents, topK = MAX_RETRIEVED_CHUNKS) {
    const retrievalQuery = buildRetrievalQuery(query);
    let queryEmbedding = [];
    try {
      queryEmbedding = await this.embedQuery(retrievalQuery);
    } catch (_) {
      queryEmbedding = [];
    }

    const exactTokens = getQuotedAndNumericTokens(retrievalQuery).map((token) => normalizeForMatch(token));
    const queryTokens = tokenize(retrievalQuery).filter((token) => !TOKEN_STOPWORDS.has(token));
    const queryTokenSet = new Set(queryTokens);
    const scoredChunks = [];

    documents.forEach((doc) => {
      (doc.structuredData || []).forEach((chunk) => {
        const text = normalizeForMatch(chunk.text);
        const chunkTokens = tokenize(chunk.text);
        const overlapCount = chunkTokens.reduce(
          (count, token) => (queryTokenSet.has(token) ? count + 1 : count),
          0
        );
        const lexicalScore = queryTokenSet.size > 0 ? (overlapCount / queryTokenSet.size) * LEXICAL_SCORE_WEIGHT : 0;
        const hasExactToken = exactTokens.some((token) => token && text.includes(token));
        const semanticScore = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        const baseScore = semanticScore > -1 ? Math.max(semanticScore, lexicalScore) : lexicalScore;
        const score = baseScore + (hasExactToken ? EXACT_MATCH_SCORE_BOOST : 0);

        if (score > 0) {
          scoredChunks.push({
            ...chunk,
            score,
            matchType: semanticScore > -1
              ? (hasExactToken ? 'exact+semantic' : 'semantic')
              : (hasExactToken ? 'exact+lexical' : 'lexical'),
            fileName: doc.fileName,
            originalName: doc.originalName || doc.fileName,
            startLine: chunk.startLine,
            endLine: chunk.endLine
          });
        }
      });
    });

    scoredChunks.sort((a, b) => b.score - a.score);
    return scoredChunks.slice(0, topK);
  }

  isRecordLookupQuery(query) {
    const lower = normalizeQueryForRetrieval(query);
    if (extractNumericTokens(lower).length > 0) {
      return true;
    }
    return RECORD_QUERY_HINTS.some((hint) => containsHint(lower, hint));
  }

  getRequestedPersonField(query) {
    const normalized = normalizeQueryForRetrieval(query);
    return PERSON_FIELD_LOOKUPS.find((field) => field.hints.some((hint) => containsHint(normalized, hint))) || null;
  }

  extractPersonNameFromQuery(query) {
    const raw = String(query || '');
    const normalizedRaw = normalizeQueryForRetrieval(query);
    const quotedName = getQuotedAndNumericTokens(raw).find((token) => /[a-z]/i.test(token) && !/\d/.test(token));
    if (quotedName) {
      return compactSpaces(quotedName);
    }

    const patterns = [
      /\bnamed\s+([a-z][a-z\s]{1,50})\??$/i,
      /\bstudent\s+named\s+([a-z][a-z\s]{1,50})\??$/i,
      /\bperson\s+named\s+([a-z][a-z\s]{1,50})\??$/i,
      /\bcustomer\s+named\s+([a-z][a-z\s]{1,50})\??$/i,
      /\bname\s*(?:is|:)?\s*([a-z][a-z\s]{1,50})\??$/i,
      /\bof\s+(?:student|person|customer|borrower)?\s*name\s*([a-z][a-z\s]{1,50})\??$/i,
      /\bof\s+(?:student|person|customer|borrower)?\s*([a-z][a-z\s]{1,50})\??$/i,
      /\bfor\s+(?:student|person|customer|borrower)?\s*([a-z][a-z\s]{1,50})\??$/i
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match || !match[1]) {
        continue;
      }

      const cleaned = compactSpaces(
        match[1]
          .replace(/[^a-z\s]/gi, ' ')
          .split(/\s+/)
          .filter((token) => token && !PERSON_LOOKUP_STOPWORDS.has(token.toLowerCase()))
          .slice(0, 3)
          .join(' ')
      );
      if (cleaned) {
        return cleaned;
      }
    }

    const fallbackNameTokens = tokenize(normalizedRaw)
      .filter((token) => !PERSON_LOOKUP_STOPWORDS.has(token))
      .filter((token) => !RECORD_QUERY_HINTS.includes(token))
      .filter((token) => !['what', 'which', 'how', 'many', 'student', 'name'].includes(token));

    if (fallbackNameTokens.length > 0) {
      return compactSpaces(fallbackNameTokens.slice(0, 3).join(' '));
    }

    return '';
  }

  getWindowAroundName(text, personName, left = 90, right = 220) {
    const compactText = compactSpaces(text);
    const normalizedText = normalizeForMatch(compactText);
    const normalizedName = normalizeForMatch(personName);
    const index = normalizedText.indexOf(normalizedName);
    if (index < 0) {
      return compactText;
    }
    const start = Math.max(0, index - left);
    const end = Math.min(compactText.length, index + normalizedName.length + right);
    return compactText.slice(start, end);
  }

  extractStudentTableRow(text, personName) {
    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return null;
    }

    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return null;
    }

    const rowPatterns = [
      new RegExp(`\\b\\d+\\s+[A-Z]{2,}\\s*-\\s*[A-Z]{2,}\\s+(\\d{1,3})\\s+(\\d{6,})\\s+${nameParts.join('\\s+')}\\s+(\\d{10})\\b`, 'i'),
      new RegExp(`\\b\\d+\\s+[A-Z]{2,}\\s*-\\s*[A-Z]{2,}\\s+(\\d{1,3})\\s+(\\d{6,})\\s+${nameParts[0]}(?:\\s+[A-Z][a-z]+)?\\s+(\\d{10})\\b`, 'i')
    ];

    for (const pattern of rowPatterns) {
      const match = compactText.match(pattern);
      if (match) {
        return {
          rollNo: match[1] || '',
          idNo: match[2] || '',
          mobile: match[3] || ''
        };
      }
    }

    return null;
  }

  extractMobileValue(text) {
    const mobileMatch = compactSpaces(text).match(/\b[6-9]\d{9}\b/);
    return mobileMatch ? mobileMatch[0] : '';
  }

  extractMobileValueForPerson(text, personName) {
    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return '';
    }

    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return '';
    }

    const fullNamePattern = new RegExp(`\\b${nameParts.join('\\s+')}\\b[\\s\\S]{0,90}?\\b([6-9]\\d{9})\\b`, 'i');
    const fullNameMatch = compactText.match(fullNamePattern);
    if (fullNameMatch && fullNameMatch[1]) {
      return fullNameMatch[1];
    }

    const firstNamePattern = new RegExp(`\\b${nameParts[0]}\\b[\\s\\S]{0,90}?\\b([6-9]\\d{9})\\b`, 'i');
    const firstNameMatch = compactText.match(firstNamePattern);
    if (firstNameMatch && firstNameMatch[1]) {
      return firstNameMatch[1];
    }

    const candidatePatterns = [
      new RegExp(`\\b${nameParts.join('\\s+')}\\b`, 'ig'),
      new RegExp(`\\b${nameParts[0]}\\b`, 'ig')
    ];

    for (const pattern of candidatePatterns) {
      const matches = [...compactText.matchAll(pattern)];
      for (const match of matches) {
        const nameIndex = match.index || 0;
        const lookBehind = compactText.slice(Math.max(0, nameIndex - 220), nameIndex);
        const phoneCandidates = [...lookBehind.matchAll(/(?:\+91[\s-]?)?([6-9]\d{9})\b/g)].map((item) => item[1]);
        if (phoneCandidates.length > 0) {
          return phoneCandidates[phoneCandidates.length - 1];
        }
      }
    }

    return '';
  }

  extractEmailValueForPerson(text, personName) {
    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return '';
    }
    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return '';
    }

    const emailPattern = '([a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,})';
    const fullNamePattern = new RegExp(`\\b${nameParts.join('\\s+')}\\b[\\s\\S]{0,120}?${emailPattern}`, 'i');
    const fullMatch = compactText.match(fullNamePattern);
    if (fullMatch && fullMatch[1]) {
      return fullMatch[1];
    }

    const firstNamePattern = new RegExp(`\\b${nameParts[0]}\\b[\\s\\S]{0,120}?${emailPattern}`, 'i');
    const firstMatch = compactText.match(firstNamePattern);
    if (firstMatch && firstMatch[1]) {
      return firstMatch[1];
    }

    return '';
  }

  extractGrNoForPerson(text, personName) {
    const row = this.extractStudentTableRow(text, personName);
    if (row?.idNo) {
      return row.idNo;
    }

    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return '';
    }
    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return '';
    }

    const candidatePatterns = [
      new RegExp(`\\b${nameParts.join('\\s+')}\\b`, 'ig'),
      new RegExp(`\\b${nameParts[0]}\\b`, 'ig')
    ];

    for (const pattern of candidatePatterns) {
      const matches = [...compactText.matchAll(pattern)];
      for (const match of matches) {
        const nameIndex = match.index || 0;
        const lookBehind = compactText.slice(Math.max(0, nameIndex - 60), nameIndex);
        const numericCandidates = [...lookBehind.matchAll(/\b\d{6,}\b/g)].map((item) => item[0]);
        if (numericCandidates.length > 0) {
          return numericCandidates[numericCandidates.length - 1];
        }
      }
    }

    return '';
  }

  extractPrnNoForPerson(text, personName) {
    const row = this.extractStudentTableRow(text, personName);
    if (row?.idNo) {
      return row.idNo;
    }

    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return '';
    }

    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return '';
    }

    const patterns = [
      new RegExp(`\\b(\\d{6,})\\b\\s+\\b${nameParts.join('\\s+')}\\b`, 'i'),
      new RegExp(`\\b(\\d{6,})\\b\\s+\\b${nameParts[0]}\\b`, 'i')
    ];

    for (const pattern of patterns) {
      const match = compactText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    const candidatePatterns = [
      new RegExp(`\\b${nameParts.join('\\s+')}\\b`, 'ig'),
      new RegExp(`\\b${nameParts[0]}\\b`, 'ig')
    ];

    for (const pattern of candidatePatterns) {
      const matches = [...compactText.matchAll(pattern)];
      for (const match of matches) {
        const nameIndex = match.index || 0;
        const lookBehind = compactText.slice(Math.max(0, nameIndex - 60), nameIndex);
        const numericCandidates = [...lookBehind.matchAll(/\b\d{6,}\b/g)].map((item) => item[0]);
        if (numericCandidates.length > 0) {
          return numericCandidates[numericCandidates.length - 1];
        }
      }
    }

    return '';
  }

  extractRollNoForPerson(text, personName) {
    const row = this.extractStudentTableRow(text, personName);
    if (row?.rollNo) {
      return row.rollNo;
    }

    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return '';
    }
    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return '';
    }

    const withGrPattern = new RegExp(`\\b(\\d{1,3})\\b\\s+\\d{6,}\\s+\\b${nameParts.join('\\s+')}\\b`, 'i');
    const withGrMatch = compactText.match(withGrPattern);
    if (withGrMatch && withGrMatch[1]) {
      return withGrMatch[1];
    }

    const labelPattern = new RegExp(`\\broll\\s*(?:no|number)?\\s*[:\\-]?\\s*([a-z0-9-]{1,12})\\b[\\s\\S]{0,80}?\\b${nameParts.join('\\s+')}\\b`, 'i');
    const labelMatch = compactText.match(labelPattern);
    if (labelMatch && labelMatch[1]) {
      return labelMatch[1];
    }

    return '';
  }

  extractLoanAmountValueForPerson(text, personName) {
    const compactText = compactSpaces(text);
    const normalizedName = compactSpaces(personName);
    if (!normalizedName) {
      return '';
    }
    const nameParts = normalizedName.split(/\s+/).filter(Boolean).map((part) => escapeRegExp(part));
    if (nameParts.length === 0) {
      return '';
    }

    const amountPattern = '(?:rs\\.?|inr|₹)?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)';
    const fullNameAmount = new RegExp(`\\b${nameParts.join('\\s+')}\\b[\\s\\S]{0,120}?\\b(?:loan\\s*amount|loan\\s*amt|sanction\\s*amount|amount|amt)?\\b\\s*[:\\-]?\\s*${amountPattern}`, 'i');
    const fullMatch = compactText.match(fullNameAmount);
    if (fullMatch && fullMatch[1]) {
      return fullMatch[1];
    }

    const firstNameAmount = new RegExp(`\\b${nameParts[0]}\\b[\\s\\S]{0,120}?\\b(?:loan\\s*amount|loan\\s*amt|sanction\\s*amount|amount|amt)?\\b\\s*[:\\-]?\\s*${amountPattern}`, 'i');
    const firstMatch = compactText.match(firstNameAmount);
    if (firstMatch && firstMatch[1]) {
      return firstMatch[1];
    }

    return this.extractLoanAmountValue(compactText);
  }

  extractLoanAmountValue(text) {
    const compactText = compactSpaces(text);
    const contextual = compactText.match(
      /\b(?:loan\s*amount|loan\s*amt|sanction\s*amount|amount|amt)\b\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
    );
    if (contextual && contextual[1]) {
      return contextual[1];
    }

    const currency = compactText.match(/\b(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    if (currency && currency[1]) {
      return currency[1];
    }

    const fallback = compactText.match(/\b\d{4,9}(?:\.\d{1,2})?\b/g) || [];
    const nonLikelyIds = fallback.find((token) => token.length >= 5 && token.length <= 9);
    return nonLikelyIds || '';
  }

  extractRequestedFieldValue(fieldKey, text, personName = '', fullText = '') {
    const sourceText = fullText || text;
    if (fieldKey === 'mobile') {
      return personName ? this.extractMobileValueForPerson(sourceText, personName) : this.extractMobileValue(text);
    }
    if (fieldKey === 'email') {
      return personName ? this.extractEmailValueForPerson(sourceText, personName) : '';
    }
    if (fieldKey === 'roll_no') {
      return personName ? this.extractRollNoForPerson(sourceText, personName) : '';
    }
    if (fieldKey === 'gr_no') {
      return personName ? this.extractGrNoForPerson(sourceText, personName) : '';
    }
    if (fieldKey === 'prn_no') {
      return personName ? this.extractPrnNoForPerson(sourceText, personName) : '';
    }
    if (fieldKey === 'loan_amount') {
      return personName ? this.extractLoanAmountValueForPerson(sourceText, personName) : this.extractLoanAmountValue(text);
    }
    return '';
  }

  buildPersonFieldLookupAnswer(field, personName, value) {
    const displayName = toDisplayName(personName) || personName;
    if (field.key === 'mobile') {
      return `Mobile number of ${displayName} is ${value}.`;
    }
    if (field.key === 'loan_amount') {
      return `Loan amount of ${displayName} is ${value}.`;
    }
    if (field.key === 'email') {
      return `Email ID of ${displayName} is ${value}.`;
    }
    if (field.key === 'roll_no') {
      return `Roll number of ${displayName} is ${value}.`;
    }
    if (field.key === 'gr_no') {
      return `GR number of ${displayName} is ${value}.`;
    }
    if (field.key === 'prn_no') {
      return `PRN number of ${displayName} is ${value}.`;
    }
    return `${field.label} of ${displayName} is ${value}.`;
  }

  findPersonFieldLookupMatch(query, documents) {
    const field = this.getRequestedPersonField(query);
    if (!field) {
      return null;
    }

    const personName = this.extractPersonNameFromQuery(query);
    if (!personName) {
      return null;
    }

    const personTokens = tokenize(personName);
    if (personTokens.length === 0) {
      return null;
    }

    const scoredMatches = [];

      documents.forEach((doc) => {
        (doc.structuredData || []).forEach((chunk) => {
          const chunkText = String(chunk.text || '');
          const normalizedChunk = normalizeForMatch(chunkText);
          const hasName = personTokens.every((token) => normalizedChunk.includes(token));
        if (!hasName) {
          return;
        }

          const nearbyText = this.getWindowAroundName(chunkText, personName);
          const valueNearName = this.extractRequestedFieldValue(field.key, nearbyText, personName, chunkText);
          const valueFromChunk = valueNearName || this.extractRequestedFieldValue(field.key, chunkText, personName, chunkText);
          if (!valueFromChunk) {
            return;
          }

          const hasTableHeaders =
            (field.key === 'gr_no' || field.key === 'prn_no' || field.key === 'roll_no') &&
            /\bgr\.?\s*no\b/i.test(chunkText) &&
            /\broll\s*no\b/i.test(chunkText);
          const hasStudentTableRow = Boolean(this.extractStudentTableRow(chunkText, personName));
          const score = 2
            + personTokens.length
            + (valueNearName ? 0.5 : 0)
            + (hasTableHeaders ? 1.25 : 0)
            + (hasStudentTableRow ? 1.5 : 0);
          scoredMatches.push({
            field,
            personName,
            value: valueFromChunk,
          score,
          chunk,
          fileName: doc.fileName,
          originalName: doc.originalName || doc.fileName
        });
      });
    });

    scoredMatches.sort((a, b) => b.score - a.score);
    return scoredMatches[0] || null;
  }

  isExplicitPersonFieldQuery(query) {
    return Boolean(this.getRequestedPersonField(query) && this.extractPersonNameFromQuery(query));
  }

  getRequestedGdsField(query) {
    const normalized = normalizeQueryForRetrieval(query);
    const { postId, registrationNo } = this.extractGdsLookupIdentifiers(query);
    if (registrationNo && (containsHint(normalized, 'post id') || containsHint(normalized, 'postid'))) {
      return { key: 'postId', label: 'post ID', hints: ['post id', 'postid'] };
    }

    if (postId && containsHint(normalized, 'registration')) {
      return { key: 'registrationNo', label: 'registration number', hints: ['registration', 'registration no', 'reg no'] };
    }

    const fields = [
      { key: 'marks', label: 'marks', hints: ['marks', 'percentage', '%'] },
      { key: 'community', label: 'post community', hints: ['community', 'post community', 'category'] },
      { key: 'division', label: 'division', hints: ['division', 'division name'] },
      { key: 'office', label: 'office', hints: ['office', 'office name'] },
      { key: 'postName', label: 'post name', hints: ['post name'] },
      { key: 'serialNo', label: 'serial number', hints: ['serial', 's no', 's.no'] },
      { key: 'registrationNo', label: 'registration number', hints: ['registration', 'registration no', 'reg no'] },
      { key: 'postId', label: 'post ID', hints: ['post id', 'postid'] }
    ];

    return fields.find((field) => field.hints.some((hint) => containsHint(normalized, hint))) || null;
  }

  extractGdsLookupIdentifiers(query) {
    const postId = extractNumericTokens(query).find((token) => token.length >= 5 && token.length <= 12) || '';
    const registrationNo = (String(query || '').match(/\b[A-Z]\d{8,}\b/i) || [])[0] || '';
    return { postId, registrationNo };
  }

  parseGdsRowsFromText(text, meta = {}) {
    const compactText = compactSpaces(text);
    if (!compactText || !/\bDivision\b/i.test(compactText) || !/\b(?:BPM|ABPM|Daksevak|Dak\s+Sevak)\b/i.test(compactText)) {
      return [];
    }

    const rowPattern = /(?:^|\s)(\d{1,5})\s+([A-Z][A-Za-z ]{1,80}?\s+Division)\s+(.+?)\s+(\d[\d\s_-]{6,}\d)\s+(BPM|ABPM|Daksevak|Dak\s+Sevak)\s+(UR|OBC|SC|ST|EWS|PWD(?:-[A-Z]+)?)\s+([A-Z]\d{8,})\s+(\d+(?:\.\d+)?)/gi;
    const rows = [];
    let match;

    while ((match = rowPattern.exec(compactText)) !== null) {
      const postId = String(match[4] || '').replace(/\D/g, '');
      if (!postId) {
        continue;
      }

      rows.push({
        ...meta,
        serialNo: compactSpaces(match[1]),
        division: compactSpaces(match[2]),
        office: compactSpaces(match[3]),
        postId,
        postName: compactSpaces(match[5]).replace(/\s+/g, ' '),
        community: compactSpaces(match[6]),
        registrationNo: compactSpaces(match[7]),
        marks: compactSpaces(match[8]),
        text: compactSpaces(match[0])
      });
    }

    return rows;
  }

  findGdsTableLookup(query, documents) {
    const field = this.getRequestedGdsField(query);
    const { postId, registrationNo } = this.extractGdsLookupIdentifiers(query);
    if (!field || (!postId && !registrationNo)) {
      return null;
    }

    for (const doc of documents || []) {
      const pages = Array.isArray(doc.pages) && doc.pages.length > 0
        ? doc.pages
        : Array.from(new Map((doc.structuredData || []).map((chunk) => [chunk.page, { page: chunk.page }])).values());

      for (const page of pages) {
        const pageNumber = Number(page.page) || 0;
        const pageText = page.text || (doc.structuredData || [])
          .filter((chunk) => Number(chunk.page) === pageNumber)
          .sort((a, b) => (Number(a.paragraph) || 0) - (Number(b.paragraph) || 0))
          .map((chunk) => chunk.text)
          .join(' ');
        const rows = this.parseGdsRowsFromText(pageText, {
          fileName: doc.fileName,
          originalName: doc.originalName || doc.fileName,
          page: pageNumber
        });
        const row = rows.find((candidate) =>
          (postId && candidate.postId === postId) ||
          (registrationNo && candidate.registrationNo.toLowerCase() === registrationNo.toLowerCase())
        );
        if (!row) {
          continue;
        }

        const matchedBy = postId && row.postId === postId ? 'postId' : 'registrationNo';

        const sourceChunk = (doc.structuredData || []).find((chunk) =>
          Number(chunk.page) === pageNumber && (
            includesLooseNumericToken(chunk.text, row.postId) ||
            String(chunk.text || '').toLowerCase().includes(row.registrationNo.toLowerCase())
          )
        ) || (doc.structuredData || []).find((chunk) => Number(chunk.page) === pageNumber) || {};

        return {
          field,
          row: { ...row, matchedBy },
          source: {
            chunkId: sourceChunk.chunkId || `${doc.fileName || row.originalName}::p${pageNumber}::gds-row-${row.serialNo}`,
            fileName: doc.fileName,
            originalName: doc.originalName || doc.fileName,
            page: pageNumber,
            paragraph: sourceChunk.paragraph || '-',
            startLine: sourceChunk.startLine,
            endLine: sourceChunk.endLine,
            text: sourceChunk.text || row.text,
            score: 10,
            matchType: 'gds_table_lookup'
          }
        };
      }
    }

    return null;
  }

  buildGdsTableLookupAnswer(lookup) {
    const { field, row } = lookup;
    const identifier = row.matchedBy === 'registrationNo'
      ? `registration number ${row.registrationNo}`
      : row.postId
      ? `post ID ${row.postId}`
      : `registration number ${row.registrationNo}`;
    const value = row[field.key];

    if (!value) {
      return 'I could not find this exact field in the uploaded documents.';
    }

    const verb = field.key === 'marks' ? 'are' : 'is';
    return `The ${field.label} for ${identifier} ${verb} ${value}.`;
  }

  findExactRecordMatches(query, documents, topK = MAX_RECORD_MATCHES) {
    const retrievalQuery = buildRetrievalQuery(query);
    const normalizedQuery = normalizeQueryForRetrieval(query);
    const quotedTokens = getQuotedAndNumericTokens(retrievalQuery).map((token) => normalizeForMatch(token));
    const numericTokens = extractNumericTokens(retrievalQuery);
    const queryKeywords = tokenize(retrievalQuery).filter((token) => !TOKEN_STOPWORDS.has(token));
    const queryKeywordSet = new Set(queryKeywords);
    const queryRecordHints = RECORD_QUERY_HINTS.filter((hint) => containsHint(normalizedQuery, hint));

    const matches = [];

    documents.forEach((doc) => {
      (doc.structuredData || []).forEach((chunk) => {
        const chunkText = String(chunk.text || '');
        const normalizedChunk = normalizeForMatch(chunkText);
        const chunkTokens = tokenize(chunkText);

        const exactHits = quotedTokens.filter((token) => token && normalizedChunk.includes(token));
        const matchedNumeric = numericTokens.filter((token) => includesLooseNumericToken(normalizedChunk, token));
        const keywordOverlap = chunkTokens.reduce(
          (count, token) => (queryKeywordSet.has(token) ? count + 1 : count),
          0
        );
        const lexicalScore = queryKeywordSet.size > 0 ? (keywordOverlap / queryKeywordSet.size) : 0;

        const hintHits = queryRecordHints.filter((hint) => containsHint(normalizedChunk, hint));
        const looksLikeRecordLine =
          /\b(roll|account|loan|post|id|a\/c|ifsc|pan|aadhaar)\b[\s._-]*(no|number|#|:)?/i.test(chunkText);

        let score = 0;
        score += exactHits.length * 0.9;
        score += matchedNumeric.length * 1.25;
        score += lexicalScore;
        score += hintHits.length * RECORD_MATCH_FIELD_BOOST;
        if (looksLikeRecordLine) {
          score += 0.45;
        }

        const hasIdentifierQuery = numericTokens.length > 0 || quotedTokens.length > 0;
        const hasIdentifierHit = matchedNumeric.length > 0 || exactHits.length > 0;
        const hasStrongSignal = hasIdentifierQuery
          ? hasIdentifierHit
          : (
              hintHits.length > 0 ||
              (looksLikeRecordLine && lexicalScore >= 0.25)
            );

        if (hasStrongSignal && score >= MIN_RECORD_SCORE) {
          matches.push({
            ...chunk,
            score,
            matchType: 'record_lookup',
            matchedNumeric,
            matchedKeywords: hintHits,
            fileName: doc.fileName,
            originalName: doc.originalName || doc.fileName,
            startLine: chunk.startLine,
            endLine: chunk.endLine
          });
        }
      });
    });

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, topK);
  }

  cleanGdsPostName(value) {
    return compactSpaces(value)
      .replace(/\b(Post\s*Name|Post\s*Community|Community|Registration|Reg\.?\s*No|Marks|Percentage|Post\s*ID)\b.*$/i, '')
      .replace(/^[\s:|,.-]+|[\s:|,.-]+$/g, '')
      .trim();
  }

  extractPostNameForPostId(text, postId) {
    const sourceText = compactSpaces(text);
    const loosePostIdPattern = buildLooseNumericPattern(postId);
    const loosePostId = String(postId || '').replace(/\D/g, '').split('').join('[\\s_-]*');
    if (!sourceText || !loosePostIdPattern || !loosePostIdPattern.test(sourceText)) {
      return '';
    }

    const communityPattern = '(UR|OBC|SC|ST|EWS|PWD(?:-[A-Z]+)?)';
    const postNameChars = "[A-Za-z0-9][A-Za-z0-9()\\/&.,' -]{1,140}?";
    const afterPostIdPatterns = [
      new RegExp(`(?<!\\d)${loosePostId}(?!\\d)\\s+(?:Post\\s*Name\\s*[:\\-]?\\s*)?(${postNameChars})\\s+${communityPattern}\\b`, 'i'),
      new RegExp(`(?<!\\d)${loosePostId}(?!\\d)\\s+(?:Post\\s*Name\\s*[:\\-]?\\s*)?(${postNameChars})(?=\\s+(?:Registration|Reg\\.?\\s*No|Marks|Percentage|\\d+(?:\\.\\d+)?|$))`, 'i')
    ];

    for (const pattern of afterPostIdPatterns) {
      const match = sourceText.match(pattern);
      const postName = this.cleanGdsPostName(match?.[1] || '');
      if (postName) {
        return postName;
      }
    }

    const beforePostIdPatterns = [
      new RegExp(`\\b(?:B\\.?O\\.?|S\\.?O\\.?|H\\.?O\\.?)\\s+(${postNameChars})\\s+${communityPattern}\\b[\\s\\S]{0,160}(?<!\\d)${loosePostId}(?!\\d)`, 'i'),
      new RegExp(`\\bPost\\s*Name\\s*[:\\-]?\\s*(${postNameChars})\\s+(?:Post\\s*Community\\s*)?${communityPattern}\\b[\\s\\S]{0,180}(?<!\\d)${loosePostId}(?!\\d)`, 'i')
    ];

    for (const pattern of beforePostIdPatterns) {
      const match = sourceText.match(pattern);
      const postName = this.cleanGdsPostName(match?.[1] || '');
      if (postName) {
        return postName;
      }
    }

    return '';
  }

  getDirectGdsRecordAnswer(query, matches) {
    const normalizedQuery = normalizeQueryForRetrieval(query);
    const wantsPostName = containsHint(normalizedQuery, 'post name');
    const wantsPostId = containsHint(normalizedQuery, 'post id') || containsHint(normalizedQuery, 'postid');
    const wantsOffice = containsHint(normalizedQuery, 'office');
    const wantsDivision = containsHint(normalizedQuery, 'division');
    const wantsCommunity = containsHint(normalizedQuery, 'community');
    const wantsMarks = containsHint(normalizedQuery, 'marks') || containsHint(normalizedQuery, 'percentage');
    const postId = extractNumericTokens(query).find((token) => token.length >= 5);
    const registrationNo = (String(query || '').match(/\b[A-Z]\d{8,}\b/i) || [])[0];

    const parseGdsRow = (match, criteria = {}) => {
      const text = String(match.text || '');
      const escapedRegistrationNo = criteria.registrationNo
        ? criteria.registrationNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : '[A-Z]\\d{8,}';
      const escapedPostId = criteria.postId
        ? criteria.postId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : '\\d{8}';
      const pattern = new RegExp(
        `(?:^|\\s)(\\d{1,5})\\s+([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){0,4}\\s+Division)\\s+(.+?)\\s+(${escapedPostId})\\s+(.+?)\\s+(UR|OBC|SC|ST|EWS|PWD(?:-[A-Z]+)?)\\s+(${escapedRegistrationNo})\\s+(\\d+(?:\\.\\d+)?)`,
        'i'
      );
      const found = text.match(pattern);
      if (!found) {
        return null;
      }

      return {
        ...match,
        serialNo: found[1].trim(),
        division: found[2].trim(),
        office: found[3].trim(),
        postId: found[4].trim(),
        postName: found[5].trim(),
        community: found[6].trim(),
        registrationNo: found[7].trim(),
        marks: found[8].trim()
      };
    };

    if (wantsPostName && postId) {
      const rowMatch = matches
        .map((match) => {
          const postName = this.extractPostNameForPostId(match.text, postId);
          return postName ? { ...match, postName } : null;
        })
        .find(Boolean);

      if (rowMatch) {
        return `The post name for post ID ${postId} is ${rowMatch.postName}.`;
      }
    }

    if (registrationNo && (wantsPostId || wantsPostName || wantsOffice || wantsDivision || wantsCommunity || wantsMarks)) {
      const rowMatch = matches
        .map((match) => parseGdsRow(match, { registrationNo }))
        .find(Boolean);

      if (rowMatch) {
        if (wantsPostId) {
          return `The post ID for registration number ${registrationNo} is ${rowMatch.postId}.`;
        }
        if (wantsOffice) {
          return `The office for registration number ${registrationNo} is ${rowMatch.office}.`;
        }
        if (wantsDivision) {
          return `The division for registration number ${registrationNo} is ${rowMatch.division}.`;
        }
        if (wantsPostName) {
          return `The post name for registration number ${registrationNo} is ${rowMatch.postName}.`;
        }
        if (wantsCommunity) {
          return `The post community for registration number ${registrationNo} is ${rowMatch.community}.`;
        }
        if (wantsMarks) {
          return `The marks for registration number ${registrationNo} are ${rowMatch.marks}.`;
        }
      }
    }

    return '';
  }

  buildRecordLookupAnswer(query, matches) {
    const directAnswer = this.getDirectGdsRecordAnswer(query, matches);
    if (directAnswer) {
      return directAnswer;
    }

    const lines = [
      `Found ${matches.length} matching record${matches.length === 1 ? '' : 's'} for: "${query}".`
    ];

    matches.slice(0, 5).forEach((match, index) => {
      const location = [
        `page ${match.page}`,
        `para ${match.paragraph}`,
        (match.startLine && match.endLine)
          ? `line ${match.startLine}${match.endLine !== match.startLine ? `-${match.endLine}` : ''}`
          : null
      ].filter(Boolean).join(', ');
      lines.push(`${index + 1}. ${match.originalName} (${location}) -> ${String(match.text || '').slice(0, 180)}`);
    });

    return lines.join('\n');
  }

  async generateDirectRecordAnswer(query, matches) {
    const directAnswer = this.getDirectGdsRecordAnswer(query, matches);
    if (directAnswer) {
      return {
        answer: directAnswer,
        citations: matches[0]?.chunkId ? [matches[0].chunkId] : []
      };
    }

    const topMatches = matches.slice(0, 3);
    const context = topMatches
      .map((chunk) =>
        `[${chunk.chunkId}] [${chunk.originalName} - Page ${chunk.page}, Para ${chunk.paragraph}] ${chunk.text}`
      )
      .join('\n\n');
    const prompt = [
      'You answer exact field-lookup questions from document table rows.',
      'Use ONLY the provided matched row/context text.',
      'Return one concise answer, not a list of matches.',
      'If the requested value is present, answer in this style: "The <field> for <identifier> is <value>."',
      'If the requested value cannot be identified from the context, answer exactly: "I could not find this in the uploaded documents."',
      'Return STRICT JSON only with this schema:',
      '{"answer":"string","citations":["chunkId1"]}',
      '',
      `Question: ${query}`,
      '',
      `Matched context:\n${context}`
    ].join('\n');

    let rawText = '';
    try {
      if (this.answerProvider === 'gemini') {
        this.requireGeminiApiKey();
        const response = await axios.post(
          this.getGeminiGenerateUrl(),
          {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json'
            }
          },
          {
            params: { key: this.geminiApiKey },
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          }
        );
        rawText = response.data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
      } else {
        const response = await axios.post(
          this.localAnswerUrl,
          {
            model: this.localAnswerModel,
            prompt,
            stream: false,
            format: 'json'
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          }
        );
        rawText = response.data?.response || '';
      }
    } catch (error) {
      if (!this.isQuotaExceededError(error)) {
        throw error;
      }

      return {
        answer: this.buildRecordLookupAnswer(query, matches),
        citations: topMatches.map((match) => match.chunkId).filter(Boolean),
        quotaFallback: true
      };
    }

    const parsed = this.parseJSONSafely(rawText);
    if (parsed?.answer) {
      return {
        answer: parsed.answer,
        citations: Array.isArray(parsed.citations) ? parsed.citations : []
      };
    }

    return {
      answer: this.buildRecordLookupAnswer(query, matches),
      citations: topMatches.map((match) => match.chunkId).filter(Boolean)
    };
  }

  async generateAnswerWithCitations(query, retrievedChunks) {
    const context = retrievedChunks
      .map(
        (chunk) =>
          `[${chunk.chunkId}] [${chunk.originalName} - Page ${chunk.page}, Para ${chunk.paragraph}, Lines ${chunk.startLine || '-'}-${chunk.endLine || '-'}] ${chunk.text}`
      )
      .join('\n\n');

    const prompt = [
      'You are a multilingual document QA assistant.',
      'Answer ONLY using the given context chunks.',
      'Use the same language as the question unless the user asks another language.',
      'If answer is not in context, reply with: "I could not find this in the uploaded documents."',
      'Return STRICT JSON only with this schema:',
      '{"answer":"string","citations":["chunkId1","chunkId2"]}',
      '',
      `Question: ${query}`,
      '',
      `Context chunks:\n${context}`
    ].join('\n');

    const provider = this.answerProvider;
    let rawText = '';

    try {
      if (provider === 'gemini') {
        this.requireGeminiApiKey();
        const response = await axios.post(
          this.getGeminiGenerateUrl(),
          {
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          },
          {
            params: { key: this.geminiApiKey },
            headers: { 'Content-Type': 'application/json' }
          }
        );

        rawText = response.data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
      } else {
        const response = await axios.post(
          this.localAnswerUrl,
          {
            model: this.localAnswerModel,
            prompt,
            stream: false,
            format: 'json'
          },
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );

        rawText = response.data?.response || '';
      }
    } catch (error) {
      if (this.isQuotaExceededError(error)) {
        return this.buildExtractiveFallbackAnswer(query, retrievedChunks);
      }
      throw error;
    }

    return this.parseJSONSafely(rawText) || {
      answer: rawText || 'No answer generated.',
      citations: []
    };
  }

  async healthCheck() {
    const embeddingProvider = this.embeddingProvider;
    const answerProvider = this.answerProvider;
    const status = {
      embeddingProvider,
      answerProvider,
      embeddingApi: embeddingProvider === 'gemini'
        ? { ok: false, provider: 'gemini', model: this.geminiEmbeddingModel }
        : { ok: false, provider: 'local', url: this.localEmbeddingUrl },
      answerApi: answerProvider === 'gemini'
        ? { ok: false, provider: 'gemini', model: this.geminiAnswerModel }
        : { ok: false, provider: 'local', url: this.localAnswerUrl, model: this.localAnswerModel }
    };

    try {
      let vectors = [];
      if (embeddingProvider === 'gemini') {
        this.requireGeminiApiKey();
        vectors = await this.embedTextsWithGemini(['health check']);
      } else {
        const embedResponse = await axios.post(
          this.localEmbeddingUrl,
          { texts: ['health check'] },
          { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );
        vectors = this.normalizeLocalEmbeddings(embedResponse.data);
      }
      status.embeddingApi.ok = Array.isArray(vectors) && vectors.length === 1 && Array.isArray(vectors[0]) && vectors[0].length > 0;
    } catch (error) {
      status.embeddingApi.error = this.formatAxiosError(error);
    }

    try {
      if (answerProvider === 'gemini') {
        this.requireGeminiApiKey();
        status.answerApi.ok = true;
        status.answerApi.skippedLiveCheck = true;
      } else {
        const answerResponse = await axios.post(
          this.localAnswerUrl,
          {
            model: this.localAnswerModel,
            prompt: 'Return {"answer":"ok","citations":[]} in JSON.',
            stream: false,
            format: 'json'
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        status.answerApi.ok = Boolean(answerResponse.data?.response);
      }
    } catch (error) {
      status.answerApi.error = this.formatAxiosError(error);
    }

    status.ok = status.embeddingApi.ok && status.answerApi.ok;
    return status;
  }

  async searchDocuments(query, documents) {
    try {
      const orderedDocuments = this.sortDocumentsByUploadOrder(documents);
      const labeledFieldQuery = this.getLabeledFieldQueryConfig(query);
      const isProjectTitleQuestion = this.isProjectTitleQuery(query);
      const isInternalGuideQuestion = this.isInternalGuideQuery(query);
      const isGroupNoQuestion = this.isGroupNoQuery(query);
      const isSubjectQuery = this.isSubjectNameQuery(query);
      const isTechStackQuestion = this.isTechStackQuery(query);

      if (labeledFieldQuery) {
        for (const doc of orderedDocuments) {
          const fieldMatch = this.extractLabeledFieldFromChunks(doc.structuredData || [], labeledFieldQuery);
          if (!fieldMatch) {
            continue;
          }

          return {
            answer: labeledFieldQuery.answer(fieldMatch.value),
            sources: [{
              chunkId: fieldMatch.chunk.chunkId,
              fileName: doc.fileName,
              originalName: doc.originalName || doc.fileName,
              page: fieldMatch.chunk.page,
              paragraph: fieldMatch.chunk.paragraph,
              startLine: fieldMatch.chunk.startLine,
              endLine: fieldMatch.chunk.endLine,
              text: fieldMatch.chunk.text,
              score: 1.98,
              matchType: `${labeledFieldQuery.key}_lookup`
            }],
            retrievedCount: 1,
            matchStrategy: `${labeledFieldQuery.key}_lookup`,
            matchedDocument: doc.originalName || doc.fileName
          };
        }
      }

      if (isGroupNoQuestion) {
        for (const doc of orderedDocuments) {
          const group = this.extractGroupNoFromChunks(doc.structuredData || []);
          if (!group) {
            continue;
          }

          return {
            answer: `The group number is ${group.groupNo}.`,
            sources: [{
              chunkId: group.chunk.chunkId,
              fileName: doc.fileName,
              originalName: doc.originalName || doc.fileName,
              page: group.chunk.page,
              paragraph: group.chunk.paragraph,
              startLine: group.chunk.startLine,
              endLine: group.chunk.endLine,
              text: group.chunk.text,
              score: 1.97,
              matchType: 'group_no_lookup'
            }],
            retrievedCount: 1,
            matchStrategy: 'group_no_lookup',
            matchedDocument: doc.originalName || doc.fileName
          };
        }
      }

      if (isInternalGuideQuestion) {
        for (const doc of orderedDocuments) {
          const guide = this.extractInternalGuideDetailsFromChunks(doc.structuredData || []);
          if (!guide) {
            continue;
          }

          const answerParts = [];
          if (guide.name) {
            answerParts.push(`Internal guide is ${guide.name}.`);
          }
          if (guide.mobile && guide.email) {
            answerParts.push(`Contact number is ${guide.mobile} and email ID is ${guide.email}.`);
          } else if (guide.mobile) {
            answerParts.push(`Contact number is ${guide.mobile}.`);
          } else if (guide.email) {
            answerParts.push(`Email ID is ${guide.email}.`);
          }

          return {
            answer: answerParts.join(' '),
            sources: [{
              chunkId: guide.chunk.chunkId,
              fileName: doc.fileName,
              originalName: doc.originalName || doc.fileName,
              page: guide.chunk.page,
              paragraph: guide.chunk.paragraph,
              startLine: guide.chunk.startLine,
              endLine: guide.chunk.endLine,
              text: guide.chunk.text,
              score: 1.96,
              matchType: 'internal_guide_lookup'
            }],
            retrievedCount: 1,
            matchStrategy: 'internal_guide_lookup',
            matchedDocument: doc.originalName || doc.fileName
          };
        }
      }

      if (isProjectTitleQuestion) {
        for (const doc of orderedDocuments) {
          const project = this.extractProjectTitleFromChunks(doc.structuredData || []);
          if (!project) {
            continue;
          }

          return {
            answer: `The project title is ${project.projectTitle}.`,
            sources: [{
              chunkId: project.chunk.chunkId,
              fileName: doc.fileName,
              originalName: doc.originalName || doc.fileName,
              page: project.chunk.page,
              paragraph: project.chunk.paragraph,
              startLine: project.chunk.startLine,
              endLine: project.chunk.endLine,
              text: project.chunk.text,
              score: 1.95,
              matchType: 'project_title_lookup'
            }],
            retrievedCount: 1,
            matchStrategy: 'project_title_lookup',
            matchedDocument: doc.originalName || doc.fileName
          };
        }
      }

      if (isSubjectQuery) {
        for (const doc of orderedDocuments) {
          const subject = this.extractSubjectNameFromChunks(doc.structuredData || []);
          if (!subject) {
            continue;
          }

          const subjectLabel = subject.subjectCode
            ? `${subject.subjectName} (${subject.subjectCode})`
            : subject.subjectName;

          return {
            answer: `The subject name is ${subjectLabel}.`,
            sources: [{
              chunkId: subject.chunk.chunkId,
              fileName: doc.fileName,
              originalName: doc.originalName || doc.fileName,
              page: subject.chunk.page,
              paragraph: subject.chunk.paragraph,
              startLine: subject.chunk.startLine,
              endLine: subject.chunk.endLine,
              text: subject.chunk.text,
              score: 1.9,
              matchType: 'subject_lookup'
            }],
            retrievedCount: 1,
            matchStrategy: 'subject_lookup',
            matchedDocument: doc.originalName || doc.fileName
          };
        }
      }

      if (isTechStackQuestion) {
        for (const doc of orderedDocuments) {
          const stack = this.extractTechStackFromChunks(doc.structuredData || []);
          if (!stack) {
            continue;
          }

          return {
            answer: `The project uses ${stack.technologies.join(', ')}.`,
            sources: stack.chunks.map((chunk) => ({
              chunkId: chunk.chunkId,
              fileName: doc.fileName,
              originalName: doc.originalName || doc.fileName,
              page: chunk.page,
              paragraph: chunk.paragraph,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              text: chunk.text,
              score: 1.88,
              matchType: 'tech_stack_lookup'
            })),
            retrievedCount: stack.chunks.length,
            matchStrategy: 'tech_stack_lookup',
            matchedDocument: doc.originalName || doc.fileName
          };
        }
      }

      const isRecordQuery = this.isRecordLookupQuery(query);
      if (isRecordQuery) {
        const gdsLookup = this.findGdsTableLookup(query, orderedDocuments);
        if (gdsLookup) {
          return {
            answer: this.buildGdsTableLookupAnswer(gdsLookup),
            sources: [gdsLookup.source],
            retrievedCount: 1,
            matchStrategy: 'gds_table_lookup',
            matchedDocument: gdsLookup.source.originalName || gdsLookup.source.fileName
          };
        }

        const specificRecord = this.findPersonFieldLookupMatch(query, orderedDocuments);
        if (specificRecord) {
          const sourceChunk = specificRecord.chunk;
          return {
            answer: this.buildPersonFieldLookupAnswer(
              specificRecord.field,
              specificRecord.personName,
              specificRecord.value
            ),
            sources: [{
              chunkId: sourceChunk.chunkId,
              fileName: specificRecord.fileName,
              originalName: specificRecord.originalName,
              page: sourceChunk.page,
              paragraph: sourceChunk.paragraph,
              startLine: sourceChunk.startLine,
              endLine: sourceChunk.endLine,
              text: sourceChunk.text,
              score: specificRecord.score,
              matchType: 'person_field_lookup'
            }],
            retrievedCount: 1,
            matchStrategy: 'person_field_lookup',
            matchedDocument: specificRecord.originalName || specificRecord.fileName
          };
        }

        if (this.isExplicitPersonFieldQuery(query)) {
          return {
            answer: 'I could not find this exact person field reliably in the uploaded documents.',
            sources: [],
            retrievedCount: 0,
            matchStrategy: 'person_field_not_found'
          };
        }

        const recordMatches = this.findExactRecordMatches(query, orderedDocuments);
        if (recordMatches.length > 0) {
          const topMatch = recordMatches[0];
          const recordAnswer = await this.generateDirectRecordAnswer(query, recordMatches);
          const citedIds = new Set(
            Array.isArray(recordAnswer.citations) && recordAnswer.citations.length > 0
              ? recordAnswer.citations
              : [topMatch.chunkId]
          );
          const sourceMatches = recordMatches.filter((chunk) => citedIds.has(chunk.chunkId));

          return {
            answer: recordAnswer.answer,
            sources: (sourceMatches.length > 0 ? sourceMatches : [topMatch]).map((chunk) => ({
              chunkId: chunk.chunkId,
              fileName: chunk.fileName,
              originalName: chunk.originalName,
              page: chunk.page,
              paragraph: chunk.paragraph,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              text: chunk.text,
              score: chunk.score,
              matchType: chunk.matchType
            })),
            retrievedCount: recordMatches.length,
            matchStrategy: 'record_lookup',
            matchedDocument: topMatch.originalName || topMatch.fileName
          };
        }
      }

      const retrievedChunks = await this.retrieveRelevantChunks(query, orderedDocuments);

      if (retrievedChunks.length > 0) {
        const modelOutput = await this.generateAnswerWithCitations(query, retrievedChunks);
        const answer = modelOutput.answer || 'No answer generated.';

        if (!this.isNoAnswerResponse(answer)) {
          const citations = Array.isArray(modelOutput.citations) ? modelOutput.citations : [];
          const chunkById = new Map(retrievedChunks.map((chunk) => [chunk.chunkId, chunk]));

          const sources = citations
            .map((chunkId) => chunkById.get(chunkId))
            .filter(Boolean)
            .map((chunk) => ({
              chunkId: chunk.chunkId,
              fileName: chunk.fileName,
              originalName: chunk.originalName,
              page: chunk.page,
              paragraph: chunk.paragraph,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              text: chunk.text,
              score: chunk.score,
              matchType: chunk.matchType
            }));

          const fallbackSources = sources.length > 0
            ? sources
            : retrievedChunks.slice(0, 3).map((chunk) => ({
                chunkId: chunk.chunkId,
                fileName: chunk.fileName,
                originalName: chunk.originalName,
                page: chunk.page,
                paragraph: chunk.paragraph,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                text: chunk.text,
                score: chunk.score,
                matchType: chunk.matchType
              }));

          const topSource = fallbackSources[0];
          return {
            answer,
            sources: fallbackSources,
            retrievedCount: retrievedChunks.length,
            matchedDocument: topSource ? (topSource.originalName || topSource.fileName) : undefined
          };
        }
      }

      return {
        answer: 'I could not find relevant content in the uploaded documents.',
        sources: [],
        retrievedCount: 0
      };
    } catch (error) {
      const detailedError = this.formatAxiosError(error);
      console.error('AI Service Error:', error.response?.data || error.message);
      throw new Error(detailedError);
    }
  }
}

module.exports = new AIService();
