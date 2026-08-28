import React from 'react';
import { render } from '@testing-library/react';
import PileAggregate from '../../components/PileAggregate';

const splitFunction = (value: string) => value.split('.').map((v) => v.trim()).filter((v) => v.length > 0);
const assembleCounts = (counts: Record<string, number>, item: string, count: number) => {
  counts[item] = (counts[item] || 0) + count;
  return counts;
};

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  keywords: 'Officer',
  count: 1,
  ...overrides,
});

describe('PileAggregate', () => {
  describe('compareDeckRows', () => {
    it('passes undefined compareCount to children when compareDeckRows is omitted', () => {
      const children = jest.fn(() => null);
      render(
        <PileAggregate
          currentDeckRows={[makeRow({ keywords: 'Officer', count: 2 })]}
          characteristicName="keywords"
          filterFunction={() => true}
          splitFunction={splitFunction}
          assembleCounts={assembleCounts}
        >
          {children}
        </PileAggregate>
      );
      expect(children).toHaveBeenCalledWith(['Officer', 2], undefined, 0);
    });

    it('passes the matching compare count for a shared key', () => {
      const children = jest.fn(() => null);
      render(
        <PileAggregate
          currentDeckRows={[makeRow({ keywords: 'Officer', count: 2 })]}
          compareDeckRows={[makeRow({ keywords: 'Officer', count: 5 })]}
          characteristicName="keywords"
          filterFunction={() => true}
          splitFunction={splitFunction}
          assembleCounts={assembleCounts}
        >
          {children}
        </PileAggregate>
      );
      expect(children).toHaveBeenCalledWith(['Officer', 2], 5, 0);
    });

    it('passes a compare count of 0 for keys missing from the comparison deck', () => {
      const children = jest.fn(() => null);
      render(
        <PileAggregate
          currentDeckRows={[makeRow({ keywords: 'Officer', count: 2 })]}
          compareDeckRows={[makeRow({ keywords: 'Engineer', count: 5 })]}
          characteristicName="keywords"
          filterFunction={() => true}
          splitFunction={splitFunction}
          assembleCounts={assembleCounts}
        >
          {children}
        </PileAggregate>
      );
      expect(children).toHaveBeenCalledWith(['Officer', 2], 0, 0);
    });
  });
});
