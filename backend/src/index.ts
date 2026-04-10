import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;
const upload = multer({ dest: 'uploads/' });

app.use(cors({
  origin: 'http://localhost:4200', // Angular dev server
  credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'RAG System Backend' });
});

app.post('/ingest', upload.array('files', 10), (req, res) => {
  const files = req.files;
  if (!files || Array.isArray(files) && files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded. Use form field "files".' });
  }

  res.json({
    message: 'Files received',
    fileCount: Array.isArray(files) ? files.length : 1,
    files: Array.isArray(files) ? files.map((file) => ({ originalname: file.originalname, mimetype: file.mimetype, size: file.size })) : []
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});