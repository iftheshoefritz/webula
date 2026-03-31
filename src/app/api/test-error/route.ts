// GET /api/test-error — intentionally throws a server-side error for testing error monitoring
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  throw new Error('Intentional server-side test error');
}
