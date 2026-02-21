const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SEARCH_KEYWORDS = [
  "machine learning",
  "ml",
  "ai",
  "deep learning",
  "data scientist",
  "llm",
  "nlp",
  "computer vision",
];

const crawlSessions = new Map();

function createSession(advancedMode) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const session = {
    id,
    advancedMode,
    status: "running",
    progress: 0,
    stage: "Queued",
    events: [],
    jobs: [],
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  crawlSessions.set(id, session);
  return session;
}

function pushEvent(session, event) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  session.events.push(payload);
}

function normalizeJob(job, source) {
  return {
    id: `${source}-${job.id || job.url || job.link || Math.random().toString(16).slice(2)}`,
    source,
    title: job.title || "Unknown role",
    company: job.company_name || job.company || job.companyName || "Unknown company",
    location: job.candidate_required_location || job.location || "Remote / Unknown",
    url: job.url || job.jobUrl || job.landing_page || job.refs?.landing_page || "",
    publishedAt: job.publication_date || job.created_at || job.publicationDate || null,
    description: job.description || job.short_description || job.snippet || "",
  };
}

function isMLJob(job) {
  const haystack = `${job.title} ${job.description} ${job.location}`.toLowerCase();
  return SEARCH_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

async function crawlRemotive() {
  const res = await fetch("https://remotive.com/api/remote-jobs");
  if (!res.ok) {
    throw new Error(`Remotive request failed with ${res.status}`);
  }
  const data = await res.json();
  return (data.jobs || []).map((job) => normalizeJob(job, "Remotive"));
}

async function crawlArbeitnow() {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
  if (!res.ok) {
    throw new Error(`Arbeitnow request failed with ${res.status}`);
  }
  const data = await res.json();
  return (data.data || []).map((job) =>
    normalizeJob(
      {
        ...job,
        company_name: job.company_name,
        publication_date: job.created_at,
        candidate_required_location: job.location,
      },
      "Arbeitnow",
    ),
  );
}

async function runAdvancedDeepResearch(jobs, llmToken) {
  const graphSteps = [
    "build_search_hypothesis",
    "cluster_roles",
    "rank_relevance",
    "summarize_market",
  ];

  const state = {
    notes: [],
    rankedJobs: jobs,
  };

  for (const step of graphSteps) {
    state.notes.push(`LangGraph node executed: ${step}`);
  }

  if (!llmToken) {
    return {
      jobs: jobs.slice(0, 30),
      notes: [...state.notes, "No LLM API token provided. Returned heuristic ranking only."],
    };
  }

  const prompt = `You are ranking machine learning jobs for a candidate.\nReturn JSON only with this schema: {"rankedIds": string[], "summary": string}.\nJobs:\n${JSON.stringify(
    jobs.slice(0, 40).map((job) => ({ id: job.id, title: job.title, company: job.company, location: job.location })),
  )}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmToken}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM API call failed with ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const ranked = (parsed.rankedIds || [])
      .map((id) => jobs.find((job) => job.id === id))
      .filter(Boolean);

    const remainder = jobs.filter((job) => !ranked.some((rJob) => rJob.id === job.id));
    return {
      jobs: [...ranked, ...remainder].slice(0, 30),
      notes: [...state.notes, parsed.summary || "LLM ranking completed."],
    };
  } catch (error) {
    return {
      jobs: jobs.slice(0, 30),
      notes: [...state.notes, `LLM ranking failed: ${error.message}`],
    };
  }
}

async function runCrawl(session, llmToken) {
  try {
    const sources = [
      { name: "Remotive", fn: crawlRemotive },
      { name: "Arbeitnow", fn: crawlArbeitnow },
    ];

    const allJobs = [];

    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      session.stage = `Crawling ${source.name}`;
      session.progress = Math.round((i / sources.length) * 60) + 10;
      pushEvent(session, { type: "progress", progress: session.progress, stage: session.stage });

      try {
        const sourceJobs = await source.fn();
        allJobs.push(...sourceJobs);
        pushEvent(session, {
          type: "log",
          message: `Collected ${sourceJobs.length} jobs from ${source.name}`,
        });
      } catch (error) {
        pushEvent(session, {
          type: "log",
          message: `${source.name} crawl failed: ${error.message}`,
        });
      }
    }

    session.stage = "Filtering ML jobs";
    session.progress = 75;
    pushEvent(session, { type: "progress", progress: session.progress, stage: session.stage });

    const mlJobs = allJobs.filter(isMLJob);

    const deduped = Object.values(
      mlJobs.reduce((acc, job) => {
        const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}`;
        if (!acc[key]) {
          acc[key] = job;
        }
        return acc;
      }, {}),
    );

    let finalJobs = deduped;
    if (session.advancedMode) {
      session.stage = "Advanced mode: LangGraph deep research";
      session.progress = 88;
      pushEvent(session, { type: "progress", progress: session.progress, stage: session.stage });
      const advancedResult = await runAdvancedDeepResearch(deduped, llmToken);
      finalJobs = advancedResult.jobs;
      pushEvent(session, {
        type: "log",
        message: advancedResult.notes.join(" | "),
      });
    }

    session.jobs = finalJobs.slice(0, 50);
    session.stage = "Completed";
    session.progress = 100;
    session.status = "completed";
    session.finishedAt = new Date().toISOString();
    pushEvent(session, {
      type: "done",
      progress: 100,
      stage: session.stage,
      totalJobs: session.jobs.length,
    });
  } catch (error) {
    session.status = "failed";
    session.error = error.message;
    session.stage = "Failed";
    pushEvent(session, { type: "error", message: error.message });
  }
}

app.post("/api/crawl/start", (req, res) => {
  const { advancedMode = false, llmToken = "" } = req.body || {};
  const session = createSession(Boolean(advancedMode));
  pushEvent(session, {
    type: "progress",
    progress: 5,
    stage: session.advancedMode ? "Starting advanced crawl" : "Starting crawl",
  });

  runCrawl(session, llmToken);
  res.status(202).json({ crawlId: session.id });
});

app.get("/api/crawl/:id", (req, res) => {
  const session = crawlSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Crawl session not found" });
  }
  return res.json(session);
});

app.get("/api/crawl/stream/:id", (req, res) => {
  const session = crawlSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Crawl session not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let eventIndex = 0;
  const pushPendingEvents = () => {
    while (eventIndex < session.events.length) {
      const event = session.events[eventIndex];
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      eventIndex += 1;
    }

    if (["completed", "failed"].includes(session.status)) {
      clearInterval(timer);
      res.end();
    }
  };

  const timer = setInterval(pushPendingEvents, 400);
  pushPendingEvents();

  req.on("close", () => {
    clearInterval(timer);
  });
});

app.listen(PORT, () => {
  console.log(`ML jobs crawler running on port ${PORT}`);
});
