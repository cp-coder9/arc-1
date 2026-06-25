import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import ClauseResultPanel from './ClauseResultPanel'
import type { ClauseResult } from '@/services/toolbox/types'

const clauseResults: ClauseResult[] = [
  {
    clauseRef: 'SANS 10400-XA 4.3.2',
    label: 'Fenestration area ratio',
    outcome: 'pass',
    threshold: '≤ 15% of floor area',
    actual: '12.4%',
    note: 'Within prescriptive limit.',
  },
  {
    clauseRef: 'SANS 10400-XA 4.3.3',
    label: 'Glazing U-value',
    outcome: 'fail',
    threshold: '≤ 2.7 W/m²K',
    actual: '3.1 W/m²K',
  },
  {
    clauseRef: 'SANS 10400-XA 4.3.4',
    label: 'External shading',
    outcome: 'advisory',
    threshold: 'Recommended for west façade',
    actual: 'Not provided',
  },
]

describe('ClauseResultPanel', () => {
  test('renders each clause outcome with cited ref, threshold, and actual', () => {
    render(<ClauseResultPanel clauseResults={clauseResults} complianceScore={67} />)

    // Citations
    expect(screen.getByText('SANS 10400-XA 4.3.2')).toBeInTheDocument()
    expect(screen.getByText('SANS 10400-XA 4.3.3')).toBeInTheDocument()
    expect(screen.getByText('SANS 10400-XA 4.3.4')).toBeInTheDocument()

    // Labels
    expect(screen.getByText('Fenestration area ratio')).toBeInTheDocument()
    expect(screen.getByText('Glazing U-value')).toBeInTheDocument()

    // Thresholds + actuals
    expect(screen.getByText('≤ 15% of floor area')).toBeInTheDocument()
    expect(screen.getByText('12.4%')).toBeInTheDocument()
    expect(screen.getByText('3.1 W/m²K')).toBeInTheDocument()

    // Note
    expect(screen.getByText('Within prescriptive limit.')).toBeInTheDocument()

    // Compliance score
    expect(screen.getByTestId('compliance-score')).toHaveTextContent('67')
  })

  test('codes outcomes via data attributes for pass / fail / advisory', () => {
    render(<ClauseResultPanel clauseResults={clauseResults} />)
    const items = screen.getAllByRole('listitem')
    const outcomes = items.map((li) => li.getAttribute('data-outcome'))
    expect(outcomes).toEqual(['pass', 'fail', 'advisory'])
  })

  test('shows an advisory + sign-off notice by default (Requirement 6.3)', () => {
    render(<ClauseResultPanel clauseResults={clauseResults} />)
    expect(screen.getByRole('note')).toHaveTextContent(/professional sign-off/i)
  })

  test('omits the sign-off notice when requiresSignOff is false', () => {
    render(<ClauseResultPanel clauseResults={clauseResults} requiresSignOff={false} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  test('renders disclaimers when provided', () => {
    render(
      <ClauseResultPanel
        clauseResults={clauseResults}
        disclaimers={['Advisory only — not a statutory certificate.']}
      />,
    )
    expect(screen.getByText('Advisory only — not a statutory certificate.')).toBeInTheDocument()
  })

  test('renders an empty-state message when there are no clauses', () => {
    render(<ClauseResultPanel clauseResults={[]} />)
    expect(screen.getByText(/no clause checks/i)).toBeInTheDocument()
  })

  test('exposes an accessible region label', () => {
    render(<ClauseResultPanel clauseResults={clauseResults} title="Fenestration checks" />)
    const region = screen.getByRole('region', { name: /fenestration checks/i })
    expect(within(region).getByText('Glazing U-value')).toBeInTheDocument()
  })
})
