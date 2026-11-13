import { describe, expect, it } from 'vitest';
import {
  getFlattenFolders,
  getWatchedFolders,
  withWatchedFolders,
} from '@/libs/profiles/watchedFolders';
import type { SystemSettings } from '@/types/settings';

const settings = (over: Partial<SystemSettings> = {}) => over as SystemSettings;

describe('watched folders per profile', () => {
  it("keeps the main profile's folders where they always were, so nothing is lost on update", () => {
    const s = settings({ autoImportFolders: ['/books'], autoImportFlattenFolders: ['/books'] });
    expect(getWatchedFolders(s, null)).toEqual(['/books']);
    expect(getFlattenFolders(s, null)).toEqual(['/books']);
  });

  it("gives a profile its own list, not the main profile's", () => {
    const s = settings({
      autoImportFolders: ['/main'],
      profileAutoImportFolders: { noa: ['/noa'] },
    });
    expect(getWatchedFolders(s, 'noa')).toEqual(['/noa']);
    expect(getWatchedFolders(s, 'eli')).toEqual([]);
    expect(getWatchedFolders(s, null)).toEqual(['/main']);
  });

  it("writes the main profile's lists to the old keys and leaves other profiles alone", () => {
    const s = settings({ profileAutoImportFolders: { noa: ['/noa'] } });
    const patch = withWatchedFolders(s, null, ['/a'], ['/a']);
    expect(patch).toEqual({ autoImportFolders: ['/a'], autoImportFlattenFolders: ['/a'] });
  });

  it("writes a profile's lists under its id and keeps everyone else's", () => {
    const s = settings({
      autoImportFolders: ['/main'],
      profileAutoImportFolders: { noa: ['/noa'], eli: ['/eli'] },
      profileAutoImportFlattenFolders: { eli: ['/eli'] },
    });
    const patch = withWatchedFolders(s, 'noa', ['/noa', '/more'], []);
    expect(patch).toEqual({
      profileAutoImportFolders: { noa: ['/noa', '/more'], eli: ['/eli'] },
      profileAutoImportFlattenFolders: { eli: ['/eli'], noa: [] },
    });
  });
});
