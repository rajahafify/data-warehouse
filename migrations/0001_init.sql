-- Projects: one row per project, with a living "context" summary the AI reads first.
CREATE TABLE projects (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  context     TEXT NOT NULL DEFAULT '',          -- markdown: goals, current state, key decisions
  status      TEXT NOT NULL DEFAULT 'active',    -- active | paused | archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notes: append-only log of notes, decisions, status updates and todos per project.
CREATE TABLE notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'note',     -- note | decision | status | todo | reference
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '',         -- comma-separated
  source       TEXT NOT NULL DEFAULT '',         -- which AI tool wrote it (claude, chatgpt, gemini...)
  created_by   TEXT NOT NULL DEFAULT '',         -- GitHub login of the signed-in user
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_project ON notes(project_slug, created_at DESC);

-- Full-text search over notes.
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body, tags,
  content='notes', content_rowid='id'
);

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body, tags) VALUES (new.id, new.title, new.body, new.tags);
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags) VALUES ('delete', old.id, old.title, old.body, old.tags);
END;

CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags) VALUES ('delete', old.id, old.title, old.body, old.tags);
  INSERT INTO notes_fts(rowid, title, body, tags) VALUES (new.id, new.title, new.body, new.tags);
END;
