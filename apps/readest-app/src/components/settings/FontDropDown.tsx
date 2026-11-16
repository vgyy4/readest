import clsx from 'clsx';
import React, { useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { FiChevronUp, FiChevronLeft } from 'react-icons/fi';
import { MdCheck } from 'react-icons/md';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';

interface DropdownProps {
  family?: string;
  selected: string;
  options: { option: string; label?: string }[];
  moreOptions?: { option: string; label?: string }[];
  onSelect: (option: string) => void;
  onGetFontFamily: (option: string, family: string) => string;
}

interface FontItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    options: { option: string; label?: string }[];
    selected: string;
    onSelect: (option: string) => void;
    onGetFontFamily: (option: string, family: string) => string;
    family: string;
    iconSize: number;
  };
}

const FontItem: React.FC<FontItemProps> = ({ index, style, data }) => {
  const { options, selected, onSelect, onGetFontFamily, family, iconSize: iconSize16 } = data;
  const option = options[index]!;

  return (
    <li
      role='option'
      aria-selected={selected === option.option}
      className='px-2'
      key={option.option}
      style={style}
    >
      <div
        role='button'
        tabIndex={0}
        onClick={() => onSelect(option.option)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelect(option.option);
          }
        }}
        aria-label={option.label || option.option}
        className='flex w-full items-center overflow-hidden !px-0 text-sm'
      >
        <span style={{ minWidth: `${iconSize16}px` }}>
          {selected === option.option && (
            <MdCheck className='text-base-content' size={iconSize16} />
          )}
        </span>
        <span
          className='line-clamp-1 overflow-visible break-all leading-loose'
          style={{ fontFamily: onGetFontFamily(option.option, family) }}
          title={option.label || option.option}
        >
          {option.label || option.option}
        </span>
      </div>
    </li>
  );
};

/** The menu's own height beyond its list (margins, the System Fonts row, the shadow). */
const MENU_CHROME = 72;

/**
 * Which side of the button the list opens on, and how tall it may be there. It opens upward when
 * there is room above, else downward, else on the roomier side with a shorter list: opened upward
 * near the top of the page it was hidden off the screen.
 */
export const dropdownPlacement = (
  button: { top: number; bottom: number },
  viewportHeight: number,
  wanted: number,
): { side: 'top' | 'bottom'; height: number } => {
  const above = button.top;
  const below = viewportHeight - button.bottom;
  const room = (space: number) => Math.max(0, space - MENU_CHROME);
  const side = above >= wanted + MENU_CHROME || above >= below ? 'top' : 'bottom';
  const space = room(side === 'top' ? above : below);
  // Never squeeze the list below a few rows.
  return { side, height: Math.min(wanted, Math.max(space, 120)) };
};

const FontDropdown: React.FC<DropdownProps> = ({
  family,
  selected,
  options,
  moreOptions,
  onSelect,
  onGetFontFamily,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const iconSize = useResponsiveSize(16);
  const allOptions = [...options, ...(moreOptions ?? [])];
  const selectedOption = allOptions.find((option) => option.option === selected) ?? allOptions[0]!;

  const ITEM_HEIGHT = 40;
  const MAX_HEIGHT = 320;
  const button = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<{ side: 'top' | 'bottom'; height: number }>({
    side: 'top',
    height: MAX_HEIGHT,
  });
  const place = () => {
    const el = button.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const wanted = Math.min(
      MAX_HEIGHT,
      Math.max(options.length, moreOptions?.length ?? 0) * ITEM_HEIGHT,
    );
    setPlacement(dropdownPlacement(rect, window.innerHeight, wanted));
  };
  const listHeight = (count: number) => Math.min(count * ITEM_HEIGHT, placement.height);

  const mainListData = useMemo(
    () => ({
      options,
      selected,
      onSelect,
      onGetFontFamily,
      family: family ?? '',
      iconSize,
      appService,
    }),
    [options, selected, onSelect, onGetFontFamily, family, iconSize, appService],
  );

  const moreListData = useMemo(
    () => ({
      options: moreOptions ?? [],
      selected,
      onSelect,
      onGetFontFamily,
      family: family ?? '',
      iconSize,
    }),
    [moreOptions, selected, onSelect, onGetFontFamily, family, iconSize],
  );

  return (
    <div
      className={clsx('dropdown', placement.side === 'top' ? 'dropdown-top' : 'dropdown-bottom')}
    >
      <button
        ref={button}
        tabIndex={0}
        className='btn btn-sm flex items-center px-[10px] font-normal normal-case sm:px-[20px]'
        onPointerDown={place}
        onClick={(e) => {
          place();
          e.currentTarget.focus();
        }}
      >
        <div className='flex items-center gap-x-1'>
          <span
            className='line-clamp-1 break-all leading-loose'
            style={{
              fontFamily: onGetFontFamily(selectedOption.option, family ?? ''),
            }}
          >
            {selectedOption.label}
          </span>
          <FiChevronUp size={iconSize} />
        </div>
      </button>
      <ul
        role='listbox'
        tabIndex={0}
        className={clsx(
          'dropdown-content bgcolor-base-200 no-triangle menu rounded-box absolute z-[1] mt-4 shadow',
          'right-[-32px] w-[46vw] !px-0 sm:right-0 sm:w-44',
          moreOptions?.length ? '' : 'inline overflow-hidden',
        )}
      >
        {/* Virtualized main options */}
        <div style={{ height: listHeight(options.length) }}>
          <List
            width='100%'
            height={listHeight(options.length)}
            itemCount={options.length}
            itemSize={ITEM_HEIGHT}
            itemData={mainListData}
          >
            {FontItem}
          </List>
        </div>

        {/* More options with nested dropdown */}
        {moreOptions && moreOptions.length > 0 && (
          <li
            className={clsx(
              'dropdown dropdown-left px-2',
              placement.side === 'top' ? 'dropdown-top' : 'dropdown-bottom',
            )}
          >
            <div className='flex items-center px-0 text-sm'>
              <span style={{ minWidth: `${iconSize}px` }}>
                <FiChevronLeft size={iconSize} />
              </span>
              <span>{_('System Fonts')}</span>
            </div>
            <ul
              role='listbox'
              tabIndex={0}
              className={clsx(
                'dropdown-content bgcolor-base-200 menu rounded-box relative z-[1] shadow',
                '!mr-4 inline w-[46vw] overflow-hidden !px-0 sm:w-[200px]',
                placement.side === 'top' ? 'mb-[-46px]' : 'mt-[-46px]',
              )}
            >
              {/* Virtualized more options */}
              <div style={{ height: listHeight(moreOptions.length) }}>
                <List
                  width='100%'
                  height={listHeight(moreOptions.length)}
                  itemCount={moreOptions.length}
                  itemSize={ITEM_HEIGHT}
                  itemData={moreListData}
                >
                  {FontItem}
                </List>
              </div>
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
};

export default FontDropdown;
