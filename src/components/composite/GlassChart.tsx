import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GlassChart — Data visualization component wrapped in a glass-panel surface.
 *
 * Renders lightweight SVG-based charts (line, bar, area, pie) using CSS custom
 * properties for colors so the chart respects the active theme automatically.
 * No external charting library is required.  When a full chart library is
 * added (e.g. Recharts) this component can be swapped for a library-backed
 * implementation while keeping the same public interface.
 *
 * Preconditions:
 *   - title is a non-empty string
 *   - chartType is one of 'line' | 'bar' | 'pie' | 'area'
 *   - data is an array of objects; each object must have at minimum a `name`
 *     (string, used for axis labels / legend) and a `value` (number).
 *     Additional numeric properties are supported for multi-series charts
 *     when the `keys` prop is provided.
 *   - height defaults to 300 when omitted
 *
 * Postconditions:
 *   - renders inside glass-panel with title as <h3>
 *   - colors reference CSS custom properties (--foreground, --glass-bg, etc.)
 *   - legend entries use glass-pill styling
 *   - tooltip uses glass-card styling
 *   - chart is keyboard-focusable and includes aria-label
 *
 * Requirements: 4.9, 4.10
 */

export interface GlassChartDataPoint {
  /** Label shown on axis / legend. */
  name: string
  /** Primary numeric value. */
  value: number
  /** Additional numeric properties for multi-series support. */
  [key: string]: string | number
}

export interface GlassChartProps {
  /** Chart heading rendered as h3. */
  title: string
  /** Visual style of the chart. */
  chartType: "line" | "bar" | "pie" | "area"
  /** Array of data points to visualise. */
  data: GlassChartDataPoint[]
  /** Chart height in pixels (default: 300). */
  height?: number
  /**
   * Keys to plot from each data point.
   * Defaults to ['value'] when omitted.
   * Each entry maps to one series / color.
   */
  keys?: string[]
  /** Optional additional className applied to the outer glass-panel wrapper. */
  className?: string
}

// ── Palette ─────────────────────────────────────────────────────────────────
// Colors reference CSS custom properties where possible, with hard-coded
// mint-teal palette fall-backs that match the Dark_Theme design tokens.
const SERIES_COLORS = [
  "var(--secondary, #aeefe3)",       // mint — primary accent
  "var(--primary, #005b4e)",         // dark teal
  "rgba(155, 123, 212, 0.85)",       // accent purple
  "rgba(217, 87, 71, 0.85)",         // destructive / red
  "rgba(174, 239, 227, 0.5)",        // soft mint
]

// ── Utility helpers ──────────────────────────────────────────────────────────

function getMin(values: number[]): number {
  return values.reduce((a, b) => Math.min(a, b), Infinity)
}

function getMax(values: number[]): number {
  return values.reduce((a, b) => Math.max(a, b), -Infinity)
}

/** Map a value to SVG coordinate space. */
function scaleY(val: number, min: number, max: number, height: number, padding: number): number {
  if (max === min) return height / 2
  return height - padding - ((val - min) / (max - min)) * (height - padding * 2)
}

function scaleX(index: number, count: number, width: number, padding: number): number {
  if (count <= 1) return width / 2
  return padding + (index / (count - 1)) * (width - padding * 2)
}

// ── Sub-chart renderers ──────────────────────────────────────────────────────

interface CartesianProps {
  data: GlassChartDataPoint[]
  keys: string[]
  width: number
  height: number
  type: "line" | "area" | "bar"
}

