import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Document } from 'langchain/document';

dotenv.config();

// Step 1: Project Init + File Upload Middleware
const app = express();
const port = process.env.PORT || 8000;
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files
  },
  fileFilter: (req, file, cb) => {
    const isSupported = isSupportedFileType(file.mimetype, file.originalname);
    if (isSupported) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname} (${file.mimetype})`));
    }
  }
});
const chromaDbPath = './chroma_db';

// Step 5: Create Embeddings + Vector Store
// Initialize embeddings
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: openaiApiKey,
  modelName: 'text-embedding-3-small',
});

// Initialize Chroma vector store
let vectorStore: Chroma | null = null;

const initializeVectorStore = async (): Promise<void> => {
  try {
    vectorStore = new Chroma(embeddings, {
      collectionName: 'rag-documents',
      url: `http://127.0.0.1:8000/chroma`,
    });
  } catch (error) {
    // If Chroma server is not available, use local store
    console.warn('Chroma server not available, using local embedded Chroma.');
    vectorStore = await Chroma.fromExistingCollection(embeddings, {
      collectionName: 'rag-documents',
      url: `http://localhost:8000/chroma`,
    }).catch(() => null);
  }
};

// Phase 2, Step 1: Set Up Retriever from Chroma
let retriever: any = null;

const initializeRetriever = async (): Promise<void> => {
  if (!vectorStore) {
    await initializeVectorStore();
  }
  if (vectorStore) {
    retriever = vectorStore.asRetriever({
      k: 4, // Return top 4 similar documents
      // scoreThreshold: 0.5, // Optional: filter by similarity score
    });
  }
};

const registryPath = './document_registry.json';

// Step 6: Maintain Document Registry
interface DocumentRegistryItem {
  id: string;
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  supported: boolean;
  chunkCount: number;
  storedChunkCount: number;
  uploadedAt: string;
  parseError?: string;
  storageError?: string;
}

let documentRegistry: DocumentRegistryItem[] = [];

const loadDocumentRegistry = async (): Promise<void> => {
  try {
    const contents = await fs.readFile(registryPath, 'utf-8');
    documentRegistry = JSON.parse(contents) as DocumentRegistryItem[];
  } catch (error) {
    documentRegistry = [];
  }
};

const saveDocumentRegistry = async (): Promise<void> => {
  await fs.writeFile(registryPath, JSON.stringify(documentRegistry, null, 2), 'utf-8');
};

const addDocumentRegistryItem = async (item: DocumentRegistryItem): Promise<void> => {
  documentRegistry.push(item);
  await saveDocumentRegistry();
};

// Step 2: File Type Detection
// Supported file types
const SUPPORTED_MIMETYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown'
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.docx', '.md'];

// Helper function to detect if file type is supported
const isSupportedFileType = (mimetype: string | undefined, originalname: string | undefined): boolean => {
  if (!mimetype || !originalname) return false;

  const ext = path.extname(originalname).toLowerCase();
  const mimetypeSupported = SUPPORTED_MIMETYPES.includes(mimetype);
  const extSupported = SUPPORTED_EXTENSIONS.includes(ext);

  return mimetypeSupported || extSupported;
};

// Step 3: Parse File Contents
const parsePdf = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text ?? '';
};

const parseDocx = async (filePath: string): Promise<string> => {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value ?? '';
};

const parseText = async (filePath: string): Promise<string> => {
  return fs.readFile(filePath, 'utf-8');
};

const parseFileContent = async (file: Express.Multer.File): Promise<{ text: string; parseError?: string }> => {
  const ext = path.extname(file.originalname).toLowerCase();

  try {
    if (ext === '.pdf') {
      return { text: await parsePdf(file.path) };
    }

    if (ext === '.docx') {
      return { text: await parseDocx(file.path) };
    }

    if (ext === '.txt' || ext === '.md') {
      return { text: await parseText(file.path) };
    }

    return { text: '', parseError: 'No parser available for this file type.' };
  } catch (error) {
    return { text: '', parseError: (error as Error).message || 'Parsing failure' };
  }
};

