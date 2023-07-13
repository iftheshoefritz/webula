import { useEffect, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
import * as d3 from 'd3';
import searchQueryParser from 'search-query-parser';
import Image from 'next/image';
import useDataFetching from '../hooks/useDataFetching';
import DeckUploader from '../components/DeckUploader';
import DeckListItem from '../components/DeckListItem';
import DeckListPile from '../components/DeckListPile';
import {missionRequirements} from '../lib/missionRequirements';

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedValue = localStorage.getItem(key);
      return savedValue ? JSON.parse(savedValue) : defaultValue;
    }
    return defaultValue;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, [key, value]);

  return [value, setValue];
}

const textColumns = [
  'name', 'set', 'rarity', 'unique', 'collectorsinfo', 'type', 'mission', 'dilemmatype',
  'quadrant', 'affiliation', 'icons', 'staff', 'keywords', 'class', 'species', 'skills',
  'gametext'
];

const rangeColumns = [
  'cost', 'span', 'points', 'integrity', 'range', 'cunning', 'weapons', 'strength', 'shields'
]

const nonFilterColumns = [
  'ImageFile'
]

const skillList = [
  'acquisition',
  'anthropology',
  'archaeology',
  'astrometrics',
  'biology',
  'diplomacy',
  'engineer',
  'exobiology',
  'geology',
  'honor',
  'intelligence',
  'law',
  'leadership',
  'medical',
  'navigation',
  'officer',
  'physics',
  'programming',
  'science',
  'security',
  'telepathy',
  'transporters',
  'treachery',
]

const QUOTE_CHARS_REGEX = /[‘’“”«»\u2018\u2019\u201C\u201D]/g;

