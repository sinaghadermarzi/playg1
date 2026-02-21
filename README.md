# ML Jobs Crawler

A web app that crawls multiple job sources for machine learning roles, displays live crawl progress, and renders the collected jobs in a UI list.

## Features

- Crawl job APIs and aggregate postings.
- Filter for ML/AI-focused roles.
- Live progress updates with server-sent events (SSE).
- Advanced mode:
  - Runs a LangGraph-style deep-research workflow.
  - Accepts an LLM API token and attempts model-based ranking.
  - Falls back to heuristic ranking when no token is provided or LLM call fails.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Notes

- Advanced mode uses the OpenAI chat completions API endpoint in this implementation.
- The LLM token is sent only when you start a crawl and enable advanced mode.
