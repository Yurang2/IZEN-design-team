-- Meetings/STT feature tables (AssemblyAI + Speaker Map + Word Boost)
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  audio_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  assembly_id TEXT,
  status TEXT NOT NULL,
  raw_json TEXT,
  utterances_json TEXT,
  text TEXT,
  keywords_used_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS speaker_maps (
  transcript_id TEXT NOT NULL,
  speaker_label TEXT NOT NULL,
  display_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (transcript_id, speaker_label)
);

CREATE TABLE IF NOT EXISTS keyword_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  phrase TEXT NOT NULL,
  weight REAL,
  tags TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_assembly_id ON transcripts(assembly_id);
CREATE INDEX IF NOT EXISTS idx_keywords_set_id ON keywords(set_id);
