# AI Drawing Compliance Pre-check — ai_drawing_checker

## Overview

| Field | Value |
|-------|-------|
| **ID** | `ai_drawing_checker` |
| **Category** | `drawing` |
| **StandaloneOnly** | true |
| **Roles** | 7 professional roles |
| **Current State** | Routes to `/drawing-checker` page. Runner uses drawing form (title, number, notes) — too weak |
| **Priority** | P3 |
| **Branch** | `toolbox/ai-drawing-checker` |

## PRD

A professional uploads drawings for AI-powered SANS/NBR compliance pre-check. The full page at `/drawing-checker` provides the full UI; the standalone runner provides a quick entry.

## Tasks

- [ ] Add "Open full AI Drawing Checker" button
- [ ] Keep existing drawing form for quick entry
- [ ] Add: compliance standards selector for pre-check
