import { textAbbreviations, rangeAbbreviations } from '../lib/constants';

const Help = (): JSX.Element => (
  <div className='mb-4'>
    <input type="checkbox" className="peer" />&nbsp;show me more search features
    <div className="flex flex-wrap max-h-0 overflow-y-scroll peer-checked:max-h-80">
      <div className="my-2">
        <p className="font-bold">Example searches:</p>
        <ul className="list-disc">
          <li>name:Odo</li>
          <li>strength:8-10</li>
          <li>strength:8-8 (exactly 8)</li>
          <li>gametext:&quot;while facing&quot;</li>
          <li>type:personnel text:selected</li>
          <li>keywords:drone icons:sta</li>
          <li>keywords:legate keywords:dissident</li>
          <li>skills:&quot;2 astrometrics&quot;</li>
          <li>-skills:acquisition (personnel without acquisition)</li>
          <li>-sk:acquisition (same as above using abbreviation for skills)</li>
        </ul>
      </div>
      <div>
        <p className="font-bold">Text fields, e.g. <i>name:odo</i> or <i>n:odo</i></p>
        <div className="flex flex-wrap max-w-full">
          {
            Object
              .entries( textAbbreviations )
              .map(([col,abbr]) => (
                <div key={col} className="bg-gray-200 p-2 m-1">{col} ({abbr})</div>
            ))}
        </div>
        <p className="font-bold">Numeric fields, e.g. <i>cost:1-4</i> or <i>c:1-4</i></p>
        <div className="flex flex-wrap">
          {
            Object
              .entries( rangeAbbreviations )
              .map(([col,abbr]) => (
                <div key={col} className="bg-gray-200 p-2 m-1">{col} ({abbr})</div>))
          }
        </div>
      </div>
    </div>
  </div>
)

export default Help
