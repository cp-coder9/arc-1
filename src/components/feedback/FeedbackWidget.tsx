import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { MessageCircle, X, Bug, Sparkles, Paintbrush, Heart, Paperclip, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { apiFetch } from "@/lib/apiClient"
import { validateDescription, validateAttachment } from "@/services/feedbackValidation"
import type { UserProfile } from "@/types"
import type { ContextSnapshot, FeedbackCategory, FeedbackStatus, FeedbackSubmission } from "@/services/feedbackTypes"

/**
 * FeedbackWidget — Persistent overlay component for collecting user feedback.
 *
 * Renders a floating trigger button at bottom-right (z-50) that opens an overlay
 * panel with focus trap, Escape key dismiss, and context snapshot capture.
 *
 * Rendered at App shell level alongside DemoBanner and Toaster.
 * The panel is a wrapper — form content (task 7.2) and "My Feedback" (task 7.3)
 * will be added later.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

export interface FeedbackWidgetProps {
  user: UserProfile;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/**
 * Derives the active module name from the current page path.
 * Extracts the first meaningful segment after the root.
 */
function deriveActiveModule(pagePath: string): string {
  const segments = pagePath.split("/").filter(Boolean)
  if (segments.length === 0) return "home"
  return segments[0]
}

/**
 * Extracts a project ID from the URL path if present.
 * Looks for patterns like /projects/:id or /project/:id in the path.
 */
function extractProjectId(pagePath: string): string | null {
  const match = pagePath.match(/\/projects?\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

/**
 * Captures a ContextSnapshot at the moment the widget is opened.
 */
function captureContextSnapshot(user: UserProfile): ContextSnapshot {
  const pagePath = window.location.pathname
  return {
    pagePath,
    activeModule: deriveActiveModule(pagePath),
    projectId: extractProjectId(pagePath),
    userRole: user.role,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
}

export function FeedbackWidget({ user }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [contextSnapshot, setContextSnapshot] = React.useState<ContextSnapshot | null>(null)
  const [activeTab, setActiveTab] = React.useState<"submit" | "my-feedback">("submit")
  const prefersReducedMotion = useReducedMotion() ?? false

  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Toggle panel open/close. Capture context on open.
  const handleTriggerClick = React.useCallback(() => {
    if (isOpen) {
      setIsOpen(false)
      // Focus returns to trigger via the useEffect below
    } else {
      setContextSnapshot(captureContextSnapshot(user))
      setIsOpen(true)
    }
  }, [isOpen, user])

  // Return focus to trigger on close
  React.useEffect(() => {
    if (!isOpen) {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // Focus trap + Escape key handling
  React.useEffect(() => {
    if (!isOpen) return undefined

    // Move focus into the panel on open
    const frameId = window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(firstFocusable ?? panel).focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setIsOpen(false)
        return
      }

      if (event.key !== "Tab") return

      const panel = panelRef.current
      if (!panel) return

      const nodeList = panel.querySelectorAll(FOCUSABLE_SELECTOR)
      const focusable: HTMLElement[] = []
      nodeList.forEach((node) => {
        const el = node as HTMLElement
        if (el.offsetParent !== null || el === document.activeElement) {
          focusable.push(el)
        }
      })

      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  return (
    <>
      {/* Floating trigger button — 44×44px, bottom-right, z-50 */}
      <Button
        ref={triggerRef}
        variant="default"
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-11 w-11 rounded-full shadow-lg"
        onClick={handleTriggerClick}
        aria-label="Open feedback"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      {/* Overlay panel — below system modals (z-[49]), above page content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Feedback panel"
            tabIndex={-1}
            className="fixed bottom-20 right-6 z-[49] w-[380px] max-h-[560px] overflow-y-auto rounded-xl border border-border bg-background shadow-xl focus:outline-none"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10, scale: prefersReducedMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 10, scale: prefersReducedMotion ? 1 : 0.95 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.2, 0.8, 0.2, 1],
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Feedback</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
                aria-label="Close feedback panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border" role="tablist" aria-label="Feedback sections">
              <button
                role="tab"
                aria-selected={activeTab === "submit"}
                aria-controls="feedback-panel-submit"
                className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === "submit"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("submit")}
              >
                Submit
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "my-feedback"}
                aria-controls="feedback-panel-my-feedback"
                className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === "my-feedback"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("my-feedback")}
              >
                My Feedback
              </button>
            </div>

            {/* Panel content */}
            <div className="p-4">
              {activeTab === "submit" ? (
                <div id="feedback-panel-submit" role="tabpanel" aria-labelledby="feedback-tab-submit">
                  <FeedbackForm
                    contextSnapshot={contextSnapshot}
                    onSuccess={() => {
                      setTimeout(() => setIsOpen(false), 3000)
                    }}
                  />
                </div>
              ) : (
                <div id="feedback-panel-my-feedback" role="tabpanel" aria-labelledby="feedback-tab-my-feedback">
                  <MyFeedbackTab />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Category Config ────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string; icon: React.ReactNode }[] = [
  { value: "bug", label: "Bug", icon: <Bug className="h-4 w-4" /> },
  { value: "feature_request", label: "Feature", icon: <Sparkles className="h-4 w-4" /> },
  { value: "usability", label: "Usability", icon: <Paintbrush className="h-4 w-4" /> },
  { value: "praise", label: "Praise", icon: <Heart className="h-4 w-4" /> },
]

const MAX_DESCRIPTION_CHARS = 2000
const MAX_ATTACHMENTS = 3

// ─── FeedbackForm Component ─────────────────────────────────────────────────

interface FeedbackFormProps {
  contextSnapshot: ContextSnapshot | null
  onSuccess: () => void
}

function FeedbackForm({ contextSnapshot, onSuccess }: FeedbackFormProps) {
  const [category, setCategory] = React.useState<FeedbackCategory | null>(null)
  const [description, setDescription] = React.useState("")
  const [attachments, setAttachments] = React.useState<File[]>([])
  const [errors, setErrors] = React.useState<{ category?: string; description?: string; attachments?: string }>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const remainingChars = MAX_DESCRIPTION_CHARS - description.length

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= MAX_DESCRIPTION_CHARS) {
      setDescription(value)
      if (errors.description) {
        setErrors((prev) => ({ ...prev, description: undefined }))
      }
    }
  }

  const handleCategorySelect = (value: FeedbackCategory) => {
    setCategory(value)
    if (errors.category) {
      setErrors((prev) => ({ ...prev, category: undefined }))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const result = validateAttachment(
        { type: file.type, size: file.size },
        attachments.length
      )
      if (!result.valid) {
        setErrors((prev) => ({ ...prev, attachments: result.error }))
        // Reset input so user can try again
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      setAttachments((prev) => [...prev, file])
    }
    setErrors((prev) => ({ ...prev, attachments: undefined }))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
    setErrors((prev) => ({ ...prev, attachments: undefined }))
  }

  const validate = (): boolean => {
    const newErrors: typeof errors = {}

    if (!category) {
      newErrors.category = "Please select a category"
    }

    const descResult = validateDescription(description)
    if (!descResult.valid) {
      newErrors.description = descResult.error
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setIsSubmitting(true)

    try {
      // Convert attachments to base64 for upload
      const attachmentData = await Promise.all(
        attachments.map(async (file) => {
          const buffer = await file.arrayBuffer()
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          )
          return {
            filename: file.name,
            type: file.type,
            size: file.size,
            data: base64,
          }
        })
      )

      const response = await apiFetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description,
          contextSnapshot,
          attachments: attachmentData,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Submission failed (${response.status})`)
      }

      // Success state
      setSuccessMessage("Thank you! Your feedback has been submitted.")
      setCategory(null)
      setDescription("")
      setAttachments([])
      setErrors({})
      onSuccess()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit feedback. Please try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (successMessage) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Heart className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-sm font-medium text-foreground">{successMessage}</p>
        <p className="text-xs text-muted-foreground">This panel will close shortly.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSuccessMessage(null)}
        >
          Submit another
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Category selection */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-muted-foreground mb-1">Category</legend>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleCategorySelect(opt.value)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                category === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
              aria-pressed={category === opt.value}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        {errors.category && (
          <p className="text-xs text-destructive" role="alert">{errors.category}</p>
        )}
      </fieldset>

      {/* Description textarea */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-description" className="text-xs font-medium text-muted-foreground">
          Description
        </label>
        <Textarea
          id="feedback-description"
          value={description}
          onChange={handleDescriptionChange}
          placeholder="Tell us what's on your mind (minimum 10 characters)..."
          className="min-h-[100px] resize-none text-sm"
          aria-invalid={!!errors.description}
          aria-describedby="description-count description-error"
        />
        <div className="flex items-center justify-between">
          {errors.description ? (
            <p id="description-error" className="text-xs text-destructive" role="alert">
              {errors.description}
            </p>
          ) : (
            <span />
          )}
          <span
            id="description-count"
            className={`text-xs ${remainingChars < 100 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {remainingChars} / {MAX_DESCRIPTION_CHARS}
          </span>
        </div>
      </div>

      {/* File attachments */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Screenshots ({attachments.length}/{MAX_ATTACHMENTS})
          </span>
          {attachments.length < MAX_ATTACHMENTS && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-3 w-3" />
              Attach
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleFileSelect}
          aria-label="Attach screenshot"
        />
        {attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {attachments.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between rounded border border-border bg-muted/30 px-2 py-1"
              >
                <span className="truncate text-xs text-foreground max-w-[200px]">
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveAttachment(idx)}
                  aria-label={`Remove ${file.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {errors.attachments && (
          <p className="text-xs text-destructive" role="alert">{errors.attachments}</p>
        )}
      </div>

      {/* Submit error */}
      {submitError && (
        <p className="text-xs text-destructive rounded border border-destructive/20 bg-destructive/5 px-2 py-1.5" role="alert">
          {submitError}
        </p>
      )}

      {/* Submit button */}
      <Button type="submit" size="sm" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Feedback"
        )}
      </Button>
    </form>
  )
}

// ─── My Feedback Tab ────────────────────────────────────────────────────────

/** Maps FeedbackStatus to Badge color class. */
function getStatusBadgeClass(status: FeedbackStatus): string {
  switch (status) {
    case "received":
      return ""
    case "reviewing":
      return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
    case "planned":
      return "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
    case "shipped":
      return "border-green-300 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300"
    case "declined":
      return "border-red-300 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900/30 dark:text-red-300"
    default:
      return ""
  }
}

/** Icon for a feedback category. */
function CategoryIcon({ category }: { category: FeedbackCategory }) {
  switch (category) {
    case "bug":
      return <Bug className="h-3.5 w-3.5 shrink-0 text-red-500" />
    case "feature_request":
      return <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-500" />
    case "usability":
      return <Paintbrush className="h-3.5 w-3.5 shrink-0 text-amber-500" />
    case "praise":
      return <Heart className="h-3.5 w-3.5 shrink-0 text-green-500" />
    default:
      return <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  }
}

interface RateLimitInfo {
  remaining: number
  resetAt: string | null
}

interface SubmissionsResponse {
  submissions: FeedbackSubmission[]
  rateLimit: RateLimitInfo
}

function MyFeedbackTab() {
  const [submissions, setSubmissions] = React.useState<FeedbackSubmission[]>([])
  const [rateLimit, setRateLimit] = React.useState<RateLimitInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function fetchSubmissions() {
      setLoading(true)
      setError(null)
      try {
        const response = await apiFetch("/api/feedback/submissions")
        if (!response.ok) {
          throw new Error(`Failed to load submissions (${response.status})`)
        }
        const data: SubmissionsResponse = await response.json()
        if (!cancelled) {
          setSubmissions(data.submissions ?? [])
          setRateLimit(data.rateLimit ?? null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load feedback")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSubmissions()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading your feedback...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-xs text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Rate limit status */}
      {rateLimit && rateLimit.remaining === 0 && rateLimit.resetAt && (
        <RateLimitBanner resetAt={rateLimit.resetAt} />
      )}

      {/* Empty state */}
      {submissions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
          <p className="text-xs text-muted-foreground">
            Switch to the Submit tab to share your first feedback.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Your feedback submissions">
          {submissions.map((sub) => (
            <li
              key={sub.id}
              className="flex items-start gap-2 rounded-lg border border-border p-2.5"
            >
              <CategoryIcon category={sub.category} />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <p className="text-xs text-foreground leading-snug line-clamp-2">
                  {sub.description.length > 80
                    ? `${sub.description.slice(0, 80)}…`
                    : sub.description}
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${getStatusBadgeClass(sub.status)}`}
                  >
                    {sub.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeDate(sub.createdAt)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Formats an ISO date as a relative or short date string. */
function formatRelativeDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  } catch {
    return ""
  }
}

/** Displays a rate limit banner with countdown. */
function RateLimitBanner({ resetAt }: { resetAt: string }) {
  const [timeLeft, setTimeLeft] = React.useState("")

  React.useEffect(() => {
    function updateCountdown() {
      const now = new Date().getTime()
      const reset = new Date(resetAt).getTime()
      const diff = reset - now

      if (diff <= 0) {
        setTimeLeft("now")
        return
      }

      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)

      if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m`)
      } else {
        setTimeLeft(`${mins}m`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 60000)
    return () => clearInterval(interval)
  }, [resetAt])

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-600 dark:bg-amber-900/20">
      <p className="text-xs text-amber-800 dark:text-amber-300">
        Submission limit reached. You can submit again in{" "}
        <span className="font-semibold">{timeLeft}</span>.
      </p>
    </div>
  )
}

export default FeedbackWidget
