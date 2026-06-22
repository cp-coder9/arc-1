# BEP Proposal Comparison — proposal_comparison

## Overview

| Field | Value |
|-------|-------|
| **ID** | `proposal_comparison` |
| **Category** | `proposal` |
| **Roles** | client |
| **Current State** | Routes to `/client-proposals` page. Runner uses generic |
| **Priority** | P5 |
| **Branch** | `toolbox/proposal-comparison` |

## PRD

A client compares professional proposals side-by-side: firm name, fee, scope, exclusions, timeline.

## Functional Requirements

### FR-1: Input Form

Table input — add proposal rows:
| Field | Type |
|-------|------|
| Firm Name | text |
| Fee (R) | number |
| Scope % | number |
| Exclusions | text |
| Timeline (weeks) | number |

### FR-2: Output

Side-by-side comparison table with lowest-fee highlighting.

### Tasks

- [ ] Add tabular input form
- [ ] Build comparison table output
- [ ] Add "Open full Proposals page" link
