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

const app = express();
const port = process.env.PORT || 8000;
const upload = multer({ dest: 'uploads/' });
const chromaDbPath = './chroma_db';

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
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

app.get('/', (req, res) => {
  res.json({ message: 'RAG System Backend' });
});

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