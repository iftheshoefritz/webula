import Image from 'next/image';

export default function SearchResults({ filteredData }) {
  return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
          />
      ))}
      </div>
  );
}
