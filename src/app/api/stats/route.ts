import { readStatsSummary } from '../../../lib/statsServer';

// The stats of the agent runs, the CI jobs and the GitHub issues (#1417), for every caller (#1990).
// They hold nothing GitHub does not show: the records are on the public branch `stats/update`, and
// the route only reads the files bundled with the deployment, so it calls no API and writes nothing.
export async function GET() {
  return Response.json(await readStatsSummary(), { headers: { 'Cache-Control': 'private, no-store' } });
}
