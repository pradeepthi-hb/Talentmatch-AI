# TalentMatch AI

TalentMatch AI is a full-stack hiring analysis platform that helps recruiters and hiring teams:

- upload a job description
- add candidate resumes
- run AI-powered candidate analysis
- compare analyzed candidates
- generate downloadable PDF reports
- store analysis sessions in a chat-style history sidebar
- maintain reusable interview question banks per analysis

The project is split into:

- `frontend/`: React + Vite application
- `backend/`: Express + MySQL API

## Core Features

- Candidate analysis against a job description
- Resume upload support for `PDF`, `DOC`, `DOCX`, and `TXT`
- Resume text extraction for analysis
- Interview scorecards and custom questions
- Reusable question bank with active/inactive toggles
- Analysis history with saved sessions
- Individual candidate report downloads
- Comparison report downloads
- Resume appended to the final report PDF
- Authentication with JWT

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS
- Lucide React
- React Markdown
- Motion

### Backend

- Node.js
- Express
- MySQL
- JWT authentication
- Multer
- PDFKit / pdf-lib
- Mammoth
- Google Gemini API

## Project Structure

```text
talentmatch-ai/
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ context/
│  │  ├─ hooks/
│  │  ├─ pages/
│  │  ├─ services/
│  │  └─ utils/
│  ├─ package.json
│  └─ .env.example
├─ backend/
│  ├─ src/
│  │  ├─ db/
│  │  ├─ middleware/
│  │  ├─ routes/
│  │  ├─ services/
│  │  └─ utils/
│  ├─ uploads/
│  ├─ package.json
│  └─ .env.example
└─ README.md
```

## Prerequisites

Install these first:

- Node.js 18+ recommended
- npm
- MySQL 8+ recommended
- LibreOffice

LibreOffice is important because the backend uses it to convert `DOC`/`DOCX` resumes into PDF before merging them into downloaded reports.

Windows default path expected by the backend:

```text
C:\Program Files\LibreOffice\program\soffice.exe
```

If LibreOffice is missing, DOC/DOCX report generation can fail.

## Environment Variables

### Backend

Create `backend/.env` and add:

```env
PORT=3002
ALLOWED_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=talentmatch

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

GEMINI_API_KEY=your_gemini_api_key
```

Notes:

- `JWT_SECRET` is required for login/session auth.
- `GEMINI_API_KEY` is required for candidate analysis.
- `ALLOWED_ORIGIN` should match the frontend URL.

### Frontend

Create `frontend/.env` and add:

```env
VITE_API_URL=http://localhost:3002
```

## Database Setup


To run the included migration:

```bash
cd backend
npm run migrate
```

## Installation

### 1. Install root dependencies

```bash
npm install
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Install backend dependencies

```bash
cd backend
npm install
```

## How To Run

You need two terminals.

### Terminal 1: Start backend

```bash
cd backend
npm run dev
```

Backend will run on:

```text
http://localhost:3002
```

### Terminal 2: Start frontend

```bash
cd frontend
npm run dev
```

Frontend will run on:

```text
http://localhost:5173
```

Open that frontend URL in your browser.

## Production Build

### Frontend

```bash
cd frontend
npm run build
```

### Backend

```bash
cd backend
npm start
```

## Typical User Flow

1. Register or log in.
2. Create or open an analysis session from the history sidebar.
3. Paste or upload a job description.
4. Add one or more candidate resumes.
5. Run match analysis for the selected candidate.
6. Review AI analysis, score breakdown, and interview questions.
7. Use the question bank for reusable interview prompts.
8. Download an individual report or a comparison report.

## Reports

### Candidate Report

The candidate report includes:

- AI analysis summary
- strengths and gaps
- category scores
- recommendations
- interview questions and ratings
- the original uploaded resume appended to the report

Resume behavior:

- uploaded `PDF`: appended directly
- uploaded `DOC` or `DOCX`: converted to PDF, then appended
- uploaded `TXT`: converted to PDF-style text output, then appended

### Comparison Report

The comparison report summarizes multiple analyzed candidates side by side.

## Authentication

Authentication uses JWT tokens stored in local storage on the frontend.

The app also restores:

- signed-in user session
- last active analysis session
- per-analysis question bank state

## Important Backend Routes

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Analyses

- `GET /api/analyses`
- `POST /api/analyses`
- `GET /api/analyses/:id`
- `PATCH /api/analyses/:id/title`
- `PUT /api/analyses/:id/jd`
- `DELETE /api/analyses/:id`

### Candidates

- `POST /api/analyses/:analysisId/candidates`
- `DELETE /api/analyses/:analysisId/candidates/:candidateId`
- `POST /api/analyses/:analysisId/candidates/:candidateId/analyze`

### Questions

- `POST /api/analyses/:analysisId/candidates/:candidateId/questions`
- `PUT /api/analyses/:analysisId/candidates/:candidateId/questions/:qId`
- `DELETE /api/analyses/:analysisId/candidates/:candidateId/questions/:qId`

### Reports

- `POST /api/report`
- `POST /api/comparison`

## Troubleshooting

### Backend fails to start

Check:

- `backend/.env` exists
- MySQL is running
- database credentials are correct
- `JWT_SECRET` is set
- `GEMINI_API_KEY` is set

### Login/session issues

Check:

- frontend `VITE_API_URL`
- backend `ALLOWED_ORIGIN`
- browser local storage is not blocked

### DOC/DOCX report download fails

Check that LibreOffice is installed at:

```text
C:\Program Files\LibreOffice\program\soffice.exe
```

### Comparison report fails

Make sure at least one candidate has completed analysis before downloading.

### No AI analysis returned

Check:

- valid `GEMINI_API_KEY`
- backend console logs
- candidate resume text extraction succeeded
- job description is not empty

## Current Notes

- The root `package.json` is frontend-oriented, but the actual working app is split into `frontend/` and `backend/`.
- The included migration script is incomplete for a fresh full setup; if you are sharing this project with others, consider adding a full schema migration for all app tables.

## Suggested Next Improvements

- Add a complete SQL migration for all required tables
- Add Docker setup for frontend, backend, and MySQL
- Add automated tests
- Add `.env.example` for the backend with all required variables
- Add health checks for Gemini and LibreOffice dependencies
