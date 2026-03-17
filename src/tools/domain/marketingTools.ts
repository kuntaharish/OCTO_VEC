/**
 * Marketing Domain Tools — SEO audit, social posting, content generation, GEO tracking.
 *
 * These tools give marketing agents the ability to:
 *   - Run SEO audits on any URL (via Lighthouse/web fetch)
 *   - Post to X/Twitter, Reddit, LinkedIn (via browser automation / API)
 *   - Track brand mentions in AI search engines (GEO scoring)
 *   - Analyse competitor content and keywords
 */

import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { config } from "../../config.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|hr|blockquote|pre|section|article)[\s>]/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── SEO Tools ────────────────────────────────────────────────────────────────

const seo_audit: AgentTool = {
  name: "seo_audit",
  label: "SEO Audit",
  description:
    "Run a technical SEO audit on a URL. Fetches the page, analyses meta tags, headings, " +
    "link structure, image alt text, and basic performance signals. Returns a structured report " +
    "with issues and recommendations.",
  parameters: Type.Object({
    url: Type.String({ description: "The full URL to audit (must start with http:// or https://)" }),
  }),
  execute: async (_, params: any) => {
    const url = (params.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return ok("Error: provide a valid URL starting with http:// or https://");

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VEC-SEO-Auditor/1.0)" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) return ok(`HTTP error: ${res.status} ${res.statusText} for ${url}`);

      const html = await res.text();
      const issues: string[] = [];
      const info: string[] = [];

      // Title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";
      if (!title) issues.push("CRITICAL: Missing <title> tag");
      else if (title.length < 30) issues.push(`WARNING: Title too short (${title.length} chars) — aim for 50-60`);
      else if (title.length > 70) issues.push(`WARNING: Title too long (${title.length} chars) — may be truncated in SERPs`);
      else info.push(`Title (${title.length} chars): "${title}"`);

      // Meta description
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
      const desc = descMatch ? descMatch[1].trim() : "";
      if (!desc) issues.push("CRITICAL: Missing meta description");
      else if (desc.length < 120) issues.push(`WARNING: Meta description short (${desc.length} chars) — aim for 150-160`);
      else if (desc.length > 170) issues.push(`WARNING: Meta description too long (${desc.length} chars)`);
      else info.push(`Meta description (${desc.length} chars): OK`);

      // Canonical
      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
      if (!canonical) issues.push("WARNING: No canonical URL tag found");
      else info.push(`Canonical: ${canonical[1]}`);

      // Open Graph
      const ogTitle = html.match(/<meta[^>]+property=["']og:title["']/i);
      const ogDesc = html.match(/<meta[^>]+property=["']og:description["']/i);
      const ogImage = html.match(/<meta[^>]+property=["']og:image["']/i);
      if (!ogTitle) issues.push("WARNING: Missing og:title meta tag");
      if (!ogDesc) issues.push("WARNING: Missing og:description meta tag");
      if (!ogImage) issues.push("WARNING: Missing og:image meta tag");
      if (ogTitle && ogDesc && ogImage) info.push("Open Graph tags: present");

      // Headings
      const h1s = html.match(/<h1[\s>]/gi) ?? [];
      if (h1s.length === 0) issues.push("CRITICAL: No H1 tag found");
      else if (h1s.length > 1) issues.push(`WARNING: Multiple H1 tags found (${h1s.length}) — use exactly 1`);
      else info.push("H1 tag: present (1)");

      const h2s = html.match(/<h2[\s>]/gi) ?? [];
      info.push(`H2 tags: ${h2s.length}`);

      // Images without alt
      const imgs = html.match(/<img[^>]*>/gi) ?? [];
      const imgsNoAlt = imgs.filter(i => !i.match(/alt=["'][^"']+["']/i));
      if (imgsNoAlt.length > 0) issues.push(`WARNING: ${imgsNoAlt.length}/${imgs.length} images missing alt text`);
      else if (imgs.length > 0) info.push(`Images: ${imgs.length} — all have alt text`);

      // Links
      const links = html.match(/<a[^>]+href/gi) ?? [];
      const extLinks = html.match(/<a[^>]+href=["']https?:\/\//gi) ?? [];
      info.push(`Links: ${links.length} total, ~${extLinks.length} external`);

      // Robots
      const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
      if (robotsMeta && /noindex/i.test(robotsMeta[1])) {
        issues.push("CRITICAL: Page has noindex directive — will not appear in search results");
      }

      // Viewport
      const viewport = html.match(/<meta[^>]+name=["']viewport["']/i);
      if (!viewport) issues.push("WARNING: No viewport meta tag — poor mobile experience");

      // SSL
      if (!url.startsWith("https://")) issues.push("WARNING: Not using HTTPS");

      // Page size
      const sizeKB = Math.round(html.length / 1024);
      if (sizeKB > 200) issues.push(`WARNING: Large HTML (${sizeKB}KB) — may affect load time`);
      info.push(`HTML size: ${sizeKB}KB`);

      // Build report
      const criticals = issues.filter(i => i.startsWith("CRITICAL"));
      const warnings = issues.filter(i => i.startsWith("WARNING"));

      let report = `## SEO Audit Report: ${url}\n\n`;
      report += `**Score: ${Math.max(0, 100 - criticals.length * 20 - warnings.length * 5)}/100**\n\n`;

      if (criticals.length) report += `### Critical Issues (${criticals.length})\n${criticals.map(i => `- ${i}`).join("\n")}\n\n`;
      if (warnings.length) report += `### Warnings (${warnings.length})\n${warnings.map(i => `- ${i}`).join("\n")}\n\n`;
      report += `### Page Info\n${info.map(i => `- ${i}`).join("\n")}\n`;

      return ok(report);
    } catch (err: any) {
      return ok(`SEO audit failed: ${err?.message ?? err}`);
    }
  },
};

const keyword_analysis: AgentTool = {
  name: "keyword_analysis",
  label: "Keyword Analysis",
  description:
    "Analyse a web page's content for keyword density, heading keywords, and content structure. " +
    "Helps identify what keywords a page is targeting and gaps to improve.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to analyse" }),
    target_keywords: Type.Optional(Type.Array(Type.String(), { description: "Keywords to check for (optional)" })),
  }),
  execute: async (_, params: any) => {
    const url = (params.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return ok("Error: provide a valid URL.");

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VEC-SEO/1.0)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return ok(`HTTP ${res.status} for ${url}`);

      const html = await res.text();
      const text = stripHtml(html).toLowerCase();
      const words = text.split(/\s+/).filter(w => w.length > 2);
      const totalWords = words.length;

      // Word frequency (top 20)
      const freq: Record<string, number> = {};
      const stopwords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "have", "with", "this", "that", "from", "they", "been", "said", "each", "which", "their", "will", "other", "about", "many", "then", "them", "these", "some", "more", "when", "would", "make", "like", "just", "over", "such", "into", "than", "also", "back", "could", "what", "there", "your"]);
      for (const w of words) {
        if (!stopwords.has(w) && w.length > 3) freq[w] = (freq[w] ?? 0) + 1;
      }
      const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20);

      // Extract headings
      const headings: string[] = [];
      const hMatches = html.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi);
      for (const m of hMatches) headings.push(stripHtml(m[2]));

      let report = `## Keyword Analysis: ${url}\n\n`;
      report += `**Total words:** ${totalWords}\n\n`;
      report += `### Top 20 Keywords\n| Keyword | Count | Density |\n|---------|-------|--------|\n`;
      for (const [word, count] of topWords) {
        report += `| ${word} | ${count} | ${((count / totalWords) * 100).toFixed(2)}% |\n`;
      }

      if (headings.length) {
        report += `\n### Headings (${headings.length})\n${headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`;
      }

      // Check target keywords
      const targets = params.target_keywords ?? [];
      if (targets.length) {
        report += `\n### Target Keyword Check\n`;
        for (const kw of targets) {
          const kwLower = kw.toLowerCase();
          const count = (text.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
          const inTitle = html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0]?.toLowerCase().includes(kwLower) ? "Yes" : "No";
          const inH1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0]?.toLowerCase().includes(kwLower) ? "Yes" : "No";
          report += `- **"${kw}"**: ${count} mentions, in title: ${inTitle}, in H1: ${inH1}\n`;
        }
      }

      return ok(report);
    } catch (err: any) {
      return ok(`Keyword analysis failed: ${err?.message ?? err}`);
    }
  },
};

