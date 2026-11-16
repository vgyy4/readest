import React, { useEffect, useState } from 'react';

import {
  CJK_EXCLUDE_PATTENS,
  CJK_FONTS_PATTENS,
  CJK_SANS_SERIF_FONTS,
  CJK_SERIF_FONTS,
  IOS_FONTS,
  LINUX_FONTS,
  MACOS_FONTS,
  MONOSPACE_FONTS,
  NON_FREE_FONTS,
  SANS_SERIF_FONTS,
  SERIF_FONTS,
  SYSTEM_BOOK_SERIF_FONTS,
  WINDOWS_FONTS,
} from '@/services/constants';
import { BOOK_SANS_SERIF_FONTS, BOOK_SERIF_FONTS } from '@/styles/bookFonts';
import { useEnv } from '@/context/EnvContext';
import type { ViewSettings } from '@/types/book';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useCustomFontStore } from '@/store/customFontStore';
import { getOSPlatform, isCJKEnv } from '@/utils/misc';
import { getSysFontsList } from '@/utils/bridge';
import { isCJKStr } from '@/utils/lang';
import { isTauriAppPlatform } from '@/services/environment';
import { useResetViewSettings } from '@/hooks/useResetSettings';
import { useKeyDownActions } from '@/hooks/useKeyDownActions';
import { saveViewSettings } from '@/helpers/settings';
import type { SettingsPanelPanelProp } from './SettingsDialog';
import { BoxedList, NavigationRow, SettingsRow, SettingsSelect } from './primitives';
import { bookFontOf, FONT_FACE_KEYS, pickBookFont } from '@/utils/fontChoice';
import NumberInput from './NumberInput';
import FontDropdown from './FontDropDown';
import CustomFonts from './CustomFonts';
import { Toggle } from '../primitives/toggle';

const genCJKFontsList = (sysFonts: string[]) => {
  return Array.from(new Set([...sysFonts, ...CJK_SERIF_FONTS, ...CJK_SANS_SERIF_FONTS]))
    .filter((font) => CJK_FONTS_PATTENS.test(font) || isCJKStr(font))
    .filter((font) => !CJK_EXCLUDE_PATTENS.test(font))
    .sort((a, b) => a.localeCompare(b));
};

const isSymbolicFontName = (font: string) =>
  /emoji|icons|symbol|dingbats|ornaments|webdings|wingdings|miuiex/i.test(font);

interface FontFaceProps {
  className?: string;
  family: string;
  label: string;
  description?: string;
  options: string[];
  moreOptions?: string[];
  selected: string;
  onSelect: (option: string) => void;
  'data-setting-id'?: string;
}

const handleFontFaceFont = (option: string, family: string) => {
  return `'${option}', ${family}`;
};

const filterNonFreeFonts = (font: string) => {
  return !['android', 'linux'].includes(getOSPlatform()) || !NON_FREE_FONTS.includes(font);
};

const FontFace = ({
  className,
  family,
  label,
  description,
  options,
  moreOptions,
  selected,
  onSelect,
  'data-setting-id': settingId,
}: FontFaceProps) => {
  const _ = useTranslation();
  return (
    <SettingsRow
      label={label}
      description={description}
      className={className}
      data-setting-id={settingId}
    >
      <FontDropdown
        family={family}
        options={options.map((option) => ({ option, label: _(option) }))}
        moreOptions={moreOptions?.map((option) => ({ option, label: option })) ?? []}
        selected={selected}
        onSelect={onSelect}
        onGetFontFamily={handleFontFaceFont}
      />
    </SettingsRow>
  );
};

const FontPanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { getView, getViewSettings } = useReaderStore();
  const { settings, fontPanelView, setFontPanelView } = useSettingsStore();
  const { fonts: allCustomFonts, getFontFamilies } = useCustomFontStore();
  const viewSettings = getViewSettings(bookKey) || settings.globalViewSettings;
  const view = getView(bookKey);

  const fontFamilyOptions = [
    {
      option: 'Serif',
      label: _('Serif Font'),
    },
    {
      option: 'Sans-serif',
      label: _('Sans-Serif Font'),
    },
  ];

  const osPlatform = getOSPlatform();
  let defaultSysFonts: string[] = [];
  switch (osPlatform) {
    case 'macos':
      defaultSysFonts = MACOS_FONTS;
      break;
    case 'windows':
      defaultSysFonts = WINDOWS_FONTS;
      break;
    case 'linux':
      defaultSysFonts = LINUX_FONTS;
      break;
    case 'ios':
      defaultSysFonts = IOS_FONTS;
      break;
    case 'android':
      defaultSysFonts = [];
      break;
    default:
      break;
  }
  const [sysFonts, setSysFonts] = useState<string[]>(defaultSysFonts);
  const [defaultFont, setDefaultFont] = useState(viewSettings.defaultFont);
  const [defaultFontSize, setDefaultFontSize] = useState(viewSettings.defaultFontSize);
  const [minFontSize, setMinFontSize] = useState(viewSettings.minimumFontSize);
  const [overrideFont, setOverrideFont] = useState(viewSettings.overrideFont);
  const [defaultCJKFont, setDefaultCJKFont] = useState(viewSettings.defaultCJKFont);
  const [serifFont, setSerifFont] = useState(viewSettings.serifFont);
  const [sansSerifFont, setSansSerifFont] = useState(viewSettings.sansSerifFont);
  const [monospaceFont, setMonospaceFont] = useState(viewSettings.monospaceFont);
  const [fontWeight, setFontWeight] = useState(viewSettings.fontWeight);
  // This book keeps its own fonts (the changes here stay in it), or follows the global fonts.
  const [ownFonts, setOwnFonts] = useState(viewSettings.ownFonts ?? false);
  const isSettingsGlobal = viewSettings.isGlobal ?? true;

  const [customFonts, setCustomFonts] = useState<string[]>(getFontFamilies());
  const [CJKFonts, setCJKFonts] = useState<string[]>(() => {
    return genCJKFontsList([...customFonts, ...sysFonts]);
  });

  const resetToDefaults = useResetViewSettings();

  const handleReset = () => {
    resetToDefaults({
      defaultFont: setDefaultFont,
      defaultFontSize: setDefaultFontSize,
      minimumFontSize: setMinFontSize,
      overrideFont: setOverrideFont,
      defaultCJKFont: setDefaultCJKFont,
      serifFont: setSerifFont,
      sansSerifFont: setSansSerifFont,
      monospaceFont: setMonospaceFont,
      fontWeight: setFontWeight,
    });
  };

  const handleManageCustomFonts = () => {
    setFontPanelView('custom-fonts');
  };

  const handleBackToMain = () => {
    setFontPanelView('main-fonts');
  };

  // Android Back / Esc: when the Custom Fonts sub-page is open, intercept
  // and step back to main-fonts instead of letting <Dialog>'s own listener
  // close the entire Settings dialog. This works because
  // `useKeyDownActions` registers its sync `native-key-down` listener
  // *after* <Dialog>'s, and `dispatchSync` walks listeners LIFO — so when
  // enabled this hook claims the Back press first and `return true`
  // consumes it; when disabled (sub-page closed) Back falls through to
  // <Dialog> and closes the dialog as before.
  useKeyDownActions({
    enabled: fontPanelView === 'custom-fonts',
    onCancel: handleBackToMain,
  });

  useEffect(() => {
    onRegisterReset(handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService]);

  useEffect(() => {
    setCJKFonts((prev) => {
      const newFonts = genCJKFontsList([...customFonts, ...sysFonts]);
      return prev.length !== newFonts.length ? newFonts : prev;
    });
  }, [customFonts, sysFonts]);

  useEffect(() => {
    setCustomFonts(getFontFamilies());
  }, [allCustomFonts, getFontFamilies]);

  useEffect(() => {
    setSerifFont(viewSettings.serifFont);
    setSansSerifFont(viewSettings.sansSerifFont);
    setMonospaceFont(viewSettings.monospaceFont);
  }, [viewSettings.serifFont, viewSettings.sansSerifFont, viewSettings.monospaceFont]);

  useEffect(() => {
    if (isTauriAppPlatform() && appService && !appService.isAndroidApp) {
      getSysFontsList().then((res) => {
        if (res.error || Object.keys(res.fonts).length === 0) {
          console.error('Failed to get system fonts list:', res.error);
          return;
        }
        const processedFonts: string[] = [];
        Object.entries(res.fonts).forEach(([fontName, fontFamily]) => {
          if (!fontName || isSymbolicFontName(fontName)) return;

          const fontsInFamily = Object.entries(res.fonts).filter(
            ([_, family]) => family === fontFamily,
          );

          if (fontsInFamily.length === 1) {
            processedFonts.push(fontFamily);
          } else {
            processedFonts.push(fontName);
          }
        });
        setSysFonts([...new Set(processedFonts)].sort((a, b) => a.localeCompare(b)));
      });
    }
  }, [appService]);

  const saveFont = <K extends (typeof FONT_FACE_KEYS)[number]>(key: K, value: ViewSettings[K]) =>
    saveViewSettings(envConfig, bookKey, key, value, ownFonts);

  useEffect(() => {
    saveFont('defaultFont', defaultFont);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFont]);

  useEffect(() => {
    saveFont('defaultCJKFont', defaultCJKFont);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCJKFont]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'defaultFontSize', defaultFontSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFontSize]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'minimumFontSize', minFontSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minFontSize]);

  useEffect(() => {
    saveFont('fontWeight', fontWeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontWeight]);

  useEffect(() => {
    saveFont('serifFont', serifFont);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serifFont]);

  useEffect(() => {
    saveFont('sansSerifFont', sansSerifFont);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sansSerifFont]);

  useEffect(() => {
    saveFont('monospaceFont', monospaceFont);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monospaceFont]);

  useEffect(() => {
    saveFont('overrideFont', overrideFont);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideFont]);

  const handleFontFamilyFont = (option: string) => {
    switch (option) {
      case 'Serif':
        return `'${serifFont}', serif`;
      case 'Sans-serif':
        return `'${sansSerifFont}', sans-serif`;
      case 'Monospace':
        return `'${monospaceFont}', monospace`;
      default:
        return '';
    }
  };

  if (fontPanelView === 'custom-fonts') {
    return (
      <div className='my-4 w-full'>
        <CustomFonts bookKey={bookKey} onBack={handleBackToMain} />
      </div>
    );
  }

  // The one place to choose the font of the book: any font, serif or not.
  const knownSerif = [...SERIF_FONTS, ...BOOK_SERIF_FONTS, ...SYSTEM_BOOK_SERIF_FONTS];
  const knownSans = [...SANS_SERIF_FONTS, ...BOOK_SANS_SERIF_FONTS];
  const isApple = ['ios', 'macos'].includes(osPlatform);
  const bookFontOptions = Array.from(
    new Set([
      ...customFonts,
      ...SERIF_FONTS.filter(filterNonFreeFonts),
      ...BOOK_SERIF_FONTS,
      ...(isApple ? SYSTEM_BOOK_SERIF_FONTS : []),
      ...SANS_SERIF_FONTS.filter(filterNonFreeFonts),
      ...BOOK_SANS_SERIF_FONTS,
    ]),
  ).map((option) => ({ option, label: _(option) }));
  const bookFont = bookFontOf({ defaultFont, serifFont, sansSerifFont });

  const handlePickBookFont = (font: string) => {
    const change = pickBookFont(font, { defaultFont }, { serif: knownSerif, sans: knownSans });
    setDefaultFont(change.defaultFont);
    if (change.serifFont) setSerifFont(change.serifFont);
    if (change.sansSerifFont) setSansSerifFont(change.sansSerifFont);
  };

  // Follow the global fonts again, or keep fonts of this book's own.
  const handleFontScope = async (own: boolean) => {
    setOwnFonts(own);
    await saveViewSettings(envConfig, bookKey, 'ownFonts', own, true, false);
    if (own) return;
    const global = settings.globalViewSettings;
    for (const key of FONT_FACE_KEYS) {
      await saveViewSettings(envConfig, bookKey, key, global[key], true);
    }
    setDefaultFont(global.defaultFont);
    setSerifFont(global.serifFont);
    setSansSerifFont(global.sansSerifFont);
    setMonospaceFont(global.monospaceFont);
    setDefaultCJKFont(global.defaultCJKFont);
    setFontWeight(global.fontWeight);
    setOverrideFont(global.overrideFont);
  };

  return (
    <div className='my-4 w-full space-y-6'>
      <BoxedList title={_('Book Font')}>
        <SettingsRow
          label={_('Book Font')}
          description={_('The font the text of the book is shown in')}
          data-setting-id='settings.font.bookFont'
        >
          <FontDropdown
            options={bookFontOptions}
            moreOptions={sysFonts.map((option) => ({ option, label: option }))}
            selected={bookFont}
            onSelect={handlePickBookFont}
            onGetFontFamily={(option) =>
              `'${option}', ${knownSans.includes(option) ? 'sans-serif' : 'serif'}`
            }
          />
        </SettingsRow>
        {bookKey && (
          <SettingsRow
            label={_('Fonts Apply To')}
            description={
              !isSettingsGlobal
                ? _('Global Settings is off: this book has its own settings')
                : ownFonts
                  ? _('Only this book. Other books keep the global fonts')
                  : _('All books that do not have their own fonts')
            }
            data-setting-id='settings.font.fontScope'
          >
            <SettingsSelect
              value={ownFonts ? 'book' : 'global'}
              disabled={!isSettingsGlobal}
              ariaLabel={_('Fonts Apply To')}
              onChange={(e) => void handleFontScope(e.target.value === 'book')}
              options={[
                { value: 'global', label: _('All books (global fonts)') },
                { value: 'book', label: _('This book only') },
              ]}
            />
          </SettingsRow>
        )}
        <SettingsRow
          asLabel
          label={_('Override Book Font')}
          description={_('Use these fonts even when the book picks its own')}
          data-setting-id='settings.font.overrideBookFont'
        >
          <Toggle checked={overrideFont} onChange={() => setOverrideFont(!overrideFont)} />
        </SettingsRow>
      </BoxedList>

      <BoxedList title={_('Font Size')}>
        <NumberInput
          label={_('Default Font Size')}
          value={defaultFontSize}
          onChange={setDefaultFontSize}
          min={minFontSize}
          max={120}
          data-setting-id='settings.font.defaultFontSize'
        />
        <NumberInput
          label={_('Minimum Font Size')}
          value={minFontSize}
          onChange={setMinFontSize}
          min={1}
          max={120}
          data-setting-id='settings.font.minimumFontSize'
        />
      </BoxedList>

      <BoxedList title={_('Font Weight')} data-setting-id='settings.font.fontWeight'>
        <NumberInput
          label={_('Font Weight')}
          value={fontWeight}
          onChange={setFontWeight}
          min={100}
          max={900}
          step={100}
        />
      </BoxedList>

      <BoxedList title={_('Text Style')}>
        <SettingsRow
          label={_('Default Font')}
          description={_('Serif or sans-serif: which of the fonts below the book uses')}
          data-setting-id='settings.font.defaultFont'
        >
          <FontDropdown
            options={fontFamilyOptions}
            selected={defaultFont}
            onSelect={setDefaultFont}
            onGetFontFamily={handleFontFamilyFont}
          />
        </SettingsRow>
        {(isCJKEnv() || view?.language.isCJK) && (
          <FontFace
            family='serif'
            label={_('CJK Font')}
            description={_('For Chinese, Japanese and Korean text')}
            options={CJKFonts}
            selected={defaultCJKFont}
            onSelect={setDefaultCJKFont}
            data-setting-id='settings.font.cjkFont'
          />
        )}
      </BoxedList>

      <BoxedList title={_('Fonts by Style')}>
        <FontFace
          family='serif'
          label={_('Serif Font')}
          description={_('Used when the Default Font is Serif')}
          options={[
            ...customFonts,
            ...SERIF_FONTS.filter(filterNonFreeFonts),
            ...BOOK_SERIF_FONTS,
            ...(['ios', 'macos'].includes(getOSPlatform()) ? SYSTEM_BOOK_SERIF_FONTS : []),
            ...CJK_SERIF_FONTS,
          ]}
          moreOptions={sysFonts}
          selected={serifFont}
          onSelect={setSerifFont}
          data-setting-id='settings.font.serifFont'
        />
        <FontFace
          family='sans-serif'
          label={_('Sans-Serif Font')}
          description={_('Used when the Default Font is Sans-serif')}
          options={[
            ...customFonts,
            ...SANS_SERIF_FONTS.filter(filterNonFreeFonts),
            ...BOOK_SANS_SERIF_FONTS,
            ...CJK_SANS_SERIF_FONTS,
          ]}
          moreOptions={sysFonts}
          selected={sansSerifFont}
          onSelect={setSansSerifFont}
          data-setting-id='settings.font.sansSerifFont'
        />
        <FontFace
          family='monospace'
          label={_('Monospace Font')}
          description={_('For code and text that needs fixed-width letters')}
          options={[...customFonts, ...MONOSPACE_FONTS]}
          moreOptions={sysFonts}
          selected={monospaceFont}
          onSelect={setMonospaceFont}
          data-setting-id='settings.font.monospaceFont'
        />
      </BoxedList>

      <BoxedList title={_('Custom Fonts')} data-setting-id='settings.font.fonts'>
        <NavigationRow title={_('Manage Fonts')} onClick={handleManageCustomFonts} />
      </BoxedList>
    </div>
  );
};

export default FontPanel;
