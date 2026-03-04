import '../../styles/globals.css';
import { loadCards } from '../../lib/loadCards';
import DeckBuilderClient from '../../components/DeckBuilderClient';

export default function Home() {
  const { data, columns } = loadCards();

  return <DeckBuilderClient data={data} columns={columns} />;
}
