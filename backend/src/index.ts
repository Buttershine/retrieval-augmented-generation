import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors({
  origin: 'http://localhost:4200', // Angular dev server
  credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'RAG System Backend' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});