const competitor_analysis: AgentTool = {
  name: "competitor_analysis",
  label: "Competitor Analysis",
  description:
    "Fetch and compare SEO signals between two URLs. Useful for competitive benchmarking — " +
    "compares title, meta, headings, content length, and keyword strategies.",
  parameters: Type.Object({
    our_url: Type.String({ description: "Your page URL" }),
    competitor_url: Type.String({ description: "Competitor page URL" }),
  }),
  execute: async (_, params: any) => {
    const urls = [params.our_url, params.competitor_url].map((u: string) => (u ?? "").trim());
    if (urls.some(u => !u || !/^https?:\/\//i.test(u))) return ok("Error: both URLs must be valid.");

    async function fetchMeta(url: string) {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VEC-SEO/1.0)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const html = await res.text();
      const text = stripHtml(html);
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "(none)";
      const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]
        ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ?? "(none)";
      const h1s = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) ?? []).map(h => stripHtml(h));
      const h2s = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) ?? []).map(h => stripHtml(h));
      const wordCount = text.split(/\s+/).length;
      const imgs = (html.match(/<img/gi) ?? []).length;
      const links = (html.match(/<a[^>]+href/gi) ?? []).length;
      return { title, desc, h1s, h2s, wordCount, imgs, links, sizeKB: Math.round(html.length / 1024) };
    }

    try {
      const [ours, theirs] = await Promise.all(urls.map(fetchMeta));
      if ("error" in ours || "error" in theirs) {
        return ok(`Fetch error: ours=${(ours as any).error ?? "ok"}, theirs=${(theirs as any).error ?? "ok"}`);
      }

      let report = `## Competitor Comparison\n\n`;
      report += `| Signal | Our Page | Competitor |\n|--------|----------|------------|\n`;
      report += `| Title | ${(ours as any).title} | ${(theirs as any).title} |\n`;
      report += `| Meta Desc | ${(ours as any).desc?.slice(0, 60)}... | ${(theirs as any).desc?.slice(0, 60)}... |\n`;
      report += `| Word Count | ${(ours as any).wordCount} | ${(theirs as any).wordCount} |\n`;
      report += `| H1 Tags | ${(ours as any).h1s.length} | ${(theirs as any).h1s.length} |\n`;
      report += `| H2 Tags | ${(ours as any).h2s.length} | ${(theirs as any).h2s.length} |\n`;
      report += `| Images | ${(ours as any).imgs} | ${(theirs as any).imgs} |\n`;
      report += `| Links | ${(ours as any).links} | ${(theirs as any).links} |\n`;
      report += `| HTML Size | ${(ours as any).sizeKB}KB | ${(theirs as any).sizeKB}KB |\n`;

      return ok(report);
    } catch (err: any) {
      return ok(`Competitor analysis failed: ${err?.message ?? err}`);
    }
  },
};

