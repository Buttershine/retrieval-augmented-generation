import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;
const upload = multer({ dest: 'uploads/' });

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

app.use(cors({
  origin: 'http://localhost:4200', // Angular dev server
  credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'RAG System Backend' });
});

app.post('/ingest', upload.array('files', 10), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded. Use form field "files".' });
  }

  const results = await Promise.all(files.map(async (file) => {
    const isSupported = isSupportedFileType(file.mimetype, file.originalname);
    const parseResult = isSupported ? await parseFileContent(file) : { text: '', parseError: 'Unsupported file type' };
    const preview = parseResult.text ? parseResult.text.slice(0, 200) : '';

    return {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      supported: isSupported,
      extension: path.extname(file.originalname).toLowerCase(),
      parsedTextLength: parseResult.text.length,
      parseError: parseResult.parseError,
      preview
    };
  }));

  const supportedFiles = results.filter(f => f.supported);
  const unsupportedFiles = results.filter(f => !f.supported);

  res.json({
    message: 'Files processed',
    fileCount: files.length,
    supportedCount: supportedFiles.length,
    unsupportedCount: unsupportedFiles.length,
    files: results
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});