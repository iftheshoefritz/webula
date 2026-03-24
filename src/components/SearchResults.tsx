import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { VirtuosoGrid, Virtuoso } from "react-virtuoso";
import { CardDef, Deck } from "../types";

const INLINE_ICON_MAP: Record<string, string> = {
  // Personnel/card icons
  'au': '/icons/icon_au.gif',
  'cmd': '/icons/icon_command.gif',
  'ds9': '/icons/icon_ds9.gif',
  'e': '/icons/icon_earth.gif',
  'fut': '/icons/icon_future.gif',
  'maq': '/icons/icon_maquis.gif',
  'pa': '/icons/icon_past.gif',
  'stf': '/icons/icon_staff.gif',
  'tn': '/icons/icon_teroknor.gif',
  'tng': '/icons/icon_tng.gif',
  'tos': '/icons/icon_tos.gif',
  'voy': '/icons/icon_voyager.gif',
  // Affiliation icons (bracket notation)
  'baj': '/icons/icon_affiliation_bajoran.gif',
  'bor': '/icons/icon_affiliation_borg.gif',
  'car': '/icons/icon_affiliation_cardassian.gif',
  'dom': '/icons/icon_affiliation_dominion.gif',
  'fed': '/icons/icon_affiliation_federation.gif',
  'fer': '/icons/icon_ferengi.gif',
  'kli': '/icons/icon_affiliation_klingon.gif',
  'na': '/icons/icon_nonaligned.gif',
  'rom': '/icons/icon_affiliation_romulan.gif',
  'sf': '/icons/icon_affiliation_starfleet.gif',
  'sta': '/icons/icon_affiliation_starfleet.gif',
  'vid': '/icons/icons_affiliation_vidiian.png',
  // Mission/dilemma type icons
  'd': '/icons/icon_dual.gif',
  's': '/icons/icon_space.gif',
  'p': '/icons/icon_planet.gif',
  'h': '/icons/icon_headquarters.gif',
  'hq': '/icons/icon_headquarters.gif',
  // Card type icons
  'equipment': '/icons/icon_equipment.gif',
  'event': '/icons/icon_event.gif',
  'interrupt': '/icons/icon_interrupt.gif',
};

// Map affiliation text to icon paths (for personnel/ships where affiliation is plain text)
const AFFILIATION_TEXT_TO_ICON: Record<string, string> = {
  'bajoran': '/icons/icon_affiliation_bajoran.gif',
  'borg': '/icons/icon_affiliation_borg.gif',
  'cardassian': '/icons/icon_affiliation_cardassian.gif',
  'dominion': '/icons/icon_affiliation_dominion.gif',
  'federation': '/icons/icon_affiliation_federation.gif',
  'ferengi': '/icons/icon_ferengi.gif',
  'klingon': '/icons/icon_affiliation_klingon.gif',
  'non-aligned': '/icons/icon_nonaligned.gif',
  'romulan': '/icons/icon_affiliation_romulan.gif',
  'starfleet': '/icons/icon_affiliation_starfleet.gif',
  'vidiian': '/icons/icons_affiliation_vidiian.png',
};

// Map mission/dilemma type codes to icon paths
const TYPE_CODE_TO_ICON: Record<string, string> = {
  's': '/icons/icon_space.gif',
  'p': '/icons/icon_planet.gif',
  'd': '/icons/icon_dual.gif',
  'h': '/icons/icon_headquarters.gif',
};

// Map quadrant codes to icon paths (for missions)
const QUADRANT_TO_ICON: Record<string, string> = {
  'a': '/icons/icon_quadrant_alpha.gif',
  'd': '/icons/icon_quadrant_delta.gif',
  'g': '/icons/icon_quadrant_gamma.gif',
};

function renderAffiliationIcon(affiliation: string): React.ReactNode {
  if (!affiliation) return null;
  const src = AFFILIATION_TEXT_TO_ICON[affiliation.toLowerCase()];
  if (src) {
    return <img src={src} alt={affiliation} title={affiliation} className="inline-block h-4 w-4 align-middle" />;
  }
  return affiliation;
}

function renderTypeIcon(typeCode: string, label?: string): React.ReactNode {
  if (!typeCode) return null;
  const src = TYPE_CODE_TO_ICON[typeCode.toLowerCase()];
  if (src) {
    const altText = label || typeCode.toUpperCase();
    return <img src={src} alt={altText} title={altText} className="inline-block h-4 w-4 align-middle" />;
  }
  return typeCode;
}

