// The parts that every folder of public decks shares (#1323): the Championship decks, served by
// `/api/championship-decks` (#1327), and the Beginner Decks under `public/`. Each folder holds an
// `index.json` and one LackeyCCG deck file per row.

// The URL of a deck file of a folder. The file names hold spaces and non-ASCII characters.
export const publicDeckFileUrl = (folderPath: string, file: string) => `${folderPath}/${encodeURIComponent(file)}`;

// A folder's index, fetched once a session for each key. A failed fetch, or a body that is not a list, is not cached, so the next
// call tries again. The Championship decks key it on the signed-in email (#1327), because the index route answers each user with
// the rows that user may see, so a sign-in change never shows the list fetched before it. `reset` forgets every cached index;
// for the tests.
export function publicDeckIndex<T>(indexUrl: string, label: string) {
  const requests = new Map<string, Promise<T[]>>();
  return {
    fetch(key = ''): Promise<T[]> {
      let request = requests.get(key);
      if (!request) {
        request = fetch(indexUrl)
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
            requests.delete(key);
            throw error;
          });
        requests.set(key, request);
      }
      return request;
    },
    reset() {
      requests.clear();
    },
  };
}

export async function fetchPublicDeckFile(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  return response.text();
}
