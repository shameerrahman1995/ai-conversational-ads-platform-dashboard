import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Pagination, DataTable, ScorePill, scorePill, type Column } from './kit';

describe('Pagination', () => {
  it('disables Previous on the first page and reports the next page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={100} onPageChange={onPageChange} />);

    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeEnabled();

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('marks the current page and navigates via a page number', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={100} onPageChange={onPageChange} />);

    expect(screen.getByLabelText('Page 1')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByLabelText('Page 2'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables Next on the last page', () => {
    render(<Pagination page={10} pageSize={10} total={100} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(screen.getByLabelText('Previous page')).toBeEnabled();
  });

  it('renders a page-size selector only when onPageSizeChange is given', () => {
    const onPageSizeChange = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pageSize={10} total={30} onPageChange={() => {}} />,
    );
    expect(screen.queryByLabelText('Rows per page')).toBeNull();

    rerender(
      <Pagination
        page={1}
        pageSize={10}
        total={30}
        onPageChange={() => {}}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });
});

describe('DataTable sorting', () => {
  interface Row {
    id: string;
    name: string;
    score: number;
  }
  const rows: Row[] = [
    { id: 'a', name: 'Alpha', score: 30 },
    { id: 'b', name: 'Bravo', score: 90 },
    { id: 'c', name: 'Cain', score: 60 },
  ];
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', render: (r) => r.name },
    {
      key: 'score',
      header: 'Score',
      render: (r) => String(r.score),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.score,
    },
  ];

  const names = () =>
    screen
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map((r) => r.querySelector('td')?.textContent);

  it('cycles ascending, descending, then clears on repeated header clicks', () => {
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
    expect(names()).toEqual(['Alpha', 'Bravo', 'Cain']);

    const sortBtn = screen.getByRole('button', { name: 'Score' });

    fireEvent.click(sortBtn); // asc by score: 30, 60, 90
    expect(names()).toEqual(['Alpha', 'Cain', 'Bravo']);

    fireEvent.click(sortBtn); // desc by score: 90, 60, 30
    expect(names()).toEqual(['Bravo', 'Cain', 'Alpha']);

    fireEvent.click(sortBtn); // cleared -> original order
    expect(names()).toEqual(['Alpha', 'Bravo', 'Cain']);
  });

  it('exposes aria-sort on the active sorted column', () => {
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score' }));
    const header = screen.getByRole('columnheader', { name: /Score/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });
});

describe('DataTable selection', () => {
  interface Row {
    id: string;
    name: string;
  }
  const rows: Row[] = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
  ];
  const columns: Column<Row>[] = [{ key: 'name', header: 'Name', render: (r) => r.name }];

  it('reports selection changes for row and select-all checkboxes', () => {
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        selectable
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Select all rows'));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['a', 'b'], rows);
  });
});

describe('ScorePill', () => {
  it('buckets scores into tiers', () => {
    expect(scorePill(85).tier).toBe('high');
    expect(scorePill(65).tier).toBe('good');
    expect(scorePill(45).tier).toBe('fair');
    expect(scorePill(10).tier).toBe('low');
    expect(scorePill(null).tier).toBe('none');
    expect(scorePill(undefined).tier).toBe('none');
  });

  it('renders the tier label, value and color class for a high score', () => {
    render(<ScorePill score={85} />);
    const label = screen.getByText('High');
    expect(label).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(label.closest('.score-pill')).toHaveClass('score-pill--high');
  });

  it('renders a no-score pill without a value when score is null', () => {
    render(<ScorePill score={null} />);
    const label = screen.getByText('No score');
    expect(label.closest('.score-pill')).toHaveClass('score-pill--none');
  });
});
