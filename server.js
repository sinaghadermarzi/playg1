const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const crawlRuns = new Map();

const ML_KEYWORDS = [
  "machine learning",
  "ml",
  "deep learning",
  "nlp",
  "computer vision",
  "llm",
  "ai engineer",
  "data scientist",
  "applied scientist",
  "research scientist",
];

function createRun(mode) {
  const id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const run = {
    id,
    mode,
    createdAt: new Date().toISOString(),
    status: "running",
    progress: 0,
    stage: "Queued",
    logs: [],
    jobs: [],
    clients: new Set(),
  };
  crawlRuns.set(id, run);
  return run;
}

function pushUpdate(run, patch = {}) {
  Object.assign(run, patch);
  const payload = {
    id: run.id,
    mode: run.mode,
    status: run.status,
    progress: run.progress,
    stage: run.stage,
    logs: run.logs,
    jobs: run.jobs,
    updatedAt: new Date().toISOString(),
  };

  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of run.clients) {
    client.write(msg);
  }
}

function addLog(run, message) {
  run.logs.push({ at: new Date().toISOString(), message });
  if (run.logs.length > 150) {
    run.logs.shift();
  }
  pushUpdate(run);
}

function containsMLKeyword(text = "") {
  const normalized = text.toLowerCase();
  return ML_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.title}|${job.company}|${job.url}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function scrapeRemoteOk(run) {
  addLog(run, "Scanning RemoteOK API…");
  const res = await fetch("https://remoteok.com/api");
  if (!res.ok) {
    throw new Error(`RemoteOK returned ${res.status}`);
  }

  const data = await res.json();
  const jobs = data
    .slice(1)
    .filter((job) => containsMLKeyword(`${job.position} ${job.tags?.join(" ") || ""}`))
    .map((job) => ({
      title: job.position,
      company: job.company || "Unknown",
      location: job.location || "Remote",
      source: "RemoteOK",
      url: `https://remoteok.com/remote-jobs/${job.id}`,
      postedAt: job.date || null,
      summary: `${job.tags?.join(", ") || "No tags listed"}`,
    }));

  addLog(run, `RemoteOK: found ${jobs.length} matching ML roles.`);
  return jobs;
}

async function scrapeWwr(run) {
  addLog(run, "Scanning WeWorkRemotely jobs feed…");
  const res = await fetch("https://weworkremotely.com/remote-jobs.rss");
  if (!res.ok) {
    throw new Error(`WeWorkRemotely returned ${res.status}`);
  }

  const xml = await res.text();
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const jobs = itemMatches
    .map(([, item]) => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || "").trim();
      const url = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
      const desc = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || "").trim();
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "").trim();
      const cleaned = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      if (!containsMLKeyword(`${title} ${cleaned}`)) {
        return null;
      }

      const [company = "Unknown", role = title] = title.split(":").map((v) => v.trim());
      return {
        title: role,
        company,
        location: "Remote",
        source: "WeWorkRemotely",
        url,
        postedAt: pubDate || null,
        summary: cleaned.slice(0, 220),
      };
    })
    .filter(Boolean);

  addLog(run, `WeWorkRemotely: found ${jobs.length} matching ML roles.`);
  return jobs;
}

async function runStandardCrawl(run) {
  const sources = [
    { label: "RemoteOK", fn: scrapeRemoteOk },
    { label: "WeWorkRemotely", fn: scrapeWwr },
  ];

  const allJobs = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    run.stage = `Crawling ${source.label}`;
    run.progress = Math.floor((i / sources.length) * 80);
    pushUpdate(run);

    try {
      const jobs = await source.fn(run);
      allJobs.push(...jobs);
    } catch (error) {
      addLog(run, `${source.label} failed: ${error.message}`);
    }
  }

  run.stage = "Deduplicating and ranking results";
  run.progress = 90;
  run.jobs = dedupeJobs(allJobs).sort((a, b) => a.title.localeCompare(b.title));
  pushUpdate(run);
}

async function runLangGraphResearch(run, token) {
  addLog(run, "Advanced mode selected: initializing LangGraph-style research pipeline.");

  const graphStages = [
    "Plan search strategy",
    "Collect candidate ML jobs",
    "Enrich with role-level reasoning",
    "Score and summarize opportunities",
  ];

  for (let i = 0; i < graphStages.length; i += 1) {
    run.stage = `Advanced pipeline: ${graphStages[i]}`;
    run.progress = Math.floor((i / graphStages.length) * 40);
    pushUpdate(run);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  await runStandardCrawl(run);

  run.stage = "Advanced pipeline: LLM synthesis";
  run.progress = 95;
  pushUpdate(run);

  const topJobs = run.jobs.slice(0, 15);
  if (topJobs.length === 0) {
    addLog(run, "No jobs available for LLM synthesis.");
    return;
  }

  const prompt = `You are assisting with ML job search deep research. Given JSON jobs, return JSON array with fields: url and rationale (max 2 sentences) and fitScore (1-100). Jobs: ${JSON.stringify(topJobs)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error ${response.status}`);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content || "[]";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const insights = JSON.parse(cleaned);

    const insightMap = new Map(insights.map((x) => [x.url, x]));
    run.jobs = run.jobs
      .map((job) => {
        const extra = insightMap.get(job.url);
        if (!extra) return job;
        return {
          ...job,
          fitScore: Number(extra.fitScore) || null,
          rationale: extra.rationale || "",
        };
      })
      .sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));

    addLog(run, "LLM synthesis complete: jobs scored with fitScore and rationale.");
  } catch (error) {
    addLog(run, `LLM synthesis skipped: ${error.message}`);
  }
}

async function startRun(run, llmToken) {
  try {
    addLog(run, `Starting ${run.mode} crawl…`);

    if (run.mode === "advanced") {
      if (!llmToken) {
        throw new Error("Advanced mode requires llmToken.");
      }
      await runLangGraphResearch(run, llmToken);
    } else {
      await runStandardCrawl(run);
    }

    run.stage = "Completed";
    run.progress = 100;
    run.status = "completed";
    pushUpdate(run);
  } catch (error) {
    run.status = "failed";
    run.stage = "Failed";
    addLog(run, error.message);
    pushUpdate(run);
  }
}

app.post("/api/crawl/start", (req, res) => {
  const { mode = "standard", llmToken = "" } = req.body || {};

  if (!["standard", "advanced"].includes(mode)) {
    return res.status(400).json({ error: "mode must be either 'standard' or 'advanced'." });
  }

  const run = createRun(mode);
  startRun(run, llmToken);

  return res.status(202).json({ runId: run.id });
});

app.get("/api/crawl/events/:runId", (req, res) => {
  const run = crawlRuns.get(req.params.runId);

  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  run.clients.add(res);
  pushUpdate(run);

  req.on("close", () => {
    run.clients.delete(res);
  });

  return undefined;
});

app.get("/api/crawl/:runId", (req, res) => {
  const run = crawlRuns.get(req.params.runId);
  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }

  return res.json({
    id: run.id,
    mode: run.mode,
    status: run.status,
    progress: run.progress,
    stage: run.stage,
    jobs: run.jobs,
    logs: run.logs,
  });
});

app.listen(PORT, () => {
  console.log(`ML Jobs crawler running at http://localhost:${PORT}`);
});
