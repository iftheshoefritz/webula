import '../styles/globals.css';
import { loadCards } from '../lib/loadCards';
import CardSearchClient from '../components/CardSearchClient';

export default function Home() {
  const { data, columns } = loadCards();

  return (
    <div>
      <CardSearchClient data={data} columns={columns} />
    </div>
  );
}
