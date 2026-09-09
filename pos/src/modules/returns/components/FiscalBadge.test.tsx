// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/returns/components/FiscalBadge.test.tsx
//
// The invariant worth pinning: a store that does not fiscalise sees no change
// anywhere. That is the entire reason `fiscal_status` is a projection with an
// explicit `'none'` member rather than a nullable join.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FiscalBadge, FiscalDetailCard } from './FiscalBadge';

describe('FiscalBadge', () => {
  it('renders nothing for a store that does not fiscalise', () => {
    const { container } = render(<FiscalBadge status="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the field is absent entirely', () => {
    // Older cached rows and the synthetic offline receipt both look like this.
    const { container } = render(<FiscalBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a status it does not know', () => {
    const { container } = render(<FiscalBadge status="something_new" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the three real states', () => {
    expect(render(<FiscalBadge status="done" />).container.textContent).toBe('ПРРО');
    expect(render(<FiscalBadge status="pending" />).container.textContent).toMatch(/реєструється/);
    expect(render(<FiscalBadge status="failed" />).container.textContent).toMatch(
      /не зареєстровано/
    );
  });
});

describe('FiscalDetailCard', () => {
  it('renders nothing without a document', () => {
    const { container } = render(<FiscalDetailCard doc={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the fiscal number and the verification link', () => {
    render(
      <FiscalDetailCard
        doc={{
          status: 'done',
          fiscal_code: 'FISCAL-1',
          fiscal_date: null,
          tax_url: 'https://cabinet.tax.gov.ua/x',
          qr_payload: null,
          receipt_text: null,
          error_code: null,
          error_message: null,
        }}
      />
    );
    expect(screen.getByText('FISCAL-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /кабінеті ДПС/i })).toHaveAttribute(
      'href',
      'https://cabinet.tax.gov.ua/x'
    );
  });

  it('promises an automatic retry while one is still coming', () => {
    render(
      <FiscalDetailCard
        doc={{
          status: 'failed',
          fiscal_code: null,
          fiscal_date: null,
          tax_url: null,
          qr_payload: null,
          receipt_text: null,
          error_code: 'unavailable',
          error_message: 'Немає звʼязку з ПРРО',
        }}
      />
    );
    expect(screen.getByText('Немає звʼязку з ПРРО')).toBeInTheDocument();
    expect(screen.getByText(/повториться автоматично/i)).toBeInTheDocument();
  });

  it('stops promising a retry once the server gave up', () => {
    // `abandoned` means the cron will not touch it again — telling the cashier
    // to wait would be a lie.
    render(
      <FiscalDetailCard
        doc={{
          status: 'abandoned',
          fiscal_code: null,
          fiscal_date: null,
          tax_url: null,
          qr_payload: null,
          receipt_text: null,
          error_code: 'rejected',
          error_message: 'ПРРО відхилило чек',
        }}
      />
    );
    expect(screen.queryByText(/повториться автоматично/i)).not.toBeInTheDocument();
    expect(screen.getByText(/власника магазину/i)).toBeInTheDocument();
  });
});
