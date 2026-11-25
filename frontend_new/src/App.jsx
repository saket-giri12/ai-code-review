
import { useState } from "react";
import "./App.css";

const examples = {
  python: `def check_user(user):
    if user == None:
        return eval("1 + 2")
    return "No user"`,

  java: `public class Main {
    public static void main(String[] args) {
        String a = "Hello";

        if (a == "Hello") {
            System.out.println(a);
        }
    }
}`,

  c: `#include <stdio.h>

int main() {
    printf("Hello World");
    return 0;
}`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello World" << endl;
    return 0;
}`
};

const navigation = [
  { name: "Dashboard", icon: "⌂", group: "WORKSPACE" },
  { name: "Code Review", icon: "</>", group: "WORKSPACE" },
  { name: "Review History", icon: "◷", group: "WORKSPACE" },
  { name: "Settings", icon: "⚙", group: "PREFERENCES" }
];

function categorizeIssues(issues = [], syntaxError = null) {
  const all = [...issues];

  if (syntaxError) {
    all.push({
      type: "Syntax / Compilation Error",
      message: syntaxError.message,
      line: syntaxError.line
    });
  }

  const security = [];
  const bugs = [];
  const quality = [];

  all.forEach((issue) => {
    const text = `${issue.type} ${issue.message}`.toLowerCase();

    const isSecurity =
      /security|vulnerab|eval\(|exec\(|gets\(|strcpy|strcat|sprintf|password|injection|unsafe/.test(text);

    const isBug =
      /syntax|compilation|error|exception|undefined|null|uninitialized|overflow/.test(text);

    if (isSecurity) {
      security.push(issue);
    } else if (isBug) {
      bugs.push(issue);
    } else {
      quality.push(issue);
    }
  });

  return { bugs, security, quality, all };
}

function getSeverity(issue) {
  const text = `${issue.type} ${issue.message}`.toLowerCase();

  if (/eval\(|exec\(|gets\(|hardcoded password|critical|injection/.test(text)) {
    return "High";
  }

  if (/security|vulnerab|strcpy|strcat|sprintf|exception|compilation/.test(text)) {
    return "Medium";
  }

  return "Low";
}

function getFix(issue) {
  const text = `${issue.type} ${issue.message}`.toLowerCase();

  if (text.includes("eval")) {
    return "Avoid eval(). Use a safe, explicit operation instead.";
  }

  if (text.includes("exec")) {
    return "Avoid executing dynamic input. Validate and use safer alternatives.";
  }

  if (text.includes("== none") || text.includes("none")) {
    return "Use 'is None' instead of comparing None with ==.";
  }

  if (text.includes("gets")) {
    return "Replace gets() with fgets() and specify a buffer size.";
  }

  if (text.includes("strcpy")) {
    return "Use a bounded copy operation and validate destination buffer size.";
  }

  if (text.includes("strcat")) {
    return "Check available buffer capacity before concatenating strings.";
  }

  if (text.includes("sprintf")) {
    return "Prefer snprintf() with an explicit destination buffer size.";
  }

  if (text.includes("password")) {
    return "Do not hardcode credentials. Use secure environment-based configuration.";
  }

  if (text.includes("string") && text.includes("==")) {
    return "Use .equals() to compare Java string contents.";
  }

  if (text.includes("bare except")) {
    return "Catch specific exceptions instead of using a bare except block.";
  }

  if (/syntax|compilation/.test(text)) {
    return "Review the reported compiler message and correct the code at the indicated line.";
  }

  return "Review this finding and apply the recommended language-specific coding practice.";
}

function App() {
  const [activePage, setActivePage] = useState("Code Review");
  const [language, setLanguage] = useState("python");
  const [defaultLanguage, setDefaultLanguage] = useState("python");
  const [code, setCode] = useState(examples.python);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const changePage = (page) => {
    setActivePage(page);
    setError("");
  };

  const changeLanguage = (value) => {
    setLanguage(value);
    setCode(examples[value]);
    setResult(null);
    setError("");
  };

  const analyzeCode = async () => {
    if (!code.trim()) {
      setError("Please enter some code first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        "https://ai-code-review-backend-vp8a.onrender.com/api/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ code, language })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Analysis failed");
      }

      setResult(data);

      const record = {
        id: Date.now(),
        language: language.toUpperCase(),
        summary: data.summary || "Analysis completed",
        success: data.success,
        issueCount:
          (data.issues?.length || 0) + (data.syntax_error ? 1 : 0),
        date: new Date().toLocaleString(),
        code,
        result: data
      };

      setHistory((previous) => [record, ...previous]);

    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to backend. Please start FastAPI."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const openHistoryRecord = (record) => {
    setLanguage(record.language.toLowerCase());
    setCode(record.code);
    setResult(record.result || null);
    setActivePage("Code Review");
    setError("");
  };

  const clearHistory = () => {
    if (window.confirm("Clear all review history?")) {
      setHistory([]);
    }
  };

  const renderSidebar = () => (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-icon">&lt;/&gt;</div>
        <div>
          <h2>CodeSense</h2>
          <span>AI Code Intelligence</span>
        </div>
      </div>

      {["WORKSPACE", "PREFERENCES"].map((group) => (
        <div className="nav-group" key={group}>
          <p className="nav-label">{group}</p>

          {navigation
            .filter((item) => item.group === group)
            .map((item) => (
              <button
                key={item.name}
                className={`nav-item ${
                  activePage === item.name ? "active" : ""
                }`}
                onClick={() => changePage(item.name)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{item.name}</span>
                {activePage === item.name && (
                  <span className="active-dot" />
                )}
              </button>
            ))}
        </div>
      ))}

      <div className="sidebar-bottom">
        <div className="profile-avatar">CS</div>
        <div>
          <strong>CodeSense User</strong>
          <span>Developer account</span>
        </div>
      </div>
    </aside>
  );

  const renderDashboard = () => (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>Dashboard</h1>
          <p>AI-powered code review and bug detection.</p>
        </div>
        <button className="primary-btn" onClick={() => changePage("Code Review")}>
          + New Review
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">⌘</div>
          <span>Total Reviews</span>
          <h2>{history.length}</h2>
          <small>Analyses performed</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">✓</div>
          <span>Successful Reviews</span>
          <h2>{history.filter((x) => x.success).length}</h2>
          <small>Successful analyzer responses</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">!</div>
          <span>Findings Detected</span>
          <h2>{history.reduce((n, x) => n + x.issueCount, 0)}</h2>
          <small>Reported issues</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">&lt;/&gt;</div>
          <span>Languages</span>
          <h2>4</h2>
          <small>Python, Java, C and C++</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Recent Code Reviews</h3>
            <p>Your latest analysis activity.</p>
          </div>
          <button className="text-btn" onClick={() => changePage("Review History")}>
            View all →
          </button>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            <span>◷</span>
            <div>
              <strong>No reviews yet</strong>
              <p>Start your first code review.</p>
            </div>
          </div>
        ) : history.slice(0, 5).map((item) => (
          <button className="history-row" key={item.id} onClick={() => openHistoryRecord(item)}>
            <span className="history-icon">&lt;/&gt;</span>
            <span className="history-info">
              <strong>{item.language} Review</strong>
              <small>{item.date}</small>
            </span>
            <span className="history-issues">{item.issueCount} findings</span>
            <span className="row-arrow">→</span>
          </button>
        ))}
      </section>
    </>
  );

  const renderFindings = (title, description, issues, type) => (
    <section className="analysis-section" key={title}>
      <div className="analysis-section-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="finding-count">{issues.length}</span>
      </div>

      {issues.length === 0 ? (
        <div className="no-findings">
          ✓ No {type} findings reported by the analyzer.
        </div>
      ) : issues.map((issue, index) => (
        <div className="finding-card" key={index}>
          <div className="finding-top">
            <strong>{issue.type}</strong>
            <span className={`severity ${getSeverity(issue).toLowerCase()}`}>
              {getSeverity(issue)}
            </span>
          </div>
          <p>{issue.message}</p>
          <small>Line: {issue.line ?? "Not provided"}</small>
        </div>
      ))}
    </section>
  );

  const renderAnalysis = () => {
    const { bugs, security, quality, all } =
      categorizeIssues(result.issues || [], result.syntax_error);

    // A transparent heuristic indicator, not a formal quality measurement.
    const penalty = all.reduce((total, issue) => {
      const severity = getSeverity(issue);
      return total + (severity === "High" ? 20 : severity === "Medium" ? 12 : 5);
    }, 0);

    const score = Math.max(0, 100 - penalty);

    return (
      <section className="result-card">
        <div className="result-heading">
          <div>
            <span className="eyebrow">AI CODE REVIEW REPORT</span>
            <h2>Analysis Results</h2>
            <p className="report-subtitle">
              {language.toUpperCase()} · {new Date().toLocaleString()}
            </p>
          </div>
          <span className={`status ${result.success ? "good" : "bad"}`}>
            {result.success ? "Analysis completed" : "Issues detected"}
          </span>
        </div>

        <p className="summary">{result.summary}</p>

        <div className="report-stats">
          <div>
            <span>Quality Indicator*</span>
            <strong>{score}/100</strong>
          </div>
          <div>
            <span>Bugs / Errors</span>
            <strong>{bugs.length}</strong>
          </div>
          <div>
            <span>Security Findings</span>
            <strong>{security.length}</strong>
          </div>
          <div>
            <span>Code Review Findings</span>
            <strong>{quality.length}</strong>
          </div>
        </div>

        <p className="score-note">
          *Heuristic indicator based on findings reported by the current analyzer.
          It is not a formal or comprehensive code-quality score.
        </p>

        {renderFindings(
          "1. Bug Detection",
          "Syntax errors, compilation failures and suspicious bug patterns.",
          bugs,
          "bug"
        )}

        {renderFindings(
          "2. Security Vulnerability Detection",
          "Potentially unsafe functions and security-related patterns.",
          security,
          "security"
        )}

        {renderFindings(
          "3. Code Quality Review",
          "Code practices and improvement opportunities reported by the analyzer.",
          quality,
          "quality"
        )}

        <section className="analysis-section">
          <div className="analysis-section-heading">
            <div>
              <h3>4. Suggested Fixes</h3>
              <p>Recommendations associated with detected findings.</p>
            </div>
          </div>

          {all.length === 0 ? (
            <div className="no-findings">
              No fixes suggested because no findings were reported.
            </div>
          ) : all.map((issue, index) => (
            <div className="fix-card" key={index}>
              <strong>{issue.type}</strong>
              <p>{getFix(issue)}</p>
              <small>Related line: {issue.line ?? "Not provided"}</small>
            </div>
          ))}
        </section>
      </section>
    );
  };

  const renderCodeReview = () => (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AI-POWERED DEVELOPER TOOL</span>
          <h1>AI Code Review & Bug Detection</h1>
          <p>Find bugs, identify security risks and review code quality.</p>
        </div>
        <div className="heading-icon">&lt;/&gt;</div>
      </div>

      <section className="editor-card">
        <div className="card-heading">
          <div>
            <h3>Code Editor</h3>
            <p>Write or paste your source code below.</p>
          </div>

          <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
          </select>
        </div>

        <div className="editor-toolbar">
          <span><i /> main.{language === "cpp" ? "cpp" : language}</span>
          <span>● Ready to analyze</span>
        </div>

        <textarea
          className="code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setResult(null);
          }}
          spellCheck="false"
          placeholder="Write your code here..."
        />

        <div className="editor-footer">
          <span>CodeSense Analyzer · {language.toUpperCase()}</span>
          <button className="analyze-btn" onClick={analyzeCode} disabled={loading}>
            {loading ? "Analyzing..." : "✦ Analyze Code"}
          </button>
        </div>
      </section>

      {error && (
        <div className="result-card error">
          <h3>Something went wrong</h3>
          <p>{error}</p>
        </div>
      )}

      {result && renderAnalysis()}

      {!result && !error && (
        <div className="empty-state">
          <span>✦</span>
          <div>
            <strong>Ready for code analysis</strong>
            <p>Your bug detection and code review report will appear here.</p>
          </div>
        </div>
      )}
    </>
  );

  const renderHistory = () => (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR ACTIVITY</span>
          <h1>Review History</h1>
          <p>Access previous code analysis reports.</p>
        </div>
        {history.length > 0 && (
          <button className="danger-btn" onClick={clearHistory}>Clear History</button>
        )}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>All Reviews</h3>
            <p>{history.length} analysis records in this session.</p>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            <span>◷</span>
            <div>
              <strong>Your history is empty</strong>
              <p>Complete a code review to see it here.</p>
            </div>
          </div>
        ) : history.map((item) => (
          <button className="history-row" key={item.id} onClick={() => openHistoryRecord(item)}>
            <span className="history-icon">&lt;/&gt;</span>
            <span className="history-info">
              <strong>{item.language} Review</strong>
              <small>{item.date}</small>
              <small>{item.summary}</small>
            </span>
            <span className="history-issues">{item.issueCount} findings</span>
            <span className="row-arrow">→</span>
          </button>
        ))}
      </section>
    </>
  );

  const renderSettings = () => (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h1>Settings</h1>
          <p>Manage your CodeSense workspace.</p>
        </div>
        <div className="heading-icon">⚙</div>
      </div>

      <section className="panel settings-panel">
        <h3>Editor Preferences</h3>
        <p>Choose your preferred default programming language.</p>
        <label className="setting-label">Default Language</label>

        <select value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)}>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="c">C</option>
          <option value="cpp">C++</option>
        </select>

        <button className="primary-btn setting-action" onClick={() => {
          changeLanguage(defaultLanguage);
          setActivePage("Code Review");
        }}>
          Apply to Editor
        </button>
      </section>

      <section className="panel settings-panel">
        <h3>Workspace Information</h3>
        <div className="setting-info">
          <span>Application</span><strong>AI Code Review & Bug Detection</strong>
        </div>
        <div className="setting-info">
          <span>Backend</span><strong>FastAPI · Port 8000</strong>
        </div>
        <div className="setting-info">
          <span>Languages</span><strong>Python, Java, C, C++</strong>
        </div>
      </section>

      <section className="panel settings-panel">
        <h3>Manage Data</h3>
        <p>Clear review records stored in this session.</p>
        <button className="danger-btn" onClick={clearHistory}>
          Clear Review History
        </button>
      </section>
    </>
  );

  return (
    <div className="app">
      {renderSidebar()}

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>
          <div className="online"><i /> API Connected</div>
        </header>

        <div className="content">
          {activePage === "Dashboard" && renderDashboard()}
          {activePage === "Code Review" && renderCodeReview()}
          {activePage === "Review History" && renderHistory()}
          {activePage === "Settings" && renderSettings()}
        </div>
      </main>
    </div>
  );
}

export default App;
