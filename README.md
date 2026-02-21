# ML Job Crawler

A Node/Express app that:

- Crawls the web for machine-learning jobs from multiple sources.
- Streams crawl progress to the UI in real time.
- Shows collected jobs in a searchable-style card list.
- Supports an **Advanced mode** that runs a LangGraph-style deep research flow and uses an LLM API token for scoring/summaries.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000.

## How it works

- **Standard mode**
  - Pulls jobs from RemoteOK + WeWorkRemotely RSS.
  - Filters jobs with ML/AI keywords.
  - Deduplicates and displays results.

- **Advanced mode**
  - Requires an LLM API token in the UI.
  - Executes a staged LangGraph-style pipeline (planning, collection, enrichment, synthesis).
  - Calls OpenAI Chat Completions (`gpt-4o-mini` by default) to assign `fitScore` and rationale to top jobs.

## Notes

- Advanced mode expects a token compatible with `https://api.openai.com/v1/chat/completions`.
- You can change model using `OPENAI_MODEL` env var.
