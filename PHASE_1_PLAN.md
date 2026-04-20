# Phase 1: Backend – Core RAG Pipeline Plan

## Overview
Build the FastAPI-equivalent Node.js/Express backend with LangChain.js for document ingestion, embeddings, vector storage, and retrieval.

## Tech Stack
- Express.js (web framework)
- LangChain.js (0.1.x)
- OpenAI or Anthropic (embeddings + LLM)
- Chroma (vector database - local persistent)
- Multer (file uploads)
- pdf-parse, mammoth, marked (file parsing)

---

## Step-by-Step Implementation

### Step 1: Project Init + File Upload Middleware ✅
- [x] Initialize Node.js + TypeScript setup
- [x] Set up Express server with CORS
- [x] Configure Multer for file uploads
- [x] Create `/ingest` endpoint skeleton

### Step 2: File Type Detection ✅
- [x] Detect supported file types (PDF, TXT, DOCX, MD)
- [x] Validate by mimetype and file extension
- [x] Return supported/unsupported file flags
- [x] Test with mixed file uploads

### Step 3: Parse File Contents ✅
- [x] Parse PDF files (using `pdf-parse`)
- [x] Parse DOCX files (using `mammoth`)
- [x] Parse TXT files (raw read)
- [x] Parse Markdown files (raw read, optional marked conversion)
- [x] Combine all text into document string
- [x] Handle parsing errors gracefully

### Step 4: Split Text into Chunks ✅
- [x] Import LangChain `RecursiveCharacterTextSplitter`
- [x] Configure split parameters (chunkSize: 1000, chunkOverlap: 200)
- [x] Apply splitter to parsed document text
- [x] Create Document objects with text + metadata (source, filename, page/chunk index)

### Step 5: Create Embeddings + Vector Store ✅
- [x] Initialize embeddings (OpenAIEmbeddings)
- [x] Load/create Chroma vector store (persistent directory: `./chroma_db`)
- [x] Add document chunks to vector store with metadata
- [x] Return stored chunk IDs and storage status in response

### Step 6: Maintain Document Registry ✅
- [x] Create document metadata tracking (JSON file persisted to disk)
- [x] Record original filename, ingestion timestamp, chunk count
- [x] Save registry to disk for persistence across restarts
- [x] Add GET /documents endpoint to list uploaded docs

### Step 7: Complete `/ingest` Endpoint ✅
- [x] Parse uploaded files
- [x] Split into chunks
- [x] Generate embeddings
- [x] Store in Chroma
- [x] Update document registry
- [x] Return success response with metadata

### Step 8: Add `GET /documents` Endpoint ✅
- [x] List all ingested documents
- [x] Show filename, chunk count, ingestion date
- [x] Return JSON array

### Step 9: Error Handling & Testing ✅
- [x] Handle unsupported file types (reject with error)
- [x] Handle large files gracefully
- [x] Test with Postman/Thunder Client
- [x] Verify Chroma persistence (restart server, check data remains)

---

## Milestone Goal: Document Ingestion Complete

**Target:** Upload PDF/TXT/DOCX/MD files → See them embedded in Chroma → List via `/documents` endpoint

**Testing checklist:**
- [x] Upload single PDF → chunks created in Chroma
- [x] Upload multiple files → all processed
- [x] Unsupported file → rejected with error
- [x] `/documents` returns list of uploaded docs
- [x] Restart server → data persists in Chroma
- [x] Test with Postman/Thunder Client

---

## Next Phases

### Phase 2: Retrieval + Response Chain
- Build retriever from Chroma
- Create LangChain LCEL chain: `prompt | llm | StrOutputParser()`
- Add conversation history (optional ConversationalRetrievalChain)
- Implement `/query` endpoint

### Phase 3: Integration & Polish
- Connect frontend to backend
- Add error + loading states
- Source citations + links
- Chat history persistence
- Docker + deployment

### Phase 4: Portfolio + Deployment
- Update README with architecture diagram
- Record 2-min demo
- Deploy to cloud (Render, Fly.io, Railway)
