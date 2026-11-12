'use client';

import { useState } from 'react';
import PlaytestAdminClient from '../../../components/PlaytestAdminClient';
import { playtestAdminFixtureApi } from '../../../lib/playtestAdminFixture';

// The page with the in-memory store of the fixture, made in the browser: a function cannot pass
// from the server page to a client component.
export default function PlaytestAdminFixture({ realNames }: { realNames: string[] }) {
  const [api] = useState(playtestAdminFixtureApi);
  return <PlaytestAdminClient realNames={realNames} api={api} />;
}
