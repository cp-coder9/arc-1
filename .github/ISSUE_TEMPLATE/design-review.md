---
name: Design Review Issues
about: Track design, UX, accessibility, and consistency issues from design reviews
title: "🎨 [Design Review] "
labels: design,ui-ux
---

# Design Review: Architex Complete App Analysis

**Review Date**: May 2, 2026  
**Scope**: All 7 Pages (Landing, Login, Client Dashboard, Architect Dashboard, Admin Dashboard, Freelancer Dashboard, BEP Dashboard)  
**Focus Areas**: Visual Design, UX/Usability, Responsive/Mobile, Accessibility, Micro-interactions/Motion, Consistency  

## Executive Summary

The Architex app has a strong foundation with correct color alignment to the logo (teal #0d9488) and a clean white background theme. However, there are **critical consistency issues** across dashboards where hardcoded colors and inconsistent background values override the design system. The app lacks sophisticated landing page animations and has accessibility concerns regarding color contrast and interactive element focus states.

**Overall findings: 15 issues** - 3 critical, 6 high, 4 medium, and 2 low priority.

### Logo Color Analysis
- **Primary Teal**: #0d9488 (correctly applied as primary in theme) ✅
- **Lighter Teal Shades**: Various lighter tints needed
- **Light Gray Background**: #F8FAFC provides excellent contrast ✅

## Critical Issues (Fix Immediately)

| # | Issue | Location |
|---|-------|----------|
| 1 | Hardcoded `bg-[#FDFDFD]` instead of `bg-background` theme token | `src/App.tsx:341` |
| 2 | StatCard hardcoded colors (text-yellow-600, text-blue-600, text-green-600) | `src/components/FreelancerDashboard.tsx:53-55` |
| 3 | Same hardcoded StatCard colors in BEPDashboard | `src/components/BEPDashboard.tsx:~100-120` |
| 6 | WCAG AA contrast issues with secondary colors (#f1f5f9) | `src/index.css:58-73` |

## High Priority Issues (This Sprint)

| # | Issue | Location |
|---|-------|----------|
| 4 | Landing page missing hero animations | `src/App.tsx:266` (LandingPage) |
| 5 | Login card inline styles instead of theme tokens | `src/App.tsx:279` |
| 7 | No visible focus indicators for keyboard navigation | Multiple components |
| 8 | Admin Dashboard too complex; poor readability | `src/components/AdminDashboard.tsx` |

## Medium Priority (Next Sprint)

| # | Issue | Location |
|---|-------|----------|
| 9 | Inconsistent padding: p-6 vs p-10 across dashboards | `src/components/FreelancerDashboard.tsx:41` |
| 10 | Responsive behavior not tested across all dashboards | `src/components/OnboardingFlow.tsx:48` |
| 13 | Sidebar toggle lacks ARIA labels | `src/App.tsx:347` |

## Low Priority (Future)

| # | Issue | Location |
|---|-------|----------|
| 11 | Logo fallback uses wrong icon color | `src/components/Logo.tsx:35-37` |
| 14 | No loading animations on dashboard transitions | Multiple components |
| 15 | Typography hierarchy inconsistent | Multiple dashboards |

## Design System Recommendations

### Color Palette (Logo-Aligned)
```
Primary:        #0d9488  (Teal - matches logo)
Primary-Light:  #14b8a6  (Lighter teal for hover states)
Primary-Dark:   #0f7560  (Darker teal for active states)
Secondary:      #f1f5f9  (Light gray)
Accent:         #06b6d4  (Cyan - complementary)
Background:     #F8FAFC  (Off-white)
Foreground:     #0f172a  (Dark slate)
```

## Action Items

### Immediate (Critical)
- [ ] Replace `bg-[#FDFDFD]` with `bg-background` in main dashboard
- [ ] Fix StatCard colors in FreelancerDashboard
- [ ] Fix StatCard colors in BEPDashboard
- [ ] Run WCAG contrast audit on secondary colors

### This Sprint (High Priority)
- [ ] Implement landing page hero animations using Framer Motion
- [ ] Standardize login card styling with theme tokens
- [ ] Refactor Admin Dashboard layout
- [ ] Add visible focus indicators (outline-2 outline-ring)

### Next Sprint (Medium)
- [ ] Standardize padding across dashboard headers
- [ ] Test responsive behavior on mobile
- [ ] Add ARIA labels to interactive elements

### Future (Low Priority)
- [ ] Design teal-colored icon for logo fallback
- [ ] Add skeleton loaders during data fetching
- [ ] Establish typography hierarchy guidelines

## Positive Findings ✅

- Logo alignment is perfect: Teal (#0d9488) matches beautifully
- Clean white background provides excellent readability
- shadcn/ui components provide strong accessibility foundation
- Framer Motion properly integrated for animations
- Responsive grid layouts correctly use breakpoints
- Design tokens well-structured in Tailwind theme

## Estimated Effort

**3-4 days** for all critical + high priority fixes with testing

---

**Full Review**: See [.kombai/resources/design-review-all-pages.md](.kombai/resources/design-review-all-pages.md) for detailed findings across all focus areas.