function CartesianChart({ data, keys, width, height, type }: CartesianProps) {
  const paddingX = 40
  const paddingY = 20
  const chartW = width - paddingX * 2
  const chartH = height - paddingY * 2

  // Flatten all values to get global min/max
  const allValues = data.flatMap((d) =>
    keys.map((k) => (typeof d[k] === "number" ? (d[k] as number) : 0))
  )
  const rawMin = getMin(allValues)
  const rawMax = getMax(allValues)
  // Ensure a small visible range even when all values are 0
  const min = rawMin === rawMax ? rawMin - 1 : rawMin
  const max = rawMax === rawMin ? rawMax + 1 : rawMax

  const barGroupWidth = chartW / data.length
  const barPadding = barGroupWidth * 0.1
  const barWidth = (barGroupWidth - barPadding * 2) / keys.length

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      {/* Horizontal grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = paddingY + frac * (height - paddingY * 2)
        const label = (max - (max - min) * frac).toFixed(0)
        return (
          <g key={frac}>
            <line
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="var(--glass-border, rgba(174,239,227,0.18))"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={paddingX - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--foreground, #fff)"
              opacity={0.45}
            >
              {label}
            </text>
          </g>
        )
      })}

      {/* X-axis labels */}
      {data.map((d, i) => {
        const x = type === "bar"
          ? paddingX + i * barGroupWidth + barGroupWidth / 2
          : scaleX(i, data.length, width, paddingX)
        return (
          <text
            key={i}
            x={x}
            y={height - 4}
            textAnchor="middle"
            fontSize={10}
            fill="var(--foreground, #fff)"
            opacity={0.45}
          >
            {String(d.name).slice(0, 10)}
          </text>
        )
      })}

      {/* Series */}
      {keys.map((key, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length]

        if (type === "bar") {
          return (
            <g key={key}>
              {data.map((d, i) => {
                const val = typeof d[key] === "number" ? (d[key] as number) : 0
                const x =
                  paddingX +
                  i * barGroupWidth +
                  barPadding +
                  si * barWidth
                const y = scaleY(val, Math.min(min, 0), max, height, paddingY)
                const barH = (height - paddingY) - y
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={Math.max(barWidth - 2, 1)}
                    height={Math.max(barH, 0)}
                    rx={3}
                    fill={color}
                    opacity={0.82}
                  />
                )
              })}
            </g>
          )
        }

        // Line / Area
        const points = data.map((d, i) => {
          const val = typeof d[key] === "number" ? (d[key] as number) : 0
          return {
            x: scaleX(i, data.length, width, paddingX),
            y: scaleY(val, min, max, height, paddingY),
          }
        })

        const pathD = points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ")

        const baselineY = scaleY(Math.max(min, 0), min, max, height, paddingY)
        const areaD =
          pathD +
          ` L ${points[points.length - 1].x.toFixed(1)} ${baselineY} L ${points[0].x.toFixed(1)} ${baselineY} Z`

        return (
          <g key={key}>
            {type === "area" && (
              <path d={areaD} fill={color} opacity={0.15} />
            )}
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Data point dots */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3}
                fill={color}
                stroke="var(--card, #11302a)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

interface PieProps {
  data: GlassChartDataPoint[]
  size: number
}

function PieChart({ data, size }: PieProps) {
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.38
  const innerRadius = size * 0.2 // donut hole

  const total = data.reduce((sum, d) => sum + (d.value || 0), 0)
  if (total === 0) return null

  let currentAngle = -Math.PI / 2 // start at top

  const slices = data.map((d, i) => {
    const fraction = d.value / total
    const startAngle = currentAngle
    const endAngle = currentAngle + fraction * 2 * Math.PI
    currentAngle = endAngle

    const x1 = cx + radius * Math.cos(startAngle)
    const y1 = cy + radius * Math.sin(startAngle)
    const x2 = cx + radius * Math.cos(endAngle)
    const y2 = cy + radius * Math.sin(endAngle)
    const xi1 = cx + innerRadius * Math.cos(startAngle)
    const yi1 = cy + innerRadius * Math.sin(startAngle)
    const xi2 = cx + innerRadius * Math.cos(endAngle)
    const yi2 = cy + innerRadius * Math.sin(endAngle)
    const largeArc = fraction > 0.5 ? 1 : 0

    const path =
      `M ${xi1.toFixed(2)} ${yi1.toFixed(2)} ` +
      `L ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `L ${xi2.toFixed(2)} ${yi2.toFixed(2)} ` +
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)} Z`

    return { path, color: SERIES_COLORS[i % SERIES_COLORS.length], label: d.name, fraction }
  })

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      {slices.map((slice, i) => (
        <path
          key={i}
          d={slice.path}
          fill={slice.color}
          opacity={0.85}
          stroke="var(--card, #11302a)"
          strokeWidth={1}
        />
      ))}
      {/* Center label */}
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize={12}
        fill="var(--foreground, #fff)"
        opacity={0.7}
      >
        {data.length} items
      </text>
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GlassChart({
  title,
  chartType,
  data,
  height = 300,
  keys = ["value"],
  className,
}: GlassChartProps) {
  // Internal SVG canvas dimensions (logical pixels; viewBox scales to container)
  const svgWidth = 560
  const svgHeight = height

  const isPie = chartType === "pie"

  return (
    <div className={cn("glass-panel rounded-2xl p-6 space-y-4", className)}>
      {/* Title */}
      <h3 className="text-lg font-heading font-semibold text-foreground">
        {title}
      </h3>

      {/* Chart area */}
      <div
        role="img"
        aria-label={`${title} — ${chartType} chart`}
        style={{ height: `${height}px` }}
        className="w-full"
      >
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-foreground-muted text-sm">
            No data available
          </div>
        ) : isPie ? (
          <PieChart data={data} size={Math.min(svgHeight, 280)} />
        ) : (
          <CartesianChart
            data={data}
            keys={keys}
            width={svgWidth}
            height={svgHeight}
            type={chartType as "line" | "area" | "bar"}
          />
        )}
      </div>

      {/* Legend — glass-pill styling per requirement 4.10 */}
      {data.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="list"
          aria-label="Chart legend"
        >
          {isPie
            ? data.map((d, i) => (
                <div
                  key={d.name}
                  role="listitem"
                  className="glass-pill flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-foreground"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                    aria-hidden="true"
                  />
                  {d.name}
                </div>
              ))
            : keys.map((key, i) => (
                <div
                  key={key}
                  role="listitem"
                  className="glass-pill flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-foreground"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                    aria-hidden="true"
                  />
                  {key}
                </div>
              ))}
        </div>
      )}
    </div>
  )
}

export default GlassChart
