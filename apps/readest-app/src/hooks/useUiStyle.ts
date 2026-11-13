import { useEffect, useState } from 'react';
import {
  DEFAULT_UI_STYLE,
  getUiStyle,
  setUiStyle,
  UI_STYLE_CHANGE_EVENT,
  type UiStyle,
} from '@/libs/uiStyle';

export const useUiStyle = () => {
  const [style, setStyle] = useState<UiStyle>(DEFAULT_UI_STYLE);
  useEffect(() => {
    setStyle(getUiStyle());
    const onChange = (e: Event) => setStyle((e as CustomEvent<UiStyle>).detail);
    window.addEventListener(UI_STYLE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(UI_STYLE_CHANGE_EVENT, onChange);
  }, []);
  return [style, setUiStyle] as const;
};
