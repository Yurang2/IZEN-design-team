-- Storyboard document state (Notion stores human metadata and relations only).
CREATE TABLE IF NOT EXISTS storyboard_documents (
  id TEXT PRIMARY KEY,
  notion_page_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  project_id TEXT,
  project_name TEXT,
  version_name TEXT,
  memo TEXT,
  meta_json TEXT NOT NULL,
  exported_file_names_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS storyboard_frames (
  document_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  frame_order INTEGER NOT NULL,
  frame_json TEXT NOT NULL,
  image_key TEXT,
  image_name TEXT,
  image_content_type TEXT,
  image_width INTEGER,
  image_height INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, frame_id)
);

CREATE INDEX IF NOT EXISTS idx_storyboard_documents_notion_page_id ON storyboard_documents(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_frames_document_order ON storyboard_frames(document_id, frame_order);