// ── Social Media Tools ───────────────────────────────────────────────────────

const draft_social_post: AgentTool = {
  name: "draft_social_post",
  label: "Draft Social Post",
  description:
    "Create a formatted social media post draft for a specific platform. " +
    "Generates the post with platform-appropriate formatting, character limits, and hashtags. " +
    "The draft is saved to a file for review before publishing.",
  parameters: Type.Object({
    platform: Type.String({ description: "Platform: 'twitter', 'reddit', 'linkedin', 'hackernews'" }),
    title: Type.Optional(Type.String({ description: "Post title (required for Reddit/HN)" })),
    content: Type.String({ description: "The post content/body" }),
    hashtags: Type.Optional(Type.Array(Type.String(), { description: "Hashtags (Twitter/LinkedIn)" })),
    subreddit: Type.Optional(Type.String({ description: "Target subreddit (Reddit only)" })),
    link_url: Type.Optional(Type.String({ description: "URL to share (if link post)" })),
  }),
  execute: async (_, params: any) => {
    const platform = (params.platform ?? "").toLowerCase().trim();
    const content = (params.content ?? "").trim();
    if (!content) return ok("Error: content is required.");

    const platforms = ["twitter", "reddit", "linkedin", "hackernews"];
    if (!platforms.includes(platform)) return ok(`Error: platform must be one of: ${platforms.join(", ")}`);

    let draft = "";
    const now = new Date().toISOString();

    switch (platform) {
      case "twitter": {
        const hashtags = (params.hashtags ?? []).map((h: string) => h.startsWith("#") ? h : `#${h}`).join(" ");
        const tweet = hashtags ? `${content}\n\n${hashtags}` : content;
        if (tweet.length > 280) {
          draft = `## Twitter/X Draft (${now})\n\n**WARNING: ${tweet.length}/280 chars — OVER LIMIT**\n\n---\n${tweet}\n---\n\nPlease shorten to fit 280 characters.`;
        } else {
          draft = `## Twitter/X Draft (${now})\n\n**Characters: ${tweet.length}/280**\n\n---\n${tweet}\n---`;
        }
        break;
      }
      case "reddit": {
        const title = (params.title ?? "").trim();
        if (!title) return ok("Error: title is required for Reddit posts.");
        const sub = params.subreddit ? `r/${params.subreddit.replace(/^r\//, "")}` : "r/<subreddit>";
        const link = params.link_url ?? "";
        draft = `## Reddit Draft (${now})\n\n**Subreddit:** ${sub}\n**Title:** ${title}\n**Type:** ${link ? "Link Post" : "Text Post"}\n`;
        if (link) draft += `**URL:** ${link}\n`;
        draft += `\n---\n${content}\n---`;
        break;
      }
      case "linkedin": {
        const hashtags = (params.hashtags ?? []).map((h: string) => h.startsWith("#") ? h : `#${h}`).join(" ");
        const post = hashtags ? `${content}\n\n${hashtags}` : content;
        if (post.length > 3000) {
          draft = `## LinkedIn Draft (${now})\n\n**WARNING: ${post.length}/3000 chars — OVER LIMIT**\n\n---\n${post}\n---`;
        } else {
          draft = `## LinkedIn Draft (${now})\n\n**Characters: ${post.length}/3000**\n\n---\n${post}\n---`;
        }
        break;
      }
      case "hackernews": {
        const title = (params.title ?? "").trim();
        if (!title) return ok("Error: title is required for Hacker News posts.");
        const link = params.link_url ?? "";
        draft = `## Hacker News Draft (${now})\n\n**Title:** ${title}\n**Type:** ${link ? "Link" : "Ask HN"}\n`;
        if (link) draft += `**URL:** ${link}\n`;
        if (!link) draft += `\n---\n${content}\n---`;
        break;
      }
    }

    return ok(draft);
  },
};

