import { textColumns, rangeColumns } from '../lib/constants';

export default function Help() {
  return (
    <div className='mb-4'>
      <input type="checkbox" className="peer" />&nbsp;show me how to use this
        <div className="flex flex-wrap max-h-0 overflow-y-scroll peer-checked:max-h-80">
          <div className="my-2">
            <p className="font-bold">Example searches:</p>
            <p>
              <ul className="list-disc">
                <li>name:Odo</li>
                <li>strength:8-10</li>
                <li>strength:8-8 (exactly 8)</li>
                <li>gametext:&quot;while facing&quot;</li>
                <li>type:personnel text:selected</li>
                <li>keywords:drone icons:sta</li>
                <li>keywords:legate keywords:dissident</li>
                <li>skills:&quot;2 astrometrics&quot;</li>
              </ul>
            </p>
          </div>
          <div>
            <p className="font-bold">Text fields, e.g. <i>name:odo</i></p>
            <div className="flex flex-wrap max-w-full">
            {textColumns.map(column => (
                <div key={column} className="bg-gray-200 p-2 m-1">{column}</div>
            ))}
          </div>
          <p className="font-bold">Numeric fields, e.g. <i>cost:1-4</i></p>
          <div className="flex flex-wrap">
            {rangeColumns.map(column => (
                <div key={column} className="bg-gray-200 p-2 m-1">{column}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