// Step 4: Split Text into Chunks
const splitTextIntoChunks = async (text: string): Promise<string[]> => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  return splitter.splitText(text);
};

app.use(cors({
  origin: 'http://localhost:4200', // Angular dev server
  credentials: true
}));
app.use(express.json());

// Step 9: Error Handling & Testing
// Error handling middleware for multer
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum 10 files allowed.' });
    }
  }
  if (error.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

app.get('/', (req, res) => {
  res.json({ message: 'RAG System Backend' });
});

// Step 8: Add `GET /documents` Endpoint
app.get('/documents', async (req, res) => {
  try {
    await loadDocumentRegistry();
    res.json({ documents: documentRegistry });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load document registry', details: (error as Error).message });
  }
});

// Test endpoint for Phase 2 Step 1: Retriever setup
app.get('/test-retriever', async (req, res) => {
  try {
    if (!retriever) {
      await initializeRetriever();
    }
    if (!retriever) {
      return res.status(500).json({ error: 'Retriever not available - check vector store initialization' });
    }

    // Test with a sample query
    const testQuery = 'What is this document about?';
    const relevantDocs = await retriever.invoke(testQuery);

    res.json({
      message: 'Retriever test successful',
      query: testQuery,
      resultsCount: relevantDocs.length,
      results: relevantDocs.map((doc: any) => ({
        content: doc.pageContent.slice(0, 200) + '...',
        metadata: doc.metadata
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Retriever test failed', details: (error as Error).message });
  }
});

// Step 7: Complete `/ingest` Endpoint
app.post('/ingest', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded. Use form field "files".' });
    }

    // Initialize vector store on first request
    if (!vectorStore) {
      await initializeVectorStore();
    }

    const results = await Promise.all(files.map(async (file) => {
      const isSupported = isSupportedFileType(file.mimetype, file.originalname);
      const parseResult = isSupported ? await parseFileContent(file) : { text: '', parseError: 'Unsupported file type' };
      const preview = parseResult.text ? parseResult.text.slice(0, 200) : '';
      const chunks = parseResult.text ? await splitTextIntoChunks(parseResult.text) : [];

      let storedIds: string[] = [];
      let storageError: string | undefined = undefined;

      // Store chunks in Chroma if vector store is available and file is supported
      if (isSupported && vectorStore && chunks.length > 0) {
        try {
          const documents = chunks.map((chunkText, index) => 
            new Document({
              pageContent: chunkText,
              metadata: {
                source: file.originalname,
                filename: file.originalname,
                chunkIndex: index,
                fileSize: file.size,
                uploadedAt: new Date().toISOString(),
              }
            })
          );

          // Add to Chroma
          storedIds = await vectorStore.addDocuments(documents);
        } catch (error) {
          storageError = `Failed to store in vector database: ${(error as Error).message}`;
        }
      }

      const registryItem: DocumentRegistryItem = {
        id: `${file.originalname}-${Date.now()}`,
        originalname: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        supported: isSupported,
        chunkCount: chunks.length,
        storedChunkCount: storedIds.length,
        uploadedAt: new Date().toISOString(),
        parseError: parseResult.parseError,
        storageError,
      };

      await addDocumentRegistryItem(registryItem);

      return {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        supported: isSupported,
        extension: path.extname(file.originalname).toLowerCase(),
        parsedTextLength: parseResult.text.length,
        chunkCount: chunks.length,
        storedChunkIds: storedIds,
        storageError,
        chunkPreview: chunks.slice(0, 2),
        parseError: parseResult.parseError,
        preview
      };
    }));

    const supportedFiles = results.filter(f => f.supported);
    const unsupportedFiles = results.filter(f => !f.supported);
    const successfullyStored = results.filter(f => f.storedChunkIds && f.storedChunkIds.length > 0);

    res.json({
      message: 'Files processed and indexed',
      fileCount: files.length,
      supportedCount: supportedFiles.length,
      unsupportedCount: unsupportedFiles.length,
      successfullyStoredCount: successfullyStored.length,
      files: results
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error processing files',
      details: (error as Error).message
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});