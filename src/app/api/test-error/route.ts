// GET /api/test-error — intentionally throws a server-side error for testing error monitoring
export async function GET() {
  throw new Error('Intentional server-side test error');
}
