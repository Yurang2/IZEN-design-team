# 40_ACCEPTANCE_CHECKLIST

## ì™„ë£Œ ì „ ì²´í¬ë¦¬ìŠ¤íŠ¸
- [ ] ìš”êµ¬ì‚¬í•­ì„ ëª¨ë‘ ì¶©ì¡±í–ˆë‹¤.
- [ ] í•µì‹¬ ê¸°ëŠ¥ íšŒê·€ í…ŒìŠ¤íŠ¸ë¥¼ í†µê³¼í–ˆë‹¤.
- [ ] ë¬¸ì„œ/ìš´ì˜ ë¡œê·¸(AAR)ë¥¼ ìµœì‹ ìœ¼ë¡œ ë°˜ì˜í–ˆë‹¤.
- [ ] ì•Œë ¤ì§„ ì¹˜ëª… ê²°í•¨ì´ ì—†ë‹¤.

## íŒì •
- í†µê³¼ ì—¬ë¶€:
- íŒì •ì:
- íŒì • ì¼ì‹œ:


### 2026-02-27 Meetings R2 Stability Check
- [x] ¿ä±¸»çÇ×À» ¸ğµÎ ÃæÁ·Çß´Ù. (R2 bucket binding °íÁ¤ + fetch 500 ¼öÁ¤)
- [x] µµ¸ŞÀÎ ±â´É Ãß°¡ Å×½ºÆ®¸¦ Åë°úÇß´Ù. (WAV E2E completed)
- [x] ¹®¼­/¿î¿µ ·Î±×(AAR)¸¦ ÃÖ½ÅÀ¸·Î ¹İ¿µÇß´Ù.
- [x] ¾Ë·ÁÁø Ä¡¸í °áÇÔÀÌ ¾ø´Ù. (º» ½Ã³ª¸®¿À ±âÁØ)

## ÆÇÁ¤ (2026-02-27)
- Åë°ú ¿©ºÎ: PASS
- ÆÇÁ¤ÀÚ: Codex
- ÆÇÁ¤ ÀÏ½Ã: 2026-02-27

### 2026-02-27 Korean Transcript Verification
- [x] Korean transcript recognition enforced (`language_code=ko`)
- [x] E2E scenario passed with real WAV input
- [x] AAR and test logs updated

### 2026-02-27 Meetings Labeling-first Flow
- [x] ¶óº§¸µ ¿ì¼± + ¼öµ¿ publish Á¤Ã¥ ¹İ¿µ
- [x] »óÅÂ Ç¥±â ºĞ¸®(Àü»ç ÁøÇàÁß/¶óº§¸µ ÇÊ¿ä/¹İ¿µ ¿Ï·á)
- [x] ¹®¼­/ÈÅ °è¾à ¾÷µ¥ÀÌÆ® ¿Ï·á
- [x] ¹èÆ÷ ¶ó¿ìÆ® ¹İ¿µ È®ÀÎ ¿Ï·á

### 2026-02-27 Meetings UI Compact Pass
- [x] Å°¿öµå UI ÇÏ´Ü ÀÌµ¿/Ãà¼Ò ¹İ¿µ
- [x] Àü»ç ¸ñ·Ï + ¸ÅÇÎ »ó¼¼ »ó´Ü ¿ì¼± ¹èÄ¡
- [x] ºôµå ¹× ´ë»ó ÆÄÀÏ ¸°Æ® Åë°ú

### 2026-02-27 Meetings Publish Hotfix Check
- [x] »ó¼¼ »ó´Ü ºÒÇÊ¿ä Á¤º¸(³»º¸³»±â/Assembly ID) Á¦°Å
- [x] ÃÖ±Ù Àü»ç ¼±ÅÃ ÇÏÀÌ¶óÀÌÆ® ¹İ¿µ
- [x] publish Illegal invocation ÀÌ½´ ÀçÇö/¼öÁ¤/Àç°ËÁõ ¿Ï·á

### 2026-02-27 Meetings Date/Title/Summary Update
- [x] filename-based title/date parsing path enforced in UI + worker
- [x] Notion date property alias handling added (`ÀÏÀÚ`/`³¯Â¥`)
- [x] optional GPT summary wiring added (OPENAI_API_KEY)
- [x] build/typecheck passed
### 2026-02-27 Meetings Keyword Compactness Update
- [x] keyword set/item boxes compacted to chip-like layout
- [x] small action buttons applied (E/X)
- [x] build/typecheck passed
### 2026-02-27 Meetings Keyword Action Feedback + GPT-5 Default
- [x] keyword set/keyword edit-delete controls switched to icons
- [x] per-item loading state added for edit/delete actions
- [x] meeting summary default model updated to gpt-5
- [x] build/typecheck passed
### 2026-02-27 Summary Default Model Rollback
- [x] default summary model reverted to gpt-5-mini
- [x] wrangler/docs default text synchronized
- [x] build/typecheck passed
### 2026-02-27 Assembly Speech Model Default Update
- [x] default speech model routing set to universal-2
- [x] optional override env (`ASSEMBLYAI_SPEECH_MODELS`) documented
- [x] build/typecheck passed
### 2026-02-27 Notion Timestamp Output Update
- [x] Notion utterance bullets include timestamp prefix
- [x] docs synchronized (hook-master / meetings guides)
- [x] build/typecheck passed
### 2026-02-27 m4a MIME Compatibility Fix
- [x] audio/x-m4a normalized to audio/mp4
- [x] upload + notion attach paths both covered
- [x] build/typecheck passed
### 2026-02-27 GPT Draft Prompt Policy Update
- [x] GPT summary prompt replaced with structured draft template
- [x] summary source includes utterance timestamp range
- [x] default model remains gpt-5-mini
- [x] build/typecheck passed
### 2026-02-27 Summary Visibility + Korean Output Enforcement
- [x] publish no longer swallows summary errors silently
- [x] publish response includes summaryGenerated/summaryError
- [x] GPT prompt enforces Korean output language
- [x] build/typecheck passed
### 2026-02-27 OpenAI Summary Empty Diagnostics Hardening
- [x] response text extractor supports additional payload shapes
- [x] empty-summary error includes status/output/content type diagnostics
- [x] responses request enforces text format
- [x] build/typecheck passed
### 2026-02-27 Summary Token Incomplete Retry
- [x] source cap reduced to 10k chars
- [x] retry on `incomplete=max_output_tokens` implemented
- [x] retry uses shorter source + higher output token budget
- [x] build/typecheck passed
### 2026-02-27 Korean Summary Quality Guard
- [x] Korean section-heading enforcement strengthened
- [x] English labels normalized to Korean in post-processing
- [x] token-incomplete first output now retries before accept
- [x] build/typecheck passed
