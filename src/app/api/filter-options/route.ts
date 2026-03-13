import { loadFilterOptions } from '../../../lib/loadCards';

export async function GET() {
  const options = loadFilterOptions();
  return Response.json(options);
}