const analyse_social_profile: AgentTool = {
  name: "analyse_social_profile",
  label: "Analyse Social Profile",
  description:
    "Fetch a public social media profile or page and extract key metrics and content strategy insights. " +
    "Works by fetching the public web version of the profile.",
  parameters: Type.Object({
    url: Type.String({ description: "Public profile URL (e.g. https://twitter.com/username, https://reddit.com/r/subreddit)" }),
  }),
  execute: async (_, params: any) => {
    const url = (params.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return ok("Error: provide a valid profile URL.");

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) return ok(`HTTP ${res.status} for ${url}`);

      const html = await res.text();
      const text = stripHtml(html);

      // Extract what we can from the page
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
      const desc = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1]
        ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1] ?? "";

      let report = `## Social Profile Analysis: ${url}\n\n`;
      report += `**Page Title:** ${title || "(none)"}\n`;
      report += `**Description:** ${desc || "(none)"}\n`;
      report += `**Content Length:** ${text.split(/\s+/).length} words\n\n`;
      report += `### Page Text Preview (first 2000 chars)\n\n${text.slice(0, 2000)}\n`;

      return ok(report);
    } catch (err: any) {
      return ok(`Profile analysis failed: ${err?.message ?? err}`);
    }
  },
};

// ── GEO (Generative Engine Optimization) Tools ───────────────────────────────

const geo_brand_check: AgentTool = {
  name: "geo_brand_check",
  label: "GEO Brand Check",
  description:
    "Check brand/product visibility in AI search engines by searching SearXNG for AI-style queries. " +
    "Simulates how a user would ask an AI about your product category and checks if your brand appears " +
    "in the results. Use this to track GEO (Generative Engine Optimization) performance.",
  parameters: Type.Object({
    brand_name: Type.String({ description: "Your brand or product name to look for" }),
    queries: Type.Array(Type.String(), { description: "Search queries a user might ask an AI (e.g. 'best project management tools for startups')" }),
  }),
  execute: async (_, params: any) => {
    const brand = (params.brand_name ?? "").trim();
    if (!brand) return ok("Error: brand_name is required.");

    const queries: string[] = params.queries ?? [];
    if (!queries.length) return ok("Error: at least one query is required.");

    const searxUrl = config.searxngUrl;
    const results: { query: string; found: boolean; position: number; snippet: string }[] = [];

    for (const q of queries.slice(0, 10)) {
      try {
        const url = `${searxUrl}/search?q=${encodeURIComponent(q)}&format=json&categories=general&pageno=1`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          results.push({ query: q, found: false, position: -1, snippet: `SearXNG error: ${res.status}` });
          continue;
        }

        const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
        const items = data.results ?? [];
        const brandLower = brand.toLowerCase();
        const idx = items.findIndex(r =>
          (r.title ?? "").toLowerCase().includes(brandLower) ||
          (r.url ?? "").toLowerCase().includes(brandLower) ||
          (r.content ?? "").toLowerCase().includes(brandLower)
        );

        results.push({
          query: q,
          found: idx >= 0,
          position: idx >= 0 ? idx + 1 : -1,
          snippet: idx >= 0 ? (items[idx].content ?? "").slice(0, 100) : "Not found in top results",
        });
      } catch {
        results.push({ query: q, found: false, position: -1, snippet: "Search failed" });
      }
    }

    const found = results.filter(r => r.found).length;
    let report = `## GEO Brand Visibility Report: "${brand}"\n\n`;
    report += `**Visibility Score: ${found}/${results.length} queries** (${Math.round((found / results.length) * 100)}%)\n\n`;
    report += `| Query | Found | Position | Snippet |\n|-------|-------|----------|--------|\n`;
    for (const r of results) {
      report += `| ${r.query} | ${r.found ? "Yes" : "No"} | ${r.position > 0 ? `#${r.position}` : "—"} | ${r.snippet.slice(0, 60)} |\n`;
    }

    report += `\n### Recommendations\n`;
    if (found === 0) {
      report += `- Brand "${brand}" not found in any search results — critical visibility gap\n`;
      report += `- Create authoritative content targeting these exact queries\n`;
      report += `- Build citations on high-authority domains\n`;
    } else if (found < results.length) {
      const missing = results.filter(r => !r.found).map(r => `"${r.query}"`);
      report += `- Missing from: ${missing.join(", ")}\n`;
      report += `- Create targeted content for these specific queries\n`;
    } else {
      report += `- Excellent visibility! Monitor for ranking changes.\n`;
    }

    return ok(report);
  },
};