function renderWithIcons(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\[[^\]]+\])/);
  // Fast path: no bracket tags
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (!part) return null;
    const match = part.match(/^\[([^\]]+)\]$/);
    if (match) {
      const src = INLINE_ICON_MAP[match[1].toLowerCase()];
      if (src) {
        return <img key={i} src={src} alt={match[1]} title={match[1]} className="inline h-4 w-4 align-middle" />;
      }
    }
    return part;
  }).filter(Boolean);
}

const DEFAULT_GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

type SearchResultsProps = {
  filteredData: any[];
  onCardSelected?: (row: CardDef) => void;
  onCardDeselected?: (event: any, row: CardDef) => void;
  currentDeck?: Deck;
  withHover?: boolean;
  useWindowScroll?: boolean;
  gridClassName?: string;
  variant?: 'legacy' | 'styled';
  viewMode?: 'image' | 'list';
};

export default function SearchResults({
  filteredData,
  onCardSelected,
  onCardDeselected,
  currentDeck,
  withHover,
  useWindowScroll = true,
  gridClassName,
  variant = 'legacy',
  viewMode = 'image',
}: SearchResultsProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState({});
  const [mounted, setMounted] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // SSR guard: document.body doesn't exist during server-side rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleHover = useCallback(
    (
      collectorsinfo: string,
      event: React.MouseEvent<HTMLElement, MouseEvent>,
    ): void => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      const imageHeight = 230;
      const imageWidth = 458;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const targetRect = event.currentTarget.getBoundingClientRect();

      setHoveredItem(collectorsinfo);

      // Start by positioning to the right of the card
      let topPosition = targetRect.top + 5;
      let leftPosition = targetRect.right + 10;

      // If image extends past right edge, position to the left instead
      if (leftPosition + imageWidth > viewportWidth) {
        leftPosition = targetRect.left - imageWidth - 10;
      }

      // If image extends past bottom edge, position above instead
      if (topPosition + imageHeight > viewportHeight) {
        topPosition = targetRect.top - imageHeight - 10;
      }

      // If image now extends past top edge, position below instead
      if (topPosition < 0) {
        topPosition = targetRect.bottom + 10;
      }

      // Final safety check: if still extends past bottom, clamp to bottom
      if (topPosition + imageHeight > viewportHeight) {
        topPosition = Math.max(0, viewportHeight - imageHeight - 10);
      }

      setImageStyle({
        position: "fixed",
        top: topPosition,
        left: leftPosition,
        zIndex: 50,
      });
    },
    [],
  );

  const handleUnhover = useCallback((): void => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({ display: "none" });
    }, 100);
  }, []);

  const handleLargeHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleLargeUnhover = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({ display: "none" });
    }, 100);
  }, []);

  const styledGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 px-4 py-4";
  const listClassName = variant === 'styled'
    ? styledGridClass
    : (gridClassName || DEFAULT_GRID_CLASS);

  const hoverPortal = useCallback(
    (row: any) => {
      if (!withHover || hoveredItem !== row.collectorsinfo || !mounted) return null;
      return createPortal(
        <div style={imageStyle}>
          <div className="relative">
            <img
              src={`/cardimages/${row.imagefile}.jpg`}
              width={230}
              height={458}
              loading="lazy"
              alt={row.name}
              className="rounded-xl block"
              onMouseEnter={handleLargeHover}
              onMouseLeave={handleLargeUnhover}
              onClick={() => onCardSelected && onCardSelected(row)}
              onContextMenu={(event) =>
                onCardDeselected && onCardDeselected(event, row)
              }
            />
            <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
          </div>
          {currentDeck && (
            <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
              {currentDeck[row.collectorsinfo]?.row?.count || 0}
            </div>
          )}
        </div>,
        document.body,
      );
    },
    [withHover, hoveredItem, mounted, imageStyle, handleLargeHover, handleLargeUnhover, onCardSelected, onCardDeselected, currentDeck],
  );

  const itemContent = useCallback(
    (index: number) => {
      const row: CardDef = filteredData[index];
      const isStyled = variant === 'styled';

      const cardWrapperClass = isStyled
        ? "relative rounded-lg overflow-hidden transition-transform duration-150 hover:scale-[1.02] hover:shadow-lg"
        : "relative";

      const count = currentDeck ? (currentDeck[row.collectorsinfo]?.row?.count || 0) : 0;

      return (
        <div className={cardWrapperClass}>
          <div className="relative">
            <img
              src={`/cardimages/${row.imagefile}.jpg`}
              width={165}
              height={229}
              loading="lazy"
              alt={row.name}
              className="w-full h-auto rounded-xl block"
              onClick={() => onCardSelected && onCardSelected(row)}
              onContextMenu={(event) =>
                onCardDeselected && onCardDeselected(event, row)
              }
              onMouseEnter={(event) => handleHover(row.collectorsinfo, event)}
              onMouseLeave={handleUnhover}
            />
            <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
          </div>
          {currentDeck && count > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/70 rounded-full px-1">
              <button
                onClick={(e) => { e.stopPropagation(); onCardDeselected?.(e as any, row); }}
                className="w-5 h-5 flex items-center justify-center text-white text-base leading-none"
                aria-label="Remove one"
              >−</button>
              <span className="text-white text-sm font-mono w-4 text-center">{count}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onCardSelected?.(row); }}
                className="w-5 h-5 flex items-center justify-center text-white text-base leading-none disabled:opacity-40"
                disabled={count >= 3}
                aria-label="Add one"
              >+</button>
            </div>
          )}
          {hoverPortal(row)}
        </div>
      );
    },
    [
      filteredData,
      onCardSelected,
      onCardDeselected,
      currentDeck,
      variant,
      handleHover,
      handleUnhover,
      hoverPortal,
    ],
  );

  const renderListItem = useCallback(
    (index: number) => {
      const row: any = filteredData[index];
      const type = (row.type || '').toLowerCase();
      const deckCount = currentDeck ? (currentDeck[row.collectorsinfo]?.row?.count ?? 0) : null;

      // Determine what to show in the left position (cost for most cards, points for missions)
      // Don't show cost for interrupts and missions
      const showCost = row.cost && type !== 'interrupt' && type !== 'mission';
      const showPoints = type === 'mission' && row.points;

      // Left-side icon: affiliation for personnel/ships, type icon for event/interrupt/equipment,
      // space/planet/dual/hq icon for missions and dilemmas
      let leftIcon: React.ReactNode = null;
      if ((type === 'personnel' || type === 'ship') && row.affiliation) {
        leftIcon = renderAffiliationIcon(row.affiliation);
      } else if (type === 'event' || type === 'interrupt' || type === 'equipment') {
        const typeSrc = INLINE_ICON_MAP[type];
        if (typeSrc) {
          leftIcon = <img src={typeSrc} alt={type} title={row.type} className="inline-block h-4 w-4 align-middle" />;
        }
      } else if (type === 'mission' && row.missiontype) {
        leftIcon = renderTypeIcon(row.missiontype);
      } else if (type === 'dilemma' && row.dilemmatype) {
        leftIcon = renderTypeIcon(row.dilemmatype);
      }

      return (
        <div
          className="flex flex-col px-3 py-2 border-b border-white/[0.06] hover:bg-white/[0.04] cursor-pointer select-none"
          onClick={() => onCardSelected && onCardSelected(row)}
          onContextMenu={(e) => onCardDeselected && onCardDeselected(e, row)}
        >
          {/* Header: icon immediately followed by cost/points (no gap), then name and count */}
          <div className="flex items-center h-7 gap-2 min-w-0">
            {/* Icon + cost/points grouped with no gap between them */}
            {(leftIcon || showCost || showPoints) && (
              <span className="flex items-center flex-shrink-0">
                {leftIcon}
                {showCost && (
                  <span className="text-lg font-bold font-mono text-text-primary w-6 text-center leading-none">
                    {row.cost}
                  </span>
                )}
                {showPoints && (
                  <span className="text-lg font-bold font-mono text-text-primary w-6 text-center leading-none">
                    {row.points}
                  </span>
                )}
              </span>
            )}
            <span
              className="font-bold text-text-primary text-lg leading-none uppercase flex-1 min-w-0 truncate"
              onMouseEnter={(e) => withHover && handleHover(row.collectorsinfo, e)}
              onMouseLeave={handleUnhover}
            >
              {row.name}
            </span>
            {deckCount !== null && deckCount > 0 && (
              <div className="ml-auto flex items-center gap-0.5 bg-black/70 rounded-full px-1 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onCardDeselected?.(e as any, row); }}
                  className="w-5 h-5 flex items-center justify-center text-white text-base leading-none"
                  aria-label="Remove one"
                >−</button>
                <span className="text-white text-xs font-mono w-4 text-center">{deckCount}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onCardSelected?.(row); }}
                  className="w-5 h-5 flex items-center justify-center text-white text-base leading-none disabled:opacity-40"
                  disabled={deckCount >= 3}
                  aria-label="Add one"
                >+</button>
              </div>
            )}
          </div>

          {/* Personnel: icons, species, INT|CUN|STR, skills, keywords */}
          {type === 'personnel' && (
            <div className="text-sm text-text-muted mt-0.5 flex flex-wrap items-center gap-x-2">
              {row.icons && <span className="flex items-center gap-0.5">{renderWithIcons(row.icons)}</span>}
              {row.species && <span>{row.species}</span>}
              {(row.integrity || row.cunning || row.strength) && (
                <span className="font-mono">{row.integrity}|{row.cunning}|{row.strength}</span>
              )}
              {row.keywords && <span className="text-text-secondary">{row.keywords}</span>}
              {row.skills && (
                <span className="text-text-secondary w-full mt-0.5 flex items-center flex-wrap gap-x-1">{renderWithIcons(row.skills)}</span>
              )}
            </div>
          )}

          {/* Mission: quadrant icon, affiliation, span, keywords, skills */}
          {type === 'mission' && (
            <div className="text-sm text-text-muted mt-0.5 flex flex-wrap gap-x-2 items-center">
              {row.quadrant && (() => {
                const qSrc = QUADRANT_TO_ICON[row.quadrant.toLowerCase()];
                return qSrc
                  ? <img src={qSrc} alt={row.quadrant.toUpperCase()} title={`${row.quadrant.toUpperCase()} Quadrant`} className="inline h-4 w-4 align-middle" />
                  : <span className="uppercase">{row.quadrant}</span>;
              })()}
              {row.affiliation && <span className="flex items-center gap-0.5">{renderWithIcons(row.affiliation)}</span>}
              {row.span && <span>Span {row.span}</span>}
              {row.keywords && <span className="text-text-secondary">{row.keywords}</span>}
              {row.skills && (
                <span className="text-text-secondary w-full mt-0.5">{renderWithIcons(row.skills)}</span>
              )}
            </div>
          )}

          {/* Ship: class, staff icons, R/W/S, keywords */}
          {type === 'ship' && (
            <div className="text-sm text-text-muted mt-0.5 flex flex-wrap items-center gap-x-2">
              {row.class && <span>{row.class}</span>}
              {row.staff && <span className="flex items-center gap-0.5">{renderWithIcons(row.staff)}</span>}
              {(row.range || row.weapons || row.shields) && (
                <span className="font-mono">R{row.range} W{row.weapons} S{row.shields}</span>
              )}
              {row.keywords && <span className="text-text-secondary">{row.keywords}</span>}
            </div>
          )}

          {/* Dilemma: keywords (type icon is now in header) */}
          {type === 'dilemma' && row.keywords && (
            <div className="text-sm text-text-muted mt-0.5 flex flex-wrap gap-x-2">
              <span>{row.keywords}</span>
            </div>
          )}

          {/* Event / Interrupt / Equipment: keywords */}
          {(type === 'event' || type === 'interrupt' || type === 'equipment') && row.keywords && (
            <div className="text-sm text-text-muted mt-0.5">{row.keywords}</div>
          )}

          {/* Full gametext */}
          {row.gametext && (
            <div className="text-sm text-text-muted mt-1 leading-relaxed flex flex-wrap items-center gap-x-0.5">{renderWithIcons(row.gametext)}</div>
          )}

          {hoverPortal(row)}
        </div>
      );
    },
    [
      filteredData,
      onCardSelected,
      onCardDeselected,
      currentDeck,
      withHover,
      handleHover,
      handleUnhover,
      hoverPortal,
    ],
  );

  // When not using window scroll, VirtuosoGrid/Virtuoso needs explicit height styling
  // to fill available space in scrollable containers
  const containerStyle = useWindowScroll ? undefined : { height: "100%", flex: "1 1 auto" };

  if (viewMode === 'list') {
    return (
      <Virtuoso
        style={containerStyle}
        totalCount={filteredData.length}
        useWindowScroll={useWindowScroll}
        itemContent={renderListItem}
      />
    );
  }

  return (
    <VirtuosoGrid
      style={containerStyle}
      totalCount={filteredData.length}
      useWindowScroll={useWindowScroll}
      listClassName={listClassName}
      itemContent={itemContent}
    />
  );
}