function toArray(item) {
  if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

export default function Home() {
  const { data, filteredData, setFilteredData, columns, loading } = useDataFetching();
  const [searchQuery, setSearchQuery] = useState('');

  const [currentDeck, setCurrentDeck] = useLocalStorage('currentDeck', {});

  const numericCount = (withPotentialCount) => {
    if (withPotentialCount) {
      return withPotentialCount.count || 0; // this check may be unnecessary, do we ever pass in an object without count property?
    } else {
      return 0;
    }
  }

  const incrementIncluded = (row) => {
    console.log('incrementSelect: ');
    console.log(row.collectorsinfo);
    if (numericCount(currentDeck[row.collectorsinfo]) < 3) {
      const newRow = row;
      newRow.count += 1;
      setCurrentDeck(prevState => ({
        ...prevState,
        [row.collectorsinfo]: {
          count: newRow.count,
          row: newRow
        }
      }));
    }
    console.log(currentDeck);
    console.log(Object.values(currentDeck));
  }

  const decrementIncluded = (event, row) => {
    console.log('decrementSelect: ' + row.collectorsinfo);
    event.preventDefault();
    if (numericCount(row) > 0) {
      console.log('function thinks it is possible to decrement from ' + numericCount(row));
      const newRow = row;
      newRow.count -= 1;
      setCurrentDeck(prevState => ({
        ...prevState,
        [row.collectorsinfo]: {
          count: newRow.count,
          row: newRow
        }
      }));
    } else {
      console.log('function thinks it is NOT possible to decrement:');
      console.log(row.count);
    }
  }

  const handleFileLoad = (contents) => {
    console.log("scratch before file load:");
    console.log(currentDeck)
    console.log("10 rows of overall data");
    const lines = contents.trim().split('\n');

    const deck = {};
    for (const line of lines) {
      const key = line.split('\t')[0].toLowerCase();
      console.log("setting up data structure for: " + key);
      const card = data.find((row) => row.collectorsinfo === key);
      switch(card.type) {
        case "mission":
          card.pile = "mission";
          //missionRequirements(card);
          break;
        case "dilemma":
          card.pile = "dilemma";
          break;
        default:
          card.pile = "draw";
      }
      card.count = (card.count || 0) + 1
      console.log("setting card.pile = " + card.pile);
      deck[key] = {
        count: (deck[key] || {count: 0}).count + 1,
        row: card
      }
    }
    console.log(deck);
    console.log(currentDeck);
    setCurrentDeck(deck);
  }

  const debouncedFilterData = useRef(null);

  useEffect(() => {
    debouncedFilterData.current = debounce(
      (query) => {
        const parsedQuery = searchQueryParser.parse(query.replace(QUOTE_CHARS_REGEX, '"'), {
          keywords: textColumns,
          ranges: rangeColumns,
          offsets: false,
        });
        console.log(query);
        console.log(parsedQuery);
        textColumns.forEach((column) => {
          if (parsedQuery[column]) {
            parsedQuery[column] = toArray(parsedQuery[column])
              .map((term) => term.toLowerCase()) // make every text term into an array of lower case strings
          }
        });
        console.log(parsedQuery);


        const filtered = data.filter((row) => {
          return columns.every((column) => {
            if (parsedQuery[column]) {
              if (textColumns.includes(column)) {
                return parsedQuery[column].every((match) =>
                  row[column].includes(match)
                )
              } else if (rangeColumns.includes(column)) {
                const range = parsedQuery[column];
                const rowValue = parseFloat(row[column]);
                const fromValue = range.from !== '' && range.from !== undefined ? parseFloat(range.from) : -Infinity;
                const toValue = range.to !== '' && range.to !== undefined ? parseFloat(range.to) : Infinity;
                return rowValue >= fromValue && rowValue <= toValue;
              }
            }
            return true;
          });
        });

        setFilteredData(filtered);
      }, 500
    );
  }, [data, columns]);


  const filterData = useCallback((query) => {
    debouncedFilterData.current(query);
  }, []);

  const currentDeckRows = Object.keys(currentDeck).map((collectorsinfo) => currentDeck[collectorsinfo].row).filter((row) => row.count > 0);

  return (
    <div>
      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          <div className="flex h-screen overflow-hidden">
            <div className="w-128 p-8 overflow-y-scroll">
              <DeckUploader onFileLoad={handleFileLoad}/>
              <DeckListPile
                pileName="Missions"
                cardsForPile={
                  currentDeckRows.filter((row) => row.pile === "mission")
                }
                incrementIncluded={incrementIncluded}
                decrementIncluded={decrementIncluded}
              />
              <DeckListPile
                pileName="Dilemmas"
                cardsForPile={
                  currentDeckRows.filter((row) => row.pile === "dilemma")
                }
                decrementIncluded={decrementIncluded}
                incrementIncluded={incrementIncluded}
              />
              <DeckListPile
                pileName="Draw"
                cardsForPile={
                  currentDeckRows.filter((row) => row.pile === "draw")
                }
                incrementIncluded={incrementIncluded}
                decrementIncluded={decrementIncluded}
              />
            </div>
            <div className="flex-grow overflow-y-scroll">
              <div className="container mx-auto p-8">
                <span>Mission requirements</span>
                <div className="flex space-x-4">
                  {

                    currentDeckRows
                      .filter((row) => row.pile === "mission" && row.mission !== "h")
                      .map((row) => {
                          return <Image
                            src={`/cardimages/${row.imagefile}.jpg`}
                            width={165}
                            height={229}
                            placeholder='blur'
                            blurDataURL='/cardimages/cardback.jpg'
                            alt={row.name}
                            key={row.collectorsinfo}
                            className='w-36 h-auto'
                          />
                      })
                  }
                </div>
              </div>
              <div className="container mx-auto p-8">
                <span>Personnel skills</span>
                <div>
                  {
                    (() => {
                      let skillCounts = {};
                      currentDeckRows
                        .filter((row) => row.pile === "draw" && row.type === "personnel")
                        .forEach((row) => {
                          console.log('splitting skills: ' + row.skills);
                          row.skills.match(/(?:\d+ \w+|\w+)/g).forEach((item) => {
                            console.log('token is ' + item);
                            let [, levelStr, skill] = item.trim().match(/(\d*)\s*(\w+)/) || [null, null, null];
                            console.log('count = ' + levelStr + ' skill = ' + skill);
                            let count = levelStr ? Number(levelStr) : 1;

                            if (skillList.includes(skill)) {
                              if (skillCounts[skill] === undefined) {
                                skillCounts[skill] = {};
                              }
                              skillCounts[skill][String(count)] = (skillCounts[skill][String(count)] || 0) + row.count;
                            }
                          })
                        });

                      Object.entries(skillCounts).forEach(([skill, count]) => {
                        if (count > 0) {
                          console.log(`${skill}: ${count}`);
                        }
                      });

                      const sortedSkillCounts = Object.entries(skillCounts).sort((a, b) => a[0].localeCompare(b[0]));
                      return (
                        <div className="flex flex-wrap">
                        {
                          sortedSkillCounts.map(([skill, skillLevels]) =>
                            <div key={skill} className="m-2 p-2 border rounded">
                              <div className="font-bold">{skill}</div>
                              <div>
                                { skillLevels['1'] && <span className="px-1">{skillLevels['1']}x1</span>}
                                { skillLevels['2'] && <span className="px-1">{skillLevels['2']}x2</span>}
                                { skillLevels['3'] && <span className="px-1">{skillLevels['3']}x3</span>}
                              </div>
                            </div>
                          )
                        }
                        </div>
                      );
                    })()
                  }
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
