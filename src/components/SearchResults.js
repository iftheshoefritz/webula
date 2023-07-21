import Image from 'next/image';

export default function SearchResults({ filteredData, onCardSelected, currentDeck }) {
  return (
    <>
      {filteredData.map((row, index) => (
        <div className="relative">
          <Image
            src={`/cardimages/${row.imagefile}.jpg`}
            width={165}
            height={229}
            placeholder='blur'
            blurDataURL='/cardimages/cardback.jpg'
            alt={row.name}
            key={index}
            className='w-full h-auto'
            onClick={() => (onCardSelected(row))}
          />
          { currentDeck &&
          <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
            { currentDeck[row.collectorsinfo]?.row?.count || 0}
          </div>
          }
        </div>
      ))}
    </>
  );
}