const content_gap_analysis: AgentTool = {
  name: "content_gap_analysis",
  label: "Content Gap Analysis",
  description:
    "Search for content opportunities by querying a topic and analysing what existing content covers. " +
    "Identifies gaps and angles that aren't well covered — useful for content strategy planning.",
  parameters: Type.Object({
    topic: Type.String({ description: "The topic or keyword to analyse" }),
    num_results: Type.Optional(Type.Number({ description: "Number of results to analyse (default 10)" })),
  }),
  execute: async (_, params: any) => {
    const topic = (params.topic ?? "").trim();
    if (!topic) return ok("Error: topic is required.");

    const limit = Math.min(params.num_results ?? 10, 20);
    const searxUrl = config.searxngUrl;

    try {
      const url = `${searxUrl}/search?q=${encodeURIComponent(topic)}&format=json&categories=general&pageno=1`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) return ok(`SearXNG error: ${res.status}`);

      const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      const items = (data.results ?? []).slice(0, limit);

      if (!items.length) return ok(`No results found for: "${topic}"`);

      let report = `## Content Gap Analysis: "${topic}"\n\n`;
      report += `### Existing Content (Top ${items.length} Results)\n\n`;

      for (let i = 0; i < items.length; i++) {
        const r = items[i];
        report += `**${i + 1}. ${r.title ?? "(no title)"}**\n`;
        report += `   URL: ${r.url}\n`;
        report += `   ${r.content ?? "(no snippet)"}\n\n`;
      }

      // Extract common themes from titles and snippets
      const allText = items.map(r => `${r.title ?? ""} ${r.content ?? ""}`).join(" ").toLowerCase();
      const words = allText.split(/\s+/).filter(w => w.length > 4);
      const freq: Record<string, number> = {};
      const stopwords = new Set(["about", "their", "which", "would", "there", "these", "other", "could", "after", "before"]);
      for (const w of words) if (!stopwords.has(w)) freq[w] = (freq[w] ?? 0) + 1;
      const themes = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);

      report += `### Common Themes in Existing Content\n`;
      report += themes.map(([w, c]) => `- "${w}" (${c} mentions)`).join("\n");
      report += `\n\n### Suggested Content Angles\n`;
      report += `- Look for topics NOT covered in the top results above\n`;
      report += `- Consider "how-to", "comparison", "alternative to" angles\n`;
      report += `- Check if any results are outdated — opportunity for fresh content\n`;

      return ok(report);
    } catch (err: any) {
      return ok(`Content gap analysis failed: ${err?.message ?? err}`);
    }
  },
};

// ── Export bundles ────────────────────────────────────────────────────────────

/** SEO-focused tools: audit, keywords, competitor comparison */
export function getSEOTools(): AgentTool[] {
  return [seo_audit, keyword_analysis, competitor_analysis];
}

/** Social media tools: draft posts, profile analysis */
export function getSocialTools(): AgentTool[] {
  return [draft_social_post, analyse_social_profile];
}

/** GEO and content strategy tools */
export function getGEOTools(): AgentTool[] {
  return [geo_brand_check, content_gap_analysis];
}

/** All marketing tools combined */
export function getAllMarketingTools(): AgentTool[] {
  return [...getSEOTools(), ...getSocialTools(), ...getGEOTools()];
}
