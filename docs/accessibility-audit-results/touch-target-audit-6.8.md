# Touch Target Size Audit — Task 6.8
**Requirement: 8.9** — All interactive elements on mobile must meet 44×44px minimum touch target.  
**Viewport tested:** 320px (smallest mobile)  
**Method:** Static analysis of Tailwind padding + line-height; Tailwind v4 defaults used.

---

## Calculation Basis

| Utility | Pixel value |
|---------|------------|
| `py-1`  | 4px top + 4px bottom = **8px** padding |
| `py-2`  | 8px top + 8px bottom = **16px** padding |
| `py-3`  | 12px top + 12px bottom = **24px** padding |
| `p-2`   | 8px all sides = **16px** vertical padding |
| `text-sm` line-height | 1.25rem = **20px** |
| `text-base` line-height | 1.5rem = **24px** |
| `text-lg` line-height | 1.75rem = **28px** |
| `text-xs` line-height | 1rem = **16px** |

---

## Findings Before Fix

| Element | Classes | Height Calc | Result |
|---------|---------|-------------|--------|
| **GlassButton sm** | `px-3 py-1 text-sm` | 20 + 8 = **28px** | ❌ -16px |
| **GlassButton md** | `px-4 py-2 text-base` | 24 + 16 = **40px** | ❌ -4px |
| **GlassButton lg** | `px-6 py-3 text-lg` | 28 + 24 = **52px** | ✅ |
| **GlassInput** | `px-4 py-2 text-base` | 24 + 16 = **40px** | ❌ -4px |
| **GlassTable th/td** | `px-4 py-3 text-sm` | 20 + 24 = **44px** | ✅ exactly |
| **MobileMenuTrigger** | `glass-button p-2` + icon 20px | 20 + 16 = **36px** | ❌ -8px |
| **Sidebar module headers** | `px-4 py-2 text-xs` | 16 + 16 = **32px** | ❌ -12px |
| **Sidebar section links** | `px-3 py-2 text-sm` | 20 + 16 = **36px** | ❌ -8px |
| **Sidebar Help/Sign Out buttons** | `px-4 py-2 text-sm` | 20 + 16 = **36px** | ❌ -8px |

---

## Fixes Applied

All non-compliant elements received `min-h-[44px]` (and `min-w-[44px]` for the icon-only hamburger).  
No padding values were altered — the minimum height ensures 44px without inflating layout unnecessarily.

| File | Change |
|------|--------|
| `src/components/ui/GlassButton.tsx` | `sm` size: added `min-h-[44px]`; `md` size: added `min-h-[44px]` |
| `src/components/ui/GlassInput.tsx` | Added `min-h-[44px]` |
| `src/components/navigation/MobileMenuTrigger.tsx` | Added `min-h-[44px] min-w-[44px] flex items-center justify-center` |
| `src/components/navigation/RoleAwareSidebar.tsx` | Module headers: `min-h-[44px]`; section links: `min-h-[44px] flex items-center`; Help/Sign Out: `min-h-[44px]` (merged with existing `flex items-center gap-2`) |
| `src/components/navigation/MobileMenuTrigger.test.tsx` | Updated class assertion from `/block/` to `/flex\|block/` (tailwind-merge drops `block` when `flex` is present — both convey the same display intent; `md:hidden` still hides on desktop) |

---

## Post-Fix Status

| Element | Height | Status |
|---------|--------|--------|
| GlassButton sm | ≥ 44px (min-h) | ✅ |
| GlassButton md | ≥ 44px (min-h) | ✅ |
| GlassButton lg | 52px (natural) | ✅ |
| GlassInput | ≥ 44px (min-h) | ✅ |
| GlassTable rows | 44px (natural py-3) | ✅ |
| MobileMenuTrigger | ≥ 44×44px (min-h + min-w) | ✅ |
| Sidebar module headers | ≥ 44px (min-h) | ✅ |
| Sidebar section links | ≥ 44px (min-h) | ✅ |
| Sidebar Help & Sign Out buttons | ≥ 44px (min-h) | ✅ |

**Zero elements below 44px minimum on mobile viewport (320px).**

---

## Tests

All 79 tests in the 4 affected test files pass after the fix:
- `src/components/ui/GlassButton.test.tsx`
- `src/components/ui/GlassInput.test.tsx`
- `src/components/navigation/MobileMenuTrigger.test.tsx`
- `src/components/navigation/RoleAwareSidebar.test.tsx`
