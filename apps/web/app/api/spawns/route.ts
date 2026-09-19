import { getSpawnCollection } from './service';

/** GeoJSON of the 12 markets with live Pyth prices/mood (see ./transform.ts). Never fails the response. */
export async function GET() {
  const body = await getSpawnCollection();
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}
