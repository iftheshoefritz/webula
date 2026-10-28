// The parts that every folder of public decks under `public/` shares (#1323): the Championship decks
// and the Beginner Decks. Each folder holds an `index.json` and one LackeyCCG deck file per row.

// The URL of a deck file of a folder. The file names hold spaces and non-ASCII characters.
export const publicDeckFileUrl = (folderPath: string, file: string) => `${folderPath}/${encodeURIComponent(file)}`;

// A folder's index, fetched once a session. A failed fetch, or a body that is not a list, is not cached, so the next call tries
// again. `reset` forgets the cached index; for the tests.
export function publicDeckIndex<T>(folderPath: string, label: string) {
  let request: Promise<T[]> | null = null;
  return {
    fetch(): Promise<T[]> {
      if (!request) {
        request = fetch(`${folderPath}/index.json`)
          .then((response) => {
            if (!response.ok) throw new Error(`${label} index: ${response.status}`);
            return response.json() as Promise<unknown>;
          })
          .then((rows) => {
            // A body that is not a list of rows leaves the folder empty, as a failed fetch does.
            if (!Array.isArray(rows)) throw new Error(`${label} index: not a list`);
            return rows as T[];
          })
          .catch((error) => {
            request = null;
            throw error;
          });
      }
      return request;
    },
    reset() {
      request = null;
    },
  };
}

export async function fetchPublicDeckFile(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  return response.text();
}
