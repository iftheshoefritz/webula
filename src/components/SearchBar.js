import { textColumns, rangeColumns } from '../lib/constants';

export default function SearchBar({ searchQuery, setSearchQuery, filterData }) {
  return (
    <div className="container mx-auto p-8">
      <input
        type="text"
        placeholder="Search query, e.g. name:Odo type:personnel"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          filterData(e.target.value);
        }}
        className='mb-4 w-full'
      />
      <div className='mb-4'>
        <input type="checkbox" className="peer" />&nbsp;show help
        <div className="flex flex-wrap max-h-0 overflow-hidden peer-checked:max-h-80">
          <div className="w-full">
            <p>Search text with the following fields, e.g. <i>name:Odo</i></p>
            <div className="flex flex-wrap">
              {textColumns.map(column => (
                  <div key={column} className="bg-gray-200 p-2 m-1">{column}</div>
              ))}
            </div>
            <p>Search numbers with the following fields, e.g. <i>cost:1-4</i></p>
            <div className="flex flex-wrap">
              {rangeColumns.map(column => (
                  <div key={column} className="bg-gray-200 p-2 m-1">{column}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
