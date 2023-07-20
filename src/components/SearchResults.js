import Image from 'next/image';

export default function SearchResults({ filteredData, onCardSelected }) {
  return (
    <>
      {filteredData.map((row, index) => (
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
      ))}
    </>
  );
}
