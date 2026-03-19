// Mock posthog-js so tests don't hit the network
jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { capture: jest.fn(), init: jest.fn() },
}));

// Mock d3 (ESM module — not transformable by default Jest config)
jest.mock('d3', () => ({
  tsvParse: (text: string) => {
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const values = line.split('\t');
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  },
}));

import { renderHook, waitFor } from '@testing-library/react';
import useDataFetching from '../../hooks/useDataFetching';

// Helper to build a minimal TSV string
const buildTsv = (rows: Record<string, string>[]) => {
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join('\t'),
    ...rows.map((row) => headers.map((h) => row[h]).join('\t')),
  ];
  return lines.join('\n');
};

const baseRow = {
  Name: 'Tricorder',
  CollectorsInfo: '1R001',
  Type: 'equipment',
  Keywords: 'U.S.S. Something',
  ImageFile: 'img1,img2',
};

describe('useDataFetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with loading = true and data = []', () => {
    global.fetch = jest.fn().mockResolvedValue({
      text: () => new Promise(() => {}), // never resolves
    } as any);

    const { result } = renderHook(() => useDataFetching());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('transitions loading from true to false once data is available', async () => {
    const tsv = buildTsv([baseRow]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('fetches TSV from /cards_with_processed_columns.txt', async () => {
    const tsv = buildTsv([baseRow]);
    const mockFetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);
    global.fetch = mockFetch;

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith('/cards_with_processed_columns.txt');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('parses TSV into card rows', async () => {
    const tsv = buildTsv([baseRow]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0]).toMatchObject({ name: 'tricorder' });
  });

  it('strips leading zeros from collectorsinfo (e.g. 1R001 → 1R1)', async () => {
    const tsv = buildTsv([{ ...baseRow, CollectorsInfo: '1R001' }]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0].collectorsinfo).toBe('1r1');
  });

  it('removes dots from U.S.S. commander keyword', async () => {
    const tsv = buildTsv([{ ...baseRow, Keywords: 'U.S.S. Enterprise' }]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0].keywords).toContain('uss');
    expect(result.current.data[0].keywords).not.toContain('U.S.S.');
  });

  it('removes dots from I.K.S. commander keyword', async () => {
    const tsv = buildTsv([{ ...baseRow, Keywords: 'I.K.S. Korinar' }]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0].keywords).toContain('iks');
    expect(result.current.data[0].keywords).not.toContain('I.K.S.');
  });

  it('extracts only the first value from a comma-separated imagefile field', async () => {
    const tsv = buildTsv([{ ...baseRow, ImageFile: 'first_image,second_image' }]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0].imagefile).toBe('first_image');
  });

  it('preserves originalName as the un-lowercased card name', async () => {
    const tsv = buildTsv([{ ...baseRow, Name: 'Jean-Luc Picard' }]);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

    const { result } = renderHook(() => useDataFetching());

    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0].originalName).toBe('Jean-Luc Picard');
    expect(result.current.data[0].name).toBe('jean-luc picard');
  });

  describe('mission/dilemmatype field normalization', () => {
    it('clears mission field for non-Mission cards', async () => {
      const tsv = buildTsv([{ ...baseRow, Type: 'Personnel', Mission: 'planet', DilemmaType: '' }]);
      global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

      const { result } = renderHook(() => useDataFetching());

      await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
      expect(result.current.data[0].missiontype).toBe('');
    });

    it('preserves mission field for Mission cards', async () => {
      const tsv = buildTsv([{ ...baseRow, Type: 'Mission', Mission: 'planet', DilemmaType: '' }]);
      global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

      const { result } = renderHook(() => useDataFetching());

      await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
      expect(result.current.data[0].missiontype).toBe('planet');
    });

    it('clears dilemmatype field for non-Dilemma cards', async () => {
      const tsv = buildTsv([{ ...baseRow, Type: 'Mission', Mission: 'planet', DilemmaType: 'planet' }]);
      global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

      const { result } = renderHook(() => useDataFetching());

      await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
      expect(result.current.data[0].dilemmatype).toBe('');
    });

    it('preserves dilemmatype field for Dilemma cards', async () => {
      const tsv = buildTsv([{ ...baseRow, Type: 'Dilemma', Mission: '', DilemmaType: 'planet' }]);
      global.fetch = jest.fn().mockResolvedValue({ text: async () => tsv } as any);

      const { result } = renderHook(() => useDataFetching());

      await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
      expect(result.current.data[0].dilemmatype).toBe('planet');
    });
  });
});
