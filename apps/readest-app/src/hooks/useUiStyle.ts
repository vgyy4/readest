import { useEffect, useState } from 'react';
import {
  getPerfMode,
  PERF_CHANGE_EVENT,
  setPerfMode,
  type PerfMode,
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

/** Lite mode (auto / on / off) and a way to change it. */
export const usePerfMode = () => {
  const [mode, setMode] = useState<PerfMode>('auto');
  useEffect(() => {
    setMode(getPerfMode());
    const onChange = (e: Event) => setMode((e as CustomEvent<PerfMode>).detail);
    window.addEventListener(PERF_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(PERF_CHANGE_EVENT, onChange);
  }, []);
  return [mode, setPerfMode] as const;
};